/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {Base, PRIMARY_ORG_BILL_COM_ID} from '../common/airtable.js';
import {ActiveStatus, entityData, filter} from '../common/bill_com.js';
import {internalCustomerId} from '../common/inputs.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} accountingBase
 * @param {string=} internalCustomerId
 * @param {string=} customerTable
 * @param {string=} syncView
 * @param {string=} nameField
 * @return {!Promise<undefined>}
 */
export async function main(
    billComApi,
    accountingBase = new Base(),
    parentCustomerId = internalCustomerId(),
    customerTable = 'Labor Charge Field (LCF) Mapping',
    syncView = 'Bill.com Sync',
    nameField = 'Abacus / Bill.com / QBO Code') {

  // Initialize Bill.com Customer collection.
  await billComApi.primaryOrgLogin();
  const billComCustomers =
      await billComApi.list(
          'Customer', [filter('parentCustomerId', '=', parentCustomerId)]);
  const billComCustomerIds = new Set();
  billComCustomers.forEach(c => billComCustomerIds.add(c.id));

  // Upsert every Bill.com Customer from the Bill.com Sync View.
  const updates = [];
  await accountingBase.selectAndUpdate(
      customerTable,
      syncView,
      async (record) => {
        const id = record.get(PRIMARY_ORG_BILL_COM_ID);
        const change = {
          id: id,
          name: record.get(nameField),
          isActive: ActiveStatus.ACTIVE,
          parentCustomerId: parentCustomerId,
        };

        // Insert/Create in Bill.com any record with no primary org Bill.com ID.
        if (id == undefined) {
          const billComId = await billComApi.create('Customer', change);
          return {[PRIMARY_ORG_BILL_COM_ID]: billComId};
        }

        // Update in Bill.com other records with a primary org Bill.com ID.
        updates.push(change);
        billComCustomerIds.delete(id);
        return null;
      });

  // Mark internal Bill.com Customers not in the Bill.com Sync View as inactive.
  for (const id of billComCustomerIds) {
    updates.push({id: id, isActive: ActiveStatus.INACTIVE});
  }
  await billComApi.bulk('Update', 'Customer', updates);
}
