import * as sync from '../../../src/common/sync.js';
import {jest} from '@jest/globals';

const stringify = JSON.stringify;

describe.each`
  source                             | mapping                 | expected
  ${[]}                              | ${[]}                   | ${{u: [], c: [], r: []}}
  ${[]}                              | ${[['a', 1]]}           | ${{u: [], c: [], r: [1]}}
  ${[['a', {x: 5}]]}                 | ${[]}                   | ${{u: [], c: [['a', {x: 5}]], r: []}}
  ${[['a', {x: 5}], ['b', {y: 10}]]} | ${[['b', 2], ['c', 3]]} | ${{u: [[2, {y: 10}]], c: [['a', {x: 5}]], r: [3]}}
`('syncChanges', ({source, mapping, expected}) => {

  test(
      `given args (${stringify(source)}, ${stringify(mapping)}),` +
          ` returns ${stringify(expected)}`,
      () => {
        expect(sync.syncChanges(new Map(source), new Map(mapping))).toEqual({
          updates: new Map(expected.u),
          creates: new Map(expected.c),
          removes: new Set(expected.r),
        })
      });

  // Do additional destination IDs test for final testcase.
  if (source.length > 0 && mapping.length > 0) {
    test('destination IDs', () => {
      const got =
          sync.syncChanges(
              new Map(source), new Map(mapping), new Set([2, 3, 4]));
      expect(got).toEqual({
        updates: new Map(expected.u),
        creates: new Map(expected.c),
        removes: new Set([3, 4]),
      })
    })
  }
});

const concat = (s1, s2) => s1 + s2;

describe.each`
  given                       | expected
  ${[]}                       | ${[]}
  ${[['a', '1']]}             | ${['a1']}
  ${[['a', '1'], ['b', '2']]} | ${['a1', 'b2']}
`('mapEntries', ({given, expected}) => {
  test(`given ${stringify(given)}, returns ${stringify(expected)}`, () => {
    expect(sync.mapEntries(new Map(given), concat)).toEqual(expected);
  });
});

describe.each`
  map                         | set           | expected
  ${[]}                       | ${[]}         | ${[]}
  ${[]}                       | ${['a']}      | ${['A']}
  ${[['a', '1']]}             | ${[]}         | ${['a1']}
  ${[['a', '1']]}             | ${['a']}      | ${['a1', 'A']}
  ${[['a', '1'], ['b', '2']]} | ${['a', 'b']} | ${['a1', 'b2', 'A', 'B']}
`('mapEntriesAndValues', ({map, set, expected}) => {

  const upperCase = s => s.toUpperCase();
  test(
      `given args (${stringify(map)}, ${stringify(set)}),` +
          ` returns ${stringify(expected)}`,
      () => {
        const got =
            sync.mapEntriesAndValues(
                new Map(map), concat, new Set(set), upperCase)
        expect(got).toEqual(expected);
      });
});

test('airtableRecordUpdate', () => {
  const id = 'rec1';
  const update = {'Field': 'value'};
  expect(sync.airtableRecordUpdate(id, update)).toEqual({id, fields: update});
});
