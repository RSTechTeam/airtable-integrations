import * as airtable from '../../src/airtable.js';

const base =
    new airtable.Base(
        process.env.AIRTABLE_BASE_ID, process.env.AIRTABLE_API_KEY);
const table = 'Table 1';
const select = (view, func) => base.select(table, view, func);
const recordIds = new Map();
const selectField = (view, field) => select(view, (r) => r.get(field));
const selectId = (view) => selectField(view, 'ID');

describe('select', () => {

  test('given no table, throws', () => {
    expect(() => base.select('', '', x => x)).toThrow();
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
    return expect(selectId('Unknown')).rejects.toThrow();
  });

  test('uses given view', async () => {
    const ids = await selectId('No One');
    expect(ids).toEqual(expect.arrayContaining([2, 3]));
    expect(ids).toEqual(expect.not.arrayContaining([1]));
  });
});

describe('update', () => {

  test('given empty, returns empty', () => {
    return expect(base.update(table, [])).resolves.toEqual([]);
  });

  const update = (tbl, text1, text3) => {
    return base.update(tbl, [
      {id: recordIds.get(1), fields: {Text: text1}},
      {id: recordIds.get(3), fields: {Text: text3}},
    ]);
  };

  test('given no table (with non-empty updates), throws', () => {
    expect(() => update('', '', '')).toThrow();
  });

  test('updates records', async () => {
    const expectTextsToContain =
        (expected) => expect(selectField('', 'Text')).resolves.toEqual(
            expect.arrayContaining(expected));
    await expectTextsToContain(['Hello', 'World', '!']);

    
    await update(table, 'Goodbye', '?');
    await expectTextsToContain(['Goodbye', 'World', '?']);

    await update(table, 'Hello', '!');
    await expectTextsToContain(['Hello', 'World', '!']);
  });
});

describe('create', () => {

  test('given empty, return empty', () => {
    return expect(base.create(table, [])).resolves.toEqual([]);
  });

  const create = (tbl) => {
    base.create(tbl, [{fields: {ID: 4}}, {fields: {ID: 5}}]);
  };

  test('given no table (with non-empty creates), throws', () => {
    expect(() => create('')).toThrow();
  });

  test('creates records', async () => {
    const created = await create(table);
    console.log(created);
    const ids = await selectId('');
    expect(ids.length).toBe(5);
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
  });
});
