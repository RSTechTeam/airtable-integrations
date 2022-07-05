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
 * Logs JSON in an exandable group.
 * @param {string} name
 * @param {Object} json
 */
export function logJson(name, json) {
  // core.startGroup(name);
  core.info(name);
  core.info(json);
  // core.endgroup();
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
