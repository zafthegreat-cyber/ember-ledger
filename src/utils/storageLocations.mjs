// Storage locations (tester reaction A115, 2026-11-01).
//
// Storage location is free text, so "Bin 3", "bin 3" and "BIN  3" used to be
// three different places. These helpers keep the person's own spelling but
// treat the same place as the same place: a new entry that matches an
// existing location (ignoring case and spacing) is saved with the existing
// spelling, and inputs can offer the known locations as suggestions.

export function storageLocationKey(value = "") {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*([#-])\s*/g, "$1");
}

/** Known locations, one per distinct place, in the spelling first seen. */
export function knownStorageLocations(records = []) {
  const seen = new Map();
  for (const record of records) {
    const raw = record?.storageLocation ?? record?.storage_location ?? record?.physicalLocation ?? record?.physical_location;
    const text = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!text) continue;
    const key = storageLocationKey(text);
    if (!seen.has(key)) seen.set(key, text);
  }
  return [...seen.values()].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
}

/** The value to save: an existing location's spelling when it is the same place, else the trimmed input. */
export function canonicalStorageLocation(value = "", records = []) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const key = storageLocationKey(text);
  const match = knownStorageLocations(records).find((location) => storageLocationKey(location) === key);
  return match || text;
}

/** True when two free-text locations name the same place. */
export function sameStorageLocation(left, right) {
  const a = storageLocationKey(left);
  const b = storageLocationKey(right);
  return Boolean(a) && a === b;
}

export const STORAGE_LOCATION_LIST_ID = "code3-storage-location-options";
