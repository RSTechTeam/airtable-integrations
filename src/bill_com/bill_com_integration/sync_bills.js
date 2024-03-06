/** @fileoverview Syncs Bill.com Bill Line Item data into Airtable. */

import {Base} from '../../common/airtable.js';
import {billComTransformUrl} from '../common/inputs.js';
import {getYyyyMmDd} from '../../common/utils.js';

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
  const entities = await billComApi.listActive(entity);
  const data = new Map();
  for (const e of entities) {
    data.set(e.id, dataFunc(e));
  }
  return data;
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

  const orgs =
      await billComIntegrationBase.select(
          'Anchor Entities', BILL_REPORTING_TABLE);
  for (const org of orgs) {

    // Initialize reference data.
    const orgCode = org.get('Local Code');
    const orgId = org.getId();
    const mso = orgCode === 'BOOM' ? 'BOOM' : 'RS';
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
              'Invoice ID': bill.invoiceNumber,
              'Approval Status': approvalStatus,
              'Approved': approvalStatus === 'Approved',
              'Payment Status': paymentStatus,
              'Paid': paymentStatus === 'Paid In Full',
              [billComIdFieldName('Bill')]: bill.id,
              'Last Updated Time': bill.updatedTime,
            });
      }
    }

    // Update every existing table record based on the Bill.com data.
    const updates = [];
    const records =
        await billComIntegrationBase.select(
            BILL_REPORTING_TABLE, '', `Org = '${orgCode} (${mso})'`);
    for (const record of records) {
      const id = record.get(primaryBillComId);
      const update = {id: record.getId()};
      if (!changes.has(id)) {
        update.fields = {Active: false};
        updates.push(update);
        continue;
      }

      const fields = changes.get(id);
      changes.delete(id);

      const airtableTime = normalizeTime(record.get('Last Updated Time'));
      const billComTime = normalizeTime(fields['Last Updated Time']);
      if (airtableTime === billComTime) continue;

      fields['Supporting Documents'] =
          await getDocuments(sessionId, fields[billComIdFieldName('Bill')]);
      update.fields = fields;
      updates.push(update);
    }
    await billComIntegrationBase.update(BILL_REPORTING_TABLE, updates);

    // Create new table records from new Bill.com data.
    const creates = [];
    for (const [id, data] of changes) {
      creates.push({
        fields: {
          [primaryBillComId]: id,
          'Supporting Documents':
            await getDocuments(sessionId, data[billComIdFieldName('Bill')]),
          ...data,
        }
      });
    }
    await billComIntegrationBase.create(BILL_REPORTING_TABLE, creates);
  }
}