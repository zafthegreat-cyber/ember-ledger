const clean = value => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const first = (row, fields) => fields.map(field => row[field]).find(value => value !== undefined && value !== null && String(value).trim() !== "") ?? "";
const unknown = value => ["", "unknown", "not specified", "unspecified"].includes(clean(value)) ? "" : clean(value);
const language = value => ({ en: "english", eng: "english", ja: "japanese", jp: "japanese" })[clean(value)] || unknown(value);
const HEADER_FIELDS = new Set(["name", "item", "item name", "product", "product name", "card", "title", "quantity", "qty", "count", "destination", "purchaser", "buyer", "cost", "cost paid", "unit cost", "paid", "purchase price", "price", "market", "market value", "value", "msrp", "retail", "set", "set name", "collection", "expansion", "condition", "variant", "finish", "printing", "language", "grade", "grading company", "upc", "sku", "barcode", "external id", "note", "notes", "date", "purchase date", "purchased", "store", "source", "vendor", "card number", "card #", "card no", "product type", "category"]);
export const importFieldId = (row, field) => `import-${row.importedItemId}-${field}`;
export const isImportHeaderRecord = cells => cells.some(cell => HEADER_FIELDS.has(clean(cell)));
export function inferImportColumnFields(headers, fields) {
  const mapping = {};
  for (const [index, header] of headers.entries()) {
    const normalized = clean(header);
    const matches = fields.flatMap(field => field.aliases.map(alias => ({ field: field.value, alias: clean(alias) })))
      .filter(match => normalized === match.alias || normalized.includes(match.alias))
      .sort((a, b) => Number(normalized === b.alias) - Number(normalized === a.alias) || b.alias.length - a.alias.length);
    const match = matches[0];
    if (match && !Object.values(mapping).includes(match.field)) mapping[index] = match.field;
  }
  return mapping;
}

export function importCopyContext(row = {}) {
  return {
    name: first(row, ["itemName", "name", "productName", "cardName"]),
    catalogId: String(first(row, ["matchedCatalogItemId", "catalogProductId", "catalog_product_id"])),
    set: unknown(first(row, ["setName", "expansion", "set_name"])),
    number: clean(first(row, ["cardNumber", "card_number"])).split("/").map(part => part.replace(/^0+(?=\d)/, "")).join("/"),
    printing: unknown(first(row, ["variant", "priceSubtype", "finish", "printing"])),
    language: language(first(row, ["language", "cardLanguage"])),
    condition: unknown(first(row, ["conditionName", "condition", "sealedCondition"])),
    gradingCompany: unknown(first(row, ["gradingCompany", "grading_company"])),
    grade: unknown(first(row, ["grade", "gradeValue"])),
    graded: Boolean(row.graded || row.grade || row.gradeValue || row.gradingCompany || row.grading_company),
  };
}

export function possibleImportDuplicate(row, item) {
  const a = importCopyContext(row), b = importCopyContext(item);
  return Boolean(a.catalogId && b.catalogId && a.catalogId === b.catalogId || clean(a.name) && clean(a.name) === clean(b.name));
}

export function sameImportCopy(row, item) {
  const a = importCopyContext(row), b = importCopyContext(item);
  if (!possibleImportDuplicate(row, item)) return false;
  if (a.catalogId && b.catalogId && a.catalogId !== b.catalogId) return false;
  return ["set", "number", "printing", "language", "condition", "gradingCompany", "grade", "graded"].every(field => a[field] === b[field]);
}

/** Provided copy attributes can narrow catalog matches; unknown attributes never choose a variant. */
export function importCatalogCandidateMatches(row, product) {
  const a = importCopyContext(row), b = importCopyContext(product);
  if (a.number && a.number !== b.number) return false;
  return ["set", "number", "printing", "language", "condition", "gradingCompany", "grade"].every(field => !a[field] || !b[field] || a[field] === b[field]);
}

export function importQuantityDraft(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 1;
  return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : raw;
}
export function importMoneyDraft(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/^\$/, "").replace(/,/g, "");
  return /^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw) && Number.isFinite(Number(normalized)) ? Number(normalized) : raw;
}
export function importRowIssues(row = {}) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  if (row.parseError) add("originalText", row.parseError);
  if (["link", "spreadsheet_reference", "pdf_reference"].includes(row.sourceType) || row.referenceOnly) add("originalText", "This is a reference, not parsed inventory. Export as CSV or paste the visible item rows, then parse again.");
  if (!String(row.itemName || "").trim()) add("itemName", "Enter an item name.");
  if (typeof importQuantityDraft(row.quantity) !== "number" || String(row.quantity ?? "").trim() === "") add("quantity", "Use a positive whole-number quantity.");
  for (const [field, label] of [["costPaid", "Cost"], ["marketValue", "Market value"], ["msrp", "MSRP"]]) {
    const value = row[field];
    if (value !== "" && value != null && (typeof importMoneyDraft(value) !== "number" || Number(importMoneyDraft(value)) < 0)) add(field, `${label} must be a nonnegative amount with up to two decimal places, or blank.`);
  }
  const date = String(row.purchaseDate || "");
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString() !== `${date}T12:00:00.000Z`)) add("purchaseDate", "Use a valid purchase date in YYYY-MM-DD format.");
  if (!["Vault", "Forge", "Wishlist", "Both", "Skip"].includes(row.destination)) add("destination", "Choose a supported destination.");
  if (row.identityAmbiguous && !row.matchedCatalogItemId && !row.manualIdentityConfirmed) add("matchedCatalogItemId", "Choose the catalog printing explicitly, or choose a manual item.");
  return issues;
}

