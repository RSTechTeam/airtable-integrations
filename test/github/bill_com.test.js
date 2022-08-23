import * as billCom from '../../src/bill_com.js';

let billComApi;

test('getApi', () => {
  const devKey = process.env.BILL_COM_DEV_KEY;
  billComApi =
      billCom.getApi(
          process.env.AIRTABLE_ORG_IDS_BASE_ID,
          process.env.BILL_COM_USER_NAME,
          process.env.BILL_COM_PASSWORD,
          devKey,
          true);
  expect(billComApi).not.toBeNull();
  expect(billComApi.getDevKey()).toBe(devKey);
  expect(billComApi.getSessionId()).toBeNull();
});

test('login', async () => {
  await billComApi.login('RS');
  expect(billComApi.getSessionId()).not.toBeNull();
});