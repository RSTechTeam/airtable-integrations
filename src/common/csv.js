/** @fileoverview Utilities for parsing CSV files. */

import Papa from 'papaparse';
import {fetchAttachment} from './fetch.js';

/**
 * @param {!Readable} csv
 * @param {string[]} header Expected header.
 * @param {!Object<string, *>} config See https://www.papaparse.com/docs#config.
 *     Header and error are preset, and expects using chunk,
 *     which may return a Promise.
 * @return {!Promise<!Array<*>>}
 */
export function parse(csv, header, config) {

  let firstChunk = true;
  const promises = [];
  return new Promise(
      (resolve, reject) => Papa.parse(
          csv,
          {
            ...config,
            header: true,
            error: (err, file) => reject(err),
            complete: (results, parser) => resolve(Promise.all(promises)),
            chunk:
              (results, parser) => {

                // Validate header during first chunk.
                if (firstChunk) {
                  firstChunk = false;
                  const parsedHeader = results.meta.fields;
                  if (JSON.stringify(parsedHeader) !== JSON.stringify(header)) {
                    reject(
                        new Error(
                            `Parsed header: ${parsedHeader}` +
                                `\nGiven header: ${header}`));
                    return;
                  }
                }

                // Parse chunk.
                promises.push(config.chunk(results, parser));
              },
          }));
}

/**
 * @param {!Object<string, *>} csv An Airtable Attachment Field.
 * @param {string[]} header Expected header.
 * @param {!Object<string, *>} config
 * @return {!Promise<!Array<*>>}
 */
export async function parseAttachment(csv, header, config) {
  const response = await fetchAttachment(csv);
  return parse(response.body, header, config);
}
