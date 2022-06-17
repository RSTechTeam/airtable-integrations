/** @fileoverview Shared code for Bill.com x Airtable Repository. */

/**
 * Core GitHub Action functions for getting inputs, setting results, logging,
 * registering secrets and exporting variables across actions.
 * https://github.com/actions/toolkit/tree/main/packages/core
 */
const core = require('@actions/core');

/**
 * @param {string} input
 * @return {string} required input value
 */
function getInput(input) {
  return core.getInput(input, {required: true});
}

/** The primary Bill.com Org. */
const primaryOrg = getInput('primary-org');

/**
 * @param {string|number} code
 * @param {string} context
 * @param {string} message
 */
function error(code, context, message) {
  throw new Error(`Error ${code} (from ${context}): ${message}`);
}

/**
 * Calls func with up to size-length portions of array.
 * @param {function(Array): Promise} func
 * @param {Array} array
 * @param {number} size
 * @return {Promise<Array>}
 */
function batch(func, array, size) {
  const promises = [];
  while (array.length > 0) {
    promises.push(func(array.splice(0, size)));
  }
  return Promise.all(promises);
}
