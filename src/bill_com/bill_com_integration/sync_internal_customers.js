/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {ActiveStatus, filter} from '../common/api.js';
import {mapEntries, mapEntriesAndValues, syncChanges} from '../../common/sync.js';
import {MSO_BILL_COM_ID} from '../common/constants.js';
import {MsoBase} from '../../common/airtable.js';

/**
 * @param {!Api} billComApi
 * @param {!MsoBase=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new MsoBase()) {
  const AIRTABLE_CUSTOMERS_TABLE = 'Internal Customers';

  // Sync for each Org/MSO.
  for await (const mso of airtableBase.iterateMsos()) {
    if (!mso.get('Use Customers?')) continue;

    await billComApi.login(mso.get('Code'));
    const parentCustomerId = mso.get('Internal Customer ID');
    const airtableCustomers =
        await airtableBase.select(AIRTABLE_CUSTOMERS_TABLE);

    const mapping =
        airtableCustomers.map(c => [c.getId(), c.get(MSO_BILL_COM_ID)]).filter(
            ([, billComId]) => billComId);
    const {updates, creates, removes} =
        syncChanges(
            // Source
            new Map(
                airtableCustomers.map(
                    c => [
                      c.getId(),
                      {
                        name: c.get('Local Name'),
                        isActive: ActiveStatus.ACTIVE,
                        parentCustomerId: parentCustomerId,
                      },
                    ])),
            // Mapping
            new Map(mapping),
            // Destination IDs
            new Set(
                Array.from(
                    await billComApi.list(
                        'Customer',
                        [filter('parentCustomerId', '=', parentCustomerId)]),
                    c => c.id)));

    await airtableBase.update(
        AIRTABLE_CUSTOMERS_TABLE,
        await Promise.all(
            mapEntries(
                creates,
                async (id, create) => ({
                  id,
                  fields: {
                    [MSO_BILL_COM_ID]:
                      await billComApi.create('Customer', create),
                  },
                }))));
    await billComApi.bulk(
        'Update',
        'Customer',
        mapEntriesAndValues(
            updates, (id, update) => ({id, ...update}),
            removes, id => ({id, isActive: ActiveStatus.INACTIVE})));
  }
}
