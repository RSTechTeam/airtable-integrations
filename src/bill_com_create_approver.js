/** @fileoverview Creates a Bill.com Electronic Check Request Approver. */

import * as airtable from './airtable.js';
import * as billCom from './bill_com.js';
import * as utils from './utils.js';

/** The Airtable Table name for new Bill.com approvers. */
const APPROVER_TABLE = 'New Bill.com Approvers';

/** The Bill.com User Profile ID for ECR Approvers. */
const ecrApproverUserProfileId = utils.getInput('ecr-approver-user-profile-id');

await billCom.primaryOrgLogin();
await airtable.select(
    APPROVER_TABLE,
    'New',
    async (record) => {
      await billCom.commonDataCall(
          'Crud/Create/User',
          {
            obj: {
              entity: 'User',
              profileId: ecrApproverUserProfileId,
              firstName: record.get('First Name'),
              lastName: record.get('Last Name'),
              email: record.get('Email'),
            }
          });
      airtable.update(
          APPROVER_TABLE, [{id: record.getId(), fields: {'Created': true}}]);
    });
