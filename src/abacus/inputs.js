/**
 * @fileoverview Lazy evaluated inputs
 * @see abacus/action.yml
 */

import {getInput} from '../common/github_actions_core.js';

/** @type function(): string */
export const airtableImportRecordId = getInput('airtable-import-record-id');
