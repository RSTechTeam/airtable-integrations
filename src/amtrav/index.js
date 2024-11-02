/** @fileoverview Imports an AmTrav CSV update into Airtable. */

import {addSummaryTableHeaders, addSummaryTableRow, log} from '../common/github_actions_core.js';
import {airtableImportRecordId} from '../common/inputs.js';
import {airtableRecordUpdate, filterMap, getMapping, syncChanges} from '../common/sync.js';
import {amtravCardId} from './inputs.js';
import {Base} from '../common/airtable.js';
import {parse} from '../common/csv.js';
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
      (val ? Number(val) : null) : val;
}

await run(async () => {

  /** AmTrav Data Airtable Table name. */
  const AMTRAV_TABLE = 'AmTrav Data';

  // Find Import Record.
  const expenseSources = new Base();
  const importRecord =
      await expenseSources.find('AmTrav Imports', airtableImportRecordId());

  // Parse Trip Spend Report CSV.
  const emails = new Map();
  await Promise.all(
      importRecord.get('Trip Spend Report').map(
          csv => parse(
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

  // For existing AmTrav Airtable Records,
  // map AmTrav Transaction ID to Airtable Record ID.
  const expenseRecords =
      getMapping(await expenseSources.select(AMTRAV_TABLE), 'Transaction ID');

  // Create Credit Card Report parse config.
  const header = [
    'Card',
    'Booking #',
    'Invoice #',
    'Transaction Date',
    'Amount',
    'Ticket #',
    'Description',
    'Merchant',
    'Traveler',
    'Travel Date',
  ];
  const usedFields =
      header.filter(
          field => !['Card', 'Travel Date'].includes(field));
  let updateCount = 0;
  let createCount = 0;
  const parseConfig = {
    transform: trimAndType,
    chunk:
      (results, parser) => {
        const {updates, creates} =
            syncChanges(
                // Source
                new Map(
                    filterMap(
                        results.data,
                        row => row['Card'] === amtravCardId(),
                        row => [
                          // Transaction ID
                          `"${row['Booking #']}:${row['Invoice #']}:` +
                              `${row['Ticket #'] ? row['Ticket #'] : ''}"`,
                          {
                            ...Object.fromEntries(
                                usedFields.map(f => [f, row[f]])),
                            'Email': emails.get(row['Booking #']),
                          },
                        ])),
                // Mapping
                expenseRecords);

        // Track change counts.
        updateCount += updates.size;
        createCount += creates.size;

        // Launch upserts.
        return Promise.all([
          expenseSources.update(
              AMTRAV_TABLE, Array.from(updates, airtableRecordUpdate)),
          expenseSources.create(
              AMTRAV_TABLE,
              Array.from(creates, ([, create]) => ({fields: create}))),
        ]);
      },
  };

  // Parse Credit Card Report CSV with above config.
  await Promise.all(
      importRecord.get('Credit Card Report').map(
          csv => parse(csv, header, parseConfig)));

  // Add summary.
  addSummaryTableHeaders(['Updates', 'Creates']);
  addSummaryTableRow([updateCount, createCount]);
});
