const text = value => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
export function cardVersionKey(value) {
  return text(value).toLowerCase().replace(/[-_]+/g, " ").replace(/first edition/g,"1st edition").replace(/holofoil/g, "holo").replace(/non holo|nonholo|nonfoil|non foil|regular/g, "normal").replace(/\s+/g, " ").trim();
}
export function cardVersionLabel(value) { return text(value).replace(/Reverse Holofoil/ig, "Reverse Holo").replace(/Holofoil/ig, "Holo"); }
export function cardVersionOf(row = {}) {
  const key=cardVersionKey(row.variant || row.finish || row.priceSubtype || row.cardVariant || row.printing),edition=cardVersionKey(row.edition);
  const printing=/^(1st edition|unlimited)$/.test(edition)?edition:"";
  const embedded=key.match(/^(1st edition|unlimited)(?:\s|$)/)?.[1];
  if(printing&&embedded&&printing!==embedded)return "edition conflict";
  if(printing&&!embedded&&key)return `${printing}${key==="normal"?"":` ${key}`}`;
  return key;
}
const validPrice = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function buildCardVersionIndex(quoteRows = []) {
  const byProduct = new Map();
  for (const row of quoteRows) {
    const productId = text(row.tcgplayerProductId || row.sourceProductId), variant = text(row.variant || row.subTypeName), key = cardVersionKey(variant);
    if (!productId || !key || row.catalogType === "sealed" || !variant || (row.currency && row.currency !== "USD")) continue;
    const option = { key, variant, label: cardVersionLabel(variant), marketPrice: validPrice(row.marketPrice) ? row.marketPrice : null, currency: "USD", source: row.source || "TCGCSV", checkedAt: row.priceCheckedAt || row.timestamp || "", sourceUpdatedAt: row.sourceUpdatedAt || "" };
    if (!byProduct.has(productId)) byProduct.set(productId, new Map());
    const versions = byProduct.get(productId), old = versions.get(key);
    const date = value => Date.parse(value) || 0;
    if (!old || (option.marketPrice !== null && (old.marketPrice === null || date(option.checkedAt) > date(old.checkedAt)))) versions.set(key, option);
  }
  const order = key => key === "normal" ? 0 : key === "holo" ? 1 : key === "reverse holo" ? 2 : 3;
  return new Map([...byProduct].map(([id, versions]) => [id, [...versions.values()].sort((a,b) => order(a.key)-order(b.key) || a.label.localeCompare(b.label))]));
}

export function cardVersionProduct(product, option) {
  if (!option) return product;
  const next = { ...product, variant: option.variant, finish: option.variant, priceSubtype: option.variant, marketSource: option.source, marketStatus: option.marketPrice === null ? "unknown" : "cached", priceCheckedAt: option.checkedAt, marketLastUpdated: option.checkedAt };
  const edition=option.edition || (option.key.startsWith("1st edition")?"1st Edition":option.key.startsWith("unlimited")?"Unlimited":"");
  if(edition)next.edition=edition;else delete next.edition;
  // A missing quote for one version must never inherit another version's value.
  for (const field of ["marketPrice", "marketValueRaw", "marketValueNearMint", "lowPrice", "midPrice", "highPrice"]) delete next[field];
  if (validPrice(option.marketPrice)) next.marketPrice = option.marketPrice;
  return next;
}

export function cardVersionQuantity(records, option) {
  let quantity = 0;
  for (const record of records) {
    if (cardVersionOf(record) !== option.key) continue;
    const count = Number(record.quantity ?? 1);
    if (Number.isSafeInteger(count) && count > 0) { quantity += count; if (!Number.isSafeInteger(quantity)) return null; }
  }
  return quantity;
}
