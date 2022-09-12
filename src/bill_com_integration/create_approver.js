/** @fileoverview Creates a Bill.com Electronic Check Request Approver. */

import {Base} from '../common/airtable.js';
import {ecrApproverUserProfileId} from '../common/inputs.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} billComIntegrationBase
 * @param {string=} approverUserProfileId
 * @param {string=} approverTable
 * @param {string=} createView
 * @return {!Promise<undefined>}
 */
export async function main(
    billComApi,
    billComIntegrationBase = new Base(),
    approverUserProfileId = ecrApproverUserProfileId(),
    approverTable = 'New Bill.com Approvers',
    createView = 'New') {

  await billComApi.primaryOrgLogin();
  await billComIntegrationBase.select(
      approverTable,
      createView,
      async (record) => {
        await billComApi.dataCall(
            'Crud/Create/User',
            {
              obj: {
                entity: 'User',
                profileId: approverUserProfileId,
                firstName: record.get('First Name'),
                lastName: record.get('Last Name'),
                email: record.get('Email'),
              }
            });
        await billComIntegrationBase.update(
            approverTable, [{id: record.getId(), fields: {'Created': true}}]);
      });
}
