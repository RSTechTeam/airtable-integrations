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
          Array.from((destinationIds?.values() || mapping.values())).filter(
              x => !updates.has(x))),
  };
}

/**
 * @param {!Map<*, *>} map
 * @param {function(*, *): *} func
 * @return {!Array<*>}
 */
export function mapEntries(map, func) {
  return Array.from(map.entries(), ([key, value]) => func(key, value));
}

/**
 * Maps the given functions on the respective ~iterables
 * and concatenates the results.
 * @param {!Map<*, *>} map
 * @param {function(*, *): *} entriesFunc
 * @param {!Set<*>} set
 * @param {function(*): *} valuesFunc
 * @return {!Array<*>}
 */
export function mapEntriesAndValues(map, entriesFunc, set, valuesFunc) {
  return [
    ...mapEntries(map, entriesFunc),
    ...Array.from(set.values(), valuesFunc),
  ];
}
