/** @fileoverview Creates a Bill.com Bill based on a new Check Request. */

import fetch from 'node-fetch';
import {apiCall} from '../common/api.js';
import {fetchError} from '../../common/utils.js';
import {FormData} from 'formdata-node';
import {MSO_BILL_COM_ID} from '../common/constants.js';
import {MsoBase} from '../../common/airtable.js';
import {warn} from '../../common/github_actions_core.js';

/** Bill.com Vendor tax ID types. */
const taxIdTypes = new Map([['EIN', '1'], ['SSN', '2']]);

/** The Bill.com API connection. */
let billComApi;

/** The Bill.com Integration Airtable Base. */
let billComIntegrationBase;

/**
 * @param {string} table
 * @param {string} airtableId
 * @return {!Promise<string>}
 */
async function getBillComId(table, airtableId) {
  const record = await billComIntegrationBase.find(table, airtableId);
  return record.get(MSO_BILL_COM_ID);
}

/**
 * @param {?Object<string, *>} attachments
 * @param {string} id - The Bill.com ID of the object to attach the document.
 * @return {!Promise<undefined>}
 */
async function uploadAttachments(attachments, id) {
  const data = new FormData();
  data.set('devKey', billComApi.getDevKey());
  data.set('sessionId', billComApi.getSessionId());
  for (const attachment of (attachments || [])) {

    // Fetch the attachment.
    const response = await fetch(attachment.url);
    if (!response.ok) {
      fetchError(response.status, attachment.filename, response.statusText);
    }

    // Download it.
    const file = await response.blob();

    // Upload it.
    data.set('file', file, attachment.filename);
    data.set('data', JSON.stringify({id: id, fileName: attachment.filename}));
    await apiCall('UploadAttachment', {}, data);
  }
}

/**
 * @param {!Record<!TField>} checkRequest
 * @return {!Promise<string>} vendorId
 */
async function getVendorId(checkRequest) {
  const NEW_VENDORS_TABLE = 'New Vendors';

  // Get existing Vendor ID.
  if (!checkRequest.get('New Vendor?')) {
    return getBillComId('Existing Vendors', checkRequest.get('Vendor')[0]);
  }

  // Check if new Vendor and ID were already created.
  const newVendorId = checkRequest.get('New Vendor')[0];
  const newVendor =
      await billComIntegrationBase.find(NEW_VENDORS_TABLE, newVendorId);
  let vendorId = newVendor.get(MSO_BILL_COM_ID);
  if (vendorId != null) return vendorId;

  // Create new Vendor and ID.
  const zipCode = newVendor.get('Zip Code');
  const taxIdType = newVendor.get('Tax ID Type');
  vendorId =
      await billComApi.create(
          'Vendor',
          {
            name: newVendor.get('Name'),
            address1: newVendor.get('Address Line 1'),
            address2: newVendor.get('Address Line 2'),
            addressCity: newVendor.get('City'),
            addressState: newVendor.get('State'),
            addressZip: zipCode && zipCode.toString(),
            addressCountry: newVendor.get('Country'),
            email: newVendor.get('Email'),
            phone: newVendor.get('Phone'),
            track1099: newVendor.get('1099 Vendor?'),
            taxId: newVendor.get('Tax ID'),
            taxIdType: taxIdType && taxIdTypes.get(taxIdType),
          });
  await billComIntegrationBase.update(
      NEW_VENDORS_TABLE,
      [{id: newVendorId, fields: {[MSO_BILL_COM_ID]: vendorId}}]);
  await uploadAttachments(newVendor.get('W-9 Form'), vendorId);
  return vendorId;
}

/**
 * @param {!Record<!TField>} record
 * @param {string=} type - |Default|Final
 * @return {?string[]} approvers MSO Bill.com IDs
 */
function getApproverIds(record, type = '') {
  return record.get(`${type}${type ? ' ' : ''}Approver ${MSO_BILL_COM_ID}s`);
}

