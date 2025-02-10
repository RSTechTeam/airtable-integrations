/**
 * @fileoverview Syncs BILL Spend & Expense data into Airtable.
 * For more information, check out the API documentation:
 * https://developer.bill.com/docs/spend-expense-api
 */

import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import {airtableRecordUpdate, getMapping, syncChanges} from '../common/sync.js';
import {Base} from '../common/airtable.js';
import {billSpendExpenseApiKey} from './inputs.js';
import {fetchError} from '../common/utils.js';
import {logJson} from '../common/github_actions_core.js';
import {run} from '../common/action.js';

/** The rate limit for BILL Spend & Expense API calls. */
const rateLimit = pThrottle({limit: 60, interval: 60 * 1000});

/**
 * @param {string} endpoint
 * @param {!URLSearchParams=} params
 * @return {!Promise<!Object<string, *>>} endpoint-specific json.
 */
async function apiCall(endpoint, params = new URLSearchParams()) {
  const response =
      await rateLimit(
          () => fetch(
              `https://gateway.prod.bill.com/connect/v3/spend/${endpoint}` +
                  `?${params}`,
              {headers: {apiToken: billSpendExpenseApiKey()}}));
  const json = response.json();
  logjson(endpoint, json);
  if (!response.ok) {
    const err = json[0];
    fetchError(err.code, endpoint, err.message);
  }
  return json;
}

/**
 * @param {string} endpoint
 * @param {number} max
 * @param {string=} nextPage
 * @param {!URLSearchParams=} params
 * @return {!Promise<!Object<string, *>>} endpoint-specific page.
 */
function getPage(endpoint, max, nextPage = '', params = new URLSearchParams()) {
  params.set('max', max.toString());
  if (nextPage) params.set('nextPage', nextPage);
  return apiCall(endpoint, params);
}

/**
 * @param {string=} nextPage
 * @return {!Promise<!Object<string, *>>}
 */
function getReimbursementPage(nextPage = '') {
  return getPage('reimbursements', 100, nextPage);
}

/**
 * @param {string=} nextPage
 * @return {!Promise<!Object<string, *>>}
 */
function getTransactionPage(nextPage = '') {
  return getPage(
      'transactions', 50, nextPage,
      new URLSearchParams({filters: 'complete:eq:true'}));
}

/**
 * @param {function(string=): !Promise<!Object<string, *>>} pageFunc
 * @return {!AsyncGenerator<!Array<!Object<string, *>>>}
 */
async function* getPages(pageFunc) {
  let page = {};
  do {
    page = await pageFunc(page.nextPage);
    yield page.results;
  } while (page.nextPage);
}

/**
 * @param {!Object<string, *>} customField
 * @return {string}
 */
function getSelectedValue(customField) {
  return customField.selectedValues[0]?.value;
}

await run(async () => {

  let changes = [];
  for await (const page of getPages(getReimbursementPage)) {
    const reimbursements =
        await Promise.all(
            page.map(
              async reimbursement => {

                // Get reimbursement to get receipt URLs.
                const r = await apiCall(`reimbursements/${reimbursement.id}`);
                const recentApprovalStatus =
                    r.statusHistory.find(sh => sh.status.includes('APPROV'));
                return {
                  'Type': 'Reimbursement',
                  'ID': r.id,
                  'Amount': r.amount,
                  'Merchant Name': r.merchantName,
                  'Notes': r.note,
                  'Submitted Date': r.submittedTime,
                  'Expense Date': r.occurredDate,
                  'Paid': r.status === 'PAID',
                  'Approved': recentApprovalStatus.status === 'APPROVED',
                  'Category': getSelectedValue(r.customFields[0]),
                  'Project': getSelectedValue(r.customFields[1]),
                  'Receipts': r.receipts.map(receipt => receipt.url),
                }
              }
            ));
    changes = [...changes, ...reimbursements];
  }

  for await (const page of getPages(getTransactionPage)) {
    changes = [
      ...changes,
      ...page.map(
          t => {
            const base = {
              'Type': 'Card Transaction',
              'Paid': true,
              'ID': t.id,
              'Merchant Name': t.merchantName,
              'Expense Date': t.occurredTime,
              'Category': getSelectedValue(t.customFields[0]),
              'Notes': getSelectedValue(t.customFields[1]),
              'Project': getSelectedValue(t.customFields[2]),
              'Approved': t.reviews.every(r => r.isApproved),
              'Amount': t.amount,
            }
            if (!t.cardPresent) return base;

            const location = t.merchantLocation;
            return {
              ...base,
              'Merchant City': location.city,
              'Merchant State': location.state,
              'Merchant Zip Code': location.postalCode,
              'Merchant Country': location.country,
            };
          }),
    ];
  }

  const BILL_SPEND_EXPENSE_TABLE = 'BILL Spend & Expense';
  const expenseSources = new Base();
  const {updates, creates} =
      syncChanges(
          // Source
          new Map(changes.map(c => [c['ID'], c])),
          // Mapping
          getMapping(
              await expenseSources.select(BILL_SPEND_EXPENSE_TABLE), 'ID'));

  return Promise.all([
      expenseSources.update(
          BILL_SPEND_EXPENSE_TABLE, Array.from(updates, airtableRecordUpdate)),
      expenseSources.create(
          BILL_SPEND_EXPENSE_TABLE,
          Array.from(creates, ([, create]) => ({fields: create}))),
    ]);
});
