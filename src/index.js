/** @fileoverview Entrypoint for choosing which file to run. */

import * as accountingSync from './accounting_sync.js';
import * as billComIntegrationCreateApprover from './bill_com_integration_create_approver.js';
import * as billComIntegrationCreateBill from './bill_com_integration_create_bill.js';
import * as billComIntegrationSync from './bill_com_integration_sync.js';
import {error} from './github_actions_core.js';
import {filename} from './inputs.js';
import {getApi} from './bill_com.js';

let imp;
switch (filename()) {
  case 'accounting_sync':
    imp = accountingSync;
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
  default:
    error(`Unknown filename ${filename()}`);
}

const billComApi = await getApi();
await imp.main(billComApi).catch(error);
