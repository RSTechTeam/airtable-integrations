/** @fileoverview Creates a Bill.com Electronic Check Request Approver. */

import * as airtable from './airtable.js';
import * as billCom from './bill_com.js';
import {ecrApproverUserProfileId} from './inputs.js';

export async function main() {
  const APPROVER_TABLE = 'New Bill.com Approvers';
  const billComIntegrationBase = airtable.getInputBase();
  await billCom.primaryOrgLogin();
  await billComIntegrationBase.select(
      APPROVER_TABLE,
      'New',
      async (record) => {
        await billCom.commonDataCall(
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
