/** @fileoverview Syncs Bill.com Bill Line Item data into Airtable. */

import {Base} from '../common/airtable.js';
import {filter} from '../common/bill_com.js';
import {getYyyyMmDd, PRIMARY_ORG} from '../common/utils.js';

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
 * @return {string}
 */
function billComIdFieldName(entity) {
  return `${PRIMARY_ORG} Bill.com ${entity} ID`;
}

/**
 * @param {string} entity
 * @param {string} id
 * @return {(!Object<undefined>|!Promise<!Object<string, *>)}
 */
function maybeRead(entity, id) {
  return id.startsWith('00') ? {} : billComApi.read(entity, id);
}

/**
 * @param {!Api} api
 * @param {!Base=} billComIntegrationBase
 * @return {!Promise<undefined>}
 */
export async function main(api, billComIntegrationBase = new Base()) {
  billComApi = api;

  const BILL_REPORTING_TABLE = 'Bill Reporting';

  // Initialize sync changes.
  await billComApi.primaryOrgLogin();
  const bills =
      await billComApi.listActive(
          'Bill', [filter('createdTime', '>', '2022-09-01')]);
  const changes = new Map();
  const primaryBillComId = billComIdFieldName('Line Item');
  for (const bill of bills) {
    const vendor = await billComApi.read('Vendor', bill.vendorId);
    const docs = await billComApi.dataCall('GetDocumentPages', {id: bill.id});
    const docsUrl = docs.documentPages.fileUrl;

    for (const item of bill.billLineItems) {
      const chartOfAccount =
          await maybeRead('ChartOfAccount', item.chartOfAccountId);
      const customer = await maybeRead('Customer', item.customerId);

      changes.set(
          item.id,
          {
            'Active': true,
            [primaryBillComId]: item.id,
            'Creation Date': getYyyyMmDd(item.createdTime),
            'Invoice Date': bill.invoiceDate,
            [billComIdFieldName('Vendor')]: bill.vendorId,
            'Vendor Name': vendor.name,
            'Vendor Address': vendor.address1,
            'Vendor City': vendor.addressCity,
            'Vendor State': vendor.addressState,
            'Vendor Zip Code': vendor.addressZip,
            'Description': item.description,
            [billComIdFieldName('Chart of Account')]: item.chartOfAccountId,
            'Chart of Account': chartOfAccount.name,
            'Amount': item.amount,
            [billComIdFieldName('Customer')]: item.customerId,
            'Customer': customer.name,
            'Invoice ID': bill.invoiceNumber,
            'Supporting Documents': docsUrl == null ? null : [{url: docsUrl}],
            'Approval Status': approvalStatuses.get(bill.approvalStatus),
            'Payment Status': paymentStatuses.get(bill.paymentStatus),
            [billComIdFieldName('Bill')]: bill.id,
          });
    }
  }

  // Update every existing table record based on the Bill.com data.
  const updates = [];
  await billComIntegrationBase.select(
      BILL_REPORTING_TABLE,
      '',
      (record) => {
        const id = record.get(primaryBillComId);
        updates.push({
          id: record.getId(),
          fields: changes.has(id) ? changes.get(id) : {Active: false},
        });
        changes.delete(id);
      });
  await billComIntegrationBase.update(BILL_REPORTING_TABLE, updates);

  // Create new table records from new entity data.
  const creates = [];
  for (const [id, data] of changes) {
    data[primaryBillComId] = id;
    creates.push({fields: data});
  }
  await billComIntegrationBase.create(BILL_REPORTING_TABLE, creates);
}