/**
 * @fileoverview Shared code for interacting with the Bill.com API.
 * For more information, check out the API documentation:
 * https://developer.bill.com/hc/en-us/articles/360035447551-API-Structure
 */

import fetch from 'node-fetch';
import * as inputs from './inputs.js';
import {Base} from './airtable.js';
import {batchAwait, fetchError} from './utils.js';
import {logJson} from './github_actions_core.js';

/**
 * @param {string} endpoint 
 * @param {!Object<string, *>} headers
 * @param {(string|FormData)} body
 * @return {!Promise<!Object<string, *>>} endpoint-specific response_data.
 */
export async function apiCall(endpoint, headers, body) {
  const response =
      await fetch(
          `https://api.bill.com/api/v2/${endpoint}.json`,
          {method: 'POST', headers: headers, body: body});
  const json = await response.json();
  logJson(endpoint, json);
  const data = json.response_data;
  if (json.response_status === 1) {
    fetchError(data.error_code, endpoint, data.error_message);
  }
  return data;
}

/**
 * @param {string} field
 * @param {string} op
 * @param {string} value
 * @return {!Object<string, string>} filter
 */
export function filter(field, op, value) {
  return {field: field, op: op, value: value};
}

/** A connection to the Bill.com API. */
export class Api {

  /**
   * @param {!Map<string, string>} orgIds - The organization ID
   *   for each Anchor Entity.
   * @param {string} userName
   * @param {string} password
   * @param {string} devKey
   */
  constructor(orgIds, userName, password, devKey) {

    /** @private @const {!Map<string, string>} */
    this.orgIds_ = orgIds;

    /** @private @const {string} */
    this.userName_ = userName;
    /** @private @const {string} */
    this.password_ = password;

    /** @return {string} */
    this.getDevKey = () => devKey;

    /** 
     * The ID of the Bill.com API session (after successful authentication).
     * @private {?string}
     */
    this.sessionId_ = null;
    /** @return {?string} */
    this.getSessionId = () => this.sessionId_;
  }

  /**
   * @param {string} endpoint
   * @param {string} params
   * @return {!Promise<!Object<string, *>>} endpoint-specific response_data.
   */
  call(endpoint, params) {
    return apiCall(
        endpoint,
        {'Content-Type': 'application/x-www-form-urlencoded'},
        `devKey=${this.getDevKey()}&sessionId=${this.sessionId_}&${params}`);
  }

  /** 
   * Login to access anchorEntity's Bill.com API and receive a session ID.
   * @param {string} anchorEntity
   */
  async login(anchorEntity) {
    const loginResponse =
        await this.call(
            'Login',
            `userName=${this.userName_}&password=${this.password_}` +
                `&orgId=${this.orgIds.get(anchorEntity)}`);
    this.sessionId_ = loginResponse.sessionId;
  }

  /** Login to access the primaryOrg's Bill.com API and receive a session ID. */
  primaryOrgLogin() {
    this.login(inputs.primaryOrg());
  }

  /**
   * @param {string} endpoint
   * @param {!Object<string, *>} data
   * @return {!Promise<!Object<string, *>>} endpoint-specific response_data.
   */
  dataCall(endpoint, data) {
    return this.call(endpoint, `data=${JSON.stringify(data)}`);
  }

  /**
   * @param {string} entity
   * @param {?Object<string, string>[]=} filters
   * @return {!Promise<!Object<string, *>[]>} entity list.
   */
  async list(entity, filters=undefined) {
    const MAX = 999;
    let fullList = [];
    for (let start = 0; ; start += MAX) {
      const response =
          await this.dataCall(
              `List/${entity}`, {start: start, max: MAX, filters: filters});
      fullList = fullList.concat(response);
      if (response.length < MAX) break;
    }
    return fullList;
  }

  /**
   * @param {string} endpoint
   * @param {!Object<string, *>[]} data
   * @return {!Promise<!Object<string, *>[]>}
   */
  bulkCall(endpoint, data) {
    return batchAwait(
        (arr) => this.dataCall(`Bulk/Crud/${endpoint}`, {bulk: arr}),
        data, 100);
  }
}

/**
 * Creates Api using orgIds from an Airtable Base.
 * @param {string=} baseId
 * @param {string=} userName
 * @param {string=} password
 * @param {string=} devKey
 * @return {!Promise<!Api>}
 */
export async function getApi(
    baseId = inputs.airtableOrgIdsBaseId(),
    userName = inputs.billComUserName(),
    password = inputs.billComPassword(),
    devKey = inputs.billComDevKey()) {

  const orgIds = new Map();
  await new Base(baseId).select(
      'Anchor Entities',
      'Org IDs',
      (r) => orgIds.set(r.get('Department'), r.get('Bill.com Org ID')));
  return new Api(orgIds, userName, password, devKey);
}
