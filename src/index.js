/** @fileoverview Entrypoint for choosing which file to run. */

import * as accountingSync from './accounting_sync.js';
import * as billComIntegrationSync from './bill_com_integration_sync.js';
import * as utils from './utils.js';

const filename = utils.getInput('filename');
let imp;
switch (filename) {
  case 'accounting_sync':
    imp = accountingSync;
    break;
  case 'bill_com_integration_sync':
    imp = billComIntegrationSync;
    break;
  default:
    utils.error(`Unknown filename ${filename}`);
}

try {
  await imp.main();
} catch (err) {
  utils.error(err);
}
