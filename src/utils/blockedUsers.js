import { useSyncExternalStore } from "react";

// People a member has blocked. Their community posts, replies and restock
// reports are hidden from that member on this device. Required by App Store
// guideline 1.2 for apps with user-generated content.
export const BLOCKED_USERS_KEY = "code3.blocked-users.v1";
const listeners = new Set();
let cache = null;

function readStored() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(BLOCKED_USERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.userId === "string" && entry.userId) : [];
  } catch {
    return [];
  }
}

function write(next) {
  cache = next;
  try { globalThis.localStorage?.setItem(BLOCKED_USERS_KEY, JSON.stringify(next)); } catch { /* still applies for this visit */ }
  for (const listener of listeners) listener();
}

export function getBlockedUsers() {
  if (!cache) cache = readStored();
  return cache;
}

export function authorIdOf(record = {}) {
  const id = record.userId ?? record.user_id ?? record.authorId ?? record.author_id ?? "";
  return typeof id === "string" || typeof id === "number" ? String(id) : "";
}

// Local placeholder owners are never a real person to block.
export function canBlockAuthor(record, currentUserId = "") {
  const id = authorIdOf(record);
  return Boolean(id) && id !== "local-beta" && id !== String(currentUserId || "");
}

export function blockUser(record, label = "") {
  const userId = authorIdOf(record);
  if (!userId || getBlockedUsers().some((entry) => entry.userId === userId)) return false;
  write([...getBlockedUsers(), { userId, label: String(label || "Community member").slice(0, 80), blockedAt: new Date().toISOString() }]);
  return true;
}

export function unblockUser(userId) {
  write(getBlockedUsers().filter((entry) => entry.userId !== userId));
}

export function isBlockedAuthor(record, blocked = getBlockedUsers()) {
  const id = authorIdOf(record);
  return Boolean(id) && blocked.some((entry) => entry.userId === id);
}

export function withoutBlockedAuthors(records = [], blocked = getBlockedUsers()) {
  if (!blocked.length || !Array.isArray(records)) return records;
  return records.filter((record) => !isBlockedAuthor(record, blocked));
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (event) => { if (event.key === BLOCKED_USERS_KEY) { cache = readStored(); listener(); } };
  globalThis.addEventListener?.("storage", onStorage);
  return () => { listeners.delete(listener); globalThis.removeEventListener?.("storage", onStorage); };
}

export function useBlockedUsers() {
  return useSyncExternalStore(subscribe, getBlockedUsers, getBlockedUsers);
}
