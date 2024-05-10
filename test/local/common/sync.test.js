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

const records = [
  [1, 2],
  [3, 6],
  [4, null],
].map(
    ([airtableId, integrationId]) => ({
      getId: () => airtableId, get: () => integrationId}));

describe.each`
  source   | expected
  ${true}  | ${[[2, 1], [6, 3], [null, 4]]}
  ${false} | ${[[1, 2], [3, 6]]}
`('getMapping', ({source, expected}) => {
  test(
      `given args (${stringify(records)}, ${source}),` +
          ` returns ${stringify(expected)}`,
      () => {
        expect(Array.from(sync.getMapping(records, '', source))).toEqual(
            expect.arrayContaining(expected));
      });
});

test('airtableRecordUpdate', () => {
  const id = 'rec1';
  const update = {'Field': 'value'};
  expect(sync.airtableRecordUpdate([id, update])).toEqual({id, fields: update});
});
