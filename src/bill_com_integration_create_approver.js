/** @fileoverview Creates a Bill.com Electronic Check Request Approver. */

import {ecrApproverUserProfileId} from './inputs.js';

/**
 * @param {!Base} billComIntegrationBase
 * @param {!Api} billComApi
 */
export async function main(billComIntegrationBase, billComApi) {
  const APPROVER_TABLE = 'New Bill.com Approvers';
  await billComApi.primaryOrgLogin();
  await billComIntegrationBase.select(
      APPROVER_TABLE,
      'New',
      async (record) => {
        await billComApi.dataCall(
            'Crud/Create/User',
            {
              obj: {
                entity: 'User',
                profileId: ecrApproverUserProfileId(),
                firstName: record.get('First Name'),
                lastName: record.get('Last Name'),
                email: record.get('Email'),
              }
            });
        await billComIntegrationBase.update(
            APPROVER_TABLE, [{id: record.getId(), fields: {'Created': true}}]);
      });
}
