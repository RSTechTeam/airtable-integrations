/** @fileoverview Utilities for syncing data from one datasource to another. */

/**
 * Returns the changes that would occur when syncing source data to a
 * destination datasource, using the given key mapping. Note: does not check
 * whether the destination data is already consistent with the source.
 * @param {!Map<*, *>} source
 *    The priveleged datasource considered to be the Source of Truth.
 * @param {!Map<*, *>} mapping
 *    A mapping from source ID to destination ID.
 * @param {Set<*>=} destinationIds
 *    A (super)set of destination IDs to use instead of mapping values when
 *     computing removes.
 * @return {!Object<string, (!Map|!Set)>}
 *    An Object with 3 fields:
 *      1) updates - A Map keyed by destination IDs
 *        (for objects in both datasources);
 *      2) creates - A Map keyed by source IDs
 *        (for objects only in the source);
 *      3) removes - A Set of destination IDs
 *        (for objects only in the destination).
 */
export function syncChanges(source, mapping, destinationIds = null) {
  const UPDATES = 'updates';
  const CREATES = 'creates';

  // Group source upserts by updates and creates.
  const upserts = new Map([[UPDATES, []], [CREATES, []]]);
  source.forEach(
      (upsert, id, map) => {
        upserts.get(mapping.has(id) ? UPDATES : CREATES).push([id, upsert]);
      });
  const updates =
      new Map(
          upserts.get(UPDATES).map(
              ([id, update]) => [mapping.get(id), update]));
  return {
    updates,
    creates: new Map(upserts.get(CREATES)),
    removes:
      new Set(
          Array.from(destinationIds || mapping.values()).filter(
              x => !updates.has(x))),
  };
}

/**
 * @param {!Array<*>} array
 * @param {function(*): boolean} filterFn
 * @param {function(*): *} mapFn
 * @return {!Array<*>}
 */
export function filterMap(array, filterFn, mapFn) {
  return array.flatMap(x => filterFn(x) ? [mapFn(x)] : []);
}

/**
 * Returns the datasource ID mapping between Airtable
 * and an integration datasource. If Airtable is the Source of Truth
 * (i.e., integrationSource is false), then filters out records
 * where the integration datasource ID is not set.
 * @param {!Array<!Object<string, *>>} airtableRecords
 * @param {string} integrationIdField
 * @param {boolean=} integrationSource
 * @return {!Map<*, *>}
 */
export function getMapping(
    airtableRecords, integrationIdField, integrationSource = true) {
  return new Map(
      filterMap(
          airtableRecords,
          integrationSource ? r => true : r => r.get(integrationIdField),
          integrationSource ?
              r => [r.get(integrationIdField), r.getId()] :
              r => [r.getId(), r.get(integrationIdField)]));
}

/**
 * @param {!Array<!Object<string, *>>} airtableRecords
 * @return {!Array<*>}
 */
export function getAirtableRecordIds(airtableRecords) {
  return new Set(airtableRecords.map(r => r.getId()));
}

/**
 * @param {string} id
 * @param {!Object<string, *>} update
 * @return {!Object<string, *>} Airtable formatted Record update
 */
export function airtableRecordUpdate([id, update]) {
  return {id, fields: update};
}

/**
 * @param {string} id
 * @return {!Object<string, *>} Airtable formatted Record deactivation
 */
export function airtableRecordDeactivate(id) {
  return airtableRecordUpdate([id, {Active: false}]);
}
