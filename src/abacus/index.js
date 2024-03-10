/** @fileoverview Imports an Abacus CSV update into Airtable. */

import Papa from 'papaparse';
import {airtableImportRecordId} from './inputs.js';
import {Base} from '../common/airtable.js';
import {error} from '../common/github_actions_core.js';

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
const importRecord =
    await expenseSources.find('Imports', airtableImportRecordId);
const upsertPromises = [];
const parseConfig = {
  download: true,
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
        return value;
      }
    },
  beforeFirstChunk:

    // Validate header.
    (results, parser) => {
      const gotHeader = results.meta.fields;
      if (JSON.stringify(gotHeader) !== JSON.stringify(airtableFields)) {
        error(
            `Error processing import record ${importRecord.getId()}.\n` +
                ` Got header: ${gotHeader}\nWant header: ${airtableFields}`);
      }
    },
  chunk:
    (results, parser) => {
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
        const existingRecordId = expenseRecords.get('Expense ID');
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
};

// Parse CSVs with above Config.
for (const csv of importRecord.get('CSVs')) {
  Papa.parse(csv.url, parseConfig);
}
await Promise.all(upsertPromises);
