/**
 * @fileoverview Syncs BILL Spend & Expense data into Airtable.
 * For more information, check out the API documentation:
 * https://developer.bill.com/docs/spend-expense-api
 */

import pLimit from 'p-limit';
import {airtableRecordUpdate, getMapping, syncChanges} from '../common/sync.js';
import {Base} from '../common/airtable.js';
import {billSpendExpenseApiKey} from './inputs.js';
import {errorParts, fetch} from '../common/fetch.js';
import {getYyyyMmDd} from '../common/utils.js';
import {logJson} from '../common/github_actions_core.js';
import {run} from '../common/action.js';
import {setTimeout} from 'node:timers/promises';

/** The rate limit for BILL Spend & Expense API calls. */
const rateLimit = pLimit(60);
const delay = 60 * 1000;

/**
 * @param {string} endpoint
 * @param {!Object<string, string>=} params
 * @return {!Promise<!Object<string, *>>} endpoint-specific json.
 */
async function apiCall(endpoint, params = {}) {
  let json;
  await new Promise(
      resolve => rateLimit(
          async () => {
            resolve(
                await fetch(
                    async response => {
                      json = await response.json();
                      const err = json[0];
                      return {
                        errorParts:
                          errorParts(err?.code, endpoint, err?.message),
                      };
                    },
                    'https://gateway.prod.bill.com/connect/v3/spend/' +
                        `${endpoint}?${new URLSearchParams(params)}`,
                    {headers: {apiToken: billSpendExpenseApiKey()}}));
            await setTimeout(delay);
          }));

  logJson(endpoint, json);
  return json;
}

/**
 * @param {string} endpoint
 * @param {number} max
 * @param {function(!Object<string, *>): *} processFunc
 * @param {!Object<string, string>=} params
 * @return {!Promise<!Array<*>>}
 */
async function processPages(endpoint, max, processFunc, params = {}) {
  params.max = max.toString();
  let page = {};
  let processed = [];
  do {
    if (page.nextPage) params.nextPage = page.nextPage;
    page = await apiCall(endpoint, params);
    processed = [...processed, ...page.results.map(processFunc)];
  } while (page.nextPage);
  return Promise.all(processed);
}

/**
 * @param {!Object<string, *>} customField
 * @return {string}
 */
function getSelectedValue(customField) {
  return customField.selectedValues[0]?.value;
}

await run(async () => {

  const budgets =
      new Map(await processPages('budgets', 100, b => [b.id, b.name]));
  const reimbursements =
      await processPages(
          'reimbursements', 100,
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
              'Submitted Date': getYyyyMmDd(r.submittedTime),
              'Expense Date': r.occurredDate,
              'Paid': r.status === 'PAID',
              'Approved': recentApprovalStatus.status === 'APPROVED',
              'Budget': budgets.get(r.budgetId),
              'Category': getSelectedValue(r.customFields[0]),
              'Project': getSelectedValue(r.customFields[1]),
              'Receipts': r.receipts.map(receipt => ({url: receipt.url})),
            }
          });
  const transactions =
      await processPages(
          'transactions', 50,
          t => {
            const base = {
              'Type': 'Card Transaction',
              'Paid': true,
              'ID': t.id,
              'Merchant Name': t.merchantName,
              'Budget': budgets.get(t.budgetId),
              'Expense Date': getYyyyMmDd(t.occurredTime),
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
          },
          {filters: 'complete:eq:true'});

  const BILL_SPEND_EXPENSE_TABLE = 'BILL Spend & Expense';
  const expenseSources = new Base();
  const {updates, creates} =
      syncChanges(
          // Source
          new Map([...reimbursements, ...transactions].map(e => [e['ID'], e])),
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
