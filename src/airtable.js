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
  return (err) =>
      utils.error(
          `Error while ${querying} records in Airtable Table ${table}: ${err}`);
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
    const maybeView = (view == null) ? null : {view: view};
    return this.base_(table).select(maybeView).all()
        .then((records) => Promise.all(records.map(func)))
        .catch(error('selecting', table));
  }

  /**
   * @param {string} table
   * @param {Array<Object>} updates
   * @return {Promise<void>}
   */
  update(table, updates) {
    return this.base_(table).update(updates).catch(error('updating', table));
  }

  /**
   * @param {string} table
   * @param {Array<Object>} creates
   * @return {Promise<void>}
   */
  create(table, creates) {
    return this.base_(table).create(creates).catch(error('creating', table));
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
