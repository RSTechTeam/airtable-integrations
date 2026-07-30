import * as csv from '../../../src/common/csv.js';
import {
  AMEX_FORMAT,
  VISA_FORMAT,
  detectFormat,
  detectFormatFromCsv,
  transactionsByReference,
} from '../../../src/visa/formats.js';

// Minimal RFC-4180 field quoting so we can embed the newline Amex uses inside
// the City/State column and the ", " spacing Visa uses.
const quoteField = (v) => /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
const toCsv = (header, rows) =>
    [header, ...rows].map((r) => r.map(quoteField).join(',')).join('\n');

// Mirrors the action's per-attachment flow with no network: detect the
// format from the CSV text, then parse with that format's header, capturing
// what transactionsByReference would sync.
const runImport = async (csvText) => {
  const synced = new Map();
  const format = detectFormatFromCsv(csvText);
  await csv.parse(csvText, format.header, {
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    transform: (v) => typeof v === 'string' ? v.trim() : v,
    chunk: (results) => {
      for (const [ref, row] of transactionsByReference(results.data)) {
        synced.set(ref, row);
      }
    },
  });
  return synced;
};

describe('AMEX_FORMAT.normalizeRow', () => {
  const row = (over = {}) => ({
    'Date': '07/15/2026',
    'Description': 'STARBUCKS STORE  0123',
    'Amount': '12.50',
    'Extended Details': 'Coffee run',
    'Appears On Your Statement As': 'AplPay STARBUCKS',
    'Address': '123 MAIN ST',
    'City/State': 'SEATTLE\nWA',
    'Zip Code': '98101',
    'Country': 'UNITED STATES',
    'Reference': "'320261234567890'",
    'Category': 'Restaurant-Restaurant',
    ...over,
  });

  test('maps an Amex row to the common shape', () => {
    const out = AMEX_FORMAT.normalizeRow(row());
    expect(out).toEqual({
      'Date': '07/15/2026',
      'Merchant': 'STARBUCKS STORE',
      'Amount': 12.5,
      'Extended Details': 'Coffee run',
      'Address': '123 MAIN ST',
      'City': 'SEATTLE',
      'State': 'WA',
      'Zip Code': '98101',
      'Country': 'UNITED STATES',
      'Reference': '320261234567890',
      'Category': 'Restaurant-Restaurant',
    });
  });

  test('keeps the whole Merchant when there is no double space', () => {
    expect(AMEX_FORMAT.normalizeRow(row({'Description': 'AMAZON'})).Merchant)
        .toEqual('AMAZON');
  });

  test('leaves City/State undefined when the value does not match', () => {
    const out = AMEX_FORMAT.normalizeRow(row({'City/State': ''}));
    expect(out.City).toBeUndefined();
    expect(out.State).toBeUndefined();
  });
});

describe('VISA_FORMAT.normalizeRow', () => {
  const row = (over = {}) => ({
    'Date': '2026-07-22',
    'Transaction': 'DEBIT',
    'Name': 'Some Airline',
    'Memo':
        '11111111111111111111111; 22222; ; DOE/JANE; ' +
        '2026-07-22 SAN FRANCISCO TO DETROIT ;',
    'Amount': '-120',
    ...over,
  });

  test('splits Memo and maps a Visa row to the common shape', () => {
    expect(VISA_FORMAT.normalizeRow(row())).toEqual({
      'Date': '2026-07-22',
      'Merchant': 'Some Airline',
      'Amount': -120,
      'Extended Details': 'DOE/JANE 2026-07-22 SAN FRANCISCO TO DETROIT',
      'Reference': '11111111111111111111111',
    });
  });

  test('uses the first Memo segment as the Reference key', () => {
    expect(VISA_FORMAT.normalizeRow(row()).Reference)
        .toEqual('11111111111111111111111');
  });

  test('treats a Memo with no semicolons as a bare Reference', () => {
    const out = VISA_FORMAT.normalizeRow(row({'Memo': 'UNSTRUCTURED MEMO'}));
    expect(out.Reference).toEqual('UNSTRUCTURED MEMO');
    expect(out['Extended Details']).toEqual('');
  });
});

