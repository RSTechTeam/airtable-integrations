import * as utils from '../src/utils.js';

test('fetchError throws', () => {
  expect(() => fetchError('code', 'context', 'message')).toThrow();
});

const identity = x => x;

describe('batchAwait', () => {

  const identityBatchAwait =
      (array, size) => utils.batchAwait(identity, array, size);

  test('returns empty when given empty', () => {
    return expect(identityBatchAwait([], 1)).resolves.toEqual([]);
  });

  test('throws when size is not positive', () => {
    return expect(identityBatchAwait([0], 0)).rejects.toThrow();
  });

  describe.each`
    array       | size | expected
    ${[1]}      | ${1} | ${[[1]]}
    ${[1, 2]}   | ${1} | ${[[1], [2]]}
    ${[1, 2, 3]}| ${2} | ${[[1, 2], [3]]}
  `('using identity func', ({array, size, expected}) => {
    test(`with args (${array}, ${size}) returns ${expected}`, () => {
      return expect(identityBatchAwait(array, size)).resolves.toEqual(expected);
    });
  });
});
