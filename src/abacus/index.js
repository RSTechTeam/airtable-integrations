/** @fileoverview Imports an Abacus CSV update into Airtable. */

import fetch from 'node-fetch';
import Papa from 'papaparse';
import {airtableImportRecordId} from './inputs.js';
import {Base} from '../common/airtable.js';
import {error} from '../common/github_actions_core.js';
import {fetchError} from '../common/utils.js';

/** Abacus Airtable Table name. */
const ABACUS_TABLE = 'Abacus';

/** Abacus to Airtable Field mapping. */
const mapping = new Map([
  ['Expense ID', 'Expense ID'],
  ['Expenser Name', 'Expenser Name'],
  ['Submitted Date', 'Submitted Date'],
  ['Transaction Date', 'Transaction Date'],
  ['Merchant', 'Merchant (Name)'],
  ['Note', 'Notes'],
  ['Category', 'Category'],
  ['Amount', 'Amount'],
  ['Projects', 'Project'],
  ['Approved Date', 'Approved'],
  ['Debit Status', 'Paid'], // Also Type
  ['Debit Date', 'Debit Date'],
]);

// For existing Abacus Airtable Records,
// map Abacus Expense ID to Airtable Record ID.
const expenseSources = new Base();
const expenses = await expenseSources.select(ABACUS_TABLE);
const expenseRecords =
    new Map(expenses.map(e => [e.get('Expense ID'), e.getId()]));

// Create Papa Parse Config.
const airtableFields = Array.from(mapping.values());
let firstChunk;
let upsertPromises = [];
const parseConfig = {
  header: true,
  transformHeader: (header, index) => airtableFields[index],
  transform:
    (value, header) => {
      switch (header) {
      case 'Amount':
        return Number(value);
      case 'Approved':
        return value > '';

      // Paid/Debit Status splits to 2 Fields, so handle later (in chunk).
      default:
        return value === '' ? undefined : value;
      }
    },
  chunk:
    (results, parser) => {
      
      // Validate header during first chunk.
      if (firstChunk) {
        firstChunk = false;
        const gotHeader = results.meta.fields;
        if (JSON.stringify(gotHeader) !== JSON.stringify(airtableFields)) {
          error(`Got header: ${gotHeader}\nWant header: ${airtableFields}`);
        }
      }

      const updates = [];
      const creates = [];
      for (const row of results.data) {

        // Handle Paid/Debit Status,
        // completing Abacus CSV row alignment with Airtable Fields.
        const debitStatus = row['Paid'];
        row['Paid'] = debitStatus !== 'pending';
        row['Type'] = debitStatus > '' ? 'Reimbursement' : 'Card Transaction';

        // Load upsert.
        const upsert = {fields: row};
        const existingRecordId = expenseRecords.get(row['Expense ID']);
        if (existingRecordId) {
          updates.push({id: existingRecordId, ...upsert});
          continue
        }
        creates.push(upsert);
      }

      // Launch upserts.
      upsertPromises =
          upsertPromises.concat([
            expenseSources.update(ABACUS_TABLE, updates),
            expenseSources.create(ABACUS_TABLE, creates),
          ]);
    },
  error: (err, file) => error(err),
};

// Parse CSVs with above Config.
const importRecord =
    await expenseSources.find('Imports', airtableImportRecordId());
for (const csv of importRecord.get('CSVs')) {
  const response = await fetch(csv.url);
  if (!response.ok) {
    fetchError(response.status, csv.filename, response.statusText);
  }
  firstChunk = true;
  Papa.parse(response.body, parseConfig);
}
await Promise.all(upsertPromises);
