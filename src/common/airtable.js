/** @fileoverview Utilities for interacting with Airtable. */

/**
 * The official Airtable JavaScript library.
 * https://github.com/Airtable/airtable.js
 */
import Airtable from 'airtable';
import {airtableApiKey, airtableBaseId} from './inputs.js';
import {batchAsync} from './utils.js';

/** The Bill.com ID Field name suffix. */
export const BILL_COM_ID_SUFFIX = 'Bill.com ID';

/** The primary Org Bill.com ID Field name. */
export const MSO_BILL_COM_ID = `MSO ${BILL_COM_ID_SUFFIX}`;

/**
 * @param {!Record<!TField>} record
 * @param {string} msoRecordId
 * @return {boolean}
 */
export function isSameMso(record, msoRecordId) {
  return record.get('MSO')[0] === msoRecordId;
}

/**
 * @param {!Promise<*>} promise
 * @param {string} querying e.g., selecting, updating, etc
 * @param {string} table
 * @return {!Promise<*>}
 */
function catchError(promise, querying, table) {
  return promise.catch(
      (err) => {
        throw new Error(
            `Error ${querying} records in Airtable Table ${table}: ${err}`);
      });
}

/**
 * Asynchronously calls func with portions of array that are at most
 * the max number of records that can be created or updated
 * via an Airtable API call.
 * @param {function(!Array<*>): !Promise<*>} func
 * @param {!Array<*>} array
 * @return {!Promise<!Array<*>>}
 */
function batch(func, array) {
  return batchAsync(func, array, 10);
}

/** An Airtable Base to query. */
export class Base {

  /**
   * @param {string=} baseId
   * @param {string=} apiKey
   */
  constructor(baseId = airtableBaseId(), apiKey = airtableApiKey()) {

    /** @private @const {!Base} */
    this.base_ = new Airtable({apiKey: apiKey}).base(baseId);
  }

  /**
   * @param {string} table
   * @param {string} view
   * @return {!Promise<!Array<!Record<!TField>>>}
   * @todo Explore replacing select
   */
  select(table, view) {
    return catchError(
        this.base_(table).select({view: view}).all(), 'selecting', table);
  }

  /**
   * @param {string} table
   * @param {!Object[]} updates
   * @param {string} updates[].id
   * @param {!Object<string, *>} updates[].fields
   * @return {!Promise<!Array<*>>}
   */
  update(table, updates) {
    return catchError(
        batch(this.base_(table).update, updates), 'updating', table);
  }

  /**
   * Runs fieldsFunc for each record from table view
   * and updates each record's fields using fieldsFunc's return value,
   * if there is one.
   * @param {string} table
   * @param {string} view
   * @param {function(!Record<!TField>): !Promise<?Object<string, *>>} fieldsFunc
   * @return {!Promise<!Array<*>>}
   */
   async selectAndUpdate(table, view, fieldsFunc) {
    const updates = [];
    const records = await this.select2(table, view);
    for (const record of records) {
      const fields = await fieldsFunc(record);
      if (fields == null) continue;
      updates.push({id: record.getId(), fields: fields});
    }
    return this.update(table, updates);
   }

  /**
   * @param {string} table
   * @param {!Object[]} creates
   * @param {!Object<string, *>} creates[].fields
   * @return {!Promise<!Array<*>>}
   */
  create(table, creates) {
    return catchError(
        batch(this.base_(table).create, creates), 'creating', table);
  }

  /**
   * Runs func on table record with id.
   * @param {string} table
   * @param {string} id
   * @param {function(!Record<!TField>): *} func
   * @return {!Promise<*>}
   */
  find(table, id, func) {
    return catchError(this.base_(table).find(id).then(func), 'finding', table);
  }
}
