/**
 * @fileoverview Lazy evaluated inputs
 * @see action.yml
 */

import {getInput} from './github_actions_core.js';

/** @type function(): string */
export const airtableApiKey = getInput('airtable-api-key');
export const airtableBaseId = getInput('airtable-base-id');
