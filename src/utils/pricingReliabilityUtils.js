export const PRICE_SOURCE_TYPES = [
  "catalog",
  "manual",
  "msrp",
  "market",
  "planned",
  "sale_record",
  "unknown",
  "imported",
  "fallback",
];

export const PRICE_CONFIDENCE_LABELS = [
  "Known",
  "Estimated",
  "Manual",
  "Stale",
  "Missing",
  "Needs Review",
];

export const STALE_PRICE_REVIEW_DAYS = 45;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePriceNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const cleaned = typeof value === "string" ? value.replace(/[$,%\s,]/g, "") : value;
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function hasKnownPriceValue(value) {
  const number = normalizePriceNumber(value);
  return number !== null && number > 0;
}

function firstValue(record = {}, keys = []) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function firstNumber(record = {}, keys = []) {
  for (const key of keys) {
    const value = normalizePriceNumber(record?.[key]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

export function normalizePriceSource(value = "", fallback = "unknown") {
  const key = normalizeKey(value);
  if (!key) return fallback;
  if (PRICE_SOURCE_TYPES.includes(key)) return key;
  if (/planned|listing|listed|asking/.test(key)) return "planned";
  if (/sale_record|sold|transaction|order|final_sale/.test(key)) return "sale_record";
  if (/msrp|retail/.test(key)) return "msrp";
  if (/manual|admin|user|custom|override|review/.test(key)) return "manual";
  if (/tcgcsv|pokemon_tcg|api|import|imported|supabase|csv|external/.test(key)) return "imported";
  if (/catalog|tidetradr|cache|cached|live/.test(key)) return "catalog";
  if (/market|price_feed|reference/.test(key)) return "market";
  if (/fallback|mock|estimated|placeholder|unknown/.test(key)) return "fallback";
  return fallback;
}

function daysBetween(dateValue, now = new Date()) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime()) || Number.isNaN(current.getTime())) return null;
  return Math.floor((current.getTime() - date.getTime()) / 86400000);
}

export function classifyPriceConfidence({
  value,
  source = "unknown",
  updatedAt = "",
  reviewedAt = "",
  needsReview = false,
  staleAfterDays = STALE_PRICE_REVIEW_DAYS,
  now = new Date(),
} = {}) {
  const number = normalizePriceNumber(value);
  if (number === null || number <= 0) return "Missing";
  const normalizedSource = normalizePriceSource(source);
  const ageDays = daysBetween(reviewedAt || updatedAt, now);
  if (needsReview) return "Needs Review";
  if (ageDays !== null && ageDays > staleAfterDays) return "Stale";
  if (normalizedSource === "manual") return "Manual";
  if (normalizedSource === "fallback" || normalizedSource === "unknown") return "Needs Review";
  if (normalizedSource === "market" || normalizedSource === "imported" || normalizedSource === "catalog") return "Estimated";
  return "Known";
}

export function priceConfidenceTone(confidence = "") {
  const label = String(confidence || "");
  if (label === "Known") return "success";
  if (label === "Estimated") return "info";
  if (label === "Manual") return "manual";
  if (label === "Stale" || label === "Needs Review") return "warning";
  if (label === "Missing") return "missing";
  return "info";
}

function defaultMoney(value) {
  if (!hasKnownPriceValue(value)) return "Unknown";
  return `$${Number(value).toFixed(2)}`;
}

export function formatPriceDisplay(value, { moneyFormatter = defaultMoney, missingLabel = "Unknown" } = {}) {
  const number = normalizePriceNumber(value);
  if (number === null || number <= 0) return missingLabel;
  return moneyFormatter(number);
}

function priceRoleSource(item = {}, role = "market") {
  if (role === "market") {
    return firstValue(item, [
      "marketPriceSource",
      "market_price_source",
      "marketValueSource",
      "market_value_source",
      "marketSource",
      "market_source",
      "marketStatus",
      "market_status",
      "externalProductSource",
      "external_product_source",
      "sourceType",
      "source_type",
      "source",
    ]);
  }
  if (role === "msrp") return firstValue(item, ["msrpSource", "msrp_source"]) || "msrp";
  if (role === "planned") return firstValue(item, ["plannedSalePriceSource", "planned_sale_price_source", "salePriceSource", "sale_price_source"]) || "manual";
  if (role === "sale") return firstValue(item, ["saleSource", "sale_source", "platform"]) || "sale_record";
  if (role === "cost") return firstValue(item, ["costSource", "cost_source", "purchaseSource", "purchase_source", "sourceType", "source_type"]) || "manual";
  return "unknown";
}

