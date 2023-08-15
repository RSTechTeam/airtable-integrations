import {Syncer, vendorName, processBulkResponses} from '../../src/sync.js';

describe('Syncer Unit Tests', () => {
  describe('vendorName', () => {
    it('returns name if city and state are null', () => {
      const name = 'Vendor Inc.';
      expect(vendorName(name, null, null)).toBe(name);
    });

    it('returns name with city and state if they are present', () => {
      const name = 'Vendor Inc.';
      const city = 'San Francisco';
      const state = 'CA';
      expect(vendorName(name, city, state)).toBe(`${name} (${city}, ${state})`);
    });
  });

  // TODO: Add tests for processBulkResponses

  describe('Syncer', () => {
    // TODO: Add tests for Syncer methods
    // Create an instance of Syncer and test its methods
  });
});
