import * as billCom from '../../../src/common/bill_com.js';
import {billComApi} from '../../test_utils.js';

let api;

test('getApi queries Airtable and creates unauthenticated Api', async () => {
  api = await billComApi();
  expect(api).not.toBeNull();
  expect(api.getDevKey()).toBe(process.env.BILL_COM_DEV_KEY);
  expect(api.getSessionId()).toBeNull();
});

test('login authenticates and sets session ID', async () => {
  await api.login('RS');
  expect(api.getSessionId()).not.toBeNull();
});

test('dataCall successfully makes API call with json data', () => {
  const response = api.dataCall('GetEntityMetadata', {'entity': ['Vendor']});
  return expect(response).resolves.not.toBeNull();
});

describe('list', () => {
  test('without filter, returns all vendors', async () => {
    const vendors = await api.list('Vendor');
    expect(vendors.length).toBeGreaterThan(1);
  });

  test('with active filter, returns single active vendor', () => {
    return expect(api.listActive('Vendor')).resolves.toHaveLength(1);
  });
});

const expectedVendor = {entity: 'Vendor', name: 'Test', email: 'test@rsllc.co'};
const expectVendor = (vendor) => expect(vendor).toMatchObject(expectedVendor);
let vendorQueryData;

test('createVendor creates vendor', async () => {
  const id =
      await api.createVendor(
          expectedVendor.name, '', '', '', '', '', '', expectedVendor.email, '');
  vendorQueryData = {id: id};
  api.dataCall('Crud/Delete/Vendor', vendorQueryData).then(expectVendor);
});

test('bulkCall returns bulk responses', async () => {
  const response = await api.bulkCall('Read/Vendor', [vendorQueryData]);
  expectVendor(response[0].bulk[0].response_data);
});
