/**
 * @fileoverview Shared code for interacting with core GitHub Action functions.
 */

/**
 * Core GitHub Action functions for getting inputs, setting results, logging,
 * registering secrets and exporting variables across actions.
 * https://github.com/actions/toolkit/tree/main/packages/core
 */
import * as core from '@actions/core';
import {lazyCache} from './utils.js'

/** @type {function(string)} */
export const log = core.info;

/** @type {function(string)} */
export const warn = core.warning;

/** @type {Array<!Object<string, *>>} */
let summaryTableData = [];

/**
 * @param {string} input
 * @return {function(): string} required input value
 */
export function getInput(input) {
  return lazyCache(() => core.getInput(input, {required: true}));
}

/**
 * Logs err, sets a failing exit code, and throws err.
 * @param {!Error} err
 */
export function error(err) {
  core.setFailed(err);
  throw err;
}

/**
 * @param {string[]} row
 * @param {boolean=} header
 */
export function addSummaryTableRow(row, header = false) {
  summaryTableData = [
    ...summaryTableData,
    ...row.map(data => ({data: data, header: header})),
  ];
}

/** Writes the summary, along with any table data. */
export function writeSummary() {
  if (summaryTableData.length > 0) {
    core.summary.addTable([summaryTableData]);
  }
  core.summary.write();
}

/**
 * @param {string} title
 * @param {!Object<string, *>} json
 * @param {(function|Array)=} replacer
 * @see JSON.stringify
 */
function logJsonGroup(title, json, replacer = null) {
  core.startGroup(title);
  log(JSON.stringify(json, replacer, '\t'));
  core.endGroup();
}

/**
 * Logs json, logging individual expandable groups for each element
 * of the assumed only top-level Array.
 * @param {string} endpoint
 * @param {!Object<string, *>} json
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
