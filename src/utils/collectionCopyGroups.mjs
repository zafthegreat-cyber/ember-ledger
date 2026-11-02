import { getRecordGame, getRecordGameLabel } from "./collectibleGames.mjs";
import { getPortfolioItemValuation, summarizePortfolio } from "./collectionPortfolio.mjs";
import { inferOwnedItemPurpose, OWNED_ITEM_PURPOSE_OPTIONS } from "../features/ownedItems/ownedItemPurpose.js";

// Presentation only: the saved acquisitions remain separate original objects.
// Never write the representative, aggregate quantity or value back to storage.
function text(value) { return ["string", "number"].includes(typeof value) ? String(value).trim() : ""; }
function first(record, fields) { return fields.map((field) => text(record[field])).find(Boolean) || ""; }
function normalized(value) { return text(value).normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " "); }
function field(record, fields) { return normalized(first(record, fields)); }
function classification(record) {
  const value = field(record, ["productClassification", "product_classification", "catalogType", "catalog_type", "productKind", "product_kind", "productType", "product_type"]);
  if (["sealed", "sealed product"].includes(value)) return "sealed";
  if (["single", "single card", "card"].includes(value)) return "single";
  if (["graded", "graded card", "slab"].includes(value)) return "graded";
  return value;
}
function language(record) {
  const value = field(record, ["language", "cardLanguage", "card_language"]);
  return ({ en: "english", eng: "english", ja: "japanese", jp: "japanese", jpn: "japanese", zh: "chinese" })[value] || value;
}
function guard(record) {
  const game = getRecordGame(record);
  const unrecognizedGame = ["tcgGame", "tcg_game", "gameId", "game_id", "game", "gameName", "game_name"].map((key) => normalized(record[key])).filter(Boolean).sort();
  return JSON.stringify([
    game === "unspecified" ? JSON.stringify([game, normalized(getRecordGameLabel(record)), unrecognizedGame]) : game,
    classification(record), language(record),
    field(record, ["variant", "variantName", "variant_name", "productVariant", "product_variant", "cardVariant", "card_variant"]),
    field(record, ["edition", "editionName", "edition_name", "printingOrEdition", "printing_or_edition"]),
    field(record, ["finish"]), field(record, ["printing"]),
    field(record, ["condition", "conditionName", "condition_name", "sealedCondition", "sealed_condition"]),
    field(record, ["gradingCompany", "grading_company", "grader"]), field(record, ["grade"]),
    field(record, ["size", "productSize", "product_size"]),
    field(record, ["sealedType", "sealed_type", "sealedProductType", "sealed_product_type"]),
    field(record, ["packCount", "pack_count"]),
    field(record, ["currency", "currencyCode", "currency_code"]),
  ]);
}
const ID_FIELDS = [
  ["catalog", ["catalogProductId", "catalog_product_id", "catalogItemId", "catalog_item_id", "masterCatalogItemId", "master_catalog_item_id"]],
  ["tcgplayer", ["tcgplayerProductId", "tcgplayer_product_id"]],
  ["barcode", ["barcode", "upc", "gtin", "ean"]],
  ["sku", ["sku", "productSku", "product_sku"]],
];
function identities(record) {
  const ids = ID_FIELDS.flatMap(([namespace, fields]) => [...new Set(fields.map((key) => text(record[key])).filter(Boolean))].map((value) => [namespace, value]));
  const external = first(record, ["externalProductId", "external_product_id", "sourceProductId", "source_product_id"]);
  const source = field(record, ["catalogSource", "catalog_source", "sourceType", "source_type", "source"]);
  // An unqualified external ID is not globally unique across catalog providers.
  if (external && source) ids.push([`external:${source}`, external]);
  return ids.sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
}
function fallbackIdentity(record) {
  const name = field(record, ["name", "title", "itemName", "item_name", "productName", "product_name", "catalogProductName", "catalog_product_name", "cardName"]);
  const set = field(record, ["setCode", "set_code", "setId", "set_id", "setName", "set_name", "expansion", "series"]);
  const type = classification(record);
  // A title alone is unsafe: different products can share a display name.
  if (!name || !set || !type || getRecordGame(record) === "unspecified") return "";
  const details = record.cardDetails || record.card_details || record.tcgCardDetails || record.tcg_card_details || {};
  const number = field(record, ["cardNumber", "card_number", "number"]) || field(details, ["cardNumber", "card_number", "number"]);
  if (["single", "graded"].includes(type) && !number) return "";
  const source = field(record, ["catalogSource", "catalog_source", "sourceType", "source_type", "source"]);
  const unqualifiedExternalIds = source ? [] : [...new Set(["externalProductId", "external_product_id", "sourceProductId", "source_product_id"].map((key) => text(record[key])).filter(Boolean))].sort();
  return JSON.stringify([name, set, type, number, unqualifiedExternalIds]);
}

export function collectionCopyQuantity(record = {}) { return getPortfolioItemValuation(record).quantity; }

