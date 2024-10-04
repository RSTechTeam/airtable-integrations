/** @fileoverview Syncs Bill.com Vendors from Airtable to Bill.com. */
 
import {Base} from '../../common/airtable.js';
import {getMapping, summarize, syncChanges} from '../../common/sync.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new Base()) {
  const AIRTABLE_VENDORS_TABLE = 'Contacts';
  const AIRTABLE_BILL_COM_ID_FIELD = 'Bill.com Vendor ID';

  const airtableVendors =
      await airtableBase.select(
          AIRTABLE_VENDORS_TABLE, 'Github Action: Upsert Bill.com Vendors');

  // Get changes.
  const {updates, creates} =
      syncChanges(
          // Source
          new Map(
              airtableVendors.map(
                  v => {
                    const name =
                        v.get('Legal first name') + ' ' + v.get('Last name');
                    return [
                      v.getId(),
                      {
                        name: `${name} (STV)`,
                        nameOnCheck: name,
                        address1: v.get('Mailing address (line 1)'),
                        address2: v.get('Mailing address (line 2)'),
                        addressCity: v.get('Mailing address (city)'),
                        addressState: v.get('Mailing address (state short)'),
                        addressZip:
                          v.get('Mailing address (zip code)').toString(),
                        addressCountry: 'USA',
                        email: v.get('Email'),
                        phone: v.get('Trimmed phone number'),
                      },
                    ];
                  })),
          // Mapping
          getMapping(airtableVendors, AIRTABLE_BILL_COM_ID_FIELD, false));

  // Perform sync.
  await billComApi.primaryOrgLogin();
  await airtableBase.update(
      AIRTABLE_VENDORS_TABLE,
      await Promise.all(
          Array.from(
              creates,
              async ([id, create]) => ({
                id,
                fields: {
                  [AIRTABLE_BILL_COM_ID_FIELD]:
                    await billComApi.create('Vendor', create),
                },
              }))));
  await billComApi.bulk(
      'Update',
      'Vendor',
      Array.from(updates, ([id, update]) => ({id, ...update})));

  // Add summary.
  addSummaryTableHeaders(['Updates', 'Creates']);
  addSummaryTableRow(summarize([updates, creates]));
}
