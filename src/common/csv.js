/** @fileoverview Utilities for parsing CSV files. */

import fetch from 'node-fetch';
import Papa from 'papaparse';
import {error} from './github_actions_core.js';
import {fetchError} from './utils.js';

/**
 * @param {!Object<string, *>} csv An Airtable Attachment Field.
 * @param {string[]} header Expected header.
 * @param {!Object<string, *>} config See https://www.papaparse.com/docs#config.
 *     Header and error are preset, and expects using chunk,
 *     which may return a Promise.
 * @return {!Promise<*>}
 */
export async function parse(csv, header, config) {

  // Download CSV.
  const response = await fetch(csv.url);
  if (!response.ok) {
    fetchError(response.status, csv.filename, response.statusText);
  }

  // Setup parse.
  let firstChunk = true;
  const promises = [];
  const chunk = config.chunk;
  delete config.chunk;

  // Execute parse.
  return new Promise(
      resolve => Papa.parse(
          response.body,
          {
            ...config,
            header: true,
            error: (err, file) => error(err),
            complete: (results, parser) => resolve(Promise.all(promises)),
            chunk:
              (results, parser) => {

                // Validate header during first chunk.
                if (firstChunk) {
                  firstChunk = false;
                  const gotHeader = results.meta.fields;
                  if (JSON.stringify(gotHeader) !== JSON.stringify(header)) {
                    error(`Got header: ${gotHeader}\nWant header: ${header}`);
                  }
                }

                // Parse chunk.
                promises.push(chunk(results, parser));
              },
          }));
}
