import * as airtable from '../../src/airtable.js';

const base =
    new airtable.Base(
        process.env.AIRTABLE_BASE_ID, process.env.AIRTABLE_API_KEY);
const table = 'Table 1';
const select = (view, func) => base.select(table, view, func);
const recordIds = new Map();
const selectField = async (view, field) => {
  const vals = [];
  await select(view, (r) => vals.push(r.get(field)));
  return vals;
}

describe('select', () => {

  test('with no view defaults to whole table', async () => {
    const ids = [];
    await select(
      undefined,
      (r) => {
        const id = r.get('ID');
        ids.push(id);
        recordIds.set(id, r.getId()); // Init recordIds
      });
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  test('with unknown view throws', () => {
    return expect(selectField('', 'ID')).rejects.toThrow();
  });

  test('uses given view', async () => {
    const ids = await selectField('No One', 'ID');
    expect(ids).toEqual(expect.arrayContaining([2, 3]));
    expect(ids).toEqual(expect.not.arrayContaining([1]));
  });
});

test('update', async () => {
  const expectTextsToContain =
      (expected) => expect(selectField(undefined, 'Text')).resolves.toEqual(
          expect.arrayContaining(expected));
  await expectTextsToContain(['Hello', 'World', '!']);

  const update = (text1, text3) => {
    return base.update(table, [
      {id: recordIds.get(1), fields: {Text: text1}},
      {id: recordIds.get(3), fields: {Text: text3}},
    ]);
  };
  await update('Goodbye', '?');
  await expectTextsToContain(['Goodbye', 'World', '?']);

  await update('Hello', '!');
  await expectTextsToContain(['Hello', 'World', '!']);
});
