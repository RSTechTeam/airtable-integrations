import * as sync from '../../../src/accounting_terminology_index/sync.js';
import {Base, PRIMARY_ORG_BILL_COM_ID} from '../../../src/common/airtable.js';
import {getApi} as billCom from '../../../src/common/bill_com.js';

test('main syncs Customers from Airtable to Bill.com', async () => {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const billComApi =
      await getApi(
          process.env.AIRTABLE_ORG_IDS_BASE_ID,
          apiKey,
          process.env.BILL_COM_USER_NAME,
          process.env.BILL_COM_PASSWORD,
          process.env.BILL_COM_DEV_KEY,
          true);
  const testCustomers = new Map();
  const expectListActiveNames = async (expected) => {
    const customers = await billComApi.listActive('Customer');
    const names =
        customers.map(
            (customer) => {
              testCustomers.set(customer.name, customer.id);
              return customer.name;
            });
    expect(names).toEqual(expect.arrayContaining(expected));
  };
  const airtableBase = new Base(process.env.AIRTABLE_BASE_ID, apiKey);

  // Test customers.
  const BILL_COM_ONLY = 'Bill.com Only Customer';
  const STALE_NAME = 'Stale Name Customer';
  const AIRTABLE_ONLY = 'Airtable Only Customer';
  const ACTIVE = 'Active? Customer';
  const NEW_NAME = 'New Name Customer';

  // Check pre-conditions.
  const initiallyActiveCustomers = [BILL_COM_ONLY, STALE_NAME];
  await expectListActiveNames(initiallyActiveCustomers);
  expect(testCustomers.size).toEqual(2);

  // Execute main.
  const customerTable = 'Customers';
  const nameField = 'Name';
  await sync.main(
      billComApi,
      airtableBase,
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
    updates.push({
      obj: {
        entity: 'Customer',
        id: id,
        name: encodeURIComponent(name),
        isActive: initiallyActiveCustomers.includes(name) ? '1' : '2',
      }
    });
  }
  await billComApi.bulkCall('Update/Customer', updates);
  await airtableBase.select(
      customerTable,
      '',
      (record) => {
        if (record.get(nameField) !== AIRTABLE_ONLY) return;
        return airtableBase.update(
            customerTable,
            [{id: record.getId(), fields: {[PRIMARY_ORG_BILL_COM_ID]: ''}}]);
      });
});
