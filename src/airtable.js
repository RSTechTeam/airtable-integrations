/** @fileoverview Utilities for interacting with Airtable. */

/**
 * The official Airtable JavaScript library.
 * https://github.com/Airtable/airtable.js
 */
import Airtable from 'airtable';
import * as utils from './utils.js';

Airtable.configure({apiKey: utils.getInput('airtable-api-key')});

/** The Bill.com ID Field name suffix. */
export const BILL_COM_ID_SUFFIX = 'Bill.com ID';

/** The primary Org Bill.com ID Field name. */
export const primaryOrgBillComId = `${utils.primaryOrg} ${BILL_COM_ID_SUFFIX}`;

/** The input Airtable Base ID. */
const inputBaseId = utils.getInput('airtable-base-id');

/**
 * @param {string} querying e.g., selecting, updating, etc
 * @param {string} table
 * @return {function(Error): void}
 */
function error(querying, table) {
  return (err) => {
    throw new Error(
        `Error while ${querying} records in Airtable Table ${table}: ${err}`)
  };
}

/**
 * Calls func with up to length-10 portions of array.
 * @param {function(Array): any} func
 * @param {Array} array
 * @return {Promise<Array<any>>}
 */
function batch10(func, array) {
  return utils.batch(func, array, 10);
}

/** An Airtable Base to query. */
export class Base {

  /** @param {string} baseId */
  constructor(baseId) {

    /** @private {Base} */
    this.base_ = new Airtable().base(baseId);
  }

  /**
   * Runs func for each record from table view.
   * @param {string} table
   * @param {string} view
   * @param {function(Record<TField>): Promise<void>} func
   * @return {Promise<Array<void>>}
   */
  select(table, view, func) {
    const maybeView = (view == undefined) ? undefined : {view: view};
    return this.base_(table).select(maybeView).all()
        .then((records) => Promise.all(records.map(func)))
        .catch(error('selecting', table));
  }

  /**
   * @param {string} table
   * @param {Array<Object>} updates
   * @return {Promise<Array<any>>}
   */
  update(table, updates) {
    return batch10(
        (arr) => this.base_(table).update(arr).catch(error('updating', table)),
        updates);
  }

  /**
   * @param {string} table
   * @param {Array<Object>} creates
   * @return {Promise<Array<any>>}
   */
  create(table, creates) {
    return batch10(
        (arr) => this.base_(table).create(arr).catch(error('creating', table)),
        creates);
  }

  /**
   * Runs func on table record with id.
   * @param {string} table
   * @param {string} id
   * @param {function(Record<TField>): Promise<void>} func
   * @return {Promise<void>}
   */
  find(table, id, func) {
    return this.base_(table).find(id).then(func).catch(error('finding', table));
  }
}

/** @return {Base} */
export function getInputBase() {
  return new Base(inputBaseId);
}
