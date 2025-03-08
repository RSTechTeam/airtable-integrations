import * as fetch from '../../../src/common/fetch.js';
import {jest} from '@jest/globals';

test('errorObject creates error Object', () => {
  expect(fetch.errorObject('code', 'context', 'message')).toEqual(
      {code: 'code', context: 'context', message: 'message'});
});

describe('errorMessage', () => {

  const errorObject = fetch.errorObject('code', '', '');

  test('without response has no fallback', () => {
    expect(fetch.errorMessage(errorObject)).toBe(
        'Error code (from undefined): undefined');
  });

  test('with response has fallback', () => {
    const response = {status: 'status', url: 'url'};
    expect(fetch.errorMessage(errorObject, response)).toBe(
        'Error code (from url): undefined');
  });
});

const goodUrl = 'https://github.com';

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
    await testFetch(goodUrl);
    expect(err).not.toBeCalled();
  });
});

test('fetchAttachment fetches without error', () => {
  return fetch.fetchAttachment({url: goodUrl});
});
