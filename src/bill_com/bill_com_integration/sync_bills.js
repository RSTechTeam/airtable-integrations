/** @fileoverview Syncs Bill.com Bill Line Item data into Airtable. */

import {addSummaryTableHeaders, addSummaryTableRow} from '../../common/github_actions_core.js';
import {Base} from '../../common/airtable.js';
import {billComTransformUrl} from '../common/inputs.js';
import {getYyyyMmDd} from '../../common/utils.js';
import {log} from '../../common/github_actions_core.js';
import * as sync from '../../common/sync.js';

/** Bill.com Bill Approval Statuses. */
const approvalStatuses = new Map([
  ['0', 'Unassigned'],
  ['1', 'Assigned'],
  ['4', 'Approving'],
  ['3', 'Approved'],
  ['5', 'Denied'],
]);

/** Bill.com Bill Payment Statuses. */
const paymentStatuses = new Map([
  ['1', 'Open'],
  ['4', 'Scheduled'],
  ['0', 'Paid In Full'],
  ['2', 'Partial Payment'],
]);

/** The Bill.com API connection. */
let billComApi;

/**
 * @param {string} entity
 * @param {func(!Object<string, *>): *} dataFunc
 * @return {!Promise<!Map<string, *>>}
 */
 async function getEntityData(entity, dataFunc) {
  return new Map(
      (await billComApi.listActive(entity)).map(e => [e.id, dataFunc(e)]));
 }

/**
 * @param {string} entity
 * @return {!Promise<!Map<string, string>>}
 */
function getNames(entity) {
  return getEntityData(entity, e => e.name);
}

/**
 * @param {string} entity
 * @return {string}
 */
function billComIdFieldName(entity) {
  return `Org Bill.com ${entity} ID`;
}

/**
 * @param {string} entity
 * @param {!RegExp} regex
 * @return {?string[]}
 */
function matchDescription(entity, regex) {
  return (entity.description || '').match(regex);
}

/**
 * @param {string} time - ISO 8601 formatted datetime.
 * @return {string} Normalized datetime
 *    for comparing across Airtable and Bill.com.
 */
function normalizeTime(time) {
  return time &&= time.substring(0, 23);
}

/**
 * @param {string} sessionId
 * @param {string} billId
 * @return {string[]} billId document URLs
 */
async function getDocuments(sessionId, billId) {
  const pages = await billComApi.dataCall('GetDocumentPages', {id: billId});
  const docs = [];
  for (let i = 1; i <= pages.documentPages.numPages; ++i) {
    docs.push({
      url: 
        `${billComTransformUrl()}?sessionId=${sessionId}&entityId=${billId}` +
            `&pageNumber=${i}`
    });
  }
  return docs;
}

/**
 * @param {!Object<string, *>} upsert
 * @return {!Object<string, *>}
 */
async function inPlaceDocuments(upsert) {
  upsert['Supporting Documents'] = await upsert['Supporting Documents']();
  return upsert;
}

/**
 * @param {!Api} api
 * @param {!Base=} billComIntegrationBase
 * @return {!Promise<undefined>}
 */
