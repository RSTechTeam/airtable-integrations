import {airtableBase} from '../../test_utils.js';
import * as csv from '../../../src/common/csv.js';

const TABLE = 'Table 1';
const ID_FIELD = 'ID';
const TEXT_FIELD = 'Text';

const base = airtableBase();

test('getSync', async () => {

  const expected = new Map([
    [0, 'Oh'],
    [1, 'Hi'],
    [2, 'World'],
    [3, '!'],
  ]);

  // Run test.
  const {chunk} =
      csv.getSync(
          data => new Map(data.map(row => [row[ID_FIELD], row])),
          base, TABLE, ID_FIELD);
  await chunk(
      ['Oh', 'Hi', 'World'].map((t, i) => ({[ID_FIELD]: i, [TEXT_FIELD]: t})),
      null);

  // Check results.
  let created;
  let updated;
  const records = await base.select(TABLE, '');
  records.forEach(
    record => {
      const id = record.get(ID_FIELD);

      // Get upserted Record IDs for reset.
      switch (id) {
        case 0:
          created = record.getId();
          break;
        case 1:
          updated = record.getId();
      }

      expect(record.get(TEXT_FIELD)).toEqual(expected.get(id));
      expected.delete(id);
    });
  expect(expected.size).toEqual(0);

  // Reset.
  await base.base_(TABLE).destroy([created]);
  await base.update(TABLE, [{id: updated, fields: {[TEXT_FIELD]: 'Hello'}}]);
});
