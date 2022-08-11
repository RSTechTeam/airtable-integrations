import * as airtable from '../../src/airtable.js';

const base =
    new airtable.Base(
        process.env.AIRTABLE_BASE_ID, process.env.AIRTABLE_API_KEY);
const table = 'Table 1';

describe('select', () => {
  const selectIds = async (view) => {
    const ids = [];
    await base.select(table, view, (r) => ids.push(r.get('ID')));
    return ids;
  }

  test('with no view defaults to whole table', () => {
    return expect(selectIds(undefined)).resolves.toEqual(
        expect.arrayContaining([1, 2, 3]));
  });

  test('uses given view', async () => {
    const ids = await selectIds('No One');
    expect(ids).toEqual(expect.arrayContaining([2, 3]));
    expect(ids).toEqual(expect.not.arrayContaining([1]));
  })
});