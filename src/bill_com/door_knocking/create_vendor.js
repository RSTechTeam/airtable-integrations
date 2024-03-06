/** @fileoverview Creates a Bill.com Vendor based on volunteer address info. */
 
import {Base} from '../../common/airtable.js';
import {PRIMARY_ORG} from '../../common/utils.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new Base()) {
  await billComApi.primaryOrgLogin();
  await airtableBase.selectAndUpdate(
      'Jotform',
      'Create Bill.com Vendor',
      async (record) => {
        const vendorId =
            await billComApi.create(
                'Vendor',
                {
                  name: `${record.get('Name')} (STV)`,
                  nameOnCheck: record.get('Name'),
                  address1: record.get('Street Address'),
                  address2: record.get('Street Address Line 2'),
                  addressCity: record.get('City'),
                  addressState: record.get('State'),
                  addressZip: record.get('Zip Code'),
                  addressCountry: 'USA',
                  email: record.get('E-mail Address'),
                  phone: record.get('Mobile Phone'),
                });

        return {[`${PRIMARY_ORG} Bill.com Vendor ID`]: vendorId};
      });
}
