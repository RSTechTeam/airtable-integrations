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

  test('without filter, returns all 2 vendors', expectListLength(2));
  test('with active filter, returns single active vendor',
      expectListLength(1, [billCom.filter('isActive', '=', '1')]));
});

describe('createVendor', () => {
  const expected = {
    entity: 'Vendor',
    isActive: '1',
    name: 'Test',
    email: 'test@rsllc.co',
  };
  const createVendor = (state) => {
    return billComApi.createVendor(
        expected.name, '', '', '', state, '', '', expected.email, '');
  };

  test('given valid info, creates vendor', async () => {
    const state = 'CA';
    const id = await createVendor(state);
    const response = await billComApi.dataCall('Crud/Read/Vendor', {id: id});
    expect(response).toMatchObject(expected);
    expect(response.addressState).toBe(state);
  });

  test('given invalid state, throws', () => {
    return expect(createVendor('X')).rejects.toThrow();
  });
});
