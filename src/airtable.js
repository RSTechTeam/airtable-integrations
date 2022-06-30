/** @fileoverview Utilities for interacting with Airtable. */

/**
 * The official Airtable JavaScript library.
 * https://github.com/Airtable/airtable.js
 */
import * as Airtable from 'airtable';
import * as utils from './utils.js';

Airtable.configure({apiKey: utils.getInput('airtable-api-key')});

/** The Bill.com ID Field name suffix. */
export const BILL_COM_ID_SUFFIX = 'Bill.com ID';

/** The primary Org Bill.com ID Field name. */
export const primaryOrgBillComId = `${utils.primaryOrg} ${BILL_COM_ID_SUFFIX}`;

/** The relevant Airtable Base. */
const base = new Airtable().base(utils.getInput('airtable-base-id'));

/**
 * @param {string} err
 * @param {string} queryType
 * @param {string} table
 */
export function errorIf(err, queryType, table) {
  if (err) {
    throw new Error(
        `Error while ${queryType} records in Airtable Table ${table}: ${err}`);
  }
}

/**
 * Runs func for each record from table view.
 * @param {string} table
 * @param {string} view
 * @param {function(Record<TField>): Promise<void>} func
 * @return {Promise<void>}
 */
export async function select(table, view, func) {
  let promises = [];
  base(table).select({view: view}).eachPage(
      function page(records, fetchNextPage) {
        promises = promises.concat(records.map(func));
        fetchNextPage();
      },
      function done(err) { errorIf(err, 'selecting', table); });
  await Promises.all(promises);
}

/**
 * @param {string} table
 * @param {Array<Object>} updates
 */
export function update(table, updates) {
  base(table).update(
      updates, (err, records) => errorIf(err, 'updating', table));
}

/**
 * @param {string} table
 * @param {Array<Object>} creates
 */
export function create(table, creates) {
  base(table).create(
      creates, (err, records) => errorIf(err, 'creating', table));
}

/**
 * Runs func on table record with id.
 * @param {string} table
 * @param {string} id
 * @param {function(Record<TField>): Promise<void>} func
 * @return {Promise<void>}
 */
export async function find(table, id, func) {
  let promise;
  base(table).find(
      id,
      (err, record) => {
        errorIf(err, 'finding', table);
        promise = func(record);
      });
  await promise;
}
