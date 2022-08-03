/** @fileoverview Creates a Bill.com Bill based on a new Check Request. */

import * as airtable from './airtable.js';
import * as billCom from './bill_com.js';
import fetch from 'node-fetch';
import * as utils from './utils.js';
import {billComDevKey} from './inputs.js';
import {FormData} from 'formdata-node';

/** The Bill.com Integration Airtable Base. */
const billComIntegrationBase = airtable.getInputBase();

/**
 * @param {string} table
 * @param {string} airtableId
 * @return {Promise<string>}
 */
async function getBillComId(table, airtableId) {
  let billComId;
  await billComIntegrationBase().find(
      table,
      airtableId,
      (record) => billComId = record.get(airtable.primaryOrgBillComId));
  return billComId;
}


export async function main() {
  const CHECK_REQUESTS_TABLE = 'Check Requests';
  const NEW_VENDORS_TABLE = 'New Vendors';

  // Get new Check Requests.
  await billCom.primaryOrgLogin();
  await billComIntegrationBase().select(
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
                const createVendorResponse =
                    await billCom.commonDataCall(
                        'Crud/Create/Vendor',
                        {
                          obj: {
                            entity: 'Vendor',
                            name: encodeURIComponent(newVendor.get('Name')),
                            address1: newVendor.get('Address Line 1'),
                            address2: newVendor.get('Address Line 2'),
                            addressCity: newVendor.get('City'),
                            addressState: newVendor.get('State'),
                            addressZip: newVendor.get('Zip Code').toString(),
                            addressCountry: newVendor.get('Country'),
                            email: newVendor.get('Email'),
                            phone: newVendor.get('Phone'),
                          }
                        });
                vendorId = createVendorResponse.id;
              });
          await billComIntegrationBase.update(
              NEW_VENDORS_TABLE,
              [{
                id: newVendorId,
                fields: {[airtable.primaryOrgBillComId]: vendorId},
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
        const createBillResponse =
            await billCom.commonDataCall(
                'Crud/Create/Bill',
                {
                  obj: {
                    entity: 'Bill',
                    vendorId: vendorId,
                    invoiceNumber: newCheckRequest.get('Vendor Invoice ID'),
                    invoiceDate: newCheckRequest.get('Expense Date'),
                    dueDate: newCheckRequest.get('Due Date'),
                    billLineItems: billComLineItems,
                  }
                });

        // Get and set the link (and ID) for the newly created Bill.com Bill.
        const getUrlResponse =
            await billCom.commonDataCall(
                'GetObjectUrl', {objectId: createBillResponse.id});
        await billComIntegrationBase.update(
            CHECK_REQUESTS_TABLE,
            [{
              id: newCheckRequest.getId(),
              fields: {
                'Active': true,
                'Bill.com Link': getUrlResponse.url,
                [airtable.primaryOrgBillComId]: createBillResponse.id,
              },
            }]);

        // Set the Bill's approvers.
        const approvers = newCheckRequest.get('Approvers');
        if (approvers != null) {
          await billCom.commonDataCall(
              'SetApprovers',
              {
                objectId: createBillResponse.id,
                entity: 'Bill',
                approvers:
                  await Promise.all(
                      approvers.map((a) => getBillComId('Users', a.id))),
              });
        }

        // Upload the Supporting Documents.
        const data = new FormData();
        data.set('devKey', billComDevKey);
        data.set('sessionId', billCom.sessionId);
        for (const doc of newCheckRequest.get('Supporting Documents')) {

          // Fetch the document.
          const response = await fetch(doc.url);
          if (!response.ok) {
            utils.fetchError(
                response.status, doc.filename, response.statusText);
          }

          // Download it.
          const file = await response.blob();

          // Upload it.
          data.set('file', file, doc.filename);
          data.set(
              'data',
              JSON.stringify(
                  {id: createBillResponse.id, fileName: doc.filename}));

          await billCom.call('UploadAttachment', {}, data);
        }
      });
}
