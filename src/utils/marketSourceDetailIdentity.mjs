const FIELDS = [
  { target: "tcgplayerProductId", aliases: ["tcgplayerProductId", "tcgplayer_product_id"] },
  { target: "tcgplayerGroupId", aliases: ["tcgplayerGroupId", "tcgplayer_group_id"], ownAliases: ["groupId"], catalogAliases: ["groupId"] },
  { target: "tcgplayerCategoryId", aliases: ["tcgplayerCategoryId", "tcgplayer_category_id"], ownAliases: ["categoryId"] },
  { target: "tcgdexCardId", aliases: ["tcgdexCardId", "tcgdexId", "tcgdex_card_id"] },
];
const present = value => value !== null && value !== undefined && !(typeof value === "string" && !value.trim());
const identifier = value => (typeof value === "string" && value.length > 0) || (typeof value === "number" && Number.isFinite(value)) ? String(value) : "";

// Detail-only metadata: an existing explicit catalog link can fill provider IDs.
// Never infer identity from a name, UPC or retailer SKU, or change saved values.
export function buildMarketSourceDetailItem(item, catalog = []) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return {};
  const link = identifier(present(item.catalogProductId) ? item.catalogProductId : item.catalog_product_id);
  if (!link || !Array.isArray(catalog)) return item;
  const matches = catalog.filter(row => row && identifier(row.id) === link);
  if (matches.length !== 1) return item;
  const linked = matches[0];
  const detail = { ...item };
  for (const { target, aliases, ownAliases = [], catalogAliases = [] } of FIELDS) {
    // An explicit owned-record identity always wins, including legacy aliases.
    if ([...aliases, ...ownAliases].some(key => present(item[key]))) continue;
    const key = [...aliases, ...catalogAliases].find(key => present(linked[key]));
    if (key) detail[target] = linked[key];
  }
  return detail;
}
