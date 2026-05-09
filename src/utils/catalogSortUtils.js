export const CATALOG_SORT_OPTIONS = [
  { value: "bestMatch", label: "Best Match" },
  { value: "setAsc", label: "Set A-Z" },
  { value: "nameAsc", label: "Name A-Z" },
  { value: "cardNumber", label: "Card Number" },
  { value: "marketHigh", label: "Market Price High-Low" },
  { value: "marketLow", label: "Market Price Low-High" },
  { value: "recentlyChecked", label: "Recently Checked" },
];

export function parseCardNumberParts(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      prefix: "",
      sort: null,
      suffix: "",
      printedTotal: null,
      missingSort: 1,
    };
  }

  const firstPart = raw.split("/")[0] || raw;
  const prefix = (firstPart.match(/^[A-Za-z]+/)?.[0] || "").toUpperCase();
  const firstNumber = raw.match(/\d+/)?.[0] || "";
  const suffix = (firstPart.match(/^[A-Za-z]*\d+\s*([A-Za-z]+)$/)?.[1] || "").toUpperCase();
  const totalText = (raw.split("/")[1] || "").match(/\d+/)?.[0] || "";

  return {
    prefix,
    sort: firstNumber ? Number(firstNumber) : null,
    suffix,
    printedTotal: totalText ? Number(totalText) : null,
    missingSort: firstNumber ? 0 : 1,
  };
}

function lower(value) {
  return String(value || "").toLowerCase();
}

export function getCatalogGroup(product = {}) {
  const catalogType = lower(product.catalogType || product.catalog_type);
  const productType = lower(product.productType || product.product_type);
  const isSealedValue = product.isSealed ?? product.is_sealed;
  const isSealed =
    isSealedValue === true ||
    isSealedValue === "true" ||
    catalogType === "sealed" ||
    /(sealed|booster|elite trainer|box|tin|collection|bundle|pack)/i.test(productType);

  if (isSealed) return { label: "Sealed", sort: 1 };
  if (catalogType === "card" || productType.includes("card") || product.cardNumber || product.card_number || product.rarity) {
    return { label: "Cards", sort: 2 };
  }
  return { label: "Other", sort: 3 };
}

export function getCatalogSetSortName(product = {}) {
  return String(product.setSortName || product.set_sort_name || product.setName || product.set_name || product.expansion || "Unknown Set").trim();
}

export function getCatalogTitle(product = {}) {
  return String(
    product.catalogType === "card" || product.catalog_type === "card"
      ? product.cardName || product.card_name || product.name || "Unknown card"
      : product.productName || product.product_name || product.name || "Unknown product"
  ).trim();
}

