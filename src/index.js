/** @fileoverview Entrypoint for choosing which file to run. */

import * as accounting_sync from './accounting_sync.js';
import * as utils from './utils.js';

const filename = utils.getInput('filename');
let imp;
switch (filename) {
  case 'accounting_sync':
    imp = accounting_sync;
    break;
  default:
    throw new Error(`Unknown filename ${filename}`);
}
await imp.main();
