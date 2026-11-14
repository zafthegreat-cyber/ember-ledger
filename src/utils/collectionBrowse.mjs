import { cardVersionKey, cardVersionLabel } from "./cardVersions.mjs";
import { collectionCopyDetails } from "./collectionCopyDetails.mjs";
import { getPortfolioItemValuation } from "./collectionPortfolio.mjs";
import { filterSetCatalogEntries, setCatalogName, setCatalogNumber } from "./setCatalog.mjs";

const text = value => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const first = (item, fields) => fields.map(field => text(item[field])).find(Boolean) || "";
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
function quoteDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))?$/.test(value)) return "";
  const date = new Date(`${value.slice(0,10)}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value.slice(0,10) && timestamp(value) !== null ? value : "";
}

// Only quote-specific timestamps describe a quote. Generic record updatedAt
// and today's date must never turn an old estimate into a fresh market price.
export function savedPriceMetadata(item = {}) {
  const valuation = getPortfolioItemValuation(item);
  const projected = valuation.source === "projected";
  const manual = [item.marketValueSource,item.market_value_source,item.marketStatus].some(value => String(value || "").toLowerCase() === "manual");
  const source = projected ? "Saved projected estimate" : manual ? "Manual saved estimate" : first(item, ["marketSource", "priceSource", "priceProvider"]);
  const raw = first(item, projected ? ["projectedPriceUpdatedAt", "projectedResaleUpdatedAt"] : manual ? ["manualPriceUpdatedAt","marketValueUpdatedAt","market_value_updated_at"] : ["priceCheckedAt", "marketLastUpdated", "priceUpdatedAt","lastPriceChecked","last_price_checked"]);
  return { source, checkedAt: quoteDate(raw) };
}

export function priceMetadataLabel(items = []) {
  const values = items.map(savedPriceMetadata);
  const sources = [...new Set(values.map(row => row.source).filter(Boolean))];
  const dates = [...new Set(values.map(row => row.checkedAt).filter(Boolean))];
  if (!sources.length && !dates.length) return "";
  const source = sources.length > 1 ? "Mixed saved sources" : sources[0] || "Saved price";
  const dateOnly = dates[0]?.length === 10;
  const date = dates.length === 1 && values.every(row => row.checkedAt === dates[0])
    ? `${["Saved projected estimate","Manual saved estimate"].includes(source) ? "Recorded" : "Checked"} ${new Date(dateOnly ? `${dates[0]}T12:00:00` : dates[0]).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", ...(!dateOnly ? {hour: "numeric", minute: "2-digit"} : {}) })}`
    : dates.length ? "Check dates vary or are incomplete" : "Check date not recorded";
  return `${source} · ${date}`;
}

export function copyRecognition(record = {}, { hidden = false } = {}) {
  const date = first(record, ["purchaseDate", "purchase_date", "acquisitionDate"]);
  const parsed = date && timestamp(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date);
  const dateLabel = parsed !== null && parsed !== "" ? new Date(parsed).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Date not recorded";
  const { storage, identity } = collectionCopyDetails(record);
  const rawCost = record.allocatedItemCost ?? record.allocatedCost ?? record.totalPurchaseCost ?? record.purchasePrice ?? record.actualPurchasePrice;
  const cost = rawCost !== "" && rawCost != null && Number.isFinite(Number(rawCost)) ? Number(rawCost) : null;
  const currency = record.purchaseCurrency || record.costCurrency || "USD";
  let costLabel = "Cost not recorded";
  if (hidden) costLabel = "Cost hidden";
  else if (cost !== null) {
    try { costLabel = new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cost); }
    catch { costLabel = `${cost} ${currency}`; }
  }
  return { title: `${dateLabel} · ${storage || "Storage not recorded"}`, detail: [costLabel, identity].filter(Boolean).join(" · ") };
}

export function sortCollectionGroups(groups, sort = "name") {
  const name = group => group.item.name || group.item.title || group.item.cardName || group.item.productName || "";
  const recent = group => Math.max(0, ...group.records.map(row => timestamp(row.createdAt || row.created_at || row.addedAt) || 0));
  return [...groups].sort((a, b) => {
    const result = sort === "value" ? (b.valuation.value ?? -1) - (a.valuation.value ?? -1)
      : sort === "quantity" ? b.quantity - a.quantity
        : sort === "recent" ? recent(b) - recent(a)
          : sort === "set" ? collator.compare(a.item.setName || a.item.set_name || "", b.item.setName || b.item.set_name || "") : 0;
    return result || collator.compare(name(a), name(b)) || a.key.localeCompare(b.key);
  });
}

export function catalogFinishOptions(entries) {
  const options = new Map();
  for (const { product } of entries) for (const raw of [product.variant || product.finish || product.priceSubtype, ...(product.versions || []).map(row => row.variant || row.label)]) {
    const key = cardVersionKey(raw);
    if (key) options.set(key, { value: key, label: cardVersionLabel(raw) });
  }
  return [...options.values()].sort((a, b) => collator.compare(a.label, b.label));
}

export function browseSetCatalog(entries, { ownership = "all", finish = "all", sort = "number", ...filters } = {}) {
  return filterSetCatalogEntries(entries, { ...filters, ownedOnly: ownership === "owned" || filters.ownedOnly })
    .filter(entry => ownership !== "missing" || !entry.owned)
    .filter(entry => finish === "all" || catalogFinishOptions([entry]).some(option => option.value === finish))
    .sort((a, b) => (sort === "rarity" ? collator.compare(a.product.rarity || "", b.product.rarity || "") : sort === "name" ? collator.compare(setCatalogName(a.product), setCatalogName(b.product)) : (a.kind === "card" ? 0 : 1) - (b.kind === "card" ? 0 : 1) || collator.compare(setCatalogNumber(a.product), setCatalogNumber(b.product))) || collator.compare(setCatalogName(a.product), setCatalogName(b.product)) || a.key.localeCompare(b.key));
}

// Catalog matching is identity-only. Original IDs, quantities, acquisition
// details and all saved quote/value fields remain exactly as recorded.
export function catalogMatchIdentityPatch(product) {
  const catalogId = product.id || product.catalogProductId;
  const next = catalogId ? { catalogProductId: String(catalogId) } : {};
  for (const field of ["name", "setName", "cardNumber", "tcgGame", "tcgplayerProductId", "language", "edition", "variant", "finish", "printing", "productClassification", "imageUrl", "photoUrl"]) {
    if (product[field] !== undefined && product[field] !== "") next[field] = product[field];
  }
  return next;
}

export function buildCatalogMatchDraft(record, product) {
  return { ...record, ...catalogMatchIdentityPatch(product) };
}
