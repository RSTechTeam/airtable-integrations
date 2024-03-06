import * as createApprover from '../../../../src/bill_com/bill_com_integration/create_approver.js';
import {airtableBase, billComApi} from '../../../test_utils.js';
import {filter} from '../../../../src/bill_com/common/api.js';

test('main creates Bill.com Approver User', async () => {
  const testStartTime = new Date().toISOString();
  const api = await billComApi();
  const listRecentlyCreatedUsers = () => {
    return api.listActive('User', [filter('createdTime', '>', testStartTime)]);
  };
  const base = airtableBase();

  // Setup.
  const userTable = 'Users';
  await api.primaryOrgLogin();
  const allUsers = await api.list('User');
  await base.selectAndUpdate(
      userTable, '', (record) => ({Email: `test${allUsers.length}@abc.xyz`}));

  // Check pre-conditions.
  expect(listRecentlyCreatedUsers()).resolves.toHaveLength(0);

  // Execute main.
  await createApprover.main(
      api, base, process.env.APPROVER_USER_PROFILE_ID, userTable, '');

  // Check post-conditions and reset.
  const users = await listRecentlyCreatedUsers();
  expect(users).toHaveLength(1);
  await base.selectAndUpdate(
      userTable,
      '',
      (record) => {
        expect(record.get('Created')).toBe(true);
        return {'Created': false};
      });
  await api.dataCall('Crud/Delete/User', {id: users[0].id});
});
