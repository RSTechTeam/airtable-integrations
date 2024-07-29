/** @fileoverview Creates a Bill.com Vendor based on volunteer address info. */
 
import {Base} from '../../common/airtable.js';
import {PRIMARY_ORG} from '../common/constants.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new Base()) {
  await billComApi.primaryOrgLogin();
  await airtableBase.selectAndUpdate(
      'Contacts',
      'GitHub Action: Create Bill.com Vendor',
      async (record) => {
        const name =
            record.get('Legal first name') + ' ' + record.get('Last name');
        const vendorId =
            await billComApi.create(
                'Vendor',
                {
                  name: `${name} (STV)`,
                  nameOnCheck: name,
                  address1: record.get('Mailing address (line 1)'),
                  address2: record.get('Mailing address (line 2)'),
                  addressCity: record.get('Mailing address (city)'),
                  addressState: record.get('Mailing address (state)'),
                  addressZip:
                    record.get('Mailing address (zip code)').toString(),
                  addressCountry: 'USA',
                  email: record.get('Email'),
                  phone: record.get('Trimmed phone number'),
                });

        return {['Bill.com Vendor ID']: vendorId};
      });
}
