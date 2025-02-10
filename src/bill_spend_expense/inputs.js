/**
 * @fileoverview Lazy evaluated inputs
 * @see bill_spend_expense/action.yml
 */

import {getInput} from '../common/github_actions_core.js';

/** @type function(): string */
export const billSpendExpenseApiKey = getInput('bill-spend-expense-api-key');