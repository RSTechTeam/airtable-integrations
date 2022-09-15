/** @fileoverview Creates a Bill.com Bill based on a new Check Request. */

import fetch from 'node-fetch';
import {apiCall} from '../common/bill_com.js';
import {Base, PRIMARY_ORG_BILL_COM_ID} from '../common/airtable.js';
import {fetchError} from '../common/utils.js';
import {finalApproverUserId} from '../common/inputs.js';
import {FormData} from 'formdata-node';

/** The Bill.com Integration Airtable Base. */
let billComIntegrationBase;

/**
 * @param {string} table
 * @param {string} airtableId
 * @return {!Promise<string>}
 */
async function getBillComId(table, airtableId) {
  let billComId;
  await billComIntegrationBase.find(
      table,
      airtableId,
      (record) => billComId = record.get(PRIMARY_ORG_BILL_COM_ID));
  return billComId;
}

/**
 * @param {!Api} billComApi
 * @param {!Base=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new Base()) {
  const CHECK_REQUESTS_TABLE = 'Check Requests';
  const NEW_VENDORS_TABLE = 'New Vendors';

  billComIntegrationBase = airtableBase;

  // Get new Check Requests.
  await billComApi.primaryOrgLogin();
  await billComIntegrationBase.select(
      CHECK_REQUESTS_TABLE,
      'New',
      async (newCheckRequest) => {
        
        // Get the Vendor to pay for whom this request was submitted.
        let vendorId;
        if (newCheckRequest.get('New Vendor?')) {
          const newVendorId = newCheckRequest.get('New Vendor')[0];
          await billComIntegrationBase.find(
              NEW_VENDORS_TABLE,
              newVendorId,
              async (newVendor) => {
                vendorId =
                    await billComApi.createVendor(
                        newVendor.get('Name'),
                        newVendor.get('Address Line 1'),
                        newVendor.get('Address Line 2'),
                        newVendor.get('City'),
                        newVendor.get('State'),
                        newVendor.get('Zip Code').toString(),
                        newVendor.get('Country'),
                        newVendor.get('Email'),
                        newVendor.get('Phone'));
              });
          await billComIntegrationBase.update(
              NEW_VENDORS_TABLE,
              [{
                id: newVendorId,
                fields: {[PRIMARY_ORG_BILL_COM_ID]: vendorId},
              }]);
        } else {
          vendorId =
              await getBillComId(
                  'Existing Vendors', newCheckRequest.get('Vendor')[0]);
        }

        // Get the Check Request Line Items.
        const billComLineItems = [];
        for (const itemId of newCheckRequest.get('Line Items')) {
          await billComIntegrationBase.find(
              'Check Request Line Items',
              itemId,
              async (item) => {
                const category = item.get('Category');
                let chartOfAccountId;
                if (category != null) {
                  chartOfAccountId =
                      await getBillComId('Chart of Accounts', category[0]);
                }
                billComLineItems.push({
                  entity: 'BillLineItem',
                  amount: item.get('Amount'),
                  chartOfAccountId: chartOfAccountId,
                  customerId:
                    await getBillComId(
                        'Internal Customers', item.get('Project')[0]),
                  description: item.get('Description'),
                });
              });
        }

        // Create Bill.com Bill based on Check Request.
        const requester = newCheckRequest.get('Requester Name');
        const invoiceId =
            newCheckRequest.get('Vendor Invoice ID') ||
                // Invoice number can currently be max 21 characters.
                // For default ID, take 15 from requester name
                // and 3 from unique part of Airtable Record ID,
                // with 3 to pretty divide these parts.
                `${requester.substring(0, 15)}` +
                    ` - ${newCheckRequest.getId().substring(3, 6)}`;
        const createBillResponse =
            await billComApi.dataCall(
                'Crud/Create/Bill',
                {
                  obj: {
                    entity: 'Bill',
                    vendorId: vendorId,
                    invoiceNumber: invoiceId,
                    invoiceDate: newCheckRequest.get('Expense Date'),
                    dueDate: newCheckRequest.get('Due Date'),
                    description:
                      `Submitted by ${requester}` +
                          ` (${newCheckRequest.get('Requester Email')}).`,
                    billLineItems: billComLineItems,
                  }
                });

        // Get and set the link (and ID) for the newly created Bill.com Bill.
        const getUrlResponse =
            await billComApi.dataCall(
                'GetObjectUrl', {objectId: createBillResponse.id});
        await billComIntegrationBase.update(
            CHECK_REQUESTS_TABLE,
            [{
              id: newCheckRequest.getId(),
              fields: {
                'Active': true,
                'Bill.com Link': getUrlResponse.url,
                'Vendor Invoice ID': invoiceId,
                [PRIMARY_ORG_BILL_COM_ID]: createBillResponse.id,
              },
            }]);

        // Set the Bill's approvers.
        const approverAirtableIds = newCheckRequest.get('Approvers') || [];
        const approverBillComIds =
            await Promise.all(
                approverAirtableIds.map((aid) => getBillComId('Users', aid)));
        approverBillComIds.push(finalApproverUserId());
        await billComApi.dataCall(
            'SetApprovers',
            {
              objectId: createBillResponse.id,
              entity: 'Bill',
              approvers: approverBillComIds,
            });

        // Upload the Supporting Documents.
        const data = new FormData();
        data.set('devKey', billComApi.getDevKey());
        data.set('sessionId', billComApi.getSessionId());
        const docs = newCheckRequest.get('Supporting Documents') || [];
        for (const doc of docs) {

          // Fetch the document.
          const response = await fetch(doc.url);
          if (!response.ok) {
            fetchError(response.status, doc.filename, response.statusText);
          }

          // Download it.
          const file = await response.blob();

          // Upload it.
          data.set('file', file, doc.filename);
          data.set(
              'data',
              JSON.stringify(
                  {id: createBillResponse.id, fileName: doc.filename}));

          await apiCall('UploadAttachment', {}, data);
        }
      });
}
