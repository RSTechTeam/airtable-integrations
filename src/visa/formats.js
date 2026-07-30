/**
 * @fileoverview The CSV statement formats this importer accepts — the legacy
 * Amex export and the new Visa export — and the transform that normalizes
 * either into Transactions for the Amex Data table.
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
 * The legacy Amex export. Original Amex import logic, unchanged in behavior:
 * Merchant from Description (text before the first double space), Amount as a
 * Number, Reference stripped of quotes, City/State split, and the
 * "Appears On Your Statement As" column dropped.
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
        row['City/State'].match(/(?<city>.+)\n(?<state>.+)/)?.groups;
    return {
      'Date': row['Date'],
      'Merchant': merchant ? merchant[1] : row['Description'],
      'Amount': Number(row['Amount']),
      'Extended Details': row['Extended Details'],
      'Address': row['Address'],
      'City': cityState?.city,
      'State': cityState?.state,
      'Zip Code': row['Zip Code'],
      'Country': row['Country'],
      'Reference': row['Reference'].replaceAll("'", ''),
      'Category': row['Category'],
    };
  },
};

/**
 * The new Visa export. Its Memo column is a semicolon-delimited multi-value
 * field, e.g.:
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
      'Amount': Number(row['Amount']),
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
 * Normalizes a batch of parsed CSV rows (in either accepted format) into
 * Transactions keyed by Reference, dropping rows without one. Passed to
 * csv.getSync, which diffs each batch against the Airtable table by this key.
 * @param {!Array<!Object<string, string>>} rows
 * @return {!Map<string, !Transaction>}
 */
export function transactionsByReference(rows) {
  if (rows.length === 0) return new Map();
  const format = detectFormat(Object.keys(rows[0]));
  return new Map(
      rows
          .map(row => format.normalizeRow(row))
          .filter(transaction => transaction['Reference'])
          .map(transaction => [transaction['Reference'], transaction]));
}
