import * as billCom from '../../src/bill_com.js';

describe('apiCall', () => {

  const expectApiCallToThrow = (endpoint, errorCode) => () => {
    const apiCall = billCom.apiCall(endpoint, {}, '', true);
    return expect(apiCall).rejects.toThrow(new RegExp(`BDC_${errorCode}`));
  };

  test('given no endpoint, throws', expectApiCallToThrow('', 1121));
  test('given missing params, throws', expectApiCallToThrow('Login', 1108));
});

test('filter', () => {
  expect(billCom.filter('field', 'op', 'value')).toEqual(
      {field: 'field', op: 'op', value: 'value'});
});