export async function main(api, billComIntegrationBase = new Base()) {
  billComApi = api;

  const BILL_REPORTING_TABLE = 'Bill Reporting';
  const merchantRegex =
      new RegExp(
          '(?<date>.+)\\n(?<name>.+)\\n(?<address>.+)\\n' +
              '(?<city>.+) \\| (?<state>.+) \\| (?<zip>.+)\\n' +
              '(?<description>.+)');

  addSummaryTableHeaders(['Org', 'Updates', 'Creates', 'Removes']);
  const orgs =
      await billComIntegrationBase.select(
          'Anchor Entities', BILL_REPORTING_TABLE);
  for (const org of orgs) {

    // Initialize reference data.
    const orgCode = org.get('Local Code');
    const orgId = org.getId();
    const mso = orgCode.startsWith('C') ? 'RS' : orgCode;
    await billComApi.login(orgCode);
    const sessionId = billComApi.getSessionId();
    const vendors =
        await getEntityData(
            'Vendor',
            v => ({
              name: v.name,
              address: v.address1,
              city: v.addressCity,
              state: v.addressState,
              zip: v.addressZip,
            }));
    const chartOfAccounts = await getNames('ChartOfAccount');
    const customers = await getNames('Customer');
    let classes;
    try {
      classes = await getNames('ActgClass');
    } catch (err) {

      // Handle no Classes.
      if (err.message.match(/BDC_1145/)) {
        log(`${orgCode} does not use Classes: ${err.message}`);
      } else {
        throw err;
      }
    }

    // Initialize sync changes.
    const bills = await billComApi.listActive('Bill');
    const changes = new Map();
    const primaryBillComId = billComIdFieldName('Line Item');
    for (const bill of bills) {

      const submitterMatch = matchDescription(bill, /Submitted by (.+) \(/);
      const vendor = vendors.get(bill.vendorId) || {};
      for (const item of bill.billLineItems) {
        const itemVendor =
            (matchDescription(item, merchantRegex) || {}).groups || vendor;
        const approvalStatus = approvalStatuses.get(bill.approvalStatus);
        const paymentStatus = paymentStatuses.get(bill.paymentStatus);
        changes.set(
            item.id,
            {
              'Active': true,
              'Org': [orgId],
              'Submitted By': submitterMatch == null ? null : submitterMatch[1],
              'Creation Date': getYyyyMmDd(item.createdTime),
              'Invoice Date': bill.invoiceDate,
              'Expense Date': itemVendor.date || bill.invoiceDate,
              [billComIdFieldName('Vendor')]: bill.vendorId,
              'Vendor Name': itemVendor.name,
              'Vendor Address': itemVendor.address,
              'Vendor City': itemVendor.city,
              'Vendor State': itemVendor.state,
              'Vendor Zip Code': itemVendor.zip,
              'Description': itemVendor.description || item.description,
              [billComIdFieldName('Chart of Account')]: item.chartOfAccountId,
              'Chart of Account': chartOfAccounts.get(item.chartOfAccountId),
              'Amount': item.amount,
              [billComIdFieldName('Customer')]: item.customerId,
              'Customer': customers.get(item.customerId),
              [billComIdFieldName('Class')]: item?.actgClassId,
              'Class': classes?.get(item?.actgClassId),
              'Invoice ID': bill.invoiceNumber,
              'Approval Status': approvalStatus,
              'Approved': approvalStatus === 'Approved',
              'Payment Status': paymentStatus,
              'Paid': paymentStatus === 'Paid In Full',
              [billComIdFieldName('Bill')]: bill.id,
              'Supporting Documents': () => getDocuments(sessionId, bill.id),
              'Last Updated Time': bill.updatedTime,
            });
      }
    }

    const airtableRecords =
        await billComIntegrationBase.select(
            BILL_REPORTING_TABLE, '', `Org = '${orgCode} (${mso})'`);
    const {updates, creates, removes} =
        sync.syncChanges(
            // Source
            changes,
            // Mapping
            sync.getMapping(airtableRecords, primaryBillComId));

    // Create new table records from new Bill.com data.
    await billComIntegrationBase.create(
        BILL_REPORTING_TABLE,
        await Promise.all(
            Array.from(
                creates,
                async ([id, create]) => ({
                  fields: {
                    [primaryBillComId]: id,
                    ...(await inPlaceDocuments(create)),
                  },
                }))));

    // Update every existing table record based on the Bill.com data.
    const airtableLastUpdatedTimes =
        new Map(
            airtableRecords.map(
                r => [r.getId(), normalizeTime(r.get('Last Updated Time'))]));
    await billComIntegrationBase.update(
        BILL_REPORTING_TABLE,
        [
          ...(await Promise.all(
              sync.filterMap(
                  Array.from(updates),
                  ([id, update]) =>
                      airtableLastUpdatedTimes.get(id) !==
                          normalizeTime(update['Last Updated Time']),
                  async ([id, update]) =>
                      sync.airtableRecordUpdate(
                          [id, await inPlaceDocuments(update)])))),
          ...Array.from(removes, sync.airtableRecordDeactivate),
        ]);
    addSummaryTableRow(
        [orgCode, ...sync.summarize([updates, creates, removes])]);
  }
}