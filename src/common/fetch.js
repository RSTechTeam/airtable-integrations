/** @fileoverview Utilities for fetching resources. */

import pRetry from 'p-retry';
import {default as nodeFetch} from 'node-fetch';
import {warn} from '../common/github_actions_core.js';

/**
 * Fetches with retry.
 * @param {function(!Response): !Promise<!Object<string, *>>)} errFunc
 * @param {...*} fetchArgs
 * @return {!Response}
 * @see Window.fetch
 */
export function fetch(errFunc, ...fetchArgs) {
  return pRetry(
      async () => {
        const response = await nodeFetch(...fetchArgs);
        if (!response.ok) {
          const err = await errFunc(response);
          const message =
              `Error ${err.code || response.status}` +
                  ` (from ${err.context || response.url}):` +
                  ` ${err.message || response.statusText}`;
          warn(message);
          throw new Error(message);
        }
        return response;
      },
      {retries: 1});
}

/**
 * @param {(string|number)} code
 * @param {string} context
 * @param {string} message
 * @return {!Object<string, *>} named error Object
 */
export function errorObject(code, context, message) {
  return {code: code, context: context, message: message};
}
