import * as sync from '../../../src/accounting_terminology_index/sync.js';
import {airtableBase, billComApi} from '../../test_utils.js';
import {entityData, isActiveEnum} from '../../../src/common/bill_com.js';
import {jest} from '@jest/globals';
import {PRIMARY_ORG_BILL_COM_ID} from '../../../src/common/airtable.js';

// Increasingly long because this test lists both active and inactive Customers,
// creates a Customer every run, and Bill.com doesn't currently enable
// true deleting.
jest.setTimeout(10000);

test('main syncs Customers from Airtable to Bill.com', async () => {
  const api = await billComApi();
  const testCustomers = new Map();
  const expectListActiveNames = async (expected) => {
    const customers = await api.listActive('Customer');
    const names =
        customers.map(
            (customer) => {
              testCustomers.set(customer.name, customer.id);
              return customer.name;
            });
    expect(names).toEqual(expect.arrayContaining(expected));
  };
  const base = airtableBase();

  // Test customers.
  const BILL_COM_ONLY = 'Bill.com Only Customer';
  const STALE_NAME = 'Stale Name Customer';
  const AIRTABLE_ONLY = 'Airtable Only Customer';
  const ACTIVE = 'Active? Customer';
  const NEW_NAME = 'New Name Customer';

  // Check pre-conditions.
  await api.primaryOrgLogin();
  const initiallyActiveCustomers = [BILL_COM_ONLY, STALE_NAME];
  await expectListActiveNames(initiallyActiveCustomers);
  expect(testCustomers.size).toEqual(2);

  // Execute main.
  const customerTable = 'Customers';
  const nameField = 'Name';
  await sync.main(
      api,
      base,
      process.env.INTERNAL_CUSTOMER_ID,
      customerTable,
      '',
      nameField);

  // Check post-conditions.
  await expectListActiveNames([AIRTABLE_ONLY, ACTIVE, NEW_NAME]);
  expect(testCustomers.size).toEqual(5);
  expect(testCustomers.get(STALE_NAME)).toEqual(testCustomers.get(NEW_NAME));

  // Reset.
  testCustomers.delete(NEW_NAME);
  const updates = [];
  for (const [name, id] of testCustomers) {
    updates.push(
        entityData(
            'Customer',
            {
              id: id,
              name: name,
              isActive: isActiveEnum(initiallyActiveCustomers.includes(name)),
            }));
  }
  await api.bulk('Update/Customer', updates);
  await base.select(
      customerTable,
      '',
      (record) => {
        if (record.get(nameField) !== AIRTABLE_ONLY) return;
        return base.update(
            customerTable,
            [{id: record.getId(), fields: {[PRIMARY_ORG_BILL_COM_ID]: ''}}]);
      });
});
