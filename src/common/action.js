/**
 * @fileoverview Runs and handles GitHub Action scripts,
 * including status setting and summary writing.
 */

import {error, writeSummary} from './github_actions_core.js';

/**
 * @param {function(): !Promise<undefined>} main
 * @return {!Promise<undefined>}
 */
export function run(main) {
  return main().catch(error).finally(writeSummary);
}
