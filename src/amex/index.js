/** @fileoverview Imports an Amex CSV update into Airtable. */

import {airtableImportRecordId} from '../common/inputs.js';
import {airtableRecordUpdate, getMapping, syncChanges} from '../common/sync.js';
import {Base} from '../common/airtable.js';
import {parse} from '../common/csv.js';
import {run} from '../common/action.js';

await run(async () => {

  /** Amex Data Airtable Table name. */
  const AMEX_TABLE = 'Amex Data';

  /** Amex CSV headers. */
  const headers = [
    'Date',
    'Description',
    'Amount',
    'Extended Details',
    'Appears On Your Statement As',
    'Address',
    'City/State',
    'Zip Code',
    'Country',
    'Reference',
    'Category',
  ];

  // For existing Amex Airtable Records,
  // map Amex Reference to Airtable Record ID.
  const expenseSources = new Base();
  const expenseRecords =
      getMapping(await expenseSources.select(AMEX_TABLE), 'Reference');

  // Create Parse Config.
  const parseConfig = {
    transformHeader:
      (header, index) => header === 'Description' ? 'Merchant' : header,
    transform:
      (value, header) => {
        switch (header) {
        case 'Appears On Your Statement As':
          // Delete column.
          return undefined;
        case 'Reference':
          value = value.repleaceAll("'", '');
          // fall through
        case 'Amount':
          return Number(value);
        case 'Merchant':
          return value.match(/(.+)\s\s/)[1];

        // Split City/State later (in chunk).
        default:
          return value
        }
      },
    chunk:
      (results, parser) => {

        // Split City/State.
        for (const row of results.data) {
          const cityState =
              row['City/State'].match(/(?<city>.+)\n(?<state>.+)/).groups;
          row['City'] = cityState.city;
          row['State'] = cityState.state;
          delete row['City/State'];
        }

        const {updates, creates} =
            syncChanges(
                // Source
                new Map(results.data.map(row => [row['Reference'], row])),
                // Mapping
                expenseRecords);

        // Launch upserts.
        return Promise.all([
          expenseSources.update(
              AMEX_TABLE, Array.from(updates, airtableRecordUpdate)),
          expenseSources.create(
              AMEX_TABLE,
              Array.from(creates, ([, create]) => ({fields: create}))),
        ]);
      },
  };

  // Parse CSV with above config.
  const importRecord =
      await expenseSources.find('Amex Imports', airtableImportRecordId());
  await Promise.all(
      importRecord.get('CSV').map(csv => parse(csv, headers, parseConfig)));
});
