/** @fileoverview Imports an Abacus CSV update into Airtable. */

import fetch from 'node-fetch';
import Papa from 'papaparse';
import {airtableImportRecordId} from './inputs.js';
import {airtableRecordUpdate, getMapping, syncChanges} from '../common/sync.js';
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
const expenseRecords =
    getMapping(await expenseSources.select(ABACUS_TABLE), 'Expense ID');

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

      // Handle Paid/Debit Status,
      // completing Abacus CSV row alignment with Airtable Fields.
      for (const row of results.data) {
        const debitStatus = row['Paid'];
        row['Paid'] = debitStatus !== 'pending';
        row['Type'] = debitStatus > '' ? 'Reimbursement' : 'Card Transaction';
      }

      const {updates, creates} =
          sync.syncChanges(
              // Source
              new Map(results.data.map(row => [row['Expense ID'], row])),
              // Mapping
              expenseRecords);

      // Launch upserts.
      upsertPromises = [
        ...upsertPromises,
        expenseSources.update(
            ABACUS_TABLE, Array.from(updates, airtableRecordUpdate)),
        expenseSources.create(
            ABACUS_TABLE,
            Array.from(creates, ([, create]) => ({fields: create}))),
      ];
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
