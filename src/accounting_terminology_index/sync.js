/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {ActiveStatus, filter} from '../common/bill_com.js';
import {Base, isSameMso, MSO_BILL_COM_ID} from '../common/airtable.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} accountingBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, accountingBase = new Base()) {

  // Sync for each Org/MSO.
  const msos = await accountingBase.select('MSOs', 'Internal Customer IDs');
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
        async (laborCharge) => {

          // Skip records not associated with current MSO.
          if (!isSameMso(laborCharge, mso.getId())) return null;

          const id = laborCharge.get(MSO_BILL_COM_ID);
          const change = {
            id: id,
            name: laborCharge.get('Local Name'),
            isActive: ActiveStatus.ACTIVE,
            parentCustomerId: parentCustomerId,
          };

          // Insert/Create in Bill.com any record with no Bill.com ID.
          if (id == undefined) {
            const billComId = await billComApi.create('Customer', change);
            return {[MSO_BILL_COM_ID]: billComId};
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
