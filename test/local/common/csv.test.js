import * as csv from '../../../src/common/csv.js';

const TEST_CSV = 
    `Header 1,Header 2
Value 1,Value 2
Hello,World`;
const TEST_CSV_URL =
    'https://raw.githubusercontent.com/RSTechTeam/airtable-integrations/main' +
        '/test/local/common/test_csv.csv';

const testHeader = ['Header 1', 'Header 2'];
const chunk =
    (results, parser) => results.data.map(row => Object.values(row).join(' '));
const parseTest = (name, throws, parse) => {
  if (throws) {
    test(`given ${name}, throws`, () => expect(parse()).rejects.toThrow());
  } else {
    test('parses', async () => {
      const parsed = await parse();
      expect(parsed.flat()).toEqual(['Value 1 Value 2', 'Hello World']);
    });
  }
};

describe.each`
  name            | header               | throws
  ${'no header'}  | ${[]}                | ${true}
  ${'bad header'} | ${['Bad', 'Header']} | ${true}
  ${'success'}    | ${testHeader}        | ${false}
`('parse', ({name, header, throws}) => {
  parseTest(name, throws, () => csv.parse(TEST_CSV, header, {chunk}));
});

describe.each`
  name         | url             | throws
  ${'no url'}  | ${''}           | ${true}
  ${'bad url'} | ${'bad url'}    | ${true}
  ${'success'} | ${TEST_CSV_URL} | ${false}
`('parseAttachment', ({name, url, throws}) => {
  parseTest(
      name, throws, () => csv.parseAttachment({url}, testHeader, {chunk}));
});
