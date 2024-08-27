import * as csv from '../../../src/common/csv.js';

const TEST_CSV_URL =
    'https://raw.githubusercontent.com/RSTechTeam/airtable-integrations/main' +
        '/test/local/common/test_csv.csv';

const testHeader = ['Header 1', 'Header 2'];
const parse =
    (url, header) => csv.parse(
        {url: url},
        header,
        {
          chunk:
            (results, parser) => results.data.map(
                row => Object.values(row).join(' ')),
        });

describe.each`
  name            | url             | header               | throws
  ${'no url'}     | ${''}           | ${testHeader}        | ${true}
  ${'bad url'}    | ${'bad url'}    | ${testHeader}        | ${true}
  ${'no header'}  | ${TEST_CSV_URL} | ${[]}                | ${true}
  ${'bad header'} | ${TEST_CSV_URL} | ${['Bad', 'Header']} | ${true}
  ${'success'}    | ${TEST_CSV_URL} | ${testHeader}        | ${false}
`('parse', ({name, url, header, throws}) => {

  const parseIt = () => parse(url, header)
  if (throws) {
    debugger;
    test(`given ${name}, throws`, () => expect(parseIt()).rejects.toThrow());
  } else {
    test('parses', async () => {
      const parsed = await parseIt();
      expect(parsed.flat()).toEqual(['Value 1 Value 2', 'Hello World'])
    });
  }
});
