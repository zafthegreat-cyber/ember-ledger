import { getCardSortMeta } from "./catalogSortUtils.js";

const UNKNOWN_SET_KEY = "set:unknown";

const SET_NAME_FIELDS = [
  "expansionOfficialName",
  "expansion_official_name",
  "expansionDisplayName",
  "expansion_display_name",
  "setName",
  "set_name",
  "expansion",
];

const SET_ID_FIELDS = [
  "setId",
  "set_id",
  "expansionId",
  "expansion_id",
  "setCode",
  "set_code",
  "expansionCode",
  "expansion_code",
  "set",
];

const PRODUCT_ID_FIELDS = [
  "catalogProductId",
  "catalog_product_id",
  "productId",
  "product_id",
  "externalProductId",
  "external_product_id",
  "tcgplayerProductId",
  "tcgplayer_product_id",
  "tcgPlayerProductId",
  "id",
];

function firstField(source = {}, fields = []) {
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function textKey(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactKey(value = "") {
  return textKey(value).replace(/\s+/g, "-");
}

function productTitle(source = {}) {
  return String(
    source.cardName ||
    source.card_name ||
    source.productName ||
    source.product_name ||
    source.itemName ||
    source.item_name ||
    source.name ||
    source.title ||
    ""
  ).trim();
}

function catalogText(source = {}) {
  return textKey([
    productTitle(source),
    source.productType,
    source.product_type,
    source.sealedProductType,
    source.sealed_product_type,
    source.productKind,
    source.product_kind,
    source.catalogType,
    source.catalog_type,
    source.category,
    source.status,
    source.vaultStatus,
    source.vault_status,
    source.condition,
    source.conditionName,
    source.condition_name,
    source.notes,
  ].filter(Boolean).join(" "));
}

function explicitSetName(source = {}) {
  return firstField(source, SET_NAME_FIELDS);
}

function explicitSetId(source = {}) {
  return firstField(source, SET_ID_FIELDS);
}

function explicitSetAliases(source = {}) {
  return [
    explicitSetId(source),
    explicitSetName(source),
    source.name,
    source.code,
    ...(Array.isArray(source.setAliases) ? source.setAliases : []),
    ...(Array.isArray(source.set_aliases) ? source.set_aliases : []),
  ].filter(Boolean).map(textKey).filter(Boolean);
}

function explicitProductKey(source = {}) {
  const key = firstField(source, PRODUCT_ID_FIELDS);
  return key ? compactKey(key) : "";
}

function variantSourceText(source = {}) {
  const details = source.cardDetails || source.card_details || source.tcgCardDetails || source.tcg_card_details || {};
  return textKey([
    source.variantName,
    source.variant_name,
    source.finish,
    source.printing,
    source.priceSubtype,
    source.price_subtype,
    source.conditionName,
    source.condition_name,
    source.rarity,
    details.finish,
    details.printing,
    details.variant,
    details.rarity,
  ].filter(Boolean).join(" "));
}

function cardIdentityKey(source = {}) {
  const productKey = explicitProductKey(source);
  if (productKey) return `product:${productKey}`;
  const cardNumber = getCardNumber(source);
  if (cardNumber) return `number:${compactKey(cardNumber)}`;
  const title = productTitle(source);
  return title ? `title:${compactKey(title)}` : "";
}

function hasCompleteChecklistFlag(source = {}) {
  return Boolean(
    source.checklistComplete ||
    source.checklist_complete ||
    source.fullChecklist ||
    source.full_checklist ||
    source.isFullChecklist ||
    source.is_full_checklist
  );
}

function setTotal(source = {}) {
  const total = Number(source.total ?? source.totalCards ?? source.total_cards ?? source.printedTotal ?? source.printed_total ?? 0);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function significantSetNameForTitleMatch(setName = "") {
  const normalized = textKey(setName);
  if (!normalized) return false;
  const tokens = normalized.split(" ").filter((token) => token.length > 2);
  return normalized.length >= 10 || tokens.length >= 2;
}

function titleContainsSetName(source = {}, setName = "") {
  const setKey = textKey(setName);
  if (!significantSetNameForTitleMatch(setKey)) return false;
  return catalogText(source).includes(setKey);
}

function descriptorForSet(set = {}) {
  const displayName = firstField(set, ["name", ...SET_NAME_FIELDS, "code"]) || "Set unknown";
  const aliases = explicitSetAliases(set);
  const normalizedName = normalizeSetName(displayName);
  const key = getSetKey(set, { fallbackName: displayName });
  return {
    id: set.setId || set.set_id || set.code || set.name || key,
    key,
    name: displayName,
    normalizedName,
    series: set.series || "",
    releaseDate: set.releaseDate || set.release_date || "",
    logoUrl: set.logoUrl || set.logo_url || "",
    symbolUrl: set.symbolUrl || set.symbol_url || "",
    totalCards: setTotal(set),
    checklistComplete: hasCompleteChecklistFlag(set),
    aliases: [...new Set([key.replace(/^set:/, ""), normalizedName, ...aliases].filter(Boolean))],
    source: set,
  };
}

function getRecordSetAlias(record = {}) {
  const name = explicitSetName(record);
  const id = explicitSetId(record);
  if (id) return compactKey(id);
  if (name) return normalizeSetName(name);
  return "";
}

function buildDescriptors(knownSets = [], records = []) {
  const byKey = new Map();
  knownSets.map(descriptorForSet).forEach((descriptor) => byKey.set(descriptor.key, descriptor));

  records.forEach((record) => {
    const setName = explicitSetName(record);
    if (!setName) return;
    const descriptor = descriptorForSet({
      name: setName,
      code: explicitSetId(record) || setName,
      series: "Catalog",
      total: 0,
    });
    if (!byKey.has(descriptor.key)) byKey.set(descriptor.key, descriptor);
  });

  byKey.set(UNKNOWN_SET_KEY, {
    id: "set-unknown",
    key: UNKNOWN_SET_KEY,
    name: "Set unknown",
    normalizedName: "set unknown",
    series: "",
    releaseDate: "",
    logoUrl: "",
    symbolUrl: "",
    totalCards: 0,
    checklistComplete: false,
    aliases: [],
    source: {},
    unknown: true,
  });

  return [...byKey.values()];
}

function resolveDescriptor(record = {}, descriptors = [], { allowSealedTitleMatch = false } = {}) {
  const alias = getRecordSetAlias(record);
  if (alias) {
    const match = descriptors.find((descriptor) => descriptor.key.replace(/^set:/, "") === alias || descriptor.aliases.includes(alias));
    if (match) return match;
  }

  if (allowSealedTitleMatch) {
    const match = descriptors.find((descriptor) => !descriptor.unknown && titleContainsSetName(record, descriptor.name));
    if (match) return match;
  }

  return descriptors.find((descriptor) => descriptor.key === UNKNOWN_SET_KEY);
}

function uniqueBy(records = [], getKey) {
  const seen = new Set();
  return records.filter((record) => {
    const key = getKey(record);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recordReferenceMatches(record = {}, item = {}) {
  if (!record || !item) return false;
  const recordId = String(record.id || record.itemId || record.item_id || "").trim();
  const itemId = String(item.id || item.itemId || item.item_id || "").trim();
  if (recordId && itemId && recordId === itemId) return true;

  const recordProduct = explicitProductKey(record);
  const itemProduct = explicitProductKey(item);
  if (recordProduct && itemProduct && recordProduct === itemProduct) return true;

  const recordSet = getSetKey(record);
  const itemSet = getSetKey(item);
  const recordNumber = compactKey(getCardNumber(record));
  const itemNumber = compactKey(getCardNumber(item));
  if (recordSet !== UNKNOWN_SET_KEY && recordSet === itemSet && recordNumber && itemNumber && recordNumber === itemNumber) return true;

  return false;
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

export function normalizeSetName(value = "") {
  return textKey(value);
}

export function getSetKey(record = {}, options = {}) {
  const id = explicitSetId(record);
  if (id) return `set:${compactKey(id)}`;
  const name = explicitSetName(record) || options.fallbackName || "";
  if (name) return `set:${compactKey(name)}`;
  return UNKNOWN_SET_KEY;
}

export function getCardNumber(source = {}) {
  const details = source.cardDetails || source.card_details || source.tcgCardDetails || source.tcg_card_details || {};
  return String(
    source.cardNumber ||
    source.card_number ||
    details.cardNumber ||
    details.card_number ||
    details.number ||
    source.number ||
    ""
  ).trim();
}

export function classifyItemAsSingleOrSealed(source = {}) {
  const text = catalogText(source);
  const catalogType = textKey(source.catalogType || source.catalog_type);
  const productKind = textKey(source.productKind || source.product_kind);
  const sealedFlag = source.isSealed ?? source.is_sealed;
  if (
    sealedFlag === true ||
    sealedFlag === "true" ||
    catalogType === "sealed" ||
    productKind === "sealed product" ||
    /\bsealed\b|\bbooster\b|\belite trainer\b|\betb\b|\bbox\b|\btin\b|\bbundle\b|\bpack\b|\bcollection\b|\bblister\b|\btrainer toolkit\b/.test(text)
  ) {
    return "sealed";
  }
  if (
    catalogType === "card" ||
    productKind === "card" ||
    getCardNumber(source) ||
    source.rarity ||
    /\bsingle card\b|\bindividual card\b|\bpromo card\b|\bgraded card\b|\bslab\b|\bcode card\b/.test(text)
  ) {
    return "single";
  }
  return "unknown";
}

export function getVariantKey(source = {}) {
  if (classifyItemAsSingleOrSealed(source) === "sealed") return "sealed_product";
  const text = variantSourceText(source) || catalogText(source);
  if (/\bpromo\b|\bblack star\b/.test(text)) return "promo";
  if (/\breverse\b/.test(text) && /\bholo\b|\bholofoil\b|\bfoil\b/.test(text)) return "reverse_holo";
  if (/\bholo\b|\bholofoil\b|\bfoil\b/.test(text)) return "holo";
  if (/\bnormal\b|\bregular\b|\bnon holo\b|\bnonholo\b/.test(text)) return "normal";
  return "unknown";
}

export function getVariantLabel(source = {}) {
  const key = typeof source === "string" ? source : getVariantKey(source);
  return {
    normal: "Normal",
    holo: "Holo",
    reverse_holo: "Reverse holo",
    promo: "Promo",
    sealed_product: "Sealed product",
    unknown: "Variant unknown",
  }[key] || "Variant unknown";
}

export function variantMatches(source = {}, filter = "all") {
  if (filter === "all") return true;
  return getVariantKey(source) === filter;
}

export function getOwnedQuantity(records = []) {
  return records.reduce((sum, record) => {
    const quantity = Number(record.quantity ?? record.qty ?? 1);
    return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);
}

export function compareSetMasteryRows(a = {}, b = {}, sortMode = "cardNumber") {
  if (sortMode === "name") {
    return compareText(productTitle(a), productTitle(b));
  }
  const aNumber = getCardNumber(a);
  const bNumber = getCardNumber(b);
  const aMeta = getCardSortMeta({ ...a, cardNumber: aNumber });
  const bMeta = getCardSortMeta({ ...b, cardNumber: bNumber });
  return (
    (aMeta.missingSort ?? 0) - (bMeta.missingSort ?? 0) ||
    compareText(aMeta.prefix, bMeta.prefix) ||
    (aMeta.sort ?? 999999) - (bMeta.sort ?? 999999) ||
    compareText(aMeta.suffix, bMeta.suffix) ||
    compareText(aMeta.raw, bMeta.raw) ||
    compareText(productTitle(a), productTitle(b))
  );
}

export function groupVariantsByCard(records = []) {
  const groups = new Map();
  records.forEach((record) => {
    const key = cardIdentityKey(record) || `record:${groups.size}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        cardNumber: getCardNumber(record),
        title: productTitle(record) || "Unknown card",
        quantity: 0,
        variants: [],
        records: [],
      });
    }
    const group = groups.get(key);
    const variantKey = getVariantKey(record);
    let variant = group.variants.find((entry) => entry.key === variantKey);
    if (!variant) {
      variant = { key: variantKey, label: getVariantLabel(variantKey), quantity: 0, records: [] };
      group.variants.push(variant);
    }
    const quantity = getOwnedQuantity([record]);
    group.quantity += quantity;
    variant.quantity += quantity;
    variant.records.push(record);
    group.records.push(record);
  });
  return [...groups.values()].sort((a, b) => compareSetMasteryRows(a.records[0], b.records[0], "cardNumber"));
}

export function groupItemsBySet(items = [], catalogProducts = [], knownSets = []) {
  const allRecords = [...items, ...catalogProducts];
  const descriptors = buildDescriptors(knownSets, allRecords);
  const groups = new Map(descriptors.map((descriptor) => [descriptor.key, { descriptor, items: [], catalogProducts: [] }]));

  items.forEach((item) => {
    const descriptor = resolveDescriptor(item, descriptors, { allowSealedTitleMatch: classifyItemAsSingleOrSealed(item) === "sealed" });
    groups.get(descriptor.key).items.push(item);
  });

  catalogProducts.forEach((product) => {
    const descriptor = resolveDescriptor(product, descriptors, { allowSealedTitleMatch: classifyItemAsSingleOrSealed(product) === "sealed" });
    groups.get(descriptor.key).catalogProducts.push(product);
  });

  return [...groups.values()].filter((group) => group.items.length || group.catalogProducts.length);
}

export function findSetSummaryForItem(item = {}, setRows = []) {
  if (!item || !setRows.length) return null;
  const directContainer = setRows.find((row) => [
    ...(row.ownedItems || []),
    ...(row.ownedCardItems || []),
    ...(row.ownedSealedItems || []),
    ...(row.wishlistItems || []),
    ...(row.catalogCards || []),
    ...(row.sealedProducts || []),
    ...(row.catalogSealedProducts || []),
  ].some((record) => recordReferenceMatches(record, item)));
  if (directContainer) return directContainer;

  const key = getSetKey(item);
  if (key !== UNKNOWN_SET_KEY) {
    const normalizedName = key.replace(/^set:/, "");
    return setRows.find((row) =>
      row.key === key ||
      compactKey(row.id) === normalizedName ||
      compactKey(row.name) === normalizedName
    ) || null;
  }

  return setRows.find((row) => row.key === UNKNOWN_SET_KEY || row.unknownSet) || null;
}

export function deriveSetCompletionSummary({ items = [], wishlistItems = [], catalogProducts = [], knownSets = [] } = {}) {
  const allRecords = [...items, ...wishlistItems, ...catalogProducts];
  const descriptors = buildDescriptors(knownSets, allRecords);
  const rows = new Map(descriptors.map((descriptor) => [descriptor.key, {
    id: descriptor.id,
    key: descriptor.key,
    name: descriptor.name,
    series: descriptor.series,
    releaseDate: descriptor.releaseDate,
    logoUrl: descriptor.logoUrl,
    symbolUrl: descriptor.symbolUrl,
    totalCards: descriptor.totalCards,
    checklistAvailable: descriptor.checklistComplete,
    unknownSet: Boolean(descriptor.unknown),
    ownedItems: [],
    ownedCardItems: [],
    ownedSealedItems: [],
    wishlistItems: [],
    catalogCards: [],
    catalogSealedProducts: [],
    sealedProducts: [],
    missingCards: [],
  }]));

  items.forEach((item) => {
    const kind = classifyItemAsSingleOrSealed(item);
    const descriptor = resolveDescriptor(item, descriptors, { allowSealedTitleMatch: kind === "sealed" });
    const row = rows.get(descriptor.key);
    row.ownedItems.push(item);
    if (kind === "sealed") row.ownedSealedItems.push(item);
    if (kind === "single") row.ownedCardItems.push(item);
  });

  wishlistItems.forEach((item) => {
    const kind = classifyItemAsSingleOrSealed(item);
    const descriptor = resolveDescriptor(item, descriptors, { allowSealedTitleMatch: kind === "sealed" });
    rows.get(descriptor.key).wishlistItems.push(item);
  });

  catalogProducts.forEach((product) => {
    const kind = classifyItemAsSingleOrSealed(product);
    const descriptor = resolveDescriptor(product, descriptors, { allowSealedTitleMatch: kind === "sealed" });
    const row = rows.get(descriptor.key);
    if (kind === "sealed") row.catalogSealedProducts.push(product);
    if (kind === "single") row.catalogCards.push(product);
  });

  return [...rows.values()].map((row) => {
    const ownedCardGroups = groupVariantsByCard(row.ownedCardItems);
    const ownedCardKeys = new Set(row.ownedCardItems.map(cardIdentityKey).filter(Boolean));
    const ownedCardNumberKeys = new Set(row.ownedCardItems.map((item) => getCardNumber(item)).filter(Boolean).map(compactKey));
    const catalogCards = uniqueBy(row.catalogCards, cardIdentityKey).sort((a, b) => compareSetMasteryRows(a, b, "cardNumber"));
    const catalogSealedProducts = uniqueBy(row.catalogSealedProducts, explicitProductKey).sort((a, b) => compareSetMasteryRows(a, b, "name"));
    const checklistAvailable = Boolean(row.checklistAvailable || (row.totalCards > 0 && catalogCards.length >= row.totalCards));
    const missingCards = checklistAvailable ? catalogCards.filter((product) => {
      const productKey = cardIdentityKey(product);
      const cardNumber = getCardNumber(product);
      return !ownedCardKeys.has(productKey) && !(cardNumber && ownedCardNumberKeys.has(compactKey(cardNumber)));
    }) : [];
    const ownedCount = ownedCardGroups.length;
    const ownedQuantity = getOwnedQuantity(row.ownedItems);
    const missingCount = checklistAvailable ? missingCards.length : null;
    const percent = row.totalCards > 0 ? Math.min(100, Math.round((ownedCount / row.totalCards) * 100)) : null;
    const trackedItemCount = row.ownedItems.length + row.wishlistItems.length;
    return {
      ...row,
      catalogCards,
      catalogSealedProducts,
      sealedProducts: catalogSealedProducts,
      missingCards,
      missingSupported: checklistAvailable,
      missingCount,
      missingCountLabel: checklistAvailable ? String(missingCount) : "Missing count needs checklist data.",
      checklistAvailable,
      checklistStatus: checklistAvailable ? "Full checklist available" : "Set checklist unavailable",
      ownedCount,
      ownedQuantity,
      trackedItemCount,
      trackedCardCount: row.ownedCardItems.length,
      trackedSealedCount: row.ownedSealedItems.length,
      variantGroups: ownedCardGroups,
      percent,
      completionLabel: percent === null
        ? `${trackedItemCount} tracked`
        : checklistAvailable
          ? `${percent}% complete`
          : `${percent}% completion estimate`,
      progressCopy: checklistAvailable
        ? `${ownedCount} owned of ${row.totalCards || catalogCards.length} cards.`
        : row.totalCards > 0
          ? `${ownedCount} owned cards. Missing count needs checklist data.`
          : `${trackedItemCount} tracked items. Missing count needs checklist data.`,
    };
  })
    .filter((row) => row.trackedItemCount > 0 || row.catalogCards.length || row.sealedProducts.length)
    .sort((a, b) =>
      Number(b.trackedItemCount || 0) - Number(a.trackedItemCount || 0) ||
      Number(b.ownedCount || 0) - Number(a.ownedCount || 0) ||
      compareText(a.name, b.name)
    );
}
