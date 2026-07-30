/** @fileoverview Imports an Amex or Visa CSV update into Airtable. */

import {airtableImportRecordId} from '../common/inputs.js';
import {Base} from '../common/airtable.js';
import {fetchAttachment} from '../common/fetch.js';
import {getSync, parse} from '../common/csv.js';
import {run} from '../common/action.js';
import {detectFormatFromCsv, transactionsByReference} from './formats.js';

// Flow: fetch the CSV attachment(s) on the Airtable import record
//   -> detect each CSV's statement format from its header (see formats.js;
//      unrecognized headers throw before anything is parsed)
//   -> papaparse streams rows in batches (sync.chunk runs once per batch)
//   -> each batch: normalize rows into Transactions and upsert them into
//      Amex Data keyed by Reference (existing records update, new ones
//      create)
//   -> sync.summarize() writes Update/Create counts to the job summary.
await run(async () => {
  // The "Expense Sources" Airtable base; which base, and as whom, comes from
  // the workflow's action inputs (see inputs.js and visa.yml).
  const expenseSourcesBase = new Base();
  const sync =
      await getSync(
          transactionsByReference, expenseSourcesBase, 'Amex Data',
          'Reference');

  // How each CSV is parsed. The keys are papaparse's config API
  // (https://www.papaparse.com/docs#config): skip blank lines (bank exports
  // end with a trailing newline, which would otherwise reach normalizeRow as
  // a phantom empty row), trim whitespace from every header and every cell,
  // and hand each batch of rows to the Airtable sync.
  const papaparseConfig = {
    skipEmptyLines: 'greedy',
    transformHeader: header => header.trim(),
    transform: value => typeof value === 'string' ? value.trim() : value,
    chunk: sync.chunk,
  };

  /**
   * The Amex Imports row that triggered this run; its CSV field holds the
   * attached statement export(s) to import.
   * @type {!import('airtable').Record<!import('airtable').FieldSet>}
   */
  const importRecord =
      await expenseSourcesBase.find('Amex Imports', airtableImportRecordId());
  await Promise.all(
      importRecord.get('CSV').map(
          async attachment => {
            const response = await fetchAttachment(attachment);
            const csvText = await response.text();
            const format = detectFormatFromCsv(csvText);
            return parse(csvText, format.header, papaparseConfig);
          }));
  sync.summarize();
});
