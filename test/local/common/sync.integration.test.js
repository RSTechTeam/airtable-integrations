import axios from 'axios';
import Airtable from 'airtable';
import {Syncer, Api, MsoBase} from '../../src/sync.js';

// Set up Airtable
const base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY}).base('YOUR_BASE_ID');
const table = base('Test');

// Set up Api and MsoBase
const api = new Api(/* pass in any required arguments */);
const msoBase = new MsoBase(/* pass in any required arguments */);

describe('Syncer Integration Tests', () => {
  beforeEach(async () => {
    // Set up test data
    await table.create([
      {fields: {number: '0po01AIEKTONQWAL57ok', name: 'Accountant'}},
      // Add more records...
    ]);
  });

  afterEach(async () => {
    // Tear down test data
    const records = await table.select().all();
    await table.destroy(records.map(record => record.getId()));
  });

  it('syncs unpaid bills', async () => {
    const syncer = new Syncer(api, msoBase);

    await syncer.syncUnpaid('Check Requests', 'Bill');

    // TODO: Add expects to verify the behavior
  });

  // TODO: Add more test cases for other methods
});
