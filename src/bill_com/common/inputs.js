/**
 * @fileoverview Lazy evaluated inputs
 * @see action.yml
 */

import {getInput} from '../../common/github_actions_core.js';

/** @type function(): string */
export const fileId = getInput('file-id');
export const airtableOrgIdsBaseId = getInput('airtable-org-ids-base-id');
export const billComDevKey = getInput('bill-com-dev-key');
export const billComUserName = getInput('bill-com-user-name');
export const billComPassword = getInput('bill-com-password');
export const billComTransformUrl = getInput('bill-com-transform-url');
export const ecrApproverUserProfileId =
  getInput('ecr-approver-user-profile-id');
