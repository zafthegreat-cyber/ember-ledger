import { BACKUP_SOURCE_REGISTRY } from "../backup/backupSourceRegistry.js";
import { readCurrentBackupSources } from "../backup/backupFormat.js";
import { CANONICAL_DOMAINS } from "../persistence/migrationSourceRegistry.js";

const TITLE_FIELDS = ["title", "displayName", "name", "itemName", "productName", "ruleName", "label", "product", "store"];
const FACT_FIELDS = ["status", "currentStatus", "purpose", "quantity", "amountMinor", "currency", "recordVersion", "occurredAt", "createdAt", "updatedAt", "sku", "upc", "certificationNumber"];
const scalar = (value) => ["string", "number", "boolean"].includes(typeof value) ? String(value).slice(0, 300) : "";
export const recordLabel = (value) => String(value).replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());

function project(source, collection, record) {
  const id = scalar(record?.id);
  if (!id || id.length > 240 || record?.archivedAt) return null;
  // Deliberately project allowed fields. Never stringify arbitrary records,
  // credentials, notes, session state, evidence bodies, or storage URLs.
  const title = TITLE_FIELDS.map((field) => scalar(record[field] ?? record.metadata?.[field])).find(Boolean) || `${recordLabel(collection)} ${id}`;
  const facts = FACT_FIELDS.flatMap((field) => {
    const value = scalar(record[field]);
    return value ? [{ label: recordLabel(field), value }] : [];
  });
  return { source, collection, id, title, type: recordLabel(collection), facts, searchText: [title, id, collection, ...facts.map((fact) => fact.value)].join(" ").toLocaleLowerCase() };
}

export function buildRecordIndex({ sources = {}, canonicalDomains = {} } = {}) {
  const records = []; const duplicates = []; const seen = new Set();
  const add = (source, collection, row) => {
    const projected = project(source, collection, row);
    if (!projected) return;
    const key = JSON.stringify([source, collection, projected.id]);
    if (seen.has(key)) { duplicates.push({ source, collection, id: projected.id }); return; }
    seen.add(key); records.push(projected);
  };
  for (const source of BACKUP_SOURCE_REGISTRY) {
    if (!source.includedInPhase1AExport || source.containsSecurityOrSessionState) continue;
    for (const path of source.recordPaths || []) {
      const rows = path === "$" ? sources[source.sourceId] : path.split(".").reduce((value, key) => value?.[key], sources[source.sourceId]);
      if (Array.isArray(rows)) rows.forEach((row) => add(source.sourceId, path === "$" ? source.sourceId : path, row));
    }
  }
  for (const domain of Object.values(CANONICAL_DOMAINS)) {
    if (Array.isArray(canonicalDomains?.[domain])) canonicalDomains[domain].forEach((row) => add("canonical", domain, row));
  }
  // Ambiguous identities are excluded entirely; never choose an arbitrary row.
  const bad = new Set(duplicates.map((row) => JSON.stringify([row.source, row.collection, row.id])));
  return { records: records.filter((row) => !bad.has(JSON.stringify([row.source, row.collection, row.id]))), duplicates };
}

export function readAuthorizedRecordIndex({ session, localStorage, sessionStorage, canonicalDomains } = {}) {
  if (session?.status !== "authorized" || session.ownerAuthorized !== true) throw new Error("Verified owner access is required to search private records.");
  const snapshot = readCurrentBackupSources({ localStorage, sessionStorage });
  return { ...buildRecordIndex({ sources: snapshot.sources, canonicalDomains }), warnings: snapshot.warnings.map((row) => `${row.sourceId}: ${row.message || "Source unavailable"}`) };
}

export function queryRecordIndex(index, query, { limit = 100 } = {}) {
  const words = String(query || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
  if (words.join(" ").length < 2) return { groups: [], total: 0, truncated: false };
  const matches = index.records.filter((record) => words.every((word) => record.searchText.includes(word)))
    .sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const groups = new Map();
  for (const row of matches.slice(0, Math.max(1, Math.min(limit, 500)))) {
    const key = `${row.source}:${row.collection}`;
    if (!groups.has(key)) groups.set(key, { key, title: `${row.type} · ${recordLabel(row.source)}`, records: [] });
    groups.get(key).records.push(row);
  }
  return { groups: [...groups.values()], total: matches.length, truncated: matches.length > limit };
}

export function recordSearchUrl(record, query = "", location = globalThis.location) {
  const params = new URLSearchParams({ recordQ: query });
  if (new URLSearchParams(location?.search).get("betaLocalMode") === "true") params.set("betaLocalMode", "true");
  const inspectionTheme = new URLSearchParams(location?.search).get("themeInspect");
  if (["light", "dark"].includes(inspectionTheme)) params.set("themeInspect", inspectionTheme);
  if (record) { params.set("source", record.source); params.set("collection", record.collection); params.set("record", record.id); }
  return `/owner-center/records?${params}`;
}
