import { getRecordGame } from "./collectibleGames.mjs";

const names = ["name", "title", "itemName", "item_name", "productName", "product_name", "catalogProductName", "catalog_product_name", "cardName", "cleanName", "displayName"];
const idFields = {
  catalog: ["catalogProductId", "catalog_product_id", "catalogItemId", "catalog_item_id", "masterCatalogItemId", "master_catalog_item_id"],
  tcgplayer: ["tcgplayerProductId", "tcgplayer_product_id"],
  barcode: ["barcode", "upc", "gtin", "ean"],
};
const attributes = {
  language: ["language", "cardLanguage", "card_language"],
  variant: ["variant", "variantName", "variant_name", "productVariant", "product_variant", "cardVariant", "card_variant"],
  edition: ["edition", "editionName", "edition_name", "printingOrEdition", "printing_or_edition"],
  finish: ["finish"], printing: ["printing"],
  size: ["size", "productSize", "product_size"],
  sealedType: ["sealedType", "sealed_type", "sealedProductType", "sealed_product_type"],
  packCount: ["packCount", "pack_count"],
  cardNumber: ["cardNumber", "card_number", "number"],
};
const text = value => ["string", "number"].includes(typeof value) ? String(value).trim() : "";
const normalize = value => text(value).normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const nameKey = value => normalize(value).normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const first = (record, fields) => fields.map(field => text(record?.[field])).find(Boolean) || "";
function value(record, field) {
  const raw = normalize(first(record, attributes[field]));
  if (["unknown", "unspecified", "not recorded"].includes(raw) || (field === "packCount" && raw === "0")) return "";
  return field === "language" ? ({ en: "english", eng: "english", ja: "japanese", jp: "japanese", jpn: "japanese", zh: "chinese" })[raw] || raw : raw;
}
function kind(record) {
  const raw = normalize(first(record, ["productClassification", "product_classification", "catalogType", "catalog_type", "productKind", "product_kind", "productType", "product_type"]));
  if (["sealed", "sealed product"].includes(raw)) return "sealed";
  if (["single", "single card", "card"].includes(raw)) return "single";
  if (["graded", "graded card", "slab"].includes(raw)) return "graded";
  return record.isSealed === true || record.is_sealed === true ? "sealed" : ["unknown", "unspecified", "not recorded"].includes(raw) ? "" : raw;
}
function ids(record, catalogRow = false) {
  const result = Object.fromEntries(Object.entries(idFields).map(([name, fields]) => [name, new Set(fields.map(field => text(record[field])).filter(Boolean))]));
  if (catalogRow && !result.catalog.size && text(record.id)) result.catalog.add(text(record.id));
  return result;
}
function catalogKey(record, identifiers) {
  const tcg = [...identifiers.tcgplayer];
  if (tcg.length === 1) return `tcgplayer:${tcg[0]}`;
  const source = normalize(first(record, ["catalogSource", "catalog_source", "sourceType", "source_type", "source"]));
  const external = first(record, ["externalProductId", "external_product_id", "sourceProductId", "source_product_id"]);
  if (source && external) return `external:${source}:${external}`;
  const catalog = [...identifiers.catalog];
  return catalog.length === 1 ? `catalog:${catalog[0]}` : "";
}

const indexes = new WeakMap();
export function createCollectionCatalogIdentity(catalog = []) {
  if (!Array.isArray(catalog) || !catalog.length) return () => null;
  if (indexes.has(catalog)) return indexes.get(catalog);
  const byName = new Map(), cache = new WeakMap();
  for (const product of catalog) {
    if (!product || typeof product !== "object") continue;
    const identifiers = ids(product, true), key = catalogKey(product, identifiers);
    if (!key || getRecordGame(product) === "unspecified" || Object.values(identifiers).some(set => set.size > 1)) continue;
    for (const name of new Set(names.map(field => nameKey(product[field])).filter(Boolean))) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ product, identifiers, key });
    }
  }
  const resolve = record => {
    if (cache.has(record)) return cache.get(record);
    const result = match(record); cache.set(record, result); return result;
  };
  function match(record) {
    const game = getRecordGame(record), recordedIds = ids(record);
    if (game === "unspecified" || Object.values(recordedIds).some(set => set.size > 1)) return null;
    const candidates = new Set(names.flatMap(field => byName.get(nameKey(record[field])) || []));
    const matching = [...candidates].filter(({ product, identifiers }) => {
      if (getRecordGame(product) !== game) return false;
      const productKind = kind(product), recordKind = kind(record);
      if (!productKind || (recordKind && recordKind !== productKind && recordKind !== normalize(product.productType))) return false;
      const recordedSet = normalize(first(record, ["setName", "set_name", "setCode", "set_code", "expansion"]));
      const productSets = new Set([product.setName, product.set_name, product.setCode, product.set_code, product.expansion].flatMap(name => {
        const full = normalize(name);
        return full ? [full, full.replace(/^[a-z]+\d*(?:\.\d+)?\s*:\s*/, "")] : [];
      }));
      if (recordedSet && productSets.size && !productSets.has(recordedSet)) return false;
      for (const field of Object.keys(attributes)) if (value(record, field) && value(product, field) && value(record, field) !== value(product, field)) return false;
      const strongIds = recordedIds.catalog.size || recordedIds.tcgplayer.size || recordedIds.barcode.size;
      // A lone card title is not a card identity, even in a partial catalog.
      if (!strongIds && productKind !== "sealed") {
        const set = normalize(first(record, ["setName", "set_name", "setCode", "set_code", "expansion"]));
        if (!set || !value(record, "cardNumber") || ![product.setName, product.set_name, product.setCode, product.set_code, product.expansion].some(name => normalize(name) === set)) return false;
      }
      for (const namespace of Object.keys(idFields)) if (recordedIds[namespace].size && identifiers[namespace].size && ![...recordedIds[namespace]].every(id => identifiers[namespace].has(id))) return false;
      return true;
    });
    if (!matching.length || new Set(matching.map(entry => entry.key)).size !== 1) return null;
    const allIds = new Set(matching.flatMap(entry => Object.values(entry.identifiers).flatMap(set => [...set])));
    const external = first(record, ["externalProductId", "external_product_id", "sourceProductId", "source_product_id"]);
    if (external && !allIds.has(external)) return null;
    const source = normalize(first(record, ["catalogSource", "catalog_source", "sourceType", "source_type", "source"]));
    if (external && source && !matching.some(({ product }) => normalize(first(product, ["catalogSource", "catalog_source", "sourceType", "source_type", "source"])) === source)) return null;
    const primaryIds = [...recordedIds.catalog, ...recordedIds.tcgplayer, ...recordedIds.barcode];
    if (primaryIds.length && !primaryIds.some(id => allIds.has(id))) return null;
    const view = { ...record, productClassification: kind(matching[0].product) };
    for (const field of Object.keys(attributes)) {
      const values = new Set(matching.map(({ product }) => value(product, field)).filter(Boolean));
      if (!value(record, field) && values.size > 1) return null;
      if (!value(record, field)) {
        for (const alias of attributes[field]) delete view[alias];
        if (values.size === 1) view[field] = [...values][0];
      }
    }
    // Physical box condition belongs to each copy, not its product identity.
    if (kind(matching[0].product) === "sealed") for (const field of ["condition", "conditionName", "condition_name", "sealedCondition", "sealed_condition"]) delete view[field];
    return { view, ids: [["catalog-match", matching[0].key], ...[...recordedIds.barcode].map(id => ["barcode", id])] };
  }
  indexes.set(catalog, resolve); return resolve;
}
