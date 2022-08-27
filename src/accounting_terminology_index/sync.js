/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import {filter} from '../common/bill_com.js';
import {internalCustomerId} from '../common/inputs.js';
import {Base, PRIMARY_ORG_BILL_COM_ID} from '../common/airtable.js';

/**
 * @param {!Api} billComApi
 * @param {!Base=} accountingBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, accountingBase = new Base()) {
  const LCF_TABLE = 'Labor Charge Field (LCF) Mapping';

  // Initialize Bill.com Customer collection.
  await billComApi.primaryOrgLogin();
  const billComCustomers =
      await billComApi.list(
          'Customer',
          [filter('parentCustomerId', '=', internalCustomerId())]);
  const billComCustomerIds = new Set();
  billComCustomers.forEach(c => billComCustomerIds.add(c.id));

  // Upsert every Bill.com Customer from the Bill.com Sync View.
  const updates = [];
  await accountingBase.select(
      LCF_TABLE,
      'Bill.com Sync',
      async (record) => {
        const id = record.get(PRIMARY_ORG_BILL_COM_ID);
        const change = {
          obj: {
            entity: 'Customer',
            isActive: '1',
            parentCustomerId: internalCustomerId(),
            name:
              encodeURIComponent(record.get('Abacus / Bill.com / QBO Code')),
          }
        }

        // Insert/Create in Bill.com any record with no primary org Bill.com ID.
        if (id == undefined) {
          const response =
              await billComApi.dataCall('Crud/Create/Customer', change);
          await accountingBase.update(
              LCF_TABLE,
              [{
                id: record.getId(),
                fields: {[PRIMARY_ORG_BILL_COM_ID]: response.id},
              }]);
          return;
        }

        // Update in Bill.com other records with a primary org Bill.com ID.
        change.obj.id = id;
        updates.push(change);
        billComCustomerIds.delete(id);
      });

  // Mark internal Bill.com Customers not in the Bill.com Sync View as inactive.
  for (const id of billComCustomerIds) {
    updates.push({obj: {entity: 'Customer', id: id, isActive: '2'}});
  }
  await billComApi.bulkCall('Update/Customer', updates);
}
