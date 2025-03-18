/** @fileoverview Utilities for fetching resources. */

import pRetry from 'p-retry';
import {default as nodeFetch} from 'node-fetch';
import {warn} from '../common/github_actions_core.js';

/**
 * Fetches with retry.
 * @param {function(!Response): !Promise<!Object<string, *>>} getErrorObject
 * @param {...*} fetchArgs
 * @return {!Response}
 * @see Window.fetch
 */
export function fetch(getErrorObject, ...fetchArgs) {
  return pRetry(
      async () => {
        const response = await nodeFetch(...fetchArgs);
        const {hasError, errorParts} = await getErrorObject(response);
        if (!response.ok || hasError) {
          const message =
              `Error ${errorParts.code || response.status}` +
                  ` (from ${errorParts.context || response.url}):` +
                  ` ${errorParts.message || response.statusText}`;
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
 * @return {!Object<string, *>} named error parts Object
 */
export function errorParts(code, context, message) {
  return {code: code, context: context, message: message};
}

/**
 * @param {!Object<string, *>} attachment
 * @return {!Response}
 */
export function fetchAttachment(attachment) {
  return fetch(
      response => ({errorParts: {context: attachment.filename}}),
      attachment.url);
}
