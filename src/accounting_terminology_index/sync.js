/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {Base, BILL_COM_ID_SUFFIX} from '../common/airtable.js';
import {ActiveStatus, filter} from '../common/bill_com.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} accountingBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, accountingBase = new Base()) {

  // Initialize Bill.com Orgs and parent customer IDs.
  const msoIds = new Map();
  await accountingBase.select(
      'MSOs',
      'Internal Customer IDs',
      (r) => {
        msoIds.set(
            r.get('Code'),
            {
              recordId: r.getId(),
              parentCustomerId: r.get('Internal Customer ID'),
            });
      });

  // Sync for each Org/MSO.
  for (const [mso, {recordId, parentCustomerId}] of msoIds) {

    // Initialize Bill.com Customer collection.
    await billComApi.login(mso);
    const billComCustomers =
        await billComApi.list(
            'Customer', [filter('parentCustomerId', '=', parentCustomerId)]);
    const billComCustomerIds = new Set();
    billComCustomers.forEach(c => billComCustomerIds.add(c.id));

    // Upsert every Bill.com Customer from the Bill.com Sync View.
    const updates = [];
    await accountingBase.selectAndUpdate(
        'Labor Charges',
        'Bill.com Sync',
        async (record) => {

          // Skip records not associated with current MSO.
          if (record.get('MSO')[0] !== recordId) return null;

          const id = record.get(BILL_COM_ID_SUFFIX);
          const change = {
            id: id,
            name: record.get('Local Name'),
            isActive: ActiveStatus.ACTIVE,
            parentCustomerId: parentCustomerId,
          };

          // Insert/Create in Bill.com any record with no Bill.com ID.
          if (id == undefined) {
            const billComId = await billComApi.create('Customer', change);
            return {[BILL_COM_ID_SUFFIX]: billComId};
          }

          // Update in Bill.com other records with a Bill.com ID.
          updates.push(change);
          billComCustomerIds.delete(id);
          return null;
        });

    // Deactivate internal Bill.com Customers not in the Bill.com Sync View.
    for (const id of billComCustomerIds) {
      updates.push({id: id, isActive: ActiveStatus.INACTIVE});
    }
    await billComApi.bulk('Update', 'Customer', updates);
  }
}