describe('transactionsByReference', () => {
  // Raw Visa-format rows; keys must be in header order for detectFormat.
  const rawRow = (memo, name = 'Some Airline') => ({
    'Date': '2026-07-22',
    'Transaction': 'DEBIT',
    'Name': name,
    'Memo': memo,
    'Amount': '-120',
  });

  test('returns an empty Map for an empty chunk', () => {
    expect(transactionsByReference([])).toEqual(new Map());
  });

  test('drops rows without a Reference', () => {
    const synced = transactionsByReference([
      rawRow('123; 22222; ; KEPT;'),
      rawRow('; 22222; ; DROPPED, empty first segment;'),
    ]);
    expect([...synced.keys()]).toEqual(['123']);
  });

  test('keeps the last row when References collide', () => {
    const synced = transactionsByReference([
      rawRow('123; ; ; first;', 'First Merchant'),
      rawRow('123; ; ; second;', 'Second Merchant'),
    ]);
    expect(synced.size).toBe(1);
    expect(synced.get('123').Merchant).toEqual('Second Merchant');
  });
});

describe('detectFormat', () => {
  test('recognizes the Amex header', () => {
    expect(detectFormat(AMEX_FORMAT.header)).toBe(AMEX_FORMAT);
  });
  test('recognizes the Visa header', () => {
    expect(detectFormat(VISA_FORMAT.header)).toBe(VISA_FORMAT);
  });
  test('throws on an unknown header', () => {
    expect(() => detectFormat(['Wrong', 'Header'])).toThrow();
  });
});

describe('detectFormatFromCsv', () => {
  test('detects from raw CSV text, handling quoting and padding', () => {
    expect(detectFormatFromCsv('Date,Transaction,Name,"Memo", Amount \nx'))
        .toBe(VISA_FORMAT);
  });
  test('throws on an empty CSV', () => {
    expect(() => detectFormatFromCsv('')).toThrow();
  });
});

describe('import pipeline (end to end)', () => {
  test('normalizes an Amex CSV', async () => {
    const synced = await runImport(toCsv(AMEX_FORMAT.header, [
      [
        '07/15/2026', 'STARBUCKS STORE  0123', '12.50', 'Coffee run',
        'AplPay STARBUCKS', '123 MAIN ST', 'SEATTLE\nWA', '98101',
        'UNITED STATES', "'320261234567890'", 'Restaurant-Restaurant',
      ],
    ]));

    expect([...synced.keys()]).toEqual(['320261234567890']);
    const row = synced.get('320261234567890');
    expect(row.Merchant).toEqual('STARBUCKS STORE');
    expect(row.Amount).toBe(12.5);
    expect(row.City).toEqual('SEATTLE');
    expect(row.State).toEqual('WA');
    expect(row).not.toHaveProperty('City/State');
  });

  test('normalizes a Visa CSV into the same common shape', async () => {
    const synced = await runImport(toCsv(VISA_FORMAT.header, [
      [
        '2026-07-22', 'DEBIT', 'Some Airline',
        '11111111111111111111111; 22222; ; DOE/JANE; ' +
            '2026-07-22 SAN FRANCISCO TO DETROIT ;',
        '-120',
      ],
    ]));

    expect([...synced.keys()]).toEqual(['11111111111111111111111']);
    const row = synced.get('11111111111111111111111');
    // Same common-shape fields the Amex path produces.
    expect(row.Date).toEqual('2026-07-22');
    expect(row.Merchant).toEqual('Some Airline');
    expect(row.Amount).toBe(-120);
    expect(row.Reference).toEqual('11111111111111111111111');
    expect(row['Extended Details'])
        .toEqual('DOE/JANE 2026-07-22 SAN FRANCISCO TO DETROIT');
  });

  test('rejects a CSV whose header matches neither format', async () => {
    await expect(runImport('Wrong,Header\nx,y')).rejects.toThrow();
  });

  test('tolerates trailing newlines and blank lines', async () => {
    const synced = await runImport(toCsv(VISA_FORMAT.header, [
      [
        '2026-07-22', 'DEBIT', 'Some Airline',
        '11111111111111111111111; 22222; ; DOE/JANE; SFO TO DTW ;', '-120',
      ],
    ]) + '\n\n');
    expect([...synced.keys()]).toEqual(['11111111111111111111111']);
  });
});
