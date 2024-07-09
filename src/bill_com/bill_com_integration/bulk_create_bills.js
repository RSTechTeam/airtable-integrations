/** @fileoverview Bulk creates single line item Bill.com Bills from a CSV. */

import fetch from 'node-fetch';
import Papa from 'papaparse';
import {Base} from '../../common/airtable.js';
import {error} from '../../common/github_actions_core.js';
import {fetchError} from '../../common/utils.js';
import {MSO_BILL_COM_ID} from '../common/constants.js';

/** The Bill.com API connection. */
let billComApi;

/** The Bill.com Integration Airtable Base. */
let billComIntegrationBase;

// Create Papa Parse Config.
let firstChunk;
let createPromises = [];
let invoiceDate;
let dueDate;
let approvers;
let project;
let category;
const parseConfig = {
  header: true,
  chunk:
    async (results, parser) => {

      // Validate header during first chunk.
      if (firstChunk) {
        firstChunk = false;
        const gotHeader = results.meta.fields;
        const wantHeader = [
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
        if (JSON.stringify(gotHeader) !== JSON.stringify(wantHeader)) {
          error(`Got header: ${gotHeader}\nWant header: ${wantHeader}`);
        }
      }

      createPromises = [
        ...createPromises,
        billComApi.bulk(
            'Create',
            'Bill',
            await Promise.all(
                results.data.map(
                    async row => ({
                      invoiceDate: invoiceDate,
                      dueDate: dueDate,
                      approvers: approvers,
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
                    })))),
      ]

    },
  error: (err, file) => error(err),
};

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
 * @param {!Api} api
 * @param {!MsoBase=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(api, airtableBase = new Base()) {

  billComApi = api;
  billComIntegrationBase = airtableBase;

  await billComApi.primaryOrgLogin();
  await airtableBase.selectAndUpdate(
      'Bulk Check Requests',
      'New',
      async (record) => {

        // Initialize form parameters.
        invoiceDate = record.get('Invoice Date');
        dueDate = record.get('Due Date');
        approvers = record.get(`Approver ${MSO_BILL_COM_ID}s`);
        project =
            await getBillComId('Internal Customers', record.get('Project')[0]);
        category =
            await getBillComId('Chart of Accounts', record.get('Category')[0]);

        // Download and parse CSV.
        for (const csv of record.get('CSV')) {
          const response = await fetch(csv.url);
          if (!response.ok) {
            fetchError(response.status, csv.filename, response.statusText);
          }
          firstChunk = true;
          Papa.parse(response.body, parseConfig);
        }
        await Promise.all(createPromises);
        return {'Processed': true};
      }
    );
}