function priceRoleUpdatedAt(item = {}, role = "market") {
  if (role === "market") {
    return firstValue(item, [
      "marketPriceReviewedAt",
      "market_price_reviewed_at",
      "marketValueUpdatedAt",
      "market_value_updated_at",
      "lastPriceChecked",
      "last_price_checked",
      "marketLastUpdated",
      "market_last_updated",
      "updatedAt",
      "updated_at",
    ]);
  }
  if (role === "planned") {
    return firstValue(item, [
      "plannedSalePriceReviewedAt",
      "planned_sale_price_reviewed_at",
      "plannedSalePriceUpdatedAt",
      "planned_sale_price_updated_at",
      "updatedAt",
      "updated_at",
    ]);
  }
  if (role === "msrp") return firstValue(item, ["msrpUpdatedAt", "msrp_updated_at", "lastPriceChecked", "last_price_checked", "updatedAt", "updated_at"]);
  if (role === "cost") return firstValue(item, ["purchaseDate", "purchase_date", "createdAt", "created_at", "updatedAt", "updated_at"]);
  return firstValue(item, ["updatedAt", "updated_at"]);
}

function priceRoleReviewedAt(item = {}, role = "market") {
  if (role === "market") return firstValue(item, ["marketPriceReviewedAt", "market_price_reviewed_at", "priceReviewedAt", "price_reviewed_at"]);
  if (role === "planned") return firstValue(item, ["plannedSalePriceReviewedAt", "planned_sale_price_reviewed_at", "priceReviewedAt", "price_reviewed_at"]);
  return "";
}

export function priceValueForRole(item = {}, role = "market") {
  if (role === "market") return firstNumber(item, ["marketPrice", "market_price", "marketValue", "market_value", "estimatedMarketValue", "estimated_market_value"]);
  if (role === "msrp") return firstNumber(item, ["msrpPrice", "msrp_price", "msrp", "retailPrice", "retail_price"]);
  if (role === "planned") return firstNumber(item, ["salePrice", "sale_price", "plannedSalePrice", "planned_sale_price", "plannedPrice", "planned_price", "listedPrice", "listed_price"]);
  if (role === "cost") return firstNumber(item, ["unitCost", "unit_cost", "costPaid", "cost_paid", "purchasePrice", "purchase_price", "costEach", "cost_each"]);
  if (role === "sale") return firstNumber(item, ["finalSalePrice", "final_sale_price", "salePrice", "sale_price", "grossSale", "gross_sale"]);
  return null;
}

export function buildPriceReviewFields(item = {}, { context = "forge", now = new Date(), moneyFormatter = defaultMoney } = {}) {
  const roleDefinitions = [
    { key: "unit_cost", role: "cost", label: "Unit cost", missingLabel: "Not set", helper: "Cost basis stays separate from market value." },
    { key: "msrp", role: "msrp", label: "MSRP", missingLabel: "MSRP unknown", helper: "Manufacturer or retail reference when known." },
    { key: "market_value", role: "market", label: "Market value", missingLabel: "Market value missing", helper: "Estimated or reviewed value, never guaranteed." },
    { key: "planned_sale", role: "planned", label: "Planned sale price", missingLabel: "Not set", helper: context === "forge" ? "Your planning price for sellable inventory." : "Optional planning value if this moves to Forge." },
  ];

  return roleDefinitions.map((definition) => {
    const value = priceValueForRole(item, definition.role);
    const source = normalizePriceSource(priceRoleSource(item, definition.role), definition.role === "planned" || definition.role === "cost" ? "manual" : "unknown");
    const updatedAt = priceRoleUpdatedAt(item, definition.role);
    const reviewedAt = priceRoleReviewedAt(item, definition.role);
    const confidence = classifyPriceConfidence({
      value,
      source,
      updatedAt,
      reviewedAt,
      needsReview: Boolean(
        item.priceNeedsReview ||
        item.price_needs_review ||
        (definition.role === "market" && (item.marketPriceNeedsReview || item.market_price_needs_review))
      ),
      now,
    });
    return {
      ...definition,
      value,
      source,
      sourceLabel: source.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      confidence,
      tone: priceConfidenceTone(confidence),
      updatedAt,
      reviewedAt,
      displayValue: formatPriceDisplay(value, { moneyFormatter, missingLabel: definition.missingLabel }),
      isMissing: confidence === "Missing",
      isManual: confidence === "Manual",
      isStale: confidence === "Stale",
      needsReview: confidence === "Needs Review" || confidence === "Stale",
    };
  });
}

