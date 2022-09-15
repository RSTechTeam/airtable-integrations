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

const givenVendor = {name: 'Test', email: 'test@abc.xyz'};
const expectedVendor = {entity: 'Vendor', ...givenVendor};
const expectVendor = (vendor) => expect(vendor).toMatchObject(expectedVendor);
const deleteAndExpectVendor =
    (data) => api.dataCall('Crud/Delete/Vendor', data).then(expectVendor);

test('create creates given entity', async () => {
  const id = await api.create('Vendor', givenVendor);
  await deleteAndExpectVendor({id: id});
});

const expectListToHaveLength = (listResult, expected) => {
  return expect(listResult).resolves.toHaveLength(expected);
};

describe('list', () => {
  test('with no filter, returns all objects', () => {
    return expectListToHaveLength(api.list('Item'), 2)
  });

  test('with inactive filter, returns all inactive objects', () => {
    return expectListToHaveLength(
        api.list('Item', [billCom.filter('isActive', '=', '2')]), 1)
  });;
});

test('listActive returns all active objects', () => {
  return expectListToHaveLength(api.listActive('Item'), 1)
});

let vendorQueryData;

test('createVendor creates vendor', async () => {
  const id =
      await api.createVendor(
          givenVendor.name, '', '', '', '', '', '', givenVendor.email, '');
  vendorQueryData = {id: id};
  await deleteAndExpectVendor(vendorQueryData);
});

test('bulkCall returns bulk responses', async () => {
  const response = await api.bulkCall('Read/Vendor', [vendorQueryData]);
  expectVendor(response[0].bulk[0].response_data);
});
