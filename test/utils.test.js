import * as utils from '../src/utils.js';

test('batchAwait returns empty when given empty', () => {
  return expect(utils.batchAwait(null, [], 0)).resolves.toEqual([]);
});
