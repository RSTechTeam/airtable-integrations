/** @fileoverview Imports an Abacus CSV update into Airtable. */

import Client from 'ssh2-sftp-client';
import {addSummaryTableHeaders, addSummaryTableRow} from '../common/github_actions_core.js';
import {airtableImportRecordId} from '../common/inputs.js';
import {airtableRecordUpdate, getMapping, syncChanges} from '../common/sync.js';
import {Base} from '../common/airtable.js';
import {emburseSftpKey, emburseSftpUsername} from './inputs.js';
import {parse} from '../common/csv.js';
import {Readable} from 'node:stream';
import {run} from '../common/action.js';

/**
 * @param {?string} timestamp
 * @return {string} timestamp's Date string,
 *    or today's Date string if no timestamp given
 */
function getDateString(timestamp) {
  return new Date(timestamp).toDateString();
}

await run(async () => {

  /** Abacus Data Airtable Table name. */
  const ABACUS_TABLE = 'Abacus Data';

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
    ['Source', 'Type'], // Also Paid, with Debit Date
    ['Debit Date', 'Debit Date'],
  ]);

  // For existing Abacus Airtable Records,
  // map Abacus Expense ID to Airtable Record ID.
  const expenseSources = new Base();
  const expenseRecords =
      getMapping(await expenseSources.select(ABACUS_TABLE), 'Expense ID');

  // Create parse config.
  const airtableFields = Array.from(mapping.values());
  let updateCount = 0;
  let createCount = 0;
  const parseConfig = {
    transformHeader: (header, index) => airtableFields[index],
    transform:
      (value, header) => {
        switch (header) {
        case 'Amount':
          return Number(value);
        case 'Approved':
          return value > '';
        case 'Type':
          return value === 'Manual' ? 'Reimbursement' : 'Card Transaction';

        // Paid references Type and Debit Date, so handle later (in chunk).
        default:
          return value === '' ? undefined : value;
        }
      },
    chunk:
      (results, parser) => {

        // Handle Paid, completing Abacus CSV row alignment with Airtable.
        for (const row of results.data) {
          row['Paid'] =
              row['Type'] === 'Card Transaction' || row['Debit Date'] > '';
        }

        const {updates, creates} =
            syncChanges(
                // Source
                new Map(results.data.map(row => [row['Expense ID'], row])),
                // Mapping
                expenseRecords);

        // Track change counts.
        updateCount += updates.size;
        createCount += creates.size;

        // Launch upserts.
        return Promise.all([
          expenseSources.update(
              ABACUS_TABLE, Array.from(updates, airtableRecordUpdate)),
          expenseSources.create(
              ABACUS_TABLE,
              Array.from(creates, ([, create]) => ({fields: create}))),
        ]);
      },
  };

  // Get CSVs.
  const importRecordId = airtableImportRecordId();
  let effectiveParse;
  let csvs;
  if (importRecordId) {
    effectiveParse = parse;
    const importRecord =
        await expenseSources.find('Abacus Imports', importRecordId);
    csvs = importRecord.get('CSVs');
  } else {
    effectiveParse = parse;
    const sftp = new Client();
    await sftp.connect({
      host: 'sftp.spend.emburse.com',
      username: emburseSftpUsername(),
      privateKey: emburseSftpKey(),
    });
    const files =
        await sftp.list(
            '', file => getDateString(file.modifyTime) === getDateString());
    const buffers = await Promise.all(files.map(f => sftp.get(f.name)));
    csvs = buffers.map(Readable.from);
  }

  // Parse CSVs with above config.
  await Promise.all(
      csvs.map(csv => effectiveParse(csv, airtableFields, parseConfig)));

  // Add summary.
  addSummaryTableHeaders(['Updates', 'Creates']);
  addSummaryTableRow([updateCount, createCount]);
});
