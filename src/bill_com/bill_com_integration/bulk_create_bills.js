/** @fileoverview Bulk creates single line item Bill.com Bills from a CSV. */

import {MsoBase} from '../../common/airtable.js';
import {MSO_BILL_COM_ID} from '../common/constants.js';
import {parse} from '../../common/csv.js';

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
 * @param {!Api} billComApi
 * @param {!MsoBase=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new MsoBase()) {
  billComIntegrationBase = airtableBase;

  const header = [
    'Invoice ID',
    'Amount ($)',
    'Description',
    'Vendor ID',
    'Name',
    'Tax ID',
    'Email',
    'Phone',
    'Address Line 1',
    'Address Line 2',
    'City',
    'State',
    'Zip Code',
    'Country',
  ];

  for await (const mso of billComIntegrationBase.iterateMsos()) {

    await billComApi.login(mso.get('Code'));
    await billComIntegrationBase.selectAndUpdate(
        'Bulk Check Requests',
        'New',
        async (record) => {

          // Create parse config.
          const submittedBy =
              `Submitted by ${record.get('Requester Name')}` +
                  ` (${record.get('Requester Email')})`;
          const project =
              await getBillComId(
                  'Internal Customers', record.get('Project')[0]);
          const category =
              await getBillComId(
                  'Chart of Accounts', record.get('Category')[0]);
          const parseConfig = {
            transformHeader: (header, index) => header.trim(),
            chunk:
              (results, parser) => Promise.all(
                  results.data.map(
                      async row => billComApi.createBill(
                          {
                            invoiceDate: record.get('Invoice Date'),
                            dueDate: record.get('Due Date'),
                            invoiceNumber: row['Invoice ID'],
                            description: submittedBy,
                            billLineItems: [{
                              entity: 'BillLineItem',
                              customerId: project,
                              chartOfAccountId: category,
                              description: row['Description'],
                              amount:
                                parseFloat(
                                    row['Amount ($)'].replace(/[$,]/g, '')),
                            }],
                            vendorId:
                              row['Vendor ID'] ||
                                  await billComApi.create(
                                      'Vendor',
                                      {
                                        name: row['Name'],
                                        taxId: row['Tax ID'],
                                        taxIdType: '2', // SSN
                                        email: row['Email'],
                                        phone: row['Phone'],
                                        address1: row['Address Line 1'],
                                        address2: row['Address Line 2'],
                                        addressCity: row['City'],
                                        addressState: row['State'],
                                        addressZip: row['Zip Code'],
                                        addressCountry: row['Country'] || 'USA',
                                      }),
                          },
                          record,
                          mso))),
          };

          // Parse CSV and create Bills.
          await Promise.all(
              record.get('CSV').map(csv => parse(csv, header, parseConfig)));
          return {'Processed': true};
        });
  }
}
