import * as airtable from '../../../src/common/airtable.js';
import {airtableBase} from '../../test_utils.js';

const base = airtableBase();
const table = 'Table 1';
const getField = (field) => (r) => r.get(field);
const select = (view) => base.select(table, view);
const selectField = async (view, field) => {
  const records = await select(view);
  return records.map(getField(field));
};
const selectId = (view) => selectField(view, 'ID');

describe('select', () => {

  test('given no table, throws', () => {
    expect(() => base.select('', '')).toThrow();
  });

  test('given no view, defaults to whole table', () => {
    return expect(select('')).resolves.toHaveLength(3);
  });

  test('given unknown view, throws', () => {
    return expect(select('Unknown')).rejects.toThrow();
  });

  test('uses given view', async () => {
    const ids = await selectId('No One');
    expect(ids).toEqual(expect.arrayContaining([2, 3]));
    expect(ids).toEqual(expect.not.arrayContaining([1]));
  });
});


const records = await select('');
const recordIds = new Map(records.map((r) => [r.get('ID'), r.getId()]));
const update = (tbl, text1, text2, text3) => {
  return base.update(tbl, [
    {id: recordIds.get(1), fields: {Text: text1}},
    {id: recordIds.get(2), fields: {Text: text2}},
    {id: recordIds.get(3), fields: {Text: text3}},
  ]);
};
const resetTexts = () => update(table, 'Hello', 'World', '!');
const expectTextsToEqual =
    (expected) => expect(selectField('', 'Text')).resolves.toEqual(expected);
const expectTextsToContain =
    (expected) => expectTextsToEqual(expect.arrayContaining(expected));
const expectControlTexts = () => expectTextsToContain(['Hello', 'World', '!']);
const resetAndExpectControlTexts = async () => {
  await resetTexts();
  await expectControlTexts();
};

describe('update', () => {

  test('given empty, returns empty', () => {
    return expect(base.update(table, [])).resolves.toEqual([]);
  });

  test('given no table (with non-empty updates), throws', () => {
    expect(() => update('', '', '', '')).toThrow();
  });

  test('updates records', async () => {
    await expectControlTexts();
    
    await update(table, 'Goodbye', 'Earth', '?');
    await expectTextsToContain(['Goodbye', 'Earth', '?']);

    await resetAndExpectControlTexts();
  });
});

describe('selectAndUpdate', () => {

  afterEach(resetAndExpectControlTexts);

  test('given no table, throws', () => {
    return expect(base.selectAndUpdate('', '', x => x)).rejects.toThrow();
  });

  const selectAndUpdate = (view) => {
    return base.selectAndUpdate(
        table, view, (record) => record.get('ID') === 2 ? null : {Text: 'Hi'});
  };

  test('given no view, defaults to whole table', async () => {
    await selectAndUpdate('');
    await expectTextsToContain(['Hi', 'World', 'Hi']);
  });

  test('given unknown view, throws', () => {
    return expect(selectAndUpdate('Unknown')).rejects.toThrow();
  });

  test('uses given view', async () => {
    await selectAndUpdate('No One');
    await expectTextsToContain(['Hello', 'World', 'Hi']);
  });
});

describe('create', () => {

  // Expect no residual created records.
  afterEach(() => expect(selectId('')).resolves.toHaveLength(3));

  test('given empty, return empty', () => {
    return expect(base.create(table, [])).resolves.toEqual([]);
  });

  const create = (tbl) => {
    return base.create(tbl, [{fields: {ID: 4}}, {fields: {ID: 5}}]);
  };

  test('given no table (with non-empty creates), throws', () => {
    expect(() => create('')).toThrow();
  });

  test('creates records', async () => {
    const created = await create(table);
    const ids = await selectId('');
    expect(ids).toHaveLength(5);
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
    await base.base_(table).destroy(created[0].map((r) => r.id));
  });
});

describe('find', () => {

  const find = (tbl, id) => base.find(tbl, recordIds.get(id), getField('ID'));

  test('given no table, throws', () => expect(() => find('', 1)).toThrow());
  test('given no id, throws', () => expect(find(table, '')).rejects.toThrow());
  test('finds record', () => expect(find(table, 1)).resolves.toEqual(1));
});
