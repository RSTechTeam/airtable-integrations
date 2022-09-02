import * as billCom from '../../../src/common/bill_com.js';

let billComApi;

test('getApi queries Airtable and creates unauthenticated Api', async () => {
  const devKey = process.env.BILL_COM_DEV_KEY;
  billComApi =
      await billCom.getApi(
          process.env.AIRTABLE_ORG_IDS_BASE_ID,
          process.env.AIRTABLE_API_KEY,
          process.env.BILL_COM_USER_NAME,
          process.env.BILL_COM_PASSWORD,
          devKey,
          true);
  expect(billComApi).not.toBeNull();
  expect(billComApi.getDevKey()).toBe(devKey);
  expect(billComApi.getSessionId()).toBeNull();
});

test('login authenticates and sets session ID', async () => {
  await billComApi.login('RS');
  expect(billComApi.getSessionId()).not.toBeNull();
});

test('dataCall successfully makes API call with json data', () => {
  const response =
      billComApi.dataCall('GetEntityMetadata', {'entity': ['Vendor']});
  return expect(response).resolves.not.toBeNull();
});

describe('list', () => {
  const expectListLength = (expectedLength, filters = null) => () => {
    const response = billComApi.list('Vendor', filters);
    return expect(response).resolves.toHaveLength(expectedLength);
  };

  test('without filter, returns all 4 vendors', expectListLength(4));
  test('with active filter, returns single active vendor',
      expectListLength(1, [billCom.filter('isActive', '=', '1')]));
});

test('createVendor creates vendor', async () => {
  const expected = {
    entity: 'Vendor',
    name: 'Test',
    email: 'test@rsllc.co',
  };
  const id =
      await billComApi.createVendor(
          expected.name, '', '', '', '', '', '', expected.email, '');
  const response = await billComApi.dataCall('Crud/Delete/Vendor', {id: id});
  expect(response).toMatchObject(expected);
});