/** Preserve quoted commas, escaped quotes and multiline cells, with physical source-line numbers. */
export function parseImportRecords(value = "") {
  const text = String(value).replace(/^\uFEFF/, "");
  if (text.length > 2 * 1024 * 1024) throw new Error("Split this import into files smaller than 2 MB.");
  let inQuote = false;
  const separators = new Set();
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') { if (inQuote && text[index + 1] === '"') index++; else inQuote = !inQuote; }
    if (!inQuote && /[\n\r]/.test(character)) break;
    if (!inQuote && ["\t", ",", "|"].includes(character)) separators.add(character);
  }
  const separator = separators.has("\t") ? "\t" : separators.has(",") ? "," : "|";
  const records = [];
  let cells = [], cell = "", raw = "", quoted = false, afterQuote = false, recordError = "", line = 1, start = 1;
  const commit = error => {
    if (raw.trim()) records.push({ cells: [...cells, cell.trim()], raw, lineNumber: start, error: error || recordError });
    cells = []; cell = ""; raw = ""; afterQuote = false; recordError = ""; start = line;
    if (records.length > 5000) throw new Error("Split this import into batches of at most 5,000 rows.");
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      raw += character;
      if (quoted && text[index + 1] === '"') { cell += '"'; raw += '"'; index++; }
      else if (quoted) { quoted = false; afterQuote = true; }
      else if (!cell.trim() && !afterQuote) quoted = true;
      else { cell += character; if (afterQuote) recordError = "Unexpected text after a quoted cell. Correct the source text and parse again."; }
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      line++; commit(); start = line;
    } else {
      raw += character;
      if (character === "\n") line++;
      if (character === separator && !quoted) { cells.push(cell.trim()); cell = ""; afterQuote = false; }
      else { if (afterQuote && character.trim()) recordError = "Unexpected text after a quoted cell. Correct the source text and parse again."; cell += character; }
    }
  }
  commit(quoted ? "A quoted CSV cell is not closed. Correct the source text and parse again." : "");
  return records;
}

// The existing inventory schema has no dedicated grade/card-number/notes columns.
// Keep imported copy details in its private action_notes field without a migration.
const DETAILS_PREFIX = "Code3 import details v1: ";
const DETAIL_FIELDS = ["setName", "cardNumber", "variant", "language", "condition", "grade", "gradingCompany", "notes", "purchaseDate", "importSourceType"];
export function readImportSavedDetails(actionNotes = "") {
  const line = String(actionNotes).split("\n").filter(line => line.startsWith(DETAILS_PREFIX)).at(-1);
  if (!line) return {};
  try {
    const parsed = JSON.parse(line.slice(DETAILS_PREFIX.length));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries([...DETAIL_FIELDS.filter(field => typeof parsed[field] === "string").map(field => [field, parsed[field]]), ["graded", parsed.graded === true]]);
  } catch { return {}; }
}
export function withImportSavedDetails(record) {
  const existing = String(record.actionNotes || record.action_notes || "");
  if (!record.importSourceType) return existing || record.notes || "";
  const details = Object.fromEntries(DETAIL_FIELDS.map(field => [field, String(record[field] ?? (field === "setName" ? record.expansion : "") ?? "")]));
  details.graded = Boolean(record.graded || record.grade || record.gradingCompany);
  return [...existing.split("\n").filter(line => !line.startsWith(DETAILS_PREFIX)), DETAILS_PREFIX + JSON.stringify(details)].filter(Boolean).join("\n");
}

export function buildRejectedImportCsv(rows, failures = []) {
  const failureById = new Map(failures.map(failure => [String(failure.rowId), failure.error]));
  const cell = value => {
    const raw = String(value ?? "");
    return `"${(/^[\s]*[=+@-]/.test(raw) ? "'" : "") + raw.replaceAll('"', '""')}"`;
  };
  const columns = ["Source line", "Item name", "Quantity", "Destination", "Cost paid USD", "Market value USD", "MSRP USD", "Purchase date YYYY-MM-DD", "Set", "Printing", "Language", "Condition", "UPC / SKU", "Correction needed", "Original source row"];
  const rejected = rows.flatMap((row, index) => {
    if (["imported", "skipped"].includes(row.importStatus) || row.destination === "Skip") return [];
    const issues = importRowIssues(row).map(issue => issue.message);
    const failure = failureById.get(String(row.importedItemId));
    if (!issues.length && !failure && row.importStatus !== "failed") return [];
    return [[row.sourceLine || index + 1, row.itemName, row.quantity, row.destination, row.costPaid, row.marketValue, row.msrp, row.purchaseDate, row.setName, row.variant, row.language, row.condition, row.upcSku, [...issues, failure || (row.importStatus === "failed" ? "Check the failed save before retrying." : "")].filter(Boolean).join(" "), row.originalText]];
  });
  return { count: rejected.length, csv: [columns, ...rejected].map(row => row.map(cell).join(",")).join("\r\n") };
}
