/** @fileoverview Entrypoint for choosing which file to run. */

import * as billComIntegrationBulkCreateBills from './bill_com_integration/bulk_create_bills.js';
import * as billComIntegrationCreateApprover from './bill_com_integration/create_approver.js';
import * as billComIntegrationCreateBill from './bill_com_integration/create_bill.js';
import * as billComIntegrationSync from './bill_com_integration/sync.js';
import * as billComIntegrationSyncBills from './bill_com_integration/sync_bills.js';
import * as billComIntegrationSyncInternalCustomers from './bill_com_integration/sync_internal_customers.js';
import * as doorKnockingCreateVendor from './door_knocking/create_vendor.js';
import {fileId} from './common/inputs.js';
import {getApi} from './common/api.js';
import {run} from '../common/action.js';

await run(async () => {
  let imp;
  switch (fileId()) {
    case 'bill_com_integration_bulk_create_bills':
      imp = billComIntegrationBulkCreateBills;
      break;
    case 'bill_com_integration_create_approver':
      imp = billComIntegrationCreateApprover;
      break;
    case 'bill_com_integration_create_bill':
      imp = billComIntegrationCreateBill;
      break;
    case 'bill_com_integration_sync':
      imp = billComIntegrationSync;
      break;
    case 'bill_com_integration_sync_bills':
      imp = billComIntegrationSyncBills;
      break;
    case 'bill_com_integration_sync_internal_customers':
      imp = billComIntegrationSyncInternalCustomers;
      break;
    case 'door_knocking_create_vendor':
      imp = doorKnockingCreateVendor;
      break;
    default:
      throw new Error(`Unknown file ID ${fileId()}`);
  }
  await imp.main(await getApi());
});
