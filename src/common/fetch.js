/** @fileoverview Utilities for fetching resources. */

import pRetry from 'p-retry';
import {default as nodeFetch} from 'node-fetch';
import {warn} from '../common/github_actions_core.js';

/**
 * Fetches with retry.
 * @param {!Object<string, function(!Response): !Promise<*>>} errorFuncs
 * @param {...*} fetchArgs
 * @return {!Response}
 * @see Window.fetch
 */
export function fetch(
    {hasError = response => false, getErrorObject}, ...fetchArgs) {

  return pRetry(
      async () => {
        const response = await nodeFetch(...fetchArgs);
        if (!response.ok || (await hasError(response))) {
          const errorObject = await getErrorObject(response);
          const message =
              `Error ${errorObject.code || response.status}` +
                  ` (from ${errorObject.context || response.url}):` +
                  ` ${errorObject.message || response.statusText}`;
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

/**
 * @param {!Object<string, *>} attachment
 * @return {!Response}
 */
export function fetchAttachment(attachment) {
  return fetch(
      {getErrorObject: response => ({context: attachment.filename})},
      attachment.url);
}
