/** @fileoverview Syncs Bill.com Customers from Airtable to Bill.com. */

import * as airtable from './airtable.js';
import * as billCom from './bill_com.js';
import * as utils from './utils.js';

/** The Airtable Table name Labor Charge Fields. */
const LCF_TABLE = 'Labor Charge Field (LCF) Mapping';

/** @param accountingBaseId {string} */
export async function main(accountingBaseId) {
  await billCom.init();

  // Initialize Bill.com Customer collection.
  await billCom.primaryOrgLogin();
  const internalCustomerId = utils.getInput('internal-customer-id');
  const billComCustomers =
      await billCom.list(
          'Customer',
          [billCom.filter('parentCustomerId', '=', internalCustomerId)]);
  const billComCustomerIds = new Set();
  billComCustomers.forEach(c => billComCustomerIds.add(c.id));

  // Upsert every Bill.com Customer from the Bill.com Sync View.
  const accountingBase = new airtable.Base(accountingBaseId);
  const updates = [];
  await accountingBase.select(
      LCF_TABLE,
      'Bill.com Sync',
      async (record) => {
        const id = record.get(airtable.primaryOrgBillComId);
        const change = {
          obj: {
            entity: 'Customer',
            isActive: '1',
            parentCustomerId: internalCustomerId,
            name:
              encodeURIComponent(record.get('Abacus / Bill.com / QBO Code')),
          }
        }

        // Insert/Create in Bill.com any record with no primary org Bill.com ID.
        if (id.length === 0) {
          const response =
              await billCom.commonDataCall('Crud/Create/Customer', change);
          await accountingBase.update(
              LCF_TABLE,
              [{
                id: record.getId(),
                fields: {[airtable.primaryOrgBillComId]: response.id},
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
  await billCom.bulkCall('Update/Customer', updates);
}
