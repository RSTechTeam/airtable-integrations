/** @fileoverview Imports an Abacus CSV update into Airtable. */

import Client from 'ssh2-sftp-client';
import {Base} from '../common/airtable.js';
import {airtableImportRecordId, emburseSftpKey, emburseSftpUsername} from './inputs.js';
import {getSync, parse, parseAttachment} from '../common/csv.js';
import {Readable} from 'node:stream';
import {run} from '../common/action.js';

await run(async () => {

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

  // Create parse config.
  const expenseSources = new Base();
  const {chunk, summarize} =
      await getSync(
          data => {
            for (const row of data) {
              row['Paid'] =
                  row['Type'] === 'Card Transaction' || row['Debit Date'] > '';
            }
            return new Map(data.map(row => [row['Expense ID'], row]));
          },
          expenseSources, 'Abacus Data', 'Expense ID');
  const airtableFields = Array.from(mapping.values());
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

        // Paid references Type and Debit Date, so handle in chunk.
        default:
          return value === '' ? undefined : value;
        }
      },
    chunk,
  };

  // Get CSVs.
  const importRecordId = airtableImportRecordId();
  let effectiveParse;
  let csvs;
  if (importRecordId) {
    effectiveParse = parseAttachment;
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
    const now = new Date();
    const oneDayAgo = now.setHours(now.getHours() - 24);
    const files = await sftp.list('/', file => file.modifyTime > oneDayAgo);
    const buffers = await Promise.all(files.map(f => sftp.get(f.name)));
    csvs = buffers.map(Readable.from);
    await sftp.end();
  }

  // Parse CSVs with above config.
  await Promise.all(
      csvs.map(csv => effectiveParse(csv, airtableFields, parseConfig)));
  summarize();
});
