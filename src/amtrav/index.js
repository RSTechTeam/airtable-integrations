/** @fileoverview Imports an AmTrav CSV update into Airtable. */

import {airtableImportRecordId} from '../common/inputs.js';
import {filterMap} from '../common/sync.js';
import {amtravCardId} from './inputs.js';
import {Base} from '../common/airtable.js';
import {getSync, parseAttachment} from '../common/csv.js';
import {run} from '../common/action.js';

/**
 * Trims "$" and leading "=" (and resulting quotes) and types number values.
 * @param {string} value
 * @param {string} header
 * @returns {string|number}
 */
function trimAndType(value, header) {
  const val =
      value.startsWith('=') ?
          value.substring(2, value.length - 1) : value.replace('$', '');
  return header.includes('#') || header === 'Amount' ?
      (val ? Number(val.replace(',', '')) : null) : val;
}

await run(async () => {

  // Find Import Record.
  const expenseSources = new Base();
  const importRecord =
      await expenseSources.find('AmTrav Imports', airtableImportRecordId());

  // Parse Trip Spend Report CSV.
  const emails = new Map();
  await Promise.all(
      importRecord.get('Trip Spend Report').map(
          csv => parseAttachment(
              csv,
              [ // Header
                'Booking #',
                'Email',
                'Air',
                'Hotel',
                'Car',
                'Other',
                'Fees',
                'Total',
              ],
              { // Parse Config
                transform: trimAndType,
                chunk:
                  (results, parser) => results.data.forEach(
                      row => emails.set(row['Booking #'], row['Email'])),
              })));

  // AmTrav Credit Card Report to Airtable Field mapping.
  const mapping = new Map([
    ['Card', 'Card'],
    ['Booking #', 'Booking #'],
    ['Invoice #', 'Invoice #'],
    ['Transaction Date', 'Transaction Date'],
    ['Amount', 'Amount'],
    ['Ticket #', 'Ticket #'],
    ['Description', 'Description'],
    ['Merchant', 'Merchant'],
    ['Traveler', 'Traveler'],
    ['Travel Date', 'Travel Date'],
    ['Meeting Name', 'Meeting Name'],
    ['STV Volunteer Canvasses', 'Billing Code'],
  ]);

  // Create Credit Card Report parse config.
  const {chunk, summarize} =
      await getSync(
          data => new Map(
              filterMap(
                  data,
                  row => row['Card'] === amtravCardId(),
                  row => [
                    // Transaction ID
                    row['Invoice #'] +
                        `:${row['Ticket #'] ? row['Ticket #'] : ''}:` +
                        row['Amount'],
                    {
                      ...Object.fromEntries(
                          usedFields.map(f => [f, row[f]])),
                      'Email': emails.get(row['Booking #']),
                    },
                  ])),
          expenseSources, 'AmTrav Data', 'Transaction ID');
  const airtableFields = Array.from(mapping.values());
  const usedFields =
      airtableFields.filter(
          field => !['Card', 'Travel Date'].includes(field));
  const parseConfig = {
    transformHeader: (header, index) => airtableFields[index],
    transform: trimAndType,
    chunk,
  };

  // Parse Credit Card Report CSV with above config.
  await Promise.all(
      importRecord.get('Credit Card Report').map(
          csv => parseAttachment(csv, airtableFields, parseConfig)));
  summarize();
});