function summarizeGroup(group) {
  const records = group.entries.sort((a, b) => a.index - b.index).map((entry) => entry.record);
  const summary = summarizePortfolio(records);
  const partial = summary.unknownCount > 0 && summary.knownCount > 0;
  const value = summary.isValid && summary.knownCount > 0 ? summary.total : null;
  const source = !summary.knownCount ? "unknown" : summary.marketKnownCount && summary.projectedKnownCount ? "mixed" : summary.projectedKnownCount ? "projected" : "market";
  const purposes = new Map();
  for (const record of records) {
    const purpose = inferOwnedItemPurpose(record);
    purposes.set(purpose, (purposes.get(purpose) || 0) + collectionCopyQuantity(record));
  }
  const shortLabels = { PERSONAL_COLLECTION: "PC", FOR_RESALE: "Resale", HOLD: "Hold", KIDS_COMMUNITY: "Kids & community", UNASSIGNED: "Unassigned" };
  return {
    key: `collection-copy:${group.key}`,
    item: records[0], records, quantity: summary.quantity,
    purposeCounts: OWNED_ITEM_PURPOSE_OPTIONS.filter(({ value: purpose }) => purposes.has(purpose)).map(({ value: purpose, label }) => ({ purpose, label, shortLabel: shortLabels[purpose], quantity: purposes.get(purpose) })),
    valuation: { ...summary, value, knownValue: summary.total, partial, source, label: value === null ? "Value not recorded" : partial ? "Partial saved estimate" : source === "mixed" ? "Saved market and projected estimates" : source === "projected" ? "Saved projected estimate" : "Saved market estimate" },
  };
}

/** Group matching products for display, preserving every acquisition unchanged.
 * IDs are namespaced. A shared ID may reconcile an omitted secondary ID, but a
 * conflicting SKU/catalog ID anywhere in that component prevents bridging.
 */
export function groupCollectionCopies(records = []) {
  const entries = (Array.isArray(records) ? records : []).filter((record) => record && typeof record === "object" && !Array.isArray(record)).map((record, index) => ({ record, index, guard: guard(record), ids: identities(record), fallback: fallbackIdentity(record) }));
  const parents = entries.map((_, index) => index);
  function root(index) { while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; } return index; }
  const aliases = new Map();
  for (const [index, entry] of entries.entries()) for (const id of entry.ids) {
    const alias = JSON.stringify([entry.guard, id]);
    if (aliases.has(alias)) parents[root(index)] = root(aliases.get(alias));
    else aliases.set(alias, index);
  }
  const components = new Map();
  for (const [index, entry] of entries.entries()) {
    if (!entry.ids.length) continue;
    const key = root(index);
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(entry);
  }
  const groups = [];
  for (const component of components.values()) {
    const namespaces = new Map();
    for (const entry of component) for (const [namespace, id] of entry.ids) {
      if (!namespaces.has(namespace)) namespaces.set(namespace, new Set());
      namespaces.get(namespace).add(id);
    }
    const conflicting = [...namespaces.values()].some((values) => values.size > 1);
    const partitions = new Map();
    for (const entry of component) {
      const ids = conflicting ? entry.ids : [...namespaces].map(([namespace, values]) => [namespace, [...values][0]]).sort(([a], [b]) => a.localeCompare(b));
      const key = JSON.stringify([entry.guard, "ids", ids]);
      if (!partitions.has(key)) partitions.set(key, { key, entries: [] });
      partitions.get(key).entries.push(entry);
    }
    groups.push(...partitions.values());
  }
  const fallbackTargets = new Map();
  for (const group of groups) for (const entry of group.entries) if (entry.fallback) {
    const key = JSON.stringify([entry.guard, entry.fallback]);
    if (!fallbackTargets.has(key)) fallbackTargets.set(key, new Set());
    fallbackTargets.get(key).add(group);
  }
  const manualGroups = new Map();
  const incompleteOccurrences = new Map();
  for (const entry of entries) {
    if (entry.ids.length) continue;
    const fallbackKey = entry.fallback ? JSON.stringify([entry.guard, entry.fallback]) : "";
    const targets = fallbackKey ? fallbackTargets.get(fallbackKey) : null;
    if (targets?.size === 1) { [...targets][0].entries.push(entry); continue; }
    const recordKey = first(entry.record, ["id"]);
    const rowIdentity = JSON.stringify([entry.guard, "row", text(entry.record._recordOrigin), recordKey || `position:${entry.index}`]);
    const occurrence = incompleteOccurrences.get(rowIdentity) || 0;
    incompleteOccurrences.set(rowIdentity, occurrence + 1);
    const key = fallbackKey || JSON.stringify([rowIdentity, occurrence]);
    if (!manualGroups.has(key)) manualGroups.set(key, { key, entries: [] });
    manualGroups.get(key).entries.push(entry);
  }
  groups.push(...manualGroups.values());
  const firstIndex = (group) => group.entries.reduce((minimum, entry) => Math.min(minimum, entry.index), Infinity);
  return groups.sort((a, b) => firstIndex(a) - firstIndex(b)).map(summarizeGroup);
}
