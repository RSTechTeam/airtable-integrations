/** @fileoverview Utilities for interacting with Airtable. */

/**
 * The official Airtable JavaScript library.
 * https://github.com/Airtable/airtable.js
 */
import Airtable from 'airtable';
import * as utils from './utils.js';
import {primaryOrg, airtableApiKey, airtableBaseId} from './inputs.js';

/** The Bill.com ID Field name suffix. */
export const BILL_COM_ID_SUFFIX = 'Bill.com ID';

/** The primary Org Bill.com ID Field name. */
export const primaryOrgBillComId = () => {
  return `${primaryOrg()} ${BILL_COM_ID_SUFFIX}`;
}

/**
 * @param {string} querying e.g., selecting, updating, etc
 * @param {string} table
 * @return {function(Error)}
 */
function error(querying, table) {
  return (err) => {
    throw new Error(
        `Error while ${querying} records in Airtable Table ${table}: ${err}`)
  };
}

/**
 * Asynchronously calls func with portions of array that are at most
 * the max number of records that can be created or updated
 * via an Airtable API call.
 * @param {function(!Array<*>): *} func
 * @param {!Array<*>} array
 * @return {!Promise<!Array<*>>}
 */
function batch(func, array) {
  return utils.batchAsync(func, array, 10);
}

/** An Airtable Base to query. */
export class Base {

  /**
   * @param {string=} baseId
   * @param {string=} apiKey
   */
  constructor(baseId = airtableBaseId(), apiKey = airtableApiKey()) {

    /** @private {Base} */
    this.base_ = new Airtable({apiKey: apiKey}).base(baseId);
  }

  /**
   * Runs func for each record from table view.
   * @param {string} table
   * @param {string} view
   * @param {function(!Record<!TField>): !Promise<undefined>} func
   * @return {!Promise<!Array<undefined>>}
   */
  select(table, view, func) {
    const maybeView = (view == undefined) ? undefined : {view: view};
    return this.base_(table).select(maybeView).all()
        .then((records) => Promise.all(records.map(func)))
        .catch(error('selecting', table));
  }

  /**
   * @param {string} table
   * @param {!Object[]} updates
   * @param {string} updates[].id
   * @param {!Object<string, *>} updates[].fields
   * @return {!Promise<!Object<string, *>[][]>}
   */
  update(table, updates) {
    return batch(
        (arr) => this.base_(table).update(arr).catch(error('updating', table)),
        updates);
  }

  /**
   * @param {string} table
   * @param {!Object[]} creates
   * @param {!Object<string, *>} creates[].fields
   * @return {!Promise<!Object<string, *>[][]>}
   */
  create(table, creates) {
    return batch(
        (arr) => this.base_(table).create(arr).catch(error('creating', table)),
        creates);
  }

  /**
   * Runs func on table record with id.
   * @param {string} table
   * @param {string} id
   * @param {function(!Record<!TField>): Promise<undefined>} func
   * @return {!Promise<undefined>}
   */
  find(table, id, func) {
    return this.base_(table).find(id).then(func).catch(error('finding', table));
  }
}

/** @return {function(): Base} */
export function getInputBase() {
  return utils.lazyCache(() => new Base());
}
