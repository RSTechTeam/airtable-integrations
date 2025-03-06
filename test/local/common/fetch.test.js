import * as fetch from '../../../src/common/fetch.js';
import {jest} from '@jest/globals';

describe('fetch', () => {

  const err = jest.fn(response => ({}));
  const testFetch = (...fetchArgs) => fetch.fetch(err, ...fetchArgs);

  afterEach(err.mockClear);

  test('throws after retries', async () => {
    const response =
        testFetch(
            'https://api.github.com/octocat',
            {headers: {Authorization: 'Bearer'}});
    await expect(response).rejects.toThrow();
    expect(err.mock.calls.length).toBeGreaterThan(1);
  });

  test('success', async () => {
    await testFetch('https://github.com');
    expect(err).not.toBeCalled();
  });
});

test('errorObject creates error Object', () => {
  expect(fetch.errorObject('code', 'context', 'message')).toEqual(
      {code: 'code', context: 'context', message: 'message'});
});