function inventoryEntries(itemOrEntries = []) {
  if (Array.isArray(itemOrEntries)) return itemOrEntries.filter(Boolean);
  if (Array.isArray(itemOrEntries?.rawItems) && itemOrEntries.rawItems.length) return itemOrEntries.rawItems.filter(Boolean);
  return itemOrEntries ? [itemOrEntries] : [];
}

export function buildPriceReliabilitySummary(items = [], { context = "forge", now = new Date() } = {}) {
  const entries = items.flatMap((item) => inventoryEntries(item));
  const summary = {
    context,
    totalRecords: entries.length,
    missingMarketValueCount: 0,
    missingPlannedSalePriceCount: 0,
    manualPriceCount: 0,
    stalePriceCount: 0,
    needsReviewPriceCount: 0,
    knownCostCount: 0,
    knownMarketValueCount: 0,
    knownCostPercent: 0,
    knownMarketValuePercent: 0,
    confidenceSummary: entries.length ? "Partial coverage" : "No inventory yet",
  };

  entries.forEach((item) => {
    const fields = buildPriceReviewFields(item, { context, now });
    const cost = fields.find((field) => field.role === "cost");
    const market = fields.find((field) => field.role === "market");
    const planned = fields.find((field) => field.role === "planned");
    if (cost && !cost.isMissing) summary.knownCostCount += 1;
    if (market && !market.isMissing) summary.knownMarketValueCount += 1;
    if (!market || market.isMissing) summary.missingMarketValueCount += 1;
    if (context === "forge" && (!planned || planned.isMissing)) summary.missingPlannedSalePriceCount += 1;
    fields
      .filter((field) => ["market", "planned", "msrp"].includes(field.role))
      .forEach((field) => {
        if (field.isManual) summary.manualPriceCount += 1;
        if (field.isStale) summary.stalePriceCount += 1;
        if (field.needsReview) summary.needsReviewPriceCount += 1;
      });
  });

  if (summary.totalRecords > 0) {
    summary.knownCostPercent = Math.round((summary.knownCostCount / summary.totalRecords) * 100);
    summary.knownMarketValuePercent = Math.round((summary.knownMarketValueCount / summary.totalRecords) * 100);
    if (summary.knownMarketValuePercent >= 80 && summary.needsReviewPriceCount === 0) summary.confidenceSummary = "Strong coverage";
    else if (summary.knownMarketValuePercent >= 50) summary.confidenceSummary = "Partial coverage";
    else summary.confidenceSummary = "Needs review";
  }

  return summary;
}

export function buildPriceReliabilityCards(summary = {}) {
  return [
    { key: "missing_market", label: "Missing market value", value: Number(summary.missingMarketValueCount || 0), helper: "Unknown values stay out of estimates." },
    { key: "manual_prices", label: "Manual prices", value: Number(summary.manualPriceCount || 0), helper: "User/admin-entered values are labeled." },
    { key: "needs_review", label: "Needs review", value: Number(summary.needsReviewPriceCount || 0), helper: `${Number(summary.stalePriceCount || 0)} stale price(s)` },
    { key: "known_cost", label: "Known cost", value: `${Number(summary.knownCostPercent || 0)}%`, helper: `${Number(summary.knownCostCount || 0)}/${Number(summary.totalRecords || 0)} records` },
    { key: "known_market", label: "Known market", value: `${Number(summary.knownMarketValuePercent || 0)}%`, helper: summary.confidenceSummary || "Price coverage" },
    ...(summary.context === "forge"
      ? [{ key: "missing_planned", label: "Missing planned price", value: Number(summary.missingPlannedSalePriceCount || 0), helper: "Forge planning only" }]
      : []),
  ];
}

export function buildMarketValueReviewPatch(entry = {}, nextValue = 0, { note = "", changedAt = new Date().toISOString() } = {}) {
  const previousValue = priceValueForRole(entry, "market") || 0;
  const reviewEntry = {
    value: nextValue,
    previousValue,
    note: cleanText(note),
    changedAt,
    source: "manual_review",
  };
  return {
    marketPrice: nextValue,
    marketValue: nextValue,
    marketValueSource: "manual",
    marketPriceSource: "manual",
    marketPriceConfidence: "Manual",
    marketPriceReviewedAt: changedAt,
    marketValueUpdatedAt: changedAt,
    lastPriceChecked: changedAt,
    priceNeedsReview: false,
    priceReviewNote: cleanText(note),
    marketPriceReviewHistory: [
      ...(Array.isArray(entry.marketPriceReviewHistory) ? entry.marketPriceReviewHistory : []),
      reviewEntry,
    ],
    updatedAt: changedAt,
  };
}

