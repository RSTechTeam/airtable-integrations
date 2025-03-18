import * as fetch from '../../../src/common/fetch.js';
import {jest} from '@jest/globals';

test('errorParts creates error parts Object', () => {
  expect(fetch.errorParts('code', 'context', 'message')).toEqual(
      {code: 'code', context: 'context', message: 'message'});
});

const URL = 'https://github.com';

describe('fetch', () => {
  const testFetch =
      hasError => fetch.fetch(response => ({hasError, errorParts: {}}), URL);

  test('throws if error', () => expect(testFetch(true)).rejects.toThrow());

  test('success', () => testFetch(false));
});

test('fetchAttachment fetches without error', () => {
  return fetch.fetchAttachment({url: URL});
});
