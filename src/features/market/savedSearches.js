// Saved Market searches (COULD 35; free on every plan per Rule A). Device-local,
// newest first, capped, de-duplicated case-insensitively. Pure helpers plus a
// tiny storage wrapper so the component stays trivial.
export const SAVED_SEARCHES_KEY = "code3-market-saved-searches-v1";
export const SAVED_SEARCHES_MAX = 20;

const norm = (value) => String(value || "").trim().replace(/\s+/g, " ");
const key = (value) => norm(value).toLowerCase();

export function readSavedSearches(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SAVED_SEARCHES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((row) => row && norm(row.query)).map((row) => ({ query: norm(row.query), label: norm(row.label || ""), savedAt: String(row.savedAt || ""), lastRunAt: String(row.lastRunAt || "") })) : [];
  } catch { return []; }
}

export function writeSavedSearches(rows, storage = globalThis.localStorage) {
  try { storage?.setItem(SAVED_SEARCHES_KEY, JSON.stringify(rows.slice(0, SAVED_SEARCHES_MAX))); } catch { /* storage unavailable */ }
  return rows.slice(0, SAVED_SEARCHES_MAX);
}

export function addSavedSearch(rows, query, { label = "", now = new Date() } = {}) {
  const clean = norm(query);
  if (!clean) return rows;
  const existing = rows.find((row) => key(row.query) === key(clean));
  const entry = { query: existing?.query || clean, label: norm(label) || existing?.label || "", savedAt: existing?.savedAt || now.toISOString(), lastRunAt: now.toISOString() };
  return [entry, ...rows.filter((row) => key(row.query) !== key(clean))].slice(0, SAVED_SEARCHES_MAX);
}

export function removeSavedSearch(rows, query) {
  return rows.filter((row) => key(row.query) !== key(query));
}

export function touchSavedSearch(rows, query, now = new Date()) {
  if (!rows.some((row) => key(row.query) === key(query))) return rows;
  return [{ ...rows.find((row) => key(row.query) === key(query)), lastRunAt: now.toISOString() }, ...rows.filter((row) => key(row.query) !== key(query))];
}

export function isSavedSearch(rows, query) {
  return rows.some((row) => key(row.query) === key(query));
}
