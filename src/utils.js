/** @fileoverview Shared code for Bill.com x Airtable Repository. */

/**
 * Core GitHub Action functions for getting inputs, setting results, logging,
 * registering secrets and exporting variables across actions.
 * https://github.com/actions/toolkit/tree/main/packages/core
 */
import * as core from '@actions/core';

/**
 * @param {string} input
 * @return {string} required input value
 */
export function getInput(input) {
  return core.getInput(input, {required: true});
}

/** The primary Bill.com Org. */
export const primaryOrg = getInput('primary-org');

/**
 * Logs err, sets a failing exit code, and throws err.
 * @param {Error} err
 */
export function error(err) {
  core.setFailed(err);
  throw err;
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
 * @param {string} title
 * @param {Object} json
 * @param {function|Array} replacer
 * @see JSON.stringify
 */
function logJsonGroup(title, json, replacer = null) {
  core.startGroup(title);
  core.info(JSON.stringify(json, replacer, '\t'));
  core.endGroup();
}

/**
 * Logs json, logging individual expandable groups for each element
 * of the assumed only top-level Array.
 * @param {string} endpoint
 * @param {Object} json
 */
export function logJson(endpoint, json) {
  let firstArray = [];
  logJsonGroup(
      endpoint,
      json,
      (key, value) => {
        if (Array.isArray(value)) {
          firstArray = value;
          return `Array(${value.length}) <see below log groups for content>`;
        }
        return value;
      });
  firstArray.forEach((data, index) => logJsonGroup(index, data));
}

/**
 * Calls func with up to size-length portions of array.
 * @param {function(Array): any} func
 * @param {Array} array
 * @param {number} size
 * @return {Promise<Array<any>>}
 */
export async function batch(func, array, size) {
  const results = [];
  while (array.length > 0) {
    const result = await func(array.splice(0, size));
    results.push(result);
  }
  return results;
}
