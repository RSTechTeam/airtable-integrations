/** @fileoverview Imports an Abacus CSV update into Airtable. */

// const __dirname = import.meta.dirname;

// const Client = await import('ssh2-sftp-client');
import Client from 'ssh2-sftp-client';
import {addSummaryTableHeaders, addSummaryTableRow, log} from '../common/github_actions_core.js';
import {airtableRecordUpdate, getMapping, syncChanges} from '../common/sync.js';
import {Base} from '../common/airtable.js';
import {airtableImportRecordId, emburseSftpKey, emburseSftpUsername} from './inputs.js';
import {parse, parseAttachment} from '../common/csv.js';
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
log('a');
await run(async () => {
  log('b');
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
  log('c');
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
  log('b');
  const importRecordId = airtableImportRecordId();
  let effectiveParse;
  let csvs;
  if (importRecordId) {
    log('c');
    effectiveParse = parseAttachment;
    const importRecord =
        await expenseSources.find('Abacus Imports', importRecordId);
    csvs = importRecord.get('CSVs');
  } else {
    log('d');
    effectiveParse = parse;
    const sftp = new Client();
    log('e');
    await sftp.connect({
      host: 'sftp.spend.emburse.com',
      username: emburseSftpUsername(),
      privateKey: emburseSftpKey(),
    });
    log('f');
    log(await sftp.cwd());
    const files =
        await sftp.list(
            '', file => getDateString(file.modifyTime) === getDateString());
    log('g');
    log(files);
    const buffers = await Promise.all(files.map(f => sftp.get(f.name)));
    log('h');
    log(buffers);
    csvs = buffers.map(Readable.from);
    log('i');
  }

  // Parse CSVs with above config.
  await Promise.all(
      csvs.map(csv => effectiveParse(csv, airtableFields, parseConfig)));

  // Add summary.
  addSummaryTableHeaders(['Updates', 'Creates']);
  addSummaryTableRow([updateCount, createCount]);
});
