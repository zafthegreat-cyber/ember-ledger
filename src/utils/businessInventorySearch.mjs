// Business/collection record search text (feedback findings F09/F10, 2026-10-31).
// Saved identifiers (SKU, barcode, UPC, catalog IDs) and useful metadata
// (game name and abbreviation, language, edition, grader, grade, storage
// fields in camelCase or snake_case) are searchable. Read-only: it never
// changes records, prices, ordering or stock authority.
import { COLLECTIBLE_GAMES, getRecordGame } from "./collectibleGames.mjs";

const IDENTIFIER_FIELDS = [
  "sku", "barcode", "upc", "ean", "gtin", "upcSku", "upc_sku",
  "catalogProductId", "catalog_product_id", "productId", "product_id", "externalProductId", "external_product_id",
  "tcgplayerProductId", "tcgplayer_product_id", "certNumber", "cert_number", "certificationNumber", "certification_number",
  "lotId", "lot_id", "referenceId", "reference_id", "orderId", "order_id",
];
const TEXT_FIELDS = [
  "title", "name", "cardName", "card_name", "productName", "product_name", "description", "purpose",
  "setName", "set_name", "expansion", "setCode", "set_code", "cardNumber", "card_number", "number",
  "variant", "printing", "finish", "edition", "rarity", "language", "cardLanguage", "card_language",
  "condition", "conditionName", "condition_name", "sealedCondition", "sealed_condition",
  "gradingCompany", "grading_company", "grader", "grade", "gradeValue", "grade_value",
  "storageLocation", "storage_location", "location", "binder", "folder", "shelf", "box",
  "store", "vendor", "platform", "channel", "status", "category", "productType", "product_type",
  "notes", "tags", "purchaserName", "purchaser_name", "buyerName", "buyer_name",
];

function text(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (typeof value === "object") return "";
  return String(value);
}

export function businessRecordSearchText(record = {}) {
  if (!record || typeof record !== "object") return "";
  const parts = [];
  for (const field of TEXT_FIELDS) parts.push(text(record[field]));
  for (const field of IDENTIFIER_FIELDS) {
    const value = text(record[field]).trim();
    if (!value) continue;
    parts.push(value, value.replace(/[\s-]+/g, ""));
  }
  const details = record.cardDetails || record.card_details || record.tcgCardDetails || record.tcg_card_details;
  if (details && typeof details === "object") parts.push(text(details.cardNumber), text(details.card_number), text(details.number), text(details.rarity), text(details.setName), text(details.set_name));
  const gameId = getRecordGame(record);
  const game = COLLECTIBLE_GAMES.find((entry) => entry.id === gameId);
  if (game) parts.push(game.id, game.name, game.shortName, game.name.normalize("NFKD").replace(/[̀-ͯ]/g, ""));
  if (record.graded || record.grade || record.gradeValue || record.gradingCompany || record.grading_company) parts.push("graded", "slab");
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Case-insensitive match of every whitespace-separated term in `query`. */
export function businessRecordMatchesQuery(record = {}, query = "") {
  const terms = String(query || "").toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  if (!terms.length) return true;
  const haystack = businessRecordSearchText(record);
  const compact = haystack.replace(/[\s-]+/g, "");
  return terms.every((term) => haystack.includes(term) || compact.includes(term.replace(/[\s-]+/g, "")));
}
