const DAY_MS = 24 * 60 * 60 * 1000;

/** Scope report activity before ranking; a shared feed is not personal usage. */
export function selectOwnAdaptiveReports(reports = [], { userIds = [], email = "", allowUnownedLocal = false } = {}) {
  const identities = new Set((Array.isArray(userIds) ? userIds : []).map((value) => String(value || "").trim()).filter(Boolean));
  const accountEmail = String(email || "").trim().toLowerCase();
  return (Array.isArray(reports) ? reports : []).filter((report) => {
    if (!report || typeof report !== "object" || Array.isArray(report)) return false;
    const ids = [report.userId, report.user_id, report.ownerId, report.owner_id]
      .map((value) => String(value || "").trim()).filter(Boolean);
    // A known different author must never become ours through an email fallback.
    if (ids.length) return ids.every((id) => identities.has(id));
    const emails = [report.email, report.guestEmail, report.guest_email]
      .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
    if (emails.length) return Boolean(accountEmail) && emails.every((value) => value === accountEmail);
    return allowUnownedLocal === true;
  });
}

function recordTime(record) {
  // Creation and submission dates represent saved work. Prefer them to an
  // updatedAt value that may only reflect a background price refresh.
  const value = record.createdAt || record.created_at || record.submittedAt || record.submitted_at ||
    record.dateCreated || record.saleDate || record.purchaseDate || record.dateSeen ||
    record.dateDiscovered || record.observedAt || record.observed_at || record.updatedAt || record.updated_at;
  return value ? new Date(value).getTime() : NaN;
}

function activityScore(records, now) {
  if (!Array.isArray(records) || !Number.isFinite(now)) return 0;
  const seenIds = new Set();
  const seenRecords = new Set();
  let count = 0;
  let lastWeek = 0;
  let lastMonth = 0;
  let latestAge = Infinity;
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record) || seenRecords.has(record)) continue;
    seenRecords.add(record);
    const id = record.id ?? record.recordId ?? record.reportId;
    const hasId = typeof id === "string" ? Boolean(id.trim()) : typeof id === "number" && Number.isFinite(id);
    if (hasId && seenIds.has(String(id))) continue;
    if (hasId) seenIds.add(String(id));
    count += 1;
    const age = now - recordTime(record);
    // Future or malformed dates still indicate saved records, but never recent activity.
    if (!Number.isFinite(age) || age < 0) continue;
    latestAge = Math.min(latestAge, age);
    if (age <= 7 * DAY_MS) lastWeek += 1;
    if (age <= 30 * DAY_MS) lastMonth += 1;
  }
  const recency = latestAge <= DAY_MS ? 3 : latestAge <= 7 * DAY_MS ? 2 : latestAge <= 30 * DAY_MS ? 1 : 0;
  // Bound volume so a large old collection does not bury newly used tools.
  return Math.min(count, 3) * 0.1 + Math.min(lastWeek, 4) * 2 + Math.min(lastMonth, 4) * 0.75 + recency;
}

/**
 * Order already-eligible page cards or shortcuts using existing, account-scoped
 * saved work. Callers retain permission checks, visibility preferences, and
 * permanent actions such as Report restock. This function never creates tracking
 * events, changes records, or changes the stable navigation.
 *
 * Each item may name activityKeys; otherwise its key names the activity bucket.
 * Explicit manual order wins over inferred activity, even when adaptation is off.
 */
export function rankAdaptivePageItems(items = [], {
  activity = {},
  enabled = true,
  preferredKeys = [],
  manualOrder = false,
  now = Date.now(),
} = {}) {
  const candidates = Array.isArray(items) ? [...items] : [];
  if (manualOrder) {
    const preferred = new Map();
    for (const key of Array.isArray(preferredKeys) ? preferredKeys : []) {
      if (!preferred.has(key)) preferred.set(key, preferred.size);
    }
    return candidates.map((item, index) => ({ item, index }))
      .sort((left, right) => (preferred.get(left.item?.key) ?? Infinity) - (preferred.get(right.item?.key) ?? Infinity) || left.index - right.index)
      .map(({ item }) => item);
  }
  if (!enabled) return candidates;
  const scores = new Map();
  const scoreFor = (key) => {
    if (!scores.has(key)) scores.set(key, activityScore(activity?.[key], Number(now)));
    return scores.get(key);
  };
  return candidates.map((item, index) => {
    const keys = Array.isArray(item?.activityKeys) ? item.activityKeys : [item?.key];
    const score = keys.reduce((highest, key) => Math.max(highest, scoreFor(key)), 0);
    return { item, index, score };
  }).sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}
