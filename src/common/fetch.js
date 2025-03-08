/** @fileoverview Utilities for fetching resources. */

import pRetry from 'p-retry';
import {default as nodeFetch} from 'node-fetch';
import {warn} from '../common/github_actions_core.js';

/**
 * @param {!Object<string, *>} errorObject
 * @param {Response=} response
 * @return {string}
 */
export function errorMessage(errorObject, response = undefined) {
  return `Error ${errorObject.code || response?.status}` +
      ` (from ${errorObject.context || response?.url}):` +
      ` ${errorObject.message || response?.statusText}`;
}

/**
 * Fetches with retry.
 * @param {function(!Response): !Promise<!Object<string, *>>)} getErrorObject
 * @param {...*} fetchArgs
 * @return {!Response}
 * @see Window.fetch
 */
export function fetch(getErrorObject, ...fetchArgs) {
  return pRetry(
      async () => {
        const response = await nodeFetch(...fetchArgs);
        if (!response.ok) {
          const message =
              errorMessage(await getErrorObject(response), response);
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
  return fetch(response => ({context: attachment.filename}), attachment.url);
}
