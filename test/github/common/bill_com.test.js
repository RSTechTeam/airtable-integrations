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
const expectVendor = (got, expected) => expect(got).toMatchObject(expected);
let vendorId;

test('create creates given entity', async () => {
  vendorId = await api.create('Vendor', givenVendor);
  const vendor = await api.dataCall('Crud/Delete/Vendor', {id: vendorId});
  expectVendor(vendor, {entity: 'Vendor', ...givenVendor});
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
        api.list(
            'Item',
            [billCom.filter('isActive', '=', billCom.ActiveStatus.INACTIVE)]),
        1);
  });
});

test('listActive returns all active objects', () => {
  return expectListToHaveLength(api.listActive('Item'), 1)
});

// shadowOp is not executed but has similar control flow
const expectedVendor = {entity: 'Vendor', ...givenVendor, name: 'Test 2'};
describe.each`
  op          | shadowOp    | data
  ${'Update'} | ${'Create'} | ${{id: vendorId, name: 'Test 2'}}
  ${'Read'}   | ${'Delete'} | ${vendorId}
`('bulk', ({op, shadowOp, data}) => {
  givenVendor.name = 'Test 2';
  test(`processes and executes ${op}(/${shadowOp}) data`, async () => {
    const response = await api.bulk(op, 'Vendor', [data]);
    expectVendor(response[0].bulk[0].response_data, expectedVendor);
  });
});
