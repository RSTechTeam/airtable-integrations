/** @fileoverview Utilities for syncing data from one datasource to another. */

/**
 * @param {!Map<string, !Object<string, *>>} source
 *    The priveleged datasource considered to be the Source of Truth.
 * @param {!Map<string, string>} mapping
 *    A mapping from source ID to destination ID.
 * @param {Set=} destinationIds
 *    A set of destination IDs to supplement those included in the mapping.
 * @return {!Object<string, (!Map|!Set)>}
 *    An Object with 3 fields:
 *      1) updates - A Map keyed by destination IDs
 *        (for objects in both datasources);
 *      2) creates - A Map keyed by source IDs
 *        (for objects only in the source);
 *      3) removes - A Set of destination IDs
 *        (for objects only in the destination).
 */
export function syncChanges(source, mapping, desinationIds = null) {
  const UPDATES = 'updates';
  const CREATES = 'creates';

  const upserts =
      Map.groupBy(source, ([id,]) => mapping.has(id) ? UPDATES : CREATES);
  const updates =
      new Map(
          upserts.get(UPDATES).map(
              ([id, update]) => [mapping.get(id), update]));
  return {
    updates,
    creates: new Map(upserts.get(CREATES)),
    removes: (destinationIds || new Set(mapping.values())).difference(updates),
  };
}
