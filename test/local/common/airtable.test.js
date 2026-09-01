import {Base} from '../../../src/common/airtable.js';

// Offline: constructing a Base makes no request, and every write is routed
// through the stub below instead of the Airtable client.
const stubbedBase = () => {
  const calls = [];
  const base = new Base('appTest', 'keyTest');
  const record = (records, options) => {
    // batch() splices the caller's array, so snapshot rather than hold it.
    calls.push({records: [...records], options: options});
    return Promise.resolve([]);
  };
  base.base_ = () => ({update: record, create: record});
  return {base, calls};
};

const rows = (n) => Array.from({length: n}, (_, i) => ({fields: {ID: i}}));

describe.each([['update'], ['create']])('Base.%s writeOptions', (method) => {
  test('defaults to no options', async () => {
    const {base, calls} = stubbedBase();
    await base[method]('Table', rows(1));
    expect(calls[0].options).toEqual({});
  });

  test('forwards what it is given', async () => {
    const {base, calls} = stubbedBase();
    await base[method]('Table', rows(1), {typecast: true});
    expect(calls[0].options).toEqual({typecast: true});
  });

  // Array.from's map function passes (chunk, index), so handing the client
  // method to batch directly used to put the batch index in the options slot.
  test('sends an options object, never the batch index', async () => {
    const {base, calls} = stubbedBase();
    await base[method]('Table', rows(25), {typecast: true});
    for (const call of calls) {
      expect(call.options).toEqual({typecast: true});
    }
  });

  test('still batches at 10 records per request', async () => {
    const {base, calls} = stubbedBase();
    await base[method]('Table', rows(25));
    expect(calls.map(call => call.records.length)).toEqual([10, 10, 5]);
  });

  test('makes no request for an empty array', async () => {
    const {base, calls} = stubbedBase();
    await expect(base[method]('Table', [])).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });
});

// The Airtable client turns a 422 into an error carrying the API's error
// type, which is how a missing field is told apart from anything else.
const airtableError = (error, statusCode = 422) =>
    Object.assign(new Error(error), {error: error, statusCode: statusCode});

const probedBase = (firstPage) => {
  const queries = [];
  const base = new Base('appTest', 'keyTest');
  base.base_ = () => ({
    select: (params) => {
      queries.push(params);
      return {firstPage: firstPage};
    },
  });
  return {base, queries};
};

describe('Base.hasField', () => {
  test('is true when Airtable accepts the field', async () => {
    const {base} = probedBase(() => Promise.resolve([]));
    await expect(base.hasField('Amex Data', 'Credit Card')).resolves.toBe(true);
  });

  test('is false when the table does not have the field', async () => {
    const {base} =
        probedBase(() => Promise.reject(airtableError('UNKNOWN_FIELD_NAME')));
    await expect(base.hasField('Amex Data', 'Credit Card'))
        .resolves.toBe(false);
  });

  // Only a missing field is an answer; anything else has to fail the run
  // rather than be read as "no such field" and silently drop data.
  test('rethrows any other error', async () => {
    const {base} =
        probedBase(() => Promise.reject(airtableError('NOT_AUTHORIZED', 403)));
    await expect(base.hasField('Amex Data', 'Credit Card')).rejects
        .toThrow('Error selecting records in Airtable Table Amex Data');
  });

  test('asks for just that field, and at most one record', async () => {
    const {base, queries} = probedBase(() => Promise.resolve([]));
    await base.hasField('Amex Data', 'Credit Card');
    expect(queries[0]).toEqual({fields: ['Credit Card'], maxRecords: 1});
  });
});
