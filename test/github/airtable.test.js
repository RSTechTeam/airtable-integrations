import * as airtable from '../../src/airtable.js';

const base =
    new airtable.Base(
        process.env.AIRTABLE_BASE_ID, process.env.AIRTABLE_API_KEY);
const table = 'Table 1';
const select = (view, func) => base.select(table, view, func);
const recordIds = new Map();
const selectField = (view, field) => select(view, (r) => r.get(field));

describe('select', () => {

  test('given no table, throws', () => {
    return expect(base.select('', '', x => x)).rejects.toThrow();
  });

  test('given no view, defaults to whole table', () => {
    const ids =
        select(
            '',
            (r) => {
              const id = r.get('ID');
              recordIds.set(id, r.getId()); // Init recordIds
              return id;
            });
    return expect(ids).resolves.toEqual(expect.arrayContaining([1, 2, 3]));
  });

  test('given unknown view, throws', () => {
    return expect(selectField('Unknown', 'ID')).rejects.toThrow();
  });

  test('uses given view', async () => {
    const ids = await selectField('No One', 'ID');
    expect(ids).toEqual(expect.arrayContaining([2, 3]));
    expect(ids).toEqual(expect.not.arrayContaining([1]));
  });
});

test('update', async () => {
  const expectTextsToContain =
      (expected) => expect(selectField('', 'Text')).resolves.toEqual(
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
