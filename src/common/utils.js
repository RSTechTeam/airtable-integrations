/** @fileoverview Shared code for Bill.com x Airtable Repository. */

import assert from 'node:assert/strict';

/** The Primary Bill.com Org. */
export const PRIMARY_ORG = 'RS';

/**
 * @param {function(): *} producer
 * @return {function(): *} producer's result, lazily evaluated and cached
 */
export function lazyCache(producer) {
  let result;
  return () => result || (result = producer());
}

/**
 * @param {(string|number)} code
 * @param {string} context
 * @param {string} message
 */
export function fetchError(code, context, message) {
  throw new Error(`Error ${code} (from ${context}): ${message}`);
}

/**
 * @param {!Array<*>} array
 * @param {number} size - A positive integer
 * @return {!Iterator<!Array<*>>} size-length portions of array
 */
function* batch(array, size) {
  assert.ok(size > 0, `${size} is not positive`);
  while (array.length > 0) {
    yield array.splice(0, size);
  }
}

/**
 * Synchronously calls func with up to size-length portions of array.
 * @param {function(Array<*>): *} func
 * @param {!Array<*>} array
 * @param {number} size
 * @return {!Promise<!Array<*>>} func results by batch
 */
export async function batchAwait(func, array, size) {
  const results = [];
  for (const arr of batch(array, size)) {
    const result = await func(arr);
    results.push(result);
  }
  return results
}

/**
 * Asynchronously calls func with up to size-length portions of array.
 * @param {function(!Array<*>): *} func
 * @param {!Array<*>} array
 * @param {number} size
 * @return {!Promise<!Array<*>>} func results by batch
 */
export function batchAsync(func, array, size) {
  const promises = [];
  for (const arr of batch(array, size)) {
    promises.push(func(arr));
  }
  return Promise.all(promises);
}

/**
 * @param {string} date - ISO 8601 Format
 * @return {string} YYYY-MM-DD
 */
export function getYyyyMmDd(date) {
  return date.substring(0, 10);
}
