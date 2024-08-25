import * as sync from '../../../../src/bill_com/bill_com_integration/sync_internal_customers.js';
import {airtableBase, airtableMsoBase, billComApi} from '../../../test_utils.js';
import {isActiveEnum} from '../../../../src/bill_com/common/api.js';
import {MSO_BILL_COM_ID} from '../../../../src/bill_com/common/constants.js';

test('main syncs Customers from Airtable to Bill.com', async () => {

  // Test customers.
  const EXTERNAL = 'External Customer'
  const INTERNAL_PARENT = 'Internal Parent Customer';
  const BILL_COM_ONLY = 'Bill.com Only Customer';
  const STALE_NAME = 'Stale Name Customer';
  const ACTIVE = 'Active? Customer';
  const AIRTABLE_ONLY = 'Airtable Only Customer';
  const NEW_NAME = 'New Name Customer';

  // Setup.
  const createCustomer =
      async (name, parentId = null, active = true) => api.create(
          'Customer',
          {
            name: name,
            parentCustomerId: parentId,
            active: isActiveEnum(active),
          });

  const api = await billComApi();
  await api.primaryOrgLogin();
  await api.bulk(
      'Delete',
      'Customer',
      (await api.listActive('Customer')).map(c => c.id));
  await createCustomer(EXTERNAL);
  const internalParentId = await createCustomer(INTERNAL_PARENT);
  await createCustomer(BILL_COM_ONLY, internalParentId);
  const staleNameId = await createCustomer(STALE_NAME, internalParentId);
  const activeId = await createCustomer(ACTIVE, internalParentId, false);
  const base = airtableBase();
  await base.selectAndUpdate(
      'Internal Customers',
      '',
      async (record) => {
        let id;
        switch (record.get('Local Name')) {
          case AIRTABLE_ONLY:
            id = '';
            break;
          case NEW_NAME:
            id = staleNameId;
            break;
          case ACTIVE:
            id = activeId;
            break;
          default:
            throw new Error('Unexpected Internal Customer');
        }
        return {[MSO_BILL_COM_ID]: id};
      });
  await base.selectAndUpdate(
      'MSOs', '', r => ({'Internal Customer ID': internalParentId}));

  // Check pre-conditions.
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

  await expectListActiveNames([
    EXTERNAL,
    INTERNAL_PARENT,
    BILL_COM_ONLY,
    STALE_NAME,
  ]);
  expect(testCustomers.size).toEqual(4);

  // Execute main.
  await sync.main(api, airtableMsoBase());

  // Check post-conditions.
  await expectListActiveNames([
    EXTERNAL,
    INTERNAL_PARENT,
    AIRTABLE_ONLY,
    NEW_NAME,
    ACTIVE,
  ]);
  expect(testCustomers.size).toEqual(7);
  expect(testCustomers.get(STALE_NAME)).toEqual(testCustomers.get(NEW_NAME));
});
