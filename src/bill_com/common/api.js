/**
 * @fileoverview Shared code for interacting with the Bill.com API.
 * For more information, check out the API documentation:
 * https://developer.bill.com/hc/en-us/articles/360035447551-API-Structure
 */

import * as inputs from './inputs.js';
import pLimit from 'p-limit';
import {airtableApiKey} from '../../common/inputs.js';
import {Base} from '../../common/airtable.js';
import {batchAwait} from '../../common/utils.js';
import {errorObject, fetch} from '../../common/fetch.js';
import {log, logJson, warn} from '../../common/github_actions_core.js';
import {MSO_BILL_COM_ID, PRIMARY_ORG} from './constants.js';

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
 * @param {boolean=} test
 * @return {string}
 */
function baseUrl(test = false) {
  return `https://api${test ? '-stage' : ''}.bill.com`;
}

/**
 * @param {string} endpoint 
 * @param {!Object<string, *>} headers
 * @param {(!URLSearchParams|!FormData)} body
 * @param {boolean} test
 * @return {!Promise<!Object<string, *>>} endpoint-specific response_data.
 */
export async function apiCall(endpoint, headers, body, test) {
  const response =
      await rateLimit(
          () => fetch(
              {
                // hasError:
                //   async response => {
                //     const json = await response.clone().json();
                //     return json.response_status === 1;
                //   },
                getErrorObject:
                  async response => {
                    const data = (await response.json()).response_data;
                    return errorObject(
                        data.error_code, endpoint, data.error_message);
                  },
              },
              `${baseUrl(test)}/api/v2/${endpoint}.json`,
              {method: 'POST', headers: headers, body: body}));

  const json = await response.json();
  logJson(endpoint, json);
  if (json.response_status === 1) {
    throw new Error(`${endpoint} ${json.response_data.error_code}`);
  }
  return json.response_data;
}

/**
 * @param {boolean} isActive
 * @return {string}
 */
export function isActiveEnum(isActive) {
  return isActive ? ActiveStatus.ACTIVE : ActiveStatus.INACTIVE;
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

/** @type {!Object<string, string>} */
export const activeFilter = filter('isActive', '=', ActiveStatus.ACTIVE);

/**
 * @param {string} entity
 * @param {string} data
 * @return {!Object<string, !Object<string, *>>}
 */
function entityData(entity, data) {
  return {obj: {entity: entity, ...data}};
}

/**
 * @param {!Record<!TField>} airtableRecord
 * @param {string=} type - |Default|Final
 * @return {?string[]} approvers MSO Bill.com IDs
 */
function getApproverIds(airtableRecord, type = '') {
  return airtableRecord.get(
      `${type}${type ? ' ' : ''}Approver ${MSO_BILL_COM_ID}s`);
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
   * @param {!Object<string, string>} params
   * @return {!Promise<!Object<string, *>>} endpoint-specific response_data.
   */
  call(endpoint, params) {
    log(JSON.stringify(params));
    return apiCall(
        endpoint,
        {'Content-Type': 'application/x-www-form-urlencoded'},
        new URLSearchParams({
          ...params, devKey: this.getDevKey(), sessionId: this.sessionId_}),
        this.test_);
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
            {
              userName: this.userName_,
              password: this.password_,
              orgId: this.orgIds_.get(anchorEntity),
            });
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
    return this.call(endpoint, {data: JSON.stringify(data)});
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
   * @param {!Object<string, *>} bill
   * @param {!Record<!TField>} airtableRecord
   * @param {!Record<!TField>} mso
   * @return {!Promise<string>} The newly created Bill ID.
   */
  async createBill(bill, airtableRecord, mso) {

    // Create the Bill.
    const invoiceNumber = bill.invoiceNumber;
    let billId;
    for (let i = 1; billId == undefined; ++i) {
      try {
        billId = await this.create('Bill', bill);
      } catch (err) {

        // Handle duplicate Vendor Invoice ID.
        if (err.message.match(/BDC_(1171|5370)/)) {
          warn(err.message);
          bill.invoiceNumber = `${invoiceNumber} (${i})`;
          continue;
        }
        throw err;
      }
    }

    // Set the Bill's approvers.
    const approvers =
        getApproverIds(airtableRecord) || getApproverIds(mso, 'Default') || [];             
    await this.dataCall(
        'SetApprovers',
        {
          entity: 'Bill',
          objectId: billId,
          approvers: [...approvers, ...getApproverIds(mso, 'Final')],
        });
    return billId;
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
      fullList = [...fullList, ...response];
      if (response.length < MAX) break;
    }

    // Construct full Class names.
    if (entity === 'ActgClass') {
      const classes =
          new Map(
              fullList.map(
                  e => [
                    e.id,
                    {name: e.name, parentActgClassId: e.parentActgClassId},
                  ]));
      for (const actgClass of fullList) {
        let p = actgClass;
        while (p = classes.get(p.parentActgClassId)) {
          actgClass.name = p.name + ':' + actgClass.name;
        }
      }
    }
    return fullList;
  }

  /**
   * @param {string} entity
   * @param {!Object<string, string>[]=} filters
   * @return {!Promise<!Object<string, *>[]>} entity list.
   */
  listActive(entity, filters = []) {
    filters.push(activeFilter);
    return this.list(entity, filters);
  }
  
  /**
   * @param {string} id
   * @return {string[]} The document URLs.
   */
  async getDocumentPages(id) {
    const pages = await this.dataCall('GetDocumentPages', {id: id});
    const urlPrefix = baseUrl(this.test_) + pages.documentPages.fileUrl;
    const docs = [];
    for (let i = 1; i <= pages.documentPages.numPages; ++i) {
      docs.push(urlPrefix + `&sessionId=${this.sessionId_}&pageNumber=${i}`);
    }
    return docs;
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
    apiKey = airtableApiKey(),
    userName = inputs.billComUserName(),
    password = inputs.billComPassword(),
    devKey = inputs.billComDevKey(),
    test = false) {

  const entities =
      await new Base(baseId, apiKey).select('Anchor Entities', 'Org IDs');
  const orgIds =
      entities.map((e) => [e.get('Local Code'), e.get('Bill.com Org ID')]);
  return new Api(new Map(orgIds), userName, password, devKey, test);
}
