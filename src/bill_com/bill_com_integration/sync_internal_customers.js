/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {ActiveStatus, filter} from '../common/api.js';
import {MSO_BILL_COM_ID} from '../common/constants.js';
import {MsoBase} from '../../common/airtable.js';
import {syncChanges} from '../../common/sync.js';

/**
 * @see Array.fromAsync
 * @param {!Iterator<*>} arrayLike
 * @param {function(*): !Promise<*>} mapFn
 * @return {!Promise<Array<*>>}
 */
function arrayFromAsync(arrayLike, mapFn) {
  return Promise.all(Array.from(arrayLike, mapFn));
}

/**
 * @param {!Api} billComApi
 * @param {!MsoBase=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new MsoBase()) {
  const AIRTABLE_CUSTOMERS_TABLE = 'Internal Customers';

  // Sync for each Org/MSO.
  for await (const mso of airtableBase.iterateMsos()) {

    await billComApi.login(mso.get('Code'));
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
            new Map(
                airtableCustomers.map(
                    c => [c.getId(), c.get(MSO_BILL_COM_ID)])),
            // Destination IDs
            new Set(
                await arrayFromAsync(
                    billComApi.list(
                        'Customer',
                        [filter('parentCustomerId', '=', parentCustomerId)]),
                    c => c.id)));

    await airtableBase.update(
        AIRTABLE_CUSTOMERS_TABLE,
        await arrayFromAsync(
            creates.entries(),
            async ([id, create]) => ({
              id,
              fields: {
                [MSO_BILL_COM_ID]: await billComApi.create('Customer', create),
              },
            })));
    const billComUpdates =
        Array.from(updates.entries(), ([id, update]) => ({id, ...update}));
    await billComApi.bulk(
        'Update',
        'Customer',
        billComUpdates.concat(
            Array.from(
                removes.values(),
                id => ({id, isActive: ActiveStatus.INACTIVE}))));
  }
}