/**
 * @param {!Api} api
 * @param {!MsoBase=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(api, airtableBase = new MsoBase()) {

  billComApi = api;
  billComIntegrationBase = airtableBase;

  // Sync for each Org/MSO.
  for await (const mso of billComIntegrationBase.iterateMsos()) {

    // Get new Check Requests.
    const msoRecordId = mso.getId();
    const msoCode = mso.get('Code');
    await billComApi.login(msoCode);
    await billComIntegrationBase.selectAndUpdate(
        'Check Requests',
        'New',
        async (newCheckRequest) => {

          // Get the Check Request Line Items.
          const billComLineItems = [];
          for (const itemId of newCheckRequest.get('Line Items')) {
            const item =
                await billComIntegrationBase.find(
                    'Check Request Line Items', itemId);
            const date = item.get('Item Expense Date');
            const description = item.get('Description');
            const lineItem = {
              entity: 'BillLineItem',
              amount: item.get('Amount'),
              chartOfAccountId:
                await getBillComId(
                    'Chart of Accounts', item.get('Category')[0]),
              customerId:
                await getBillComId(
                    'Internal Customers', item.get('Project')[0]),
              description:
                date == undefined ?
                    description :
                    `${date}\n${item.get('Merchant Name')}\n` +
                        `${item.get('Merchant Address')}\n` +
                        `${item.get('Merchant City')} | ` +
                        `${item.get('Merchant State')} | ` +
                        `${item.get('Merchant Zip Code')}\n${description}`,
            };

            const project =
                await billComIntegrationBase.find(
                    'Internal Customers', item.get('Project')[0]);
            if (mso.get('Use Customers?')) {
              lineItem.customerId = project.get(MSO_BILL_COM_ID);
            } else {
              lineItem.actgClassId = project.get('MSO Bill.com Class ID')[0];
            }
            billComLineItems.push(lineItem);
          }

          // Compile Bill.com Bill based on Check Request.
          const requester = newCheckRequest.get('Requester Name');
          const invoiceId =
              newCheckRequest.get('Vendor Invoice ID') ||
                  // Invoice number can currently be max 21 characters.
                  // For default ID, take 15 from requester name
                  // and 3 from unique part of Airtable Record ID,
                  // with 3 to pretty divide these parts.
                  `${requester.substring(0, 15)}` +
                      ` - ${newCheckRequest.getId().substring(3, 6)}`;
          const notes = newCheckRequest.get('Notes');
          const bill = {
            vendorId: await getVendorId(newCheckRequest),
            invoiceNumber: invoiceId,
            invoiceDate: newCheckRequest.get('Invoice Date'),
            dueDate: newCheckRequest.get('Due Date'),
            description:
              `Submitted by ${requester}` +
                  ` (${newCheckRequest.get('Requester Email')}).` +
                  (notes == undefined ? '' : `\n\nNotes:\n${notes}`),
            billLineItems: billComLineItems,
          };

          // Create the Bill.
          let newBillId;
          for (let i = 1; newBillId == undefined; ++i) {
            try {
              newBillId = await billComApi.create('Bill', bill);
            } catch (err) {

              // Handle duplicate Vendor Invoice ID.
              if (err.message.match(/BDC_(1171|5370)/)) {
                warn(err.message);
                bill.invoiceNumber = `${invoiceId} (${i})`;
                continue;
              }
              throw err;
            }
          }

          // Set the Bill's approvers.
          const approvers =
              getApproverIds(newCheckRequest) ||
                  getApproverIds(mso, 'Default') || [];             
          await billComApi.dataCall(
              'SetApprovers',
              {
                objectId: newBillId,
                entity: 'Bill',
                approvers: approvers.concat(getApproverIds(mso, 'Final')),
              });

          // Upload the Supporting Documents.
          await uploadAttachments(
              newCheckRequest.get('Supporting Documents'), newBillId);

          return {
            'Active': true,
            'MSO': [msoRecordId],
            'Vendor Invoice ID': bill.invoiceNumber,
            [MSO_BILL_COM_ID]: newBillId,
          };
        });
  }
}
