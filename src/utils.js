/** @fileoverview Shared code for Bill.com x Airtable Repository. */

/**
 * @param {function(): any} producer
 * @return {function(): any} producer's result, lazily evaluated and cached
 */
export function lazyCache(producer) {
  let result;
  return () => {
    if (result == undefined) {
      result = producer();
    }
    return result;
  }
}

/**
 * @param {string|number} code
 * @param {string} context
 * @param {string} message
 */
export function fetchError(code, context, message) {
  throw new Error(`Error ${code} (from ${context}): ${message}`);
}

/**
 * @param {Array<any>} array
 * @param {number} size
 * @return {!Iterator<Array<any>>} size-length portions of array
 */
function* batch(array, size) {
  while (array.length > 0) {
    yield array.splice(0, size);
  }
}

/**
 * Synchronously calls func with up to size-length portions of array.
 * @param {function(Array): any} func
 * @param {Array} array
 * @param {number} size
 * @return {Promise<Array<any>>}
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
 * @param {function(Array): any} func
 * @param {Array} array
 * @param {number} size
 * @return {Promise<Array<any>>}
 */
export function batchAsync(func, array, size) {
  const promises = [];
  for (const arr of batch(array, size)) {
    promises.push(func(arr));
  }
  return Promise.all(promises);
}
