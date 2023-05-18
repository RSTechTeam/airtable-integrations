/**
 * @fileoverview Shared code for interacting with the Bill.com API.
 * For more information, check out the API documentation:
 * https://developer.bill.com/hc/en-us/articles/360035447551-API-Structure
 */

import fetch from 'node-fetch';
import * as inputs from './inputs.js';
import pLimit from 'p-limit';
import {Base} from './airtable.js';
import {batchAwait, fetchError, PRIMARY_ORG} from './utils.js';
import {log, logJson} from './github_actions_core.js';

/**
 * Mirrors Bill.com's isActive enum.
 * @enum {string}
 */
export const ActiveStatus = {ACTIVE: '1', INACTIVE: '2'};

/**
 * The concurrent rate limit for Bill.com API requests
 * per developer key per organization.
 */
const rateLimit = pLimit(3);

/**
 * @param {string} endpoint 
 * @param {!Object<string, *>} headers
 * @param {(string|FormData)} body
 * @param {boolean=} test
 * @return {!Promise<!Object<string, *>>} endpoint-specific response_data.
 */
export async function apiCall(endpoint, headers, body, test = false) {
  const response =
      await fetch(
          `https://api${test ? '-sandbox' : ''}.bill.com/` +
              `api/v2/${endpoint}.json`,
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
 * @param {boolean} isActive
 * @return {string}
 */
export function isActiveEnum(isActive) {
  return isActive ? ActiveStatus.ACTIVE : ActiveStatus.INACTIVE;
}

/**
 * @param {string} entity
 * @param {string} data
 * @return {!Object<string, !Object<string, *>>}
 */
export function entityData(entity, data) {

  // Copy to avoid changing passed argument.
  data = {...data};
  data.name &&= encodeURIComponent(data.name);
  return {obj: {entity: entity, ...data}};
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
   * @param {boolean} test
   */
  constructor(orgIds, userName, password, devKey, test) {

    /** @private @const {!Map<string, string>} */
    this.orgIds_ = orgIds;

    /** @private @const {string} */
    this.userName_ = userName;
    /** @private @const {string} */
    this.password_ = password;

    /** @private @const {boolena} */
    this.test_ = test;

    /** @return {string} */
    this.getDevKey = () => devKey;

    /** 
     * The ID of the current Bill.com API session
     * (after successful authentication).
     * @private {?string}
     */
    this.sessionId_ = null;
    /** @return {?string} */
    this.getSessionId = () => this.sessionId_;
  }

  /**
   * @param {string} endpoint
   * @param {string} params
   * @return {!Promise<!Object<stri3g, *>>} endpoint-specific response_data.
   */
  call(endpoint, params) {
    log(params);
    return rateLimit(
        () => apiCall(
            endpoint,
            {'Content-Type': 'application/x-www-form-urlencoded'},
            `devKey=${this.getDevKey()}&sessionId=${this.sessionId_}&${params}`,
            this.test_));
  }

  /** 
   * Login to access anchorEntity's Bill.com API and receive a session ID.
   * @param {string} anchorEntity
   * @return {!Promise<undefined>}
   */
  async login(anchorEntity) {
    const loginResponse =
        await this.call(
            'Login',
            `userName=${this.userName_}&password=${this.password_}` +
                `&orgId=${this.orgIds_.get(anchorEntity)}`);
    this.sessionId_ = loginResponse.sessionId;
  }

  /**
   * Login to access the primary org's Bill.com API and receive a session ID.
   * @return {!Promise<undefined>}
   */
  primaryOrgLogin() {
    return this.login(PRIMARY_ORG);
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
   * @param {!Object<string, *>} data
   * @return {!Promise<string>} The newly created entity ID.
   */
  async create(entity, data) {
    const response =
        await this.dataCall(`Crud/Create/${entity}`, entityData(entity, data));
    return response.id;
  }

  /**
   * @param {string} entity
   * @param {!Object<string, string>[]=} filters
   * @return {!Promise<!Object<string, *>[]>} entity list.
   */
  async list(entity, filters = []) {
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
   * @param {string} entity
   * @param {!Object<string, string>[]=} filters
   * @return {!Promise<!Object<string, *>[]>} entity list.
   */
  listActive(entity, filters = []) {
    filters.push(filter('isActive', '=', ActiveStatus.ACTIVE));
    return this.list(entity, filters);
  }

  /**
   * @param {string} op - Create|Read|Update|Delete
   * @param {string} entity
   * @param {(string[]|!Object<string, *>[])} data -
   *   A list of IDs if op is Read or Delete, otherwise a list of entity data.
   * @return {!Promise<!Object<string, *>[]>}
   */
  bulk(op, entity, data) {
    const func =
        ['Read', 'Delete'].includes(op) ?
            (datum) => ({id: datum}) : (datum) => entityData(entity, datum);
    return batchAwait(
        (arr) => this.dataCall(`Bulk/Crud/${op}/${entity}`, {bulk: arr}),
        data.map(func), 100);
  }
}

/**
 * Creates Api using orgIds from an Airtable Base.
 * @param {string=} baseId
 * @param {string=} userName
 * @param {string=} password
 * @param {string=} devKey
 * @param {boolean=} test
 * @return {!Promise<!Api>}
 */
export async function getApi(
    baseId = inputs.airtableOrgIdsBaseId(),
    apiKey = inputs.airtableApiKey(),
    userName = inputs.billComUserName(),
    password = inputs.billComPassword(),
    devKey = inputs.billComDevKey(),
    test = false) {

  const entities =
      await new Base(baseId, apiKey).select('Anchor Entities', 'Org IDs');
  const orgIds =
      entities.map((e) => [e.get('Department'), e.get('Bill.com Org ID')]);
  return new Api(new Map(orgIds), userName, password, devKey, test);
}
