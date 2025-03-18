import * as fetch from '../../../src/common/fetch.js';
import {jest} from '@jest/globals';

test('errorObject creates error Object', () => {
  expect(fetch.errorObject('code', 'context', 'message')).toEqual(
      {code: 'code', context: 'context', message: 'message'});
});

const URL = 'https://github.com';

describe('fetch', () => {

  const err = jest.fn(response => ({}));
  const testFetch =
      hasError => fetch.fetch(
          {hasError: response => hasError, getErrorObject: err}, URL);

  afterEach(err.mockClear);

  test('throws after retries', async () => {
    const response = testFetch(true);
    await expect(response).rejects.toThrow();
    expect(err.mock.calls.length).toBeGreaterThan(1);
  });

  test('success', async () => {
    await testFetch(false);
    expect(err).not.toBeCalled();
  });
});

test('fetchAttachment fetches without error', () => {
  return fetch.fetchAttachment({url: URL});
});
