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

/**
 * @param {string} err
 * @param {string} queryType
 * @param {string} table
 */
function errorIf(err, queryType, table) {
  if (err) {
    throw new Error(
        `Error while ${queryType} records in Airtable Table ${table}: ${err}`);
  }
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
   * @return {Promise<void>}
   */
  async select(table, view, func) {
    let promises = [];
    await this.base_(table).select({view: view}).eachPage(
        function page(records, fetchNextPage) {
          promises = promises.concat(records.map(func));
          fetchNextPage();
        },
        function done(err) { errorIf(err, 'selecting', table); });
    await Promise.all(promises);
  }

  /**
   * @param {string} table
   * @param {Array<Object>} updates
   */
  update(table, updates) {
    return this.base_(table).update(
        updates, (err, records) => errorIf(err, 'updating', table));
  }

  /**
   * @param {string} table
   * @param {Array<Object>} creates
   */
  create(table, creates) {
    return this.base_(table).create(
        creates, (err, records) => errorIf(err, 'creating', table));
  }

  /**
   * Runs func on table record with id.
   * @param {string} table
   * @param {string} id
   * @param {function(Record<TField>): Promise<void>} func
   * @return {Promise<void>}
   */
  async find(table, id, func) {
    let promise;
    await this.base_(table).find(
        id,
        (err, record) => {
          errorIf(err, 'finding', table);
          promise = func(record);
        });
    await promise;
  }
}
