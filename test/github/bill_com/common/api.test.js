import * as api from '../../../../src/bill_com/common/api.js';
import {billComApi} from '../../../test_utils.js';
import {jest} from '@jest/globals';

jest.setTimeout(10**4);

let testApi;

test('getApi queries Airtable and creates unauthenticated Api', async () => {
  testApi = await billComApi();
  expect(testApi).not.toBeNull();
  expect(testApi.getDevKey()).toBe(process.env.BILL_COM_DEV_KEY);
  expect(testApi.getSessionId()).toBeNull();
});

test('login authenticates and sets session ID', async () => {
  await testApi.login('RS');
  expect(testApi.getSessionId()).not.toBeNull();
});

test('dataCall successfully makes API call with json data', () => {
  const response =
      testApi.dataCall('GetEntityMetadata', {'entity': ['Vendor']});
  return expect(response).resolves.not.toBeNull();
});

const givenVendor = {name: 'Test', email: 'test@abc.xyz'};
const expectVendor = (got, expected) => expect(got).toMatchObject(expected);
let vendorId;

test('create creates given entity', async () => {
  vendorId = await testApi.create('Vendor', givenVendor);
  const vendor = await testApi.dataCall('Crud/Delete/Vendor', {id: vendorId});
  expectVendor(vendor, {entity: 'Vendor', ...givenVendor});
});

const expectListToHaveLength = (listResult, expected) => {
  return expect(listResult).resolves.toHaveLength(expected);
};

describe('list', () => {
  test('with no filter, returns all objects', () => {
    return expectListToHaveLength(testApi.list('Item'), 2)
  });

  test('with inactive filter, returns all inactive objects', () => {
    return expectListToHaveLength(
        testApi.list(
            'Item', [api.filter('isActive', '=', api.ActiveStatus.INACTIVE)]),
        1);
  });
});

test('listActive returns all active objects', () => {
  return expectListToHaveLength(testApi.listActive('Item'), 1)
});

// shadowOp is not executed but has similar control flow
describe.each`
  op          | shadowOp
  ${'Update'} | ${'Create'}
  ${'Read'}   | ${'Delete'}
`('bulk', ({op, shadowOp}) => {
  const expectedVendor = {entity: 'Vendor', ...givenVendor, name: 'Test 2'};

  test(`processes and executes ${op}(/${shadowOp}) data`, async () => {
    const data = op === 'Update' ? {id: vendorId, name: 'Test 2'} : vendorId;
    const response = await testApi.bulk(op, 'Vendor', [data]);
    expectVendor(response[0].bulk[0].response_data, expectedVendor);
  });
});
