import * as api from '../../../../src/bill_com/common/api.js';

describe('apiCall', () => {

  const expectApiCallToThrow = (endpoint, appType, body, errorCode) => () => {
    const headers = {'Content-Type': `application/${appType}`};
    const apiCall = api.apiCall(endpoint, headers, body, true);
    return expect(apiCall).rejects.toThrow(new RegExp(`BDC_${errorCode}`));
  };

  const expectLoginToThrow = (appType, body, errorCode) => {
    return expectApiCallToThrow('Login', appType, body, errorCode);
  };

  const body =
      new URLSearchParams({
        devKey: 'devKey',
        userName: 'userName',
        password: 'password',
        orgId: 'orgId',
      });

  test('given no endpoint, throws', expectApiCallToThrow('', '', '', 1121));

  test('given missing params, throws', expectLoginToThrow('', '', 1108));

  test('given invalid params (wrong Content-Type), throws',
      expectLoginToThrow('', body, 1108));

  test('given invalid params (correct Content-Type, throws',
      expectLoginToThrow('x-www-form-urlencoded', body, 1129));
});

describe.each`
  given    | expected
  ${true}  | ${api.ActiveStatus.ACTIVE}
  ${false} | ${api.ActiveStatus.INACTIVE}
`('isActiveEnum', ({given, expected}) => {

  test(`given ${given}, returns ${expected}`,
      () => expect(api.isActiveEnum(given)).toBe(expected));
});

test('filter creates API filter object', () => {
  expect(api.filter('field', 'op', 'value')).toEqual(
      {field: 'field', op: 'op', value: 'value'});
});
