import * as fetch from '../../../src/common/fetch.js';

test('errorParts creates error parts Object', () => {
  expect(fetch.errorParts('code', 'context', 'message')).toEqual(
      {code: 'code', context: 'context', message: 'message'});
});

const URL = 'https://github.com';
const expectSuccess = response => expect(response.ok).toBe(true);

describe('fetch', () => {
  const errorParts = fetch.errorParts('code', 'context', 'message');
  const testFetch =
      hasError => fetch.fetch(response => ({hasError, errorParts}), URL);

  test('throws if error', () => {
    return expect(testFetch(true)).rejects.toThrow(
        'Error code (from context): message');
  });

  test('success', async () => expectSuccess(await testFetch(false)));
});

test('fetchAttachment fetches without error', async () => {
  expectSuccess(await fetch.fetchAttachment({url: URL}));
});
