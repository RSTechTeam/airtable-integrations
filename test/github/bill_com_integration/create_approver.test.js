import * as createApprover from '../../../src/bill_com_integration/create_approver.js';
import {airtableBase, billComApi} from '../../test_utils.js';
import {filter} from '../../../src/common/bill_com.js';

test('main creates Bill.com Approver User', async () => {
  const testStartTime = Date().toISOString();
  const api = await billComApi();
  const listRecentlyCreatedUsers = () => {
    return api.listActive('User', [filter('createdTime', '>', testStartTime)]);
  };
  const base = airtableBase();

  // Check pre-conditions.
  api.primaryOrgLogin();
  expect(listRecentlyCreatedUsers()).resolves.toHaveLength(0);

  // Execute main.
  const userTable = 'Users';
  await createApprover.main(
      api, base, process.env.APPROVER_USER_PROFILE_ID, userTable, '');

  // Check post-conditions and reset.
  const users = await listRecentlyCreatedUsers();
  expect(users).toHaveLength(1);
  api.dataCall('Crud/Delete/User', {id: users[0].id});
  base.select(
      userTable,
      '',
      (record) => {
        expect(record.get('Created')).toBe(true);
        return base.update(
            userTable, [{id: record.getId(), fields: {'Created': false}}]);
      });
});
