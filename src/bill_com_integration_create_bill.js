/** @fileoverview Creates a Bill.com Bill based on a new Check Request. */

import * as airtable from './airtable.js';
import * as billCom from './bill_com.js';
import fetch from 'node-fetch';
import * as utils from './utils.js';

/** The Airtable Table name for Check Requests. */
const CHECK_REQUESTS_TABLE = 'Check Requests';

/** The Airtable Table name for New Vendors. */
const NEW_VENDORS_TABLE = 'New Vendors';

/** The Bill.com Integration Airtable Base. */
const billComIntegrationBase = airtable.getInputBase();

/**
 * @param {string} table
 * @param {string} airtableId
 * @return {Promise<string>}
 */
async function getBillComId(table, airtableId) {
  let billComId;
  await billComIntegrationBase.find(
      table,
      airtableId,
      (record) => billComId = record.get(airtable.primaryOrgBillComId));
  return billComId;
}


export async function main() {

  // Get new Check Requests.
  await billCom.primaryOrgLogin();
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
                'Bill.com Session ID': billCom.sessionId,
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

        // Upload the Supporting Documents (via Integromat).

        // if (newCheckRequest.get('Supporting Documents') != null) {
        //   await fetch(`${utils.getInput('integromat-hook-prefix')}${newCheckRequest.getId()}`);
        // }

        const data = new FormData();
        data.set('devKey', billCom.devKey);
        data.set('sessionId', billCom.sessionId);
        for (const doc of thisRequest.getCellValue('Supporting Documents')) {
            
          // Fetch the document.
          const response = await fetch(doc.url);
          utils.logJson(doc.filename, response);
          if (!response.ok) {
            utils.fetchError(
                response.status, doc.filename, response.statusText);
          }

          // Download it.
          const file = await response.blob();

          // Upload it.
          data.set('file', file, doc.filename);
          data.set('data', {id: createBillResponse.id, fileName: doc.filename});

           await billCom.call('UploadAttachment', undefined, data);
         }
      });
}


// TODO use FormData now that we're off Airtable

// const formBoundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
// let uploads = [];
// /*let data = new FormData();
// data.set('devKey', devKey);
// data.set('sessionId', sessionId);*/
// for (const doc of thisRequest.getCellValue('Supporting Documents')) {
    
//     // Fetch the document.
//     const response = await fetch(doc.url);
//     console.log(doc.filename, response);
//     if (!response.ok) {
//         error(
//             response.status, doc.filename, response.statusText);
//     }

//     // Download it.
//     const file = await response.blob();

//     // Upload it.
//     /*data.set('file', file, doc.filename);
//     data.set(
//         'data',
//         {id: createBillResponse.id, fileName: doc.filename});*/
//     //await billComLogin();
//     //uploads.push(
//      await   billComApiCall(
//             'UploadAttachment',
//             {'Content-Type':
//                 `multipart/form-data; boundary=${formBoundary}`},
// `${formBoundary}
// Content-Disposition: form-data; name="devKey"

// ${devKey}
// ${formBoundary}
// Content-Disposition: form-data; name="sessionId"

// ${sessionId}
// ${formBoundary}
// Content-Disposition: form-data; name="file"; filename="${doc.filename}"
// Content-Type: ${doc.type}

// ${file}
// ${formBoundary}
// Content-Disposition: form-data; name="data"

// {"id":"${createBillResponse.id}","fileName":"${doc.filename}"}
// ${formBoundary}`);
// }
//await Promise.all(uploads);
