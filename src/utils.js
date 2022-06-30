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

export function log(...message) {
  core.notice(message);
}

/**
 * @param {string|number} code
 * @param {string} context
 * @param {string} message
 */
export function error(code, context, message) {
  const msg = `Error ${code} (from ${context}): ${message}`;
  core.setFailed(msg);
  throw new Error(msg);
}

/**
 * Calls func with up to size-length portions of array.
 * @param {function(Array): Promise} func
 * @param {Array} array
 * @param {number} size
 * @return {Promise<Array>}
 */
export function batch(func, array, size) {
  const promises = [];
  while (array.length > 0) {
    promises.push(func(array.splice(0, size)));
  }
  return Promise.all(promises);
}
