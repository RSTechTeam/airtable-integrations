/** @fileoverview Creates a Bill.com Vendor based on volunteer address info. */
 
import {Base} from '../common/airtable.js';
import {primaryOrg} from '../common/inputs.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new Base()) {
  await billComApi.primaryOrgLogin();
  await airtableBase.selectAndUpdate(
      'Sign Ups',
      'Create Bill.com Vendor',
      async (record) => {
        const vendorId =
            await billComApi.createVendor(
                `${record.get('Name*')} (STV)`,
                record.get('Address*'),
                '',
                record.get('City*'),
                record.get('State*'),
                record.get('Zip Code*'),
                'USA',
                record.get('Email*'),
                record.get('Phone*'));

        return {[`${primaryOrg()} Bill.com Vendor ID`]: vendorId};
      });
}
