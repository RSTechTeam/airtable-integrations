import * as airtable from '../../src/airtable.js';

const base =
    new airtable.Base(
        process.env.AIRTABLE_BASE_ID, process.env.AIRTABLE_API_KEY);
const table = 'Table 1';

describe('select', () => {
  test('with no view defaults', async () => {
    const ids = [];
    await base().select(table, undefined, (r) => ids.push(r.get('ID')));
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3]));
  });
});