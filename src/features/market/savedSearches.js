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

export const SAVED_SEARCHES_CHANGED_EVENT = "code3:saved-searches-changed";
export const SAVED_SEARCHES_SYNCED_EVENT = "code3:saved-searches-synced";

export function writeSavedSearches(rows, storage = globalThis.localStorage, { silent = false } = {}) {
  const next = rows.slice(0, SAVED_SEARCHES_MAX);
  try { storage?.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  if (!silent && typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
    try { globalThis.dispatchEvent(new globalThis.CustomEvent(SAVED_SEARCHES_CHANGED_EVENT, { detail: { rows: next } })); } catch { /* no DOM */ }
  }
  return next;
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

/**
 * Merge the device list with the account list (SHOULD 17: saved searches are the
 * alert subscription list, so they live on the account too). Same query on both
 * sides keeps the newer lastRunAt; order is newest-run first; capped.
 */
export function mergeSavedSearches(local = [], remote = []) {
  const byKey = new Map();
  [...remote, ...local].forEach((row) => {
    const clean = norm(row?.query);
    if (!clean) return;
    const k = key(clean);
    const prev = byKey.get(k);
    const entry = { query: prev?.query || clean, label: norm(row.label || "") || prev?.label || "", savedAt: [prev?.savedAt, row.savedAt].filter(Boolean).sort()[0] || "", lastRunAt: [prev?.lastRunAt, row.lastRunAt].filter(Boolean).sort().pop() || "" };
    byKey.set(k, entry);
  });
  return [...byKey.values()].sort((a, b) => String(b.lastRunAt || b.savedAt).localeCompare(String(a.lastRunAt || a.savedAt))).slice(0, SAVED_SEARCHES_MAX);
}

/** Supabase row <-> local row. */
export function savedSearchFromRow(row = {}) {
  return { query: norm(row.query), label: norm(row.label || ""), savedAt: String(row.created_at || ""), lastRunAt: String(row.last_run_at || row.created_at || "") };
}
export function savedSearchToRow(row = {}, userId) {
  return { user_id: userId, query: norm(row.query), query_key: key(row.query), label: norm(row.label || "") || null, last_run_at: row.lastRunAt || row.savedAt || new Date().toISOString() };
}

/**
 * Keep the device list and the account list in step. `client` is a Supabase
 * client; returns the resulting rows (or local on failure).
 */
export async function syncSavedSearches(client, userId, local = readSavedSearches(), { mode = "merge" } = {}) {
  if (!client || !userId) return local;
  try {
    const { data, error } = await client.from("saved_searches").select("query,label,created_at,last_run_at").eq("user_id", userId);
    if (error) throw error;
    // "merge" on sign-in (a new phone picks up the account list); "push" after a
    // local edit, so removing a chip removes the alert subscription too.
    const merged = mode === "push" ? local.slice(0, SAVED_SEARCHES_MAX) : mergeSavedSearches(local, (data || []).map(savedSearchFromRow));
    const keep = new Set(merged.map((row) => key(row.query)));
    const stale = (data || []).map((row) => key(row.query)).filter((k) => !keep.has(k));
    if (merged.length) {
      const { error: upsertError } = await client.from("saved_searches").upsert(merged.map((row) => savedSearchToRow(row, userId)), { onConflict: "user_id,query_key" });
      if (upsertError) throw upsertError;
    }
    if (stale.length) await client.from("saved_searches").delete().eq("user_id", userId).in("query_key", stale);
    writeSavedSearches(merged, globalThis.localStorage, { silent: true });
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      try { globalThis.dispatchEvent(new globalThis.CustomEvent(SAVED_SEARCHES_SYNCED_EVENT, { detail: { rows: merged } })); } catch { /* no DOM */ }
    }
    return merged;
  } catch {
    return local;
  }
}
