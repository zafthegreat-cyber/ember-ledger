// Improvement #97: every download or export states which private fields the
// file will contain before the file is generated. This module turns real column
// names (or a known export kind) into a short, honest sentence. It never changes
// what an export contains; it only describes it.

const GROUPS = Object.freeze([
  ["contact details", /(^|[^a-z])(email|phone|address|street|zip|postal|contact)([^a-z]|$)/i],
  ["people's names", /(purchaser|buyer|customer|seller|recipient|partner|helper|employee|driver|kid|child|guardian|ownerName|contactName|displayName|fullName|^name$)/i],
  ["private notes", /(note|comment|description|memo|remark|reason|disclaimer)/i],
  ["locations", /(location|destination|startLocation|storage|shelf|bin|city|state$|region|store(?!d)|venue|booth)/i],
  ["where you bought or sold", /(merchant|vendor|supplier|purchaseSource|^source$|channel|platform|marketplace)/i],
  ["money amounts", /(price|cost|amount|total|fee|fees|profit|loss|proceeds|revenue|value|basis|refund|discount|tax|premium|bid|budget|shipping|roi|estimate|gross|net)/i],
  ["receipt and reference numbers", /(receipt|reference|invoice|order(Id|Number)|certification|certNumber|sku|serial)/i],
  ["links", /(url|link|href)/i],
  ["dates and times", /(date|time|at$|_at$|timestamp|createdAt|updatedAt|when|period|year)/i],
  ["record IDs", /(^id$|Id$|_id$|^ids$|Ids$|(^|\s)ids?(\s|$))/i],
  ["quantities and status", /(quantity|qty|count|status|condition|grade|miles|trip)/i],
]);

const GROUP_ORDER = GROUPS.map(([label]) => label);
const MAX_FIELDS = 200;

function labelOf(field) {
  const text = String(field ?? "").trim();
  if (!text) return "";
  for (const [label, pattern] of GROUPS) {
    if (pattern.test(text)) return label;
  }
  return "";
}

export function classifyExportFields(fields = []) {
  const seen = new Set();
  const groups = new Map();
  let other = 0;
  for (const field of (Array.isArray(fields) ? fields : []).slice(0, MAX_FIELDS)) {
    const text = String(field ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const label = labelOf(text);
    if (!label) { other += 1; continue; }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(text);
  }
  const ordered = GROUP_ORDER.filter((label) => groups.has(label)).map((label) => ({ label, fields: groups.get(label) }));
  return { groups: ordered, otherFieldCount: other, fieldCount: seen.size };
}

export function fieldsFromRows(rows = [], limit = 50) {
  const keys = new Set();
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, limit)) {
    if (row && typeof row === "object" && !Array.isArray(row)) for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys];
}

function joinList(items, conjunction = "and") {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${conjunction} ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, ${conjunction} ${list[list.length - 1]}`;
}

// Fixed descriptions for exports whose shape is not a flat row set, or whose
// contents are known regardless of the current rows.
export const EXPORT_KINDS = Object.freeze({
  "beta-backup": { noun: "beta data backup", includes: ["every record saved on this device", "private notes", "people's names", "locations", "money amounts", "record IDs", "your saved settings"], excludes: ["passwords", "sign-in sessions", "attachment files"] },
  "verified-backup": { noun: "verified backup", includes: ["every registered device source: collection, inventory, sales, expenses, mileage, restock reports and settings", "private notes", "people's names", "locations", "money amounts", "record IDs"], excludes: ["passwords", "sign-in sessions", "attachment files, which export separately"] },
  "private-files-backup": { noun: "private file backup", includes: ["every private attachment as embedded file bytes, including receipt photos", "original file names", "record IDs"], excludes: ["collection and sales records, which are in the record backup"] },
  "sourcing-backup": { noun: "sourcing backup", includes: ["deals, auctions, purchases, inventory, sales, expenses and mileage", "private notes", "where you bought or sold", "money amounts", "locations", "links", "record IDs"], excludes: ["sign-in sessions", "provider credentials"] },
  "scout-report": { noun: "report", includes: ["the store and product you reported", "your written notes", "the time you were there", "report IDs"], excludes: ["your account details", "photos"] },
  "portfolio-csv": { noun: "portfolio spreadsheet", includes: ["item names, games, sets and quantities"], valueFields: ["money amounts", "estimate sources"], excludes: ["storage locations", "private notes", "purchase prices"] },
  "review-report": { noun: "review report", includes: ["record IDs", "field names and file paths", "validation findings"], excludes: ["record contents", "attachment files"] },
  "cloud-comparison": { noun: "comparison file", includes: ["both saved copies in full", "private names", "notes", "locations", "record details"], excludes: ["passwords", "sign-in sessions"] },
  "calendar-event": { noun: "calendar entry", includes: ["the event title, date and location you entered"], excludes: ["other records"] },
});

export function describeExport({ kind = "", format = "file", fields = [], rows = null, recordCount = null, redactions = [], includeValues = true } = {}) {
  const formatLabel = /csv/i.test(format) && /json/i.test(format) ? "CSV or JSON file" : /csv/i.test(format) ? "CSV" : /json/i.test(format) ? "JSON file" : /calendar|ics/i.test(format) ? "calendar file" : "file";
  const count = Number.isSafeInteger(recordCount) ? recordCount : Array.isArray(rows) ? rows.length : null;
  const known = EXPORT_KINDS[kind] || null;
  const classified = classifyExportFields(fields.length ? fields : fieldsFromRows(rows || []));
  const fromFields = classified.groups.map((group) => group.label);
  let includes = known ? [...known.includes] : fromFields;
  if (known?.valueFields) includes = includeValues ? [...includes, ...known.valueFields] : includes;
  if (!known && !includes.length && classified.fieldCount) includes = ["the listed columns"];
  const excludes = [...(known?.excludes || []), ...redactions.filter((item) => typeof item === "string" && item.trim())];
  const privateGroups = includes.filter((label) => !["dates and times", "quantities and status", "the listed columns"].includes(label));
  const noun = known?.noun || `${formatLabel}`;
  const countText = count === null ? "" : ` ${count.toLocaleString()} record${count === 1 ? "" : "s"} with`;
  let sentence = includes.length
    ? `This ${noun === formatLabel ? formatLabel : `${noun} (${formatLabel})`} will include${countText} ${joinList(includes)}.`
    : `This ${noun === formatLabel ? formatLabel : `${noun} (${formatLabel})`} will include${countText} the records shown here.`;
  if (excludes.length) sentence += ` It does not include ${joinList(excludes, "or")}.`;
  sentence += privateGroups.length ? " Nothing is uploaded; keep the file private." : " Nothing is uploaded.";
  return {
    kind: kind || "custom",
    format: formatLabel,
    recordCount: count,
    includes,
    excludes,
    privateGroups,
    fieldCount: classified.fieldCount,
    containsPrivateData: privateGroups.length > 0,
    sentence,
  };
}
