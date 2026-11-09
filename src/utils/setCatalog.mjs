import { getRecordGame } from "./collectibleGames.mjs";
import { getPortfolioItemValuation } from "./collectionPortfolio.mjs";
import { createCollectionCatalogIdentity } from "./collectionCatalogIdentity.mjs";
import { groupCollectionCopies } from "./collectionCopyGroups.mjs";
import { collectionSetNameKey, collectionSetCardNumberKey } from "./collectionSets.mjs";

const text = value => ["string", "number"].includes(typeof value) ? String(value).trim() : "";
const first = (row, fields) => fields.map(field => text(row?.[field])).find(Boolean) || "";
const normal = value => text(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
const idFields = { catalog: ["catalogProductId", "catalog_product_id", "catalogItemId", "catalog_item_id"], tcgplayer: ["tcgplayerProductId", "tcgplayer_product_id"], barcode: ["barcode", "upc", "ean", "gtin"] };
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const setCatalogName = product => first(product, ["name", "cardName", "productName", "itemName", "title"]) || "Unnamed item";
export const setCatalogNumber = product => first(product, ["cardNumber", "card_number", "setNumber", "number"]);
export function setCatalogKind(row) {
  if (row?.isAccessory === true || /^code card\b/i.test(setCatalogName(row))) return "other";
  const kind = normal(first(row, ["catalogType", "catalogItemType", "productClassification", "productKind", "productType"]));
  if (["card", "single", "single card", "raw card", "graded", "graded card"].includes(kind)) return "card";
  if (["sealed", "sealed product", "sealed_product"].includes(kind) || row?.isSealed === true || row?.is_sealed === true) return "sealed";
  if (setCatalogNumber(row)) return "card";
  return "other";
}
export function setCatalogKey(product) {
  const tcg = first(product, idFields.tcgplayer);
  return tcg ? `tcgplayer:${tcg}` : text(product.id) ? `catalog:${product.id}` : "";
}
function identifiers(row, product = false) {
  return Object.fromEntries(Object.entries(idFields).map(([namespace, fields]) => [namespace, new Set([...fields.map(field => text(row[field])), ...(product && namespace === "catalog" ? [text(row.id)] : [])].filter(Boolean))]));
}
function compatible(owned, product) {
  if (getRecordGame(owned) !== getRecordGame(product) || (setCatalogKind(owned) !== "other" && setCatalogKind(owned) !== setCatalogKind(product))) return false;
  const setName = record => first(record, ["setName", "set_name", "expansion"]);
  if (setName(owned) && setName(product) && collectionSetNameKey(setName(owned), getRecordGame(owned)) !== collectionSetNameKey(setName(product), getRecordGame(product))) return false;
  if (setCatalogNumber(owned) && setCatalogNumber(product) && collectionSetCardNumberKey(setCatalogNumber(owned)) !== collectionSetCardNumberKey(setCatalogNumber(product))) return false;
  const language = value => ({ en: "english", eng: "english", ja: "japanese", jp: "japanese" })[normal(value)] || normal(value);
  for (const field of ["language", "variant", "edition", "finish", "printing", "packCount"]) {
    const a = field === "language" ? language(owned.language || owned.cardLanguage) : normal(owned[field]);
    const b = field === "language" ? language(product.language || product.cardLanguage) : normal(product[field]);
    if (a && b && a !== "unknown" && a !== "not recorded" && !(field === "packCount" && a === "0") && a !== b) return false;
  }
  return true;
}
function priceTime(row) { return Date.parse(row.priceCheckedAt || row.marketLastUpdated || "") || 0; }
function identityView(record) {
  const kind = setCatalogKind(record);
  return { ...record, ...(kind !== "other" ? { productClassification: kind === "card" ? "single" : "sealed" } : {}), setName: collectionSetNameKey(first(record, ["setName", "set_name", "expansion"]), getRecordGame(record)), ...(setCatalogNumber(record) ? { cardNumber: collectionSetCardNumberKey(setCatalogNumber(record)) } : {}) };
}

// Read-only product coverage. Every copy keeps its original object, cost and price.
export function buildSetCatalogEntries({ catalogRecords = [], ownedItems = [] } = {}) {
  const byKey = new Map();
  for (const product of catalogRecords) {
    const key = setCatalogKey(product), kind = setCatalogKind(product);
    if (!key || kind === "other") continue;
    const scopedKey = `${getRecordGame(product)}:${key}`;
    const previous = byKey.get(scopedKey);
    if (!previous) byKey.set(scopedKey, { key: scopedKey, catalogKey: key, kind, product, identifiers: identifiers(product, true), records: [], savedOnly: false });
    else if (previous.kind === kind) {
      for (const [namespace, values] of Object.entries(identifiers(product, true))) for (const value of values) previous.identifiers[namespace].add(value);
      if (priceTime(product) > priceTime(previous.product)) previous.product = product;
    }
  }
  const entries = [...byKey.values()], index = new Map();
  for (const entry of entries) for (const [namespace, values] of Object.entries(entry.identifiers)) for (const value of values) {
    const key = `${namespace}:${value}`;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(entry);
  }
  const resolveName = createCollectionCatalogIdentity(entries.map(entry => identityView(entry.product)));
  const unmatched = [];
  for (const record of ownedItems) {
    if (!(getPortfolioItemValuation(record).quantity > 0)) continue;
    const ids = identifiers(record);
    const hasIds = Object.values(ids).some(values => values.size);
    const candidates = new Set(Object.entries(ids).flatMap(([namespace, values]) => [...values].flatMap(value => [...(index.get(`${namespace}:${value}`) || [])])));
    let matches = [...candidates].filter(entry => {
      if (!compatible(record, entry.product)) return false;
      const target = entry.identifiers;
      return Object.entries(ids).every(([namespace, values]) => !values.size || [...values].every(value => target[namespace].has(value)));
    });
    if (!hasIds) {
      const resolved = resolveName(identityView(record));
      const key = resolved?.ids.find(([namespace]) => namespace === "catalog-match")?.[1];
      matches = key ? entries.filter(entry => entry.catalogKey === key && compatible(record, entry.product)) : [];
    }
    if (matches.length === 1) matches[0].records.push(record);
    else unmatched.push(record);
  }
  for (const group of groupCollectionCopies(unmatched)) entries.push({ key: `saved:${group.key}`, kind: setCatalogKind(group.item), product: group.item, records: group.records, savedOnly: true });
  return entries.map(entry => {
    let quantity = 0;
    for (const record of entry.records) {
      const next = quantity + getPortfolioItemValuation(record).quantity;
      quantity = Number.isSafeInteger(next) ? next : null;
      if (quantity === null) break;
    }
    return { ...entry, owned: entry.records.length > 0, ownedQuantity: quantity };
  }).sort((a, b) => (a.kind === "card" ? 0 : a.kind === "sealed" ? 1 : 2) - (b.kind === "card" ? 0 : b.kind === "sealed" ? 1 : 2) || collator.compare(setCatalogNumber(a.product), setCatalogNumber(b.product)) || collator.compare(setCatalogName(a.product), setCatalogName(b.product)) || a.key.localeCompare(b.key));
}

export function filterSetCatalogEntries(entries, { kind = "all", ownedOnly = false, query = "" } = {}) {
  const needle = normal(query);
  return entries.filter(entry => (kind === "all" || entry.kind === kind) && (!ownedOnly || entry.owned) && (!needle || normal([setCatalogName(entry.product), setCatalogNumber(entry.product), entry.product.rarity].join(" ")).includes(needle)));
}

// A reviewed catalog selection starts a NEW draft. Never copy a catalog row ID,
// purchase cost, acquisition date or aggregate ownership into a saved record.
export function createSetCatalogItemSeed(set, product) {
  const seed = { name: setCatalogName(product), setName: set.name, tcgGame: set.gameId, quantity: 1, catalogProductId: text(product.id), productClassification: setCatalogKind(product) === "card" ? "Raw card" : "Sealed product" };
  for (const field of ["tcgplayerProductId", "cardNumber", "language", "variant", "edition", "finish", "printing", "imageUrl", "photoUrl", "marketSource", "marketLastUpdated", "priceCheckedAt", "marketStatus"]) if (product[field] !== undefined && product[field] !== "") seed[field] = product[field];
  if (!["unknown", "unavailable", "missing", "no_price"].includes(normal(product.marketStatus)) && typeof product.marketPrice === "number" && Number.isFinite(product.marketPrice) && product.marketPrice >= 0) seed.marketPrice = product.marketPrice;
  return seed;
}
