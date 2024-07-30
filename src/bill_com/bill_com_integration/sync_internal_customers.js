/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {ActiveStatus, filter} from '../common/api.js';
import {addSummaryTableHeaders, addSummaryTableRow} from '../../common/github_actions_core.js';
import {getMapping, syncChanges} from '../../common/sync.js';
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
  addSummaryTableHeaders(['MSO', 'Updates', 'Creates', 'Removes']);
  for await (const mso of airtableBase.iterateMsos()) {
    if (!mso.get('Use Customers?')) continue;

    const msoCode = mso.get('Code');
    await billComApi.login(msoCode);
    const parentCustomerId = mso.get('Internal Customer ID');
    const airtableCustomers =
        await airtableBase.select(AIRTABLE_CUSTOMERS_TABLE);

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
            getMapping(airtableCustomers, MSO_BILL_COM_ID, false),
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
            Array.from(
                creates,
                async ([id, create]) => ({
                  id,
                  fields: {
                    [MSO_BILL_COM_ID]:
                      await billComApi.create('Customer', create),
                  },
                }))));
    await billComApi.bulk(
        'Update',
        'Customer',
        [
          ...Array.from(updates, ([id, update]) => ({id, ...update})),
          ...Array.from(removes, id => ({id, isActive: ActiveStatus.INACTIVE})),
        ]);
    addSummaryTableRow([
      msoCode,
      ...[updates, creates, removes].map(
          arrayLike => arrayLike.size > 0 ? arrayLike.size : '-'),
    ]);
  }
}
