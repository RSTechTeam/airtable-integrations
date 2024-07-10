/** @fileoverview Bulk creates single line item Bill.com Bills from a CSV. */

import {Base} from '../../common/airtable.js';
import {log} from '../../common/github_actions_core.js';
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
export async function main(billComApi, airtableBase = new Base()) {
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
  await billComApi.primaryOrgLogin();
  await airtableBase.selectAndUpdate(
      'Bulk Check Requests',
      'New',
      async (record) => {

        // Create parse config.
        const project =
            await getBillComId('Internal Customers', record.get('Project')[0]);
        const category =
            await getBillComId('Chart of Accounts', record.get('Category')[0]);
        const parseConfig = {
          chunk:
            (results, parser) => Promise.all(
                results.data.map(
                    async row => ({
                      invoiceDate: record.get('Invoice Date'),
                      dueDate: record.get('Due Date'),
                      approvers: record.get(`Approver ${MSO_BILL_COM_ID}s`),
                      invoiceNumber: row['Invoice ID'],
                      description: row['Description'],
                      billLineItems: [{
                        entity: 'BillLineItem',
                        customerId: project,
                        chartOfAccountId: category,
                        amount: parseFloat(row['Amount ($)']),
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
                    }))),
        };

        // Parse CSV.
        const bills =
            await Promise.all(
                record.get('CSV').map(csv => parse(csv, header, parseConfig)));
        log(bills);
        // log(await Promise.all(bills));
        // log(await Promise.all(bills).flat());
        await billComApi.bulk('Create', 'Bill', bills.flat());
            //'Create', 'Bill', (await Promise.all(bills)).flat());
        return {'Processed': true};
      }
    );
}
