/** @fileoverview Imports an Amex or Visa CSV update into Airtable. */

import {airtableImportRecordId} from '../common/inputs.js';
import {Base} from '../common/airtable.js';
import {fetchAttachment} from '../common/fetch.js';
import {getSync, parse} from '../common/csv.js';
import {warn} from '../common/github_actions_core.js';
import {run} from '../common/action.js';
import {
  detectFormatFromCsv,
  importRecordFields,
  transactionsByReference,
} from './formats.js';

// Flow: fetch the CSV attachment(s) on the Airtable import record
//   -> detect each CSV's statement format from its header (see formats.js;
//      unrecognized headers throw before anything is parsed)
//   -> papaparse streams rows in batches (sync.chunk runs once per batch)
//   -> each batch: normalize rows into Transactions, stamp on the import
//      record's own fields (Credit Card, where Amex Data has them), and
//      upsert them into Amex Data keyed by Reference (existing records
//      update, new ones create)
//   -> sync.summarize() writes Update/Create counts to the job summary.
await run(async () => {
  // The "Expense Sources" Airtable base; which base, and as whom, comes from
  // the workflow's action inputs (see inputs.js and visa.yml).
  const expenseSourcesBase = new Base();

  /**
   * The Amex Imports row that triggered this run; its CSV field holds the
   * attached statement export(s) to import, and its own fields describe the
   * import as a whole.
   * @type {!import('airtable').Record<!import('airtable').FieldSet>}
   */
  const importRecord =
      await expenseSourcesBase.find('Amex Imports', airtableImportRecordId());

  // Fields copied from the import record onto every transaction it produces,
  // less any that Amex Data does not have. Writing an unknown field name
  // fails the whole batch, so a base that has the field on Amex Imports but
  // not yet on Amex Data would import nothing at all; skipping it instead
  // means everything else still syncs, in whichever order the two tables get
  // the field.
  const extraFields = {};
  for (const [field, value] of
      Object.entries(importRecordFields(importRecord))) {
    if (await expenseSourcesBase.hasField('Amex Data', field)) {
      extraFields[field] = value;
    } else {
      warn(`Amex Data has no ${field} field; importing without it.`);
    }
  }

  // Credit Card is a single select on both tables, and Airtable has no way to
  // share one option list between them. typecast makes it create any option
  // it does not already have, so the lists converge without manual upkeep.
  // It applies to the whole record write, not just that field, so only ask
  // for it when there is actually a value to write: with none, these upserts
  // are byte-for-byte what they were before this field existed.
  const writeOptions =
      Object.keys(extraFields).length > 0 ? {typecast: true} : {};
  const sync =
      await getSync(
          rows => transactionsByReference(rows, extraFields),
          expenseSourcesBase, 'Amex Data', 'Reference', writeOptions);

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
