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
  const listLength = async (filters = null) => {
    const list = await billComApi.list('Vendor', filters);
    return list.length;
  };

  test('without filter, returns all vendors', () => {
    return expect(listLength()).resolves.toBeGreaterThan(1);
  });

  test('with active filter, returns single active vendor', () => {
    const filter = [billCom.filter('isActive', '=', '1')];
    return expect(listLength(filter)).resolves.toBe(1);
  });
});

const expectedVendor = {entity: 'Vendor', name: 'Test', email: 'test@rsllc.co'};
const expectVendor = (vendor) => expect(vendor).toMatchObject(expectedVendor);
let vendorQueryData;

test('createVendor creates vendor', async () => {
  const id =
      await billComApi.createVendor(
          expectedVendor.name, '', '', '', '', '', '', expectedVendor.email, '');
  vendorQueryData = {id: id};
  billComApi.dataCall('Crud/Delete/Vendor', vendorQueryData).then(expectVendor);
});

test('bulkCall returns bulk responses', async () => {
  const response = await billComApi.bulkCall('Read/Vendor', [vendorQueryData]);
  expectVendor(response[0].bulk[0].response_data);
});
