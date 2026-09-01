/**
 * @fileoverview The CSV statement formats this importer accepts — the legacy
 * Amex export and the new Visa export — and the transform that normalizes
 * either into Transactions for the Amex Data table. Also the few fields that
 * come from the Amex Imports record itself rather than from its CSV.
 *
 * Pure data transforms only: no I/O and no action inputs, so tests can import
 * this module freely (index.js is the entry point with side effects).
 */

import Papa from 'papaparse';

/**
 * A bank transaction normalized for the Amex Data table. Both statement
 * formats produce the required core fields; the legacy Amex export also
 * carries the optional address/category columns.
 * @typedef {{
 *   Date: string,
 *   Merchant: string,
 *   Amount: number,
 *   'Extended Details': string,
 *   Reference: string,
 *   Address: (string|undefined),
 *   City: (string|undefined),
 *   State: (string|undefined),
 *   'Zip Code': (string|undefined),
 *   Country: (string|undefined),
 *   Category: (string|undefined),
 *   'Credit Card': (string|undefined),
 * }} Transaction
 */

/**
 * A known CSV statement format: the exact header that identifies it, and the
 * transform from one raw CSV row to a Transaction.
 * @typedef {{
 *   header: string[],
 *   normalizeRow: function(!Object<string, string>): !Transaction,
 * }} StatementFormat
 */

/**
 * The legacy Amex export. Merchant from Description (text before the first
 * double space), Amount as a Number (stripped of $ and thousands commas),
 * Reference stripped of quotes, City/State split, and the
 * "Appears On Your Statement As" column dropped.
 *
 * Current live exports keep the historical header but shift the location
 * data: City/State holds "CITY\nZIP" and the Zip Code column holds the
 * state. Older files had "CITY\nSTATE" with the zip under Zip Code. Both
 * layouts are accepted; a numeric second line tells them apart.
 * @type {!StatementFormat}
 */
export const AMEX_FORMAT = {
  header: [
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
  ],
  normalizeRow(row) {
    const merchant = row['Description'].match(/(.+?)\s\s+/);
    const cityState =
        row['City/State'].match(/(?<city>.+)\n(?<second>.+)/)?.groups;
    const zipInCityState = /^\d/.test(cityState?.second ?? '');
    return {
      'Date': row['Date'],
      'Merchant': merchant ? merchant[1] : row['Description'],
      'Amount': Number(row['Amount'].replace(/[$,]/g, '')),
      'Extended Details': row['Extended Details'],
      'Address': row['Address'],
      'City': cityState?.city,
      'State': zipInCityState ? row['Zip Code'] : cityState?.second,
      'Zip Code': zipInCityState ? cityState.second : row['Zip Code'],
      'Country': row['Country'],
      'Reference': row['Reference'].replaceAll("'", ''),
      'Category': row['Category'],
    };
  },
};

/**
 * The new Visa export. It shows debits as negative amounts, the opposite of
 * the Amex Data table's positive-charge convention, so Amount is negated
 * (finance request, 2026-07-30). Its Memo column is a semicolon-delimited
 * multi-value field, e.g.:
 *   `11111111111111111111111; 22222; ; DOE/JANE; SFO TO DTW ;`
 * which finance splits into: reference number; merchant #; ?; description.
 *
 * NOTE: the Memo -> Transaction mapping below is a best guess pending
 * confirmation from finance. It is intentionally the only place this mapping
 * lives, so it is a one-spot change. Memo segments (trimmed) are:
 *   [reference number, merchant #, ?, description...].
 * Reference = segment 1; Extended Details = segments 4+ joined. Transaction
 * type (DEBIT/CREDIT) and the merchant #/? segments are not currently mapped.
 * @type {!StatementFormat}
 */
export const VISA_FORMAT = {
  header: ['Date', 'Transaction', 'Name', 'Memo', 'Amount'],
  normalizeRow(row) {
    const segments = row['Memo'].split(';').map(segment => segment.trim());
    return {
      'Date': row['Date'],
      'Merchant': row['Name'],
      'Amount': -Number(row['Amount']),
      'Extended Details': segments.slice(3).filter(Boolean).join(' '),
      'Reference': segments[0],
    };
  },
};

/** Every format the importer accepts. To support a new format, add it here. */
const FORMATS = [AMEX_FORMAT, VISA_FORMAT];

const headerEquals = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param {string[]} fields The parsed (trimmed) CSV header.
 * @return {!StatementFormat} The format whose header matches.
 * @throws if the header matches no known format.
 */
export function detectFormat(fields) {
  const format = FORMATS.find(f => headerEquals(f.header, fields));
  if (!format) throw new Error(`Unrecognized CSV header: ${fields}`);
  return format;
}

/**
 * Detects the statement format of a whole CSV from its header row, parsed
 * (with papaparse, so quoting/BOM/line endings are handled) but not otherwise
 * processed. Lets the importer pick the format up front and then parse with
 * that format's exact expected header.
 * @param {string} csvText
 * @return {!StatementFormat}
 * @throws if the header matches no known format.
 */
export function detectFormatFromCsv(csvText) {
  const {meta} = Papa.parse(csvText, {header: true, preview: 1});
  return detectFormat((meta.fields ?? []).map(field => field.trim()));
}

/**
 * Amex Imports fields that describe the whole import and so belong on each of
 * its transactions. Adding another shared field is a one-line change here,
 * given the same field name exists on Amex Data.
 * @type {string[]}
 */
const IMPORT_RECORD_FIELDS = ['Credit Card'];

/**
 * Normalizes a batch of parsed CSV rows (in either accepted format) into
 * Transactions keyed by Reference, dropping rows without one. Passed to
 * csv.getSync, which diffs each batch against the Airtable table by this key.
 *
 * extraFields is stamped onto every Transaction in the batch — it carries the
 * values that describe the whole import rather than one row (see
 * importRecordFields). It is spread last, so the import record wins over any
 * same-named CSV column; no accepted format defines one today.
 * @param {!Array<!Object<string, string>>} rows
 * @param {!Object<string, *>=} extraFields
 * @return {!Map<string, !Transaction>}
 */
export function transactionsByReference(rows, extraFields = {}) {
  if (rows.length === 0) return new Map();
  const format = detectFormat(Object.keys(rows[0]));
  return new Map(
      rows
          .map(row => ({...format.normalizeRow(row), ...extraFields}))
          .filter(transaction => transaction['Reference'])
          .map(transaction => [transaction['Reference'], transaction]));
}

/**
 * The Amex Imports fields copied onto every Transaction of that import. Only
 * values actually set are returned, so a base whose Amex Imports table lacks
 * these fields (or leaves them blank) syncs exactly as it did before they
 * existed, and never blanks the destination on update.
 * @param {{get: function(string): *}} importRecord An Airtable record, or
 *     anything else answering get(fieldName).
 * @return {!Object<string, *>}
 */
export function importRecordFields(importRecord) {
  return Object.fromEntries(
      IMPORT_RECORD_FIELDS
          .map(field => [field, importRecord.get(field)])
          .filter(([, value]) => value));
}
