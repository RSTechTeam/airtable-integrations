/** @fileoverview Entrypoint for choosing which file to run. */

import * as billComIntegrationCreateApprover from './bill_com_integration/create_approver.js';
import * as billComIntegrationCreateBill from './bill_com_integration/create_bill.js';
import * as billComIntegrationSync from './bill_com_integration/sync.js';
import * as billComIntegrationSyncBills from './bill_com_integration/sync_bills.js';
import * as billComIntegrationSyncInternalCustomers from './bill_com_integration/sync_internal_customers.js';
import * as doorKnockingCreateVendor from './door_knocking/create_vendor.js';
import {error} from './common/github_actions_core.js';
import {fileId} from './common/inputs.js';
import {getApi} from './common/bill_com.js';

let imp;
switch (fileId()) {
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
    error(`Unknown file ID ${fileId()}`);
}

const billComApi = await getApi();
await imp.main(billComApi).catch(error);
