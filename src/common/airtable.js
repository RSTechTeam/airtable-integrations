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
   * @param {string=} view
   * @param {string=} filterByFormula
   * @return {!Promise<!Array<!Record<!TField>>>}
   */
  select(table, view = '', filterByFormula = '') {
    const params = {view: view, filterByFormula: filterByFormula};
    return catchError(
        this.base_(table).select(params).all(), 'selecting', table);
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
    for (const record of await this.select(table, view)) {
      const fields = await fieldsFunc(record);
      fields && updates.push({id: record.getId(), fields: fields});
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
   * @param {string} table
   * @param {string} id
   * @return {!Promise<!Record<!TField>>}
   */
  find(table, id) {
    return catchError(this.base_(table).find(id), 'finding', table);
  }
}

/**
 * An Airtable Base where each Table is partitioned by MSO,
 * enabling per MSO selects across Tables. Select methods should only be called
 * while iterating via iterateMsos.
 */
export class MsoBase extends Base {

  /**
   * @param {string=} baseId
   * @param {string=} apiKey
   */
  constructor(baseId = airtableBaseId(), apiKey = airtableApiKey()) {
    super(baseId, apiKey);

    /** @private {?Record<!TField>} */
    this.currentMso_ = null;
    /** @return {?Record<!TField>} */
    this.getCurrentMso = () => this.currentMso_;
  }

  /** @override */
  select(table, view = '', filterByFormula = '') {
    const msoFilter = `MSO = '${this.currentMso_.get('Code')}'`;
    return super.select(
        table,
        view,
        filterByFormula === '' ?
            msoFilter : `AND(${msoFilter}, ${filterByFormula})`);
  }

  /** @return {!Promise<!Iterator<!Record<!TField>>>} */
  async* iterateMsos() {
    for (this.currentMso_ of await super.select('MSOs')) {
      yield this.currentMso_;
    }
    this.currentMso_ = null;
  }
}
