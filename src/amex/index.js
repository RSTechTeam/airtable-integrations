/** @fileoverview Imports an Amex CSV update into Airtable. */

import {airtableImportRecordId} from '../common/inputs.js';
import {Base} from '../common/airtable.js';
import {getSync, parseAttachment} from '../common/csv.js';
import {run} from '../common/action.js';

await run(async () => {

  /** Amex CSV transformed headers. */
  const headers = [
    'Date',
    'Merchant', // From Description
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

  // Create Parse Config.
  const expenseSources = new Base();
  const {chunk, summarize} =
      await getSync(
          data => {
            // Split City/State.
            for (const row of results.data) {
              const cityState =
                  row['City/State'].match(/(?<city>.+)\n(?<state>.+)/)?.groups;
              row['City'] = cityState?.city;
              row['State'] = cityState?.state;
              delete row['City/State'];
            }
            return new Map(data.map(row => [row['Reference'], row]));
          },
          expenseSources, 'Amex Data', 'Reference');
  const parseConfig = {
    transformHeader:
      (header, index) => header === 'Description' ? 'Merchant' : header,
    transform:
      (value, header) => {
        switch (header) {
        case 'Appears On Your Statement As':
          // Delete column.
          return undefined;
        case 'Amount':
          return Number(value);
        case 'Reference':
          return value.replaceAll("'", '');
        case 'Merchant':
          const match = value.match(/(.+?)\s\s+/);
          return match ? match[1] : value;

        // Split City/State later (in chunk).
        default:
          return value;
        }
      },
    chunk,
  };

  // Parse CSV with above config.
  const importRecord =
      await expenseSources.find('Amex Imports', airtableImportRecordId());
  await Promise.all(
      importRecord.get('CSV').map(
          csv => parseAttachment(csv, headers, parseConfig)));
  summarize();
});
