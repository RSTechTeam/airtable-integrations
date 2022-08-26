/** @fileoverview Creates a Bill.com Vendor based on volunteer address info. */
 
import {Base} from '../common/airtable.js';
import {primaryOrg} from '../common/inputs.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} airtableBase
 */
export async function main(billComApi, airtableBase = new Base()) {
  const VOLUNTEERS_TABLE = 'Sign Ups';

  await billComApi.primaryOrgLogin();
  await airtableBase.select(
      VOLUNTEERS_TABLE,
      'Create Bill.com Vendor',
      async (record) => {

        const vendorId =
            await billComApi.createVendor(
                record.get('Name*'),
                record.get('Address*'),
                null,
                record.get('City*'),
                record.get('State*'),
                record.get('Zip Code*'),
                'USA',
                record.get('Email*'),
                record.get('Phone*'));

        await airtableBase.update(
            VOLUNTEERS_TABLE,
            [{
              id: record.getId(),
              fields: {[`${primaryOrg()} Bill.com Vendor ID`]: vendorId},
            }]);
      })
}