export function getCardSortMeta(product = {}) {
  const parsed = parseCardNumberParts(product.cardNumber || product.card_number);
  const sortValue = Number(product.cardNumberSort ?? product.card_number_sort ?? parsed.sort);
  const printedTotal = Number(product.printedTotal ?? product.printed_total ?? parsed.printedTotal);
  return {
    prefix: String(product.cardNumberPrefix ?? product.card_number_prefix ?? parsed.prefix ?? "").toUpperCase(),
    sort: Number.isFinite(sortValue) ? sortValue : null,
    suffix: String(product.cardNumberSuffix ?? product.card_number_suffix ?? parsed.suffix ?? "").toUpperCase(),
    printedTotal: Number.isFinite(printedTotal) ? printedTotal : null,
    missingSort: product.cardNumber || product.card_number || Number.isFinite(sortValue) ? 0 : 1,
    raw: String(product.cardNumber || product.card_number || ""),
  };
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function compareCardNumber(a, b) {
  const aMeta = getCardSortMeta(a);
  const bMeta = getCardSortMeta(b);
  return (
    aMeta.missingSort - bMeta.missingSort ||
    compareText(aMeta.prefix, bMeta.prefix) ||
    (aMeta.sort ?? 999999) - (bMeta.sort ?? 999999) ||
    compareText(aMeta.suffix, bMeta.suffix) ||
    compareText(aMeta.raw, bMeta.raw)
  );
}

export function compareCatalogProducts(a = {}, b = {}, sortKey = "typeSetNumber") {
  const aMarket = Number(a.marketPrice ?? a.market_price ?? a.marketValue ?? a.market_value ?? 0);
  const bMarket = Number(b.marketPrice ?? b.market_price ?? b.marketValue ?? b.market_value ?? 0);
  const aGroup = getCatalogGroup(a);
  const bGroup = getCatalogGroup(b);
  const aSet = getCatalogSetSortName(a);
  const bSet = getCatalogSetSortName(b);
  const aTitle = getCatalogTitle(a);
  const bTitle = getCatalogTitle(b);

  if (sortKey === "nameAsc") return compareText(aTitle, bTitle);
  if (sortKey === "marketHigh") return bMarket - aMarket || compareText(aTitle, bTitle);
  if (sortKey === "marketLow") return aMarket - bMarket || compareText(aTitle, bTitle);
  if (sortKey === "recentlyChecked") {
    return new Date(b.lastPriceChecked || b.last_price_checked || b.updatedAt || b.updated_at || 0) - new Date(a.lastPriceChecked || a.last_price_checked || a.updatedAt || a.updated_at || 0) || compareText(aTitle, bTitle);
  }
  if (sortKey === "setAsc" || sortKey === "cardNumber") {
    return (
      compareText(aSet, bSet) ||
      aGroup.sort - bGroup.sort ||
      (aGroup.label === "Cards" && bGroup.label === "Cards" ? compareCardNumber(a, b) : 0) ||
      compareText(aTitle, bTitle)
    );
  }

  return (
    aGroup.sort - bGroup.sort ||
    compareText(aSet, bSet) ||
    (aGroup.label === "Cards" && bGroup.label === "Cards" ? compareCardNumber(a, b) : 0) ||
    compareText(aTitle, bTitle)
  );
}

export function applyCatalogDbSort(query, sortKey = "bestMatch", useBrowseView = true) {
  if (sortKey === "nameAsc") {
    return query.order("name", { ascending: true, nullsFirst: false });
  }
  if (sortKey === "marketHigh") {
    return query.order("market_price", { ascending: false, nullsFirst: false }).order("name", { ascending: true, nullsFirst: false });
  }
  if (sortKey === "marketLow") {
    return query.order("market_price", { ascending: true, nullsFirst: false }).order("name", { ascending: true, nullsFirst: false });
  }
  if (sortKey === "recentlyChecked") {
    return query.order("last_price_checked", { ascending: false, nullsFirst: false }).order("name", { ascending: true, nullsFirst: false });
  }

  if (useBrowseView) {
    const base = sortKey === "setAsc" || sortKey === "cardNumber"
      ? query
          .order("set_sort_name", { ascending: true, nullsFirst: false })
          .order("catalog_group_sort", { ascending: true, nullsFirst: false })
      : query
          .order("catalog_group_sort", { ascending: true, nullsFirst: false })
          .order("set_sort_name", { ascending: true, nullsFirst: false });
    return base
      .order("card_number_missing_sort", { ascending: true, nullsFirst: false })
      .order("card_prefix_sort", { ascending: true, nullsFirst: false })
      .order("card_number_sort_safe", { ascending: true, nullsFirst: false })
      .order("card_number", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true, nullsFirst: false });
  }

  const base = sortKey === "setAsc" || sortKey === "cardNumber"
    ? query.order("set_name", { ascending: true, nullsFirst: false }).order("is_sealed", { ascending: false, nullsFirst: false })
    : query.order("is_sealed", { ascending: false, nullsFirst: false }).order("set_name", { ascending: true, nullsFirst: false });
  return base
    .order("card_number_prefix", { ascending: true, nullsFirst: false })
    .order("card_number_sort", { ascending: true, nullsFirst: false })
    .order("card_number", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true, nullsFirst: false });
}
