/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {ActiveStatus, filter} from '../common/bill_com.js';
import {Base, BILL_COM_ID_SUFFIX, isSameMso} from '../common/airtable.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} accountingBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, accountingBase = new Base()) {

  // Sync for each Org/MSO.
  const msos = await accountingBase.select2('MSOs', 'Internal Customer IDs');
  for (const mso of msos) {

    // Initialize Bill.com Customer collection.
    await billComApi.login(mso.get('Code'));
    const parentCustomerId = mso.get('Internal Customer ID');
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
          if (!isSameMso(record, mso.getId())) return null;

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