export function buildPlannedPriceReviewPatch(entry = {}, nextValue = 0, { note = "", changedAt = new Date().toISOString() } = {}) {
  const previousValue = priceValueForRole(entry, "planned") || 0;
  return {
    salePrice: nextValue,
    plannedSalePrice: nextValue,
    planned_sale_price: nextValue,
    plannedSalePriceSource: "manual",
    plannedSalePriceConfidence: "Manual",
    plannedSalePriceReviewedAt: changedAt,
    plannedSalePriceHistory: [
      ...(Array.isArray(entry.plannedSalePriceHistory) ? entry.plannedSalePriceHistory : []),
      {
        price: nextValue,
        previousPrice: previousValue,
        note: cleanText(note),
        changedAt,
        source: "manual_review",
      },
    ],
    updatedAt: changedAt,
  };
}

export function buildInventoryPriceReliabilityExportRows(summary = {}, { sectionPrefix = "Price reliability" } = {}) {
  const reliability = summary.priceReliabilitySummary || summary;
  return [
    { section: sectionPrefix, label: "Missing market value", value: reliability.missingMarketValueCount || 0, count: reliability.totalRecords || 0, notes: "Unknown market values are excluded from estimates." },
    { section: sectionPrefix, label: "Manual price records", value: reliability.manualPriceCount || 0, count: reliability.totalRecords || 0, notes: "Manual prices are user/admin-entered and should be reviewed when needed." },
    { section: sectionPrefix, label: "Needs price review", value: reliability.needsReviewPriceCount || 0, count: reliability.totalRecords || 0, notes: `${reliability.stalePriceCount || 0} stale price record(s).` },
    { section: sectionPrefix, label: "Known cost coverage", value: reliability.knownCostPercent || 0, count: reliability.knownCostCount || 0, notes: `${reliability.knownCostCount || 0}/${reliability.totalRecords || 0} records with tracked cost.` },
    { section: sectionPrefix, label: "Known market coverage", value: reliability.knownMarketValuePercent || 0, count: reliability.knownMarketValueCount || 0, notes: reliability.confidenceSummary || "Valuation coverage summary." },
    ...(reliability.context === "forge"
      ? [{ section: sectionPrefix, label: "Missing planned sale price", value: reliability.missingPlannedSalePriceCount || 0, count: reliability.totalRecords || 0, notes: "Planned sale price is separate from market value." }]
      : []),
  ];
}

export function buildMarketplacePriceWarning({ askingPrice, listingType = "" } = {}, { marketValue, msrp } = {}) {
  const price = normalizePriceNumber(askingPrice);
  const freeOrTrade = /\b(free|trade|donation|looking)\b/i.test(String(listingType || ""));
  if (price === null || price <= 0 || freeOrTrade) return "";
  const knownMarket = normalizePriceNumber(marketValue);
  const knownMsrp = normalizePriceNumber(msrp);
  const reference = knownMarket && knownMarket > 0 ? knownMarket : knownMsrp && knownMsrp > 0 ? knownMsrp : null;
  if (!reference) return "";
  if (price > reference * 1.5) return "Double-check this price. It looks far from known MSRP/market values.";
  if (price < reference * 0.25) return "Double-check this price. It looks unusually low and may be a typo.";
  return "";
}

export function buildDropRadarPriceDisplay(product = {}, { moneyFormatter = defaultMoney } = {}) {
  const msrp = priceValueForRole(product, "msrp");
  const market = priceValueForRole(product, "market");
  return {
    msrp,
    market,
    msrpDisplay: formatPriceDisplay(msrp, { moneyFormatter, missingLabel: "MSRP unknown" }),
    marketDisplay: formatPriceDisplay(market, { moneyFormatter, missingLabel: "Market value unknown" }),
    labels: [
      msrp ? { key: "msrp", label: "MSRP Known", tone: "info" } : { key: "msrp_missing", label: "MSRP unknown", tone: "missing" },
      market ? { key: "market", label: "Market value known", tone: "info" } : { key: "market_missing", label: "Market value missing", tone: "missing" },
    ],
  };
}
