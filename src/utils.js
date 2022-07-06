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
 * Logs message, sets a failing exit code, and throws an error.
 * @param {string} message
 */
export function error(message) {
  core.setFailed(message);
  throw new Error(message);
}

/**
 * @param {string|number} code
 * @param {string} context
 * @param {string} message
 */
export function fetchError(code, context, message) {
  error(`Error ${code} (from ${context}): ${message}`);
}

/**
 * Log JSON in an expandable group.
 * @param {string} title
 * @param {Object} json
 * @param {function|Array} replacer
 * @see JSON.stringify
 */
function logJson(title, json, replacer = null) {
  core.startGroup(title);
  core.info(JSON.stringify(json, replacer, '\t'));
  core.endGroup();
}

/**
 * Logs JSON in exandable groups based on endpoint.
 * @param {string} endpoint
 * @param {Object} json
 */
export function logBillComJson(endpoint, json) {
  if (endpoint.startsWith('List')) {
    logJson(
        endpoint,
        json,
        (key, value) => {
          if (key === 'response_data') {
            return `Array(${value.length}) <see below log groups for data>`;
          }
          return value;
        });
    json.response_data.forEach((data, index) => logJson(index, data));
  } else if (endpoint.startsWith('Bulk')) {
    let array;
    logJson(
        endpoint,
        json,
        (key, value) => {
          if (Array.isArray(value)) {
            array = value;
            return `Array(${value.length}) <see below log groups for data>`;
          }
          return value;
        });
    array.forEach((data, index) => logJson(index, data));
  } else {
    logJson(endpoint, json);
  }
}

/**
 * Calls func with up to size-length portions of array.
 * @param {function(Array): Promise} func
 * @param {Array} array
 * @param {number} size
 * @return {Promise<void>}
 */
export async function batch(func, array, size) {
  while (array.length > 0) {
    await func(array.splice(0, size));
  }
}
