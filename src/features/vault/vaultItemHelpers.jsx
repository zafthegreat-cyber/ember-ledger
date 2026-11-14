/* eslint-disable react-refresh/only-export-components -- plain helpers (a few return JSX), no components here */
// Moved out of App.jsx unchanged (Nov 15, 2026) to shrink the main component file.
import { getProductImageFallback, getProductImageUrl } from "../../utils/productDisplayUtils";
import { nativeAllowsRemoteProductImage } from "../../config/nativeLaunchScope.js";
import { getCardNumber as getSetMasteryCardNumber, getVariantLabel as getSetMasteryVariantLabel } from "../../utils/vaultSetMastery";
import { hasKnownPriceValue } from "../../utils/pricingReliabilityUtils";
import { safeReadBrowserJson, safeWriteBrowserJson } from "../../utils/betaDataCleanup";
import { normalizeGradeAssistChecklist } from "../../utils/inventoryDetailUtils";

function renderGenericProductImageFallback(product = {}, options = {}) {
  const fallback = getProductImageFallback(product, {
    title: options.title || product.name || product.productName || product.product_name || product.cardName || product.card_name,
    setName: options.setName || product.setName || product.set_name || product.expansion,
    productType: options.productType || product.productType || product.product_type || product.sealedProductType || product.sealed_product_type,
  });
  const className = ["image-needed-placeholder", "branded-product-fallback", options.className].filter(Boolean).join(" ");
  return (
    <div className={className} hidden={Boolean(options.hidden)}>
      <strong>{fallback.title}</strong>
      <span>{fallback.meta}</span>
      <b>{options.badge || "No photo yet"}</b>
    </div>
  );
}

const PURCHASER_NAME_MAX_LENGTH = 40;

const CATEGORIES = ["Pokemon", "Makeup", "Clothes", "Candy", "Collectibles", "Supplies", "Other"];

const STATUSES = ["In Stock", "Needs Photos", "Needs Market Check", "Ready to List", "Listed", "Sold", "Held", "Personal Collection", "Damaged"];

const VAULT_STATUS_OPTIONS = [
  { value: "personal_collection", label: "Personal Collection", description: "Keeping long term." },
  { value: "at_home", label: "At home", description: "Owned and stored at home." },
  { value: "at_store", label: "At store", description: "Owned and stored at a store or booth." },
  { value: "listed", label: "Listed", description: "Owned and currently listed for sale or trade." },
  { value: "sold", label: "Sold", description: "Sold or no longer owned." },
  { value: "trade_pile", label: "Trade pile", description: "Owned and available for trade." },
  { value: "gift_donation", label: "Gift / donation", description: "Set aside for gifting or donation." },
  { value: "sealed", label: "Sealed / Holding", description: "Unopened or held product." },
  { value: "wishlist", label: "Wishlist", description: "Wanted but not owned yet." },
  { value: "ready_for_forge", label: "Ready for Business", description: "May sell later." },
  { value: "archived", label: "Archived", description: "No longer active." },
  { value: "held", label: "Held", description: "Legacy held status." },
  { value: "ripped_opened", label: "Ripped / Opened" },
  { value: "moved_to_forge", label: "Moved to Business" },
  { value: "traded", label: "Traded" },
];

const VAULT_STORAGE_LOCATIONS = ["", "Binder", "ETB", "Shelf", "Box", "Display case", "Closet", "Other"];

const VAULT_CONDITIONS = ["", "Unknown", "Poor", "Played", "Light Play", "Lightly Played", "Near Mint", "Mint", "Sealed", "Box damage", "Missing wrap", "Other", "Damaged"];

const FORGE_PHYSICAL_LOCATION_OPTIONS = ["At Home", "At Store", "In Transit", "Storage", "Event / Pop-Up", "With Partner", "Other"];

const ITEM_COMPARE_TYPES = [
  "card",
  "sealed product",
  "pack",
  "booster box",
  "tin",
  "bundle",
  "supply",
  "set",
  "wishlist",
  "unknown",
];

function normalizeItemCompareType(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (ITEM_COMPARE_TYPES.includes(normalized)) return normalized;
  if (/booster\s*box|booster\s*display|display\s*box/.test(normalized)) return "booster box";
  if (/\btin\b|collector'?s?\s+chest|pok[e\u00e9]?\s*ball/.test(normalized)) return "tin";
  if (/\bbundle\b|build\s*&?\s*battle|stadium/.test(normalized)) return "bundle";
  if (/sealed|etb|elite trainer|collection box|premium collection|ultra premium|upc/.test(normalized)) return "sealed product";
  if (/pack|booster/.test(normalized)) return "pack";
  if (/sleeve|binder|toploader|top loader|deck box|storage|playmat|supply/.test(normalized)) return "supply";
  if (/wishlist|iso|want/.test(normalized)) return "wishlist";
  if (/card|single|slab|graded/.test(normalized)) return "card";
  return "unknown";
}

function normalizeVaultStatus(item = {}) {
  const raw = String(item.vaultStatus || item.status || item.actionNotes || "").toLowerCase();
  if (raw.includes("moved_to_forge") || raw.includes("moved to forge")) return "moved_to_forge";
  if (raw.includes("ready_for_forge") || raw.includes("ready for forge")) return "ready_for_forge";
  if (raw.includes("archived") || raw.includes("archive")) return "archived";
  if (raw.includes("at_home") || raw.includes("at home")) return "at_home";
  if (raw.includes("at_store") || raw.includes("at store")) return "at_store";
  if (raw.includes("listed")) return "listed";
  if (raw.includes("sold")) return "sold";
  if (raw.includes("trade_pile") || raw.includes("trade pile")) return "trade_pile";
  if (raw.includes("gift") || raw.includes("donation")) return "gift_donation";
  if (raw.includes("traded") || raw === "trade") return "traded";
  if (raw.includes("ripped") || raw.includes("opened") || raw.includes("rip later")) return "ripped_opened";
  if (raw.includes("wishlist") || raw.includes("wish")) return "wishlist";
  if (raw.includes("sealed") || raw.includes("keep sealed")) return "sealed";
  if (raw.includes("held") || raw.includes("hold")) return "held";
  return "personal_collection";
}

function vaultStatusLabel(value) {
  return VAULT_STATUS_OPTIONS.find((status) => status.value === value)?.label || "Personal Collection";
}

function isWishlistLikeVaultItem(item = {}) {
  const scopes = [
    ...(Array.isArray(item.destinationScope) ? item.destinationScope : []),
    ...(Array.isArray(item.itemScope) ? item.itemScope : []),
    ...(Array.isArray(item.destination_scope) ? item.destination_scope : []),
  ].map((scope) => String(scope || "").toLowerCase());
  const recordType = String(item.recordType || item.record_type || "").toLowerCase();
  const status = String(item.status || item.vaultStatus || item.vault_status || "").toLowerCase();
  return scopes.includes("wishlist")
    || recordType === "wishlist_item"
    || item.isWishlist
    || item.is_wishlist
    || normalizeVaultStatus(item) === "wishlist"
    || status === "wishlist";
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim().toLowerCase() !== "unknown";
}

function money(value) {
  return `$${toNumber(value).toFixed(2)}`;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[eé]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogClassificationText(value = {}) {
  const source = value || {};
  return normalizeSearchText([
    source.name,
    source.productName,
    source.product_name,
    source.cardName,
    source.card_name,
    source.productType,
    source.product_type,
    source.sealedProductType,
    source.sealed_product_type,
    source.productKind,
    source.product_kind,
    source.cardSubtype,
    source.card_subtype,
    source.category,
    source.displayCategory,
    source.display_category,
    source.catalogDisplayKind,
    source.catalog_display_kind,
    source.displayKind,
    source.display_kind,
    source.kind,
    source.itemType,
    source.item_type,
    source.catalogItemType,
    source.catalog_item_type,
    source.recordType,
    source.record_type,
    source.destination,
    source.destinationScope,
    source.destination_scope,
    source.sourceCollection,
    source.source_collection,
    source.wishlistCategory,
    source.wishlist_category,
    source.isoCategory,
    source.iso_category,
    source.supplyCategory,
    source.supply_category,
    source.setType,
    source.set_type,
    source.priceSubtype,
    source.price_subtype,
    source.setName,
    source.set_name,
    source.expansion,
    source.productLine,
    source.product_line,
    source.sourceUrl,
    source.source_url,
    source.marketUrl,
    source.market_url,
    source.identifierSearch,
    source.identifier_search,
    source.description,
    source.notes,
  ].filter(Boolean).join(" "));
}

function isCatalogCodeCardLike(value = {}) {
  const text = catalogClassificationText(value);
  return (
    /\bcode\s*card\b/.test(text) ||
    /\bpokemon\s+tcg\s+(live|online)\b/.test(text) ||
    /\bdigital\s+booster\s+pack\b/.test(text) ||
    /\bpokemon\.com\/redeem\b/.test(text) ||
    /\bonline\s+code\b/.test(text) ||
    /\bbooster\s+pack\s+code\b/.test(text) ||
    /\bredeem\b/.test(text) ||
    /\bcode\s*[-:]/.test(text)
  );
}

function catalogCardDetailsForClassification(value = {}) {
  return value.cardDetails || value.card_details || value.tcgCardDetails || value.tcg_card_details || {};
}

function catalogHasAnyValue(...values) {
  return values.some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function catalogSourceSuggestsSealed(value = {}) {
  const source = value || {};
  const typeText = normalizeSearchText([
    source.catalogType,
    source.catalog_type,
    source.catalogGroup,
    source.catalog_group,
    source.productType,
    source.product_type,
    source.sealedProductType,
    source.sealed_product_type,
    source.productKind,
    source.product_kind,
    source.catalogItemType,
    source.catalog_item_type,
  ].filter(Boolean).join(" "));
  const sealedFlag = source.isSealed ?? source.is_sealed;
  const sealedProductPattern = /\bbooster\s*(tin)?\b|\bmini\s+portfolio\b|\bportfolio\b|\bbinder\s+collection\b|\bposter\s+collection\b|\btech\s+sticker\b|\bsurprise\s+box\b|\baccessory\s+pouch\b|\bsuper\s+premium\b|\bcollector'?s?\s+chest\b|\bknock\s*out\b|\b(ex|deluxe)\s+battle\s+deck\b/;
  if (sealedProductPattern.test(typeText)) return true;
  return (
    sealedFlag === true ||
    sealedFlag === "true" ||
    /\bsealed\b|\bbooster\s*(box|bundle|pack)?\b|\belite\s+trainer\b|\bcollection\s+box\b|\bpremium\s+collection\b|\bspecial\s+collection\b|\bultra[-\s]?premium\b|\bmini\s+tin\b|\btin\b|\bblister\b|\bbuild\s*&?\s*battle\b|\btrainer'?s?\s+toolkit\b|\bleague\s+battle\s+deck\b|\btheme\s+deck\b|\bstarter\s+deck\b/.test(typeText) ||
    catalogNameSuggestsSealedProduct(source)
  );
}

function catalogNameSuggestsSealedProduct(value = {}) {
  const source = value || {};
  const nameText = normalizeSearchText([
    source.name,
    source.productName,
    source.product_name,
    source.title,
    source.displayName,
    source.display_name,
  ].filter(Boolean).join(" "));
  return /\bbooster\s+(box|bundle|pack|display)\b|\belite\s+trainer\s+box\b|\betb\b|\bpokemon\s+center\s+elite\s+trainer\s+box\b|\bsleeved\s+booster\b|\bchecklane\s+blister\b|\b3[-\s]?pack\s+blister\b|\bmini\s+tin\b|\bpok[eÃ©]?\s*ball\s+tin\b|\btin\b|\bcollection\s+box\b|\bpremium\s+collection\b|\bspecial\s+collection\b|\bultra[-\s]?premium\s+collection\b|\bupc\b|\bbuild\s*&?\s*battle\s+(box|stadium)\b|\btrainer'?s?\s+toolkit\b|\bleague\s+battle\s+deck\b|\btheme\s+deck\b|\bstarter\s+deck\b|\bdisplay\s+case\b|\bretail\s+bundle\b|\blunch\s*box\b|\blunchbox\b|\bcollector'?s?\s+chest\b|\bholiday\s+calendar\b/.test(nameText);
}

function isInventorySealedProduct(value = {}) {
  const source = value || {};
  const statusText = normalizeSearchText([source.status, source.vaultStatus, source.vault_status, source.condition, source.conditionName, source.condition_name].filter(Boolean).join(" "));
  return catalogSourceSuggestsSealed(source) || /\bsealed\b|\bkeep\s+sealed\b|\bsealed\s*\/\s*holding\b/.test(statusText);
}

function isInventoryCardProduct(value = {}) {
  if (isInventorySealedProduct(value)) return false;
  const text = catalogClassificationText(value);
  return (
    isCatalogCodeCardLike(value) ||
    catalogHasStrongCardIndicators(value) ||
    /\bsingle[_\s-]?card\b|\bindividual\s+card\b|\bpromo\s+card\b|\bgraded\s+card\b|\bslab\b/.test(text)
  );
}

function detectCollectorItemVisualType(source = {}) {
  const value = source || {};
  const recordType = normalizeSearchText([
    value.recordType,
    value.record_type,
    value.destination,
    value.destinationScope,
    value.destination_scope,
    value.sourceCollection,
    value.source_collection,
    value.vaultStatus,
    value.vault_status,
  ].filter(Boolean).join(" "));
  const explicitTypeText = normalizeSearchText([
    value.itemType,
    value.item_type,
    value.productType,
    value.product_type,
    value.category,
    value.catalogType,
    value.catalog_type,
    value.catalogDisplayKind,
    value.displayKind,
    value.displayCategory,
    value.display_category,
    value.kind,
    value.productKind,
    value.product_kind,
    value.catalogItemType,
    value.catalog_item_type,
    value.sealedProductType,
    value.sealed_product_type,
    value.wishlistCategory,
    value.wishlist_category,
    value.isoCategory,
    value.iso_category,
    value.supplyCategory,
    value.supply_category,
    value.setType,
    value.set_type,
    value.recordType,
    value.record_type,
    value.status,
  ].filter(Boolean).join(" "));
  const broadText = normalizeSearchText([
    explicitTypeText,
    value.name,
    value.itemName,
    value.productName,
    value.cardName,
    value.title,
    value.description,
    value.notes,
  ].filter(Boolean).join(" "));
  const supplyText = normalizeSearchText([
    explicitTypeText,
    value.supplyCategory,
    value.supply_category,
    value.storageType,
    value.storage_type,
  ].filter(Boolean).join(" "));

  if (
    value.wishlistIso ||
    value.isWishlist ||
    value.is_wishlist ||
    /\bwishlist[_\s-]?item\b|\bwishlist\b|\biso\b/.test(recordType) ||
    /\bwishlist\b|\biso\b|\bwant(ed)?\b/.test(explicitTypeText)
  ) return "wishlist";
  if (
    /\bcollection[_\s-]?set\b|\bset[_\s-]?shelf\b/.test(recordType) ||
    /\b(set shelf|collection set|favorite set|kid set|sealed set|slab set|trade binder|master set|family set)\b/.test(explicitTypeText)
  ) return "set";
  if (
    /\b(sleeves?|binder|top\s*loader|toploader|deck\s*box|storage|playmat|supply|supplies|shipping material|shipping supplies?)\b/.test(supplyText) ||
    (/\b(sleeves?|top\s*loader|toploader|deck\s*box|storage|playmat|supply|supplies|shipping material|shipping supplies?)\b/.test(broadText)) ||
    (/\bbinder\b/.test(broadText) && !/\bbinder\s+collection\b|\bbinder\s+bundle\b/.test(broadText))
  ) return "supply";
  if (/\bbooster[-\s]+(box|display)\b|\bdisplay[-\s]+box\b/.test(broadText)) return "booster box";
  if (/\b(tin|mini\s+tin|collector'?s?\s+chest|pok[e\u00e9]?\s*ball)\b/.test(broadText)) return "tin";
  if (/\b(bundle|build\s+(and\s+)?battle|stadium)\b/.test(broadText)) return "bundle";
  if (/\b(sleeved\s+booster|booster\s+pack|checklane\s+blister|3[-\s]?pack\s+blister|blister)\b/.test(broadText) || /\bpack\b/.test(explicitTypeText)) return "pack";
  if (catalogSourceSuggestsSealed(value) || /\bsealed\b|\betb\b|\belite\s+trainer\b|\bcollection\s+box\b|\bbundle\b|\btin\b|\bultra[-\s]?premium\b|\bupc\b/.test(broadText)) return "sealed product";
  if (
    getCatalogDisplayKind(value) === "card" ||
    getCatalogDisplayKind(value) === "code_card" ||
    isInventoryCardProduct(value) ||
    /\b(card|single|slab|graded|promo)\b/.test(explicitTypeText)
  ) return "card";
  return "unknown";
}

function collectorVisualTypeLabel(value = "") {
  const normalized = normalizeItemCompareType(value);
  return ({
    card: "Card",
    "sealed product": "Sealed Product",
    pack: "Pack",
    "booster box": "Booster Box",
    tin: "Tin",
    bundle: "Bundle",
    supply: "Supply",
    set: "Set",
    wishlist: "Wishlist",
    unknown: "Unknown",
  })[normalized] || "Unknown";
}

function vaultItemDisplayImage(item = {}) {
  const image = item.displayImage || item.itemImage || item.item_image || item.imageUrl || item.image_url || item.catalogImageUrl || item.productImageUrl || getCatalogImage(item);
  return nativeAllowsRemoteProductImage(image) ? image : getCatalogImage(item);
}

const MASTER_CARD_VARIANT_LABELS = {
  normal: "Normal",
  reverse_holo: "Reverse Holo",
  holo: "Holo",
  foil: "Foil",
  etched: "Etched",
  pokeball: "Ball reverse",
  masterball: "Master reverse",
  stamped: "Stamped",
  promo: "Promo",
  full_art: "Full Art",
  illustration: "Illustration",
  special_illustration: "Special Illustration",
  secret: "Secret",
  graded: "Graded",
  sealed_related: "Sealed related",
  other: "Other",
};

const MASTER_CARD_CONDITION_LABELS = {
  mint: "Mint",
  near_mint: "Near Mint",
  light_play: "Light Play",
  moderate_play: "Moderate Play",
  heavy_play: "Heavy Play",
  damaged: "Damaged",
  sealed: "Sealed",
};

function inferMasterCardVariantType(item = {}) {
  if (item.graded || item.grade || item.gradingCompany || item.grading_company) return "graded";
  const text = normalizeSearchText([
    item.variantType,
    item.variant_type,
    item.variant,
    item.variantName,
    item.variant_name,
    item.finish,
    item.printing,
    item.priceSubtype,
    item.price_subtype,
    item.rarity,
    item.productType,
    item.product_type,
    item.condition,
    item.conditionName,
    vaultVariantLabel(item),
  ].filter(Boolean).join(" "));
  if (text.includes("special illustration")) return "special_illustration";
  if (text.includes("illustration")) return "illustration";
  if (text.includes("full art")) return "full_art";
  if (text.includes("secret")) return "secret";
  if (text.includes("promo")) return "promo";
  if (text.includes("stamp") || text.includes("staff") || text.includes("prerelease")) return "stamped";
  if (text.includes("master ball") || text.includes("masterball")) return "masterball";
  if (text.includes("poke ball") || text.includes("pokeball")) return "pokeball";
  if (text.includes("reverse")) return "reverse_holo";
  if (text.includes("holo")) return "holo";
  if (text.includes("etched")) return "etched";
  if (text.includes("foil")) return "foil";
  if (text.includes("sealed")) return "sealed_related";
  if (text.includes("normal") || text.includes("standard") || text.includes("regular")) return "normal";
  return "other";
}

function vaultItemTypeLabel(item = {}) {
  if (item.graded || item.grade || item.gradingCompany || item.grading_company) return "Graded card";
  const visualType = detectCollectorItemVisualType(item);
  const visualLabel = collectorVisualTypeLabel(visualType);
  const savedType = String(item.productType || item.product_type || item.category || "").trim();
  const savedTypeIsGeneric = !savedType || /^(item|product|other|unknown|sealed|sealed product)$/i.test(savedType);
  if (!savedTypeIsGeneric) return savedType;
  if (["wishlist", "set", "supply", "tin", "bundle", "pack", "booster box"].includes(visualType)) return visualLabel;
  if (isInventorySealedProduct(item)) return item.productType || item.product_type || "Sealed product";
  if (isInventoryCardProduct(item)) return item.productType || item.product_type || "Single card";
  return savedType || "Other";
}

function vaultItemSetLabel(item = {}) {
  return String(item.setName || item.set_name || item.expansion || item.productLine || item.product_line || "").trim();
}

function vaultCardNumberLabel(value = {}) {
  return getSetMasteryCardNumber(value);
}

function vaultVariantLabel(value = {}) {
  return getSetMasteryVariantLabel(value);
}

function vaultItemLocationLabel(item = {}) {
  return friendlyInventoryLabel(item.storageLocation || item.storage_location || item.locationSummary || item.physicalLocation || item.physical_location || item.location, "");
}

function firstKnownVaultNumber(...values) {
  for (const value of values) {
    if (hasKnownPriceValue(value)) return Number(value);
  }
  return null;
}

function vaultItemLastUpdatedLabel(item = {}) {
  const raw = item.updatedAt || item.updated_at || item.lastPriceChecked || item.marketLastUpdated || item.createdAt || item.created_at || "";
  return raw ? shortDate(raw) : "Not updated";
}

function catalogHasStrongCardIndicators(value = {}) {
  const source = value || {};
  const details = catalogCardDetailsForClassification(source);
  const printedTotal = source.printedTotal || source.printed_total || details.printedTotal || details.printed_total;
  const rarity = source.rarity || details.rarity;
  const supertype = source.supertype || details.supertype;
  const cardNumber = source.cardNumber || source.card_number || details.cardNumber || details.card_number || (
    catalogHasAnyValue(printedTotal, rarity, supertype) ? source.number : ""
  );
  const cardTypeText = normalizeSearchText([
    supertype,
    source.cardSubtype,
    source.card_subtype,
    details.stage,
    (details.subtypes || []).join(" "),
    (details.types || []).join(" "),
    source.productType,
    source.product_type,
    source.catalogItemType,
    source.catalog_item_type,
  ].filter(Boolean).join(" "));
  const numberPatternText = normalizeSearchText([
    cardNumber,
    source.displayNumber,
    source.display_number,
    source.collectorNumber,
    source.collector_number,
    source.name,
    source.cardName,
    source.card_name,
  ].filter(Boolean).join(" "));
  const hasCardNumberPattern = /\b[a-z]{0,3}\d{1,4}[a-z]?\/[a-z]{0,3}\d{1,4}[a-z]?\b/.test(numberPatternText);
  const hasCardSpecificArrays = [
    details.subtypes,
    details.types,
    details.attacks,
    details.abilities,
    details.weaknesses,
    details.resistances,
    details.retreatCost,
    details.retreat_cost,
  ].some((entry) => Array.isArray(entry) ? entry.length > 0 : catalogHasAnyValue(entry));
  const hasCardSpecificScalar = catalogHasAnyValue(
    cardNumber,
    printedTotal,
    rarity,
    supertype,
    source.hp,
    details.hp,
    source.artist,
    details.artist,
    source.regulationMark,
    source.regulation_mark,
    details.regulationMark,
    details.regulation_mark,
    source.evolvesFrom,
    source.evolves_from,
    details.evolvesFrom,
    details.evolves_from
  );
  const explicitCardType =
    /\b(pokemon|pok[eé]mon|trainer|item|supporter|stadium|tool|energy)\b/.test(cardTypeText) &&
    !/\bsealed\b|\bbooster\b|\bbox\b|\bbundle\b|\btin\b|\bcollection\b|\bpack\b|\bblister\b|\bdeck\b|\belite\s+trainer\s+box\b|\btrainer'?s?\s+toolkit\b|\bleague\s+battle\s+deck\b|\btheme\s+deck\b|\bstarter\s+deck\b/.test(cardTypeText);
  const explicitKindText = normalizeSearchText([
    source.catalogType,
    source.catalog_type,
    source.catalogGroup,
    source.catalog_group,
    source.productKind,
    source.product_kind,
    source.catalogItemType,
    source.catalog_item_type,
    source.productType,
    source.product_type,
  ].filter(Boolean).join(" "));
  const sourceSaysCard =
    !catalogNameSuggestsSealedProduct(source) && (
      source.catalogType === "card" ||
      source.catalog_type === "card" ||
      /\bsingle[_\s-]?card\b|\bindividual\s+card\b|\bpromo\s+card\b/.test(explicitKindText) ||
      (/\bcard\b/.test(explicitKindText) && !catalogSourceSuggestsSealed(source) && catalogHasAnyValue(cardNumber, printedTotal, rarity, supertype))
    );
  const cardVariantWithMetadata =
    catalogHasAnyValue(source.finish, source.printing, source.variant, source.variantNames, source.variant_names, source.priceSubtype, source.price_subtype) &&
    catalogHasAnyValue(cardNumber, printedTotal, rarity, supertype, source.setName, source.set_name, source.expansion);

  return Boolean(
    sourceSaysCard ||
    hasCardNumberPattern ||
    hasCardSpecificScalar ||
    hasCardSpecificArrays ||
    explicitCardType ||
    cardVariantWithMetadata
  );
}

function classifyCatalogItem(value = {}) {
  if (!value) return "other";
  if (isCatalogCodeCardLike(value)) return "code_card";
  if (catalogSourceSuggestsSealed(value)) return "sealed";
  if (catalogHasStrongCardIndicators(value)) return "card";
  return "other";
}

function getCatalogDisplayKind(value = {}) {
  if (!value) return "other";
  const recomputedKind = classifyCatalogItem(value);
  const storedKind = value.catalogDisplayKind || value.displayKind;
  if (storedKind === "sealed" && (recomputedKind === "card" || recomputedKind === "code_card")) return recomputedKind;
  if ((storedKind === "card" || storedKind === "code_card") && recomputedKind === "sealed") return recomputedKind;
  return storedKind || recomputedKind;
}

function toNumber(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function getCatalogImage(product = {}) {
  return getProductImageUrl(product);
}

function getImageSourceLabel(item = {}) {
  const source = item.imageSource || item.itemImageSource || "";
  const status = item.imageStatus || item.itemImageStatus || "";
  const value = status || source || (getCatalogImage(item) || item.itemImage ? "manual" : "placeholder");
  const labels = {
    pokemon_tcg_api: "Pokemon TCG API",
    tcgdex: "TCGdex",
    best_buy: "Best Buy",
    ebay: "Marketplace",
    tcgcsv: "TCGCSV",
    user: "User photo",
    manual: "Manual image",
    mock: "Image needs review",
    placeholder: "Image needed",
    official: "Official/API",
    api: "API",
    retailer: "Retailer",
    marketplace: "Marketplace",
    unknown: "Unknown image",
  };
  return labels[value] || labels[source] || labels[status] || String(value).replaceAll("_", " ");
}

function shortDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function forgePhysicalLocationLabel(item = {}) {
  return friendlyInventoryLabel(item.physicalLocation || item.physical_location, "");
}

const PERSON_TYPE_OPTIONS = ["Family", "Seller", "Helper", "Partner", "Business", "Other"];

const INFO_TOOLTIP_COPY = {
  whoPaid: "The person or account that originally paid for this item or expense.",
  ownerPerson: "The person this record belongs to for family, collection, or business tracking.",
  costBasis: "What this item cost before profit is calculated.",
  plannedSalePrice: "The price you expect to sell this item for later.",
  profit: "Estimated money left after the known costs in this record.",
  netProfit: "Estimated profit after known costs, expenses, fees, and reimbursements.",
  mileage: "Business miles can help estimate travel cost and records for later review.",
  reimbursement: "Money someone may need back for expenses or mileage they covered.",
  payoutEstimate: "Estimated amount available to pay after costs, expenses, and reimbursements.",
  vehicle: "A reusable vehicle profile for mileage logs and business records.",
  smartSetup: "Smart Setup shapes the app around your collecting, family, Restocks, or seller needs. You can change this anytime.",
  customizeMyApp: "Choose which sections each page shows first. This changes visibility only, not your saved data or permissions.",
  smartRecommendations: "Code 3 TCG can suggest layout changes based on app use, but it will not change your layout without confirmation.",
  resetRecommended: "Restore the recommended layout for your current setup mode.",
  sellerTools: "Seller tools unlock Business, receipts, mileage, expenses, sales, and planning summaries when you choose to use them.",
  adminTools: "Admin tools are protected by account permissions. Visibility settings cannot grant admin access.",
  lockedTools: "Locked tools stay unavailable until your role, setup, or beta access allows them.",
};

function friendlyInventoryLabel(value, fallback = "Not assigned") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (/^(?:-?\d+|null|undefined|n\/a)$/i.test(text)) return fallback;
  if (/^unknown$/i.test(text)) return fallback === "No purchaser assigned" ? fallback : "Unknown";
  if (/unassigned\s+purchaser(?:\s*-?\d+)?/i.test(text)) return "No purchaser assigned";
  if (/no\s+purchaser\s+assigned(?:\s*-\s*\d+)?/i.test(text)) return "No purchaser assigned";
  return text.replace(/\s+-1$/i, "");
}

function itemPurchaserName(item) {
  return friendlyInventoryLabel(item.purchaserName || item.purchaser_name || item.buyer, "No purchaser assigned");
}

function itemPurchaserKey(item = {}) {
  const purchaserId = String(item.purchaserId || item.purchaser_id || "").trim();
  if (purchaserId) return `id:${purchaserId}`;
  const name = itemPurchaserName(item);
  if (name && name !== "No purchaser assigned") return `name:${normalizeSearchText(name)}`;
  return "__unassigned_purchaser__";
}

function summarizeBreakdownRows(rows = [], options = {}) {
  const { type = "purchaser", moneyFn = money } = options;
  const groups = new Map();
  rows.forEach((row) => {
    const quantity = Math.max(0, Number(row.quantity || 0));
    if (quantity <= 0) return;
    const key = type === "location"
      ? normalizeSearchText(forgePhysicalLocationLabel(row) || "No location assigned")
      : itemPurchaserKey(row);
    const name = type === "location"
      ? (forgePhysicalLocationLabel(row) || "No location assigned")
      : itemPurchaserName(row);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name,
        quantity: 0,
        totalCost: 0,
        entries: [],
      });
    }
    const group = groups.get(key);
    group.quantity += quantity;
    group.totalCost += quantity * Number(row.unitCost || row.unit_cost || 0);
    group.entries.push(row);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      averageCost: group.quantity > 0 ? group.totalCost / group.quantity : 0,
      summary: `${group.name} ${group.quantity}`,
      costSummary: group.totalCost > 0 ? moneyFn(group.totalCost) : "",
    }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

function inventoryGroupEntries(item = {}) {
  return Array.isArray(item.rawItems) && item.rawItems.length ? item.rawItems : item ? [item] : [];
}

function inventoryEntryLabel(item = {}) {
  const pieces = [
    itemPurchaserName(item),
    `Qty ${Number(item.quantity || 0)}`,
    forgePhysicalLocationLabel(item),
    hasValue(item.unitCost) ? `Cost ${money(item.unitCost)}` : "",
  ].filter(Boolean);
  return pieces.join(" - ");
}

function statusClass(status) {
  return `status-badge ${String(status || "In Stock")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

const COLLECTOR_SHOWCASE_KIND_LABELS = {
  card: "Card",
  sealed: "Sealed Product",
  pack: "Pack",
  "booster-box": "Booster Box",
  tin: "Tin",
  bundle: "Bundle",
  wishlist: "Wishlist",
  slab: "Slab",
  supply: "Supply",
  set: "Set",
  unknown: "Unknown type",
  item: "Visual display",
};

function sealedProductFrameMeta(value = {}) {
  const source = typeof value === "string" ? { name: value } : (value || {});
  const text = normalizeSearchText([
    source.name,
    source.title,
    source.productName,
    source.product_name,
    source.productType,
    source.product_type,
    source.sealedProductType,
    source.sealed_product_type,
    source.category,
    source.kind,
    source.itemType,
    source.item_type,
    source.catalogItemType,
    source.catalog_item_type,
    source.displayKind,
    source.display_kind,
    source.setName,
    source.set_name,
    source.franchise,
    source.meta,
  ].filter(Boolean).join(" "));
  if (/\bbooster[-\s]+(box|display)\b|\bdisplay[-\s]+box\b|\bdisplay\s+case\b/.test(text)) return { key: "booster-box", label: "Booster Box" };
  if (/\betb\b|\belite\s+trainer\s+box\b/.test(text)) return { key: "etb", label: "ETB" };
  if (/\btin\b|\bcollector'?s?\s+chest\b|\bpok[e\u00e9]?\s*ball\b/.test(text)) return { key: "tin", label: "Tin" };
  if (/\bbundle\b|\bbuild\s+(and\s+)?battle\b|\bstadium\b/.test(text)) return { key: "bundle", label: "Bundle" };
  if (/\b(collection|premium|special|ex|vmax|vstar|box)\s+box\b|\bultra[-\s]?premium\b|\bupc\b|\bcollection\b/.test(text)) return { key: "collection-box", label: "Collection Box" };
  if (/\bsleeved\s+booster\b|\bbooster\s+pack\b|\bpack\b|\bblister\b/.test(text)) return { key: "booster-pack", label: "Booster Pack" };
  return { key: "unknown", label: "Unknown sealed product" };
}

function normalizeCollectorShowcaseKind(kind = "") {
  const value = String(kind || "").toLowerCase();
  if (value.includes("wishlist") || value.includes("iso") || value.includes("want")) return "wishlist";
  if (value.includes("slab") || value.includes("graded")) return "slab";
  if (value.includes("supply") || value.includes("sleeve") || value.includes("binder") || value.includes("deck box") || value.includes("storage")) return "supply";
  if (value.includes("set")) return "set";
  if (value.includes("booster box") || value.includes("booster-box") || value.includes("display box") || value.includes("display")) return "booster-box";
  if (value.includes("pack") || value.includes("blister")) return "pack";
  if (value.includes("tin") || value.includes("collector chest") || value.includes("collector's chest")) return "tin";
  if (value.includes("bundle") || value.includes("stadium") || value.includes("build battle")) return "bundle";
  if (value.includes("sealed") || value.includes("box") || value.includes("etb") || value.includes("elite trainer") || value.includes("booster")) return "sealed";
  if (value.includes("card") || value.includes("single") || value.includes("promo")) return "card";
  if (value.includes("unknown")) return "unknown";
  return "item";
}

function collectorShowcaseInitials(title = "") {
  const words = String(title || "Vault Item").replace(/[^a-z0-9 ]/gi, " ").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "ET";
}

const COLLECTOR_SHOWCASE_RARITY_HELPER = "Rarity from catalog data when available.";

function collectorShowcaseRaritySource(value = "", meta = []) {
  return [
    value,
    ...(Array.isArray(meta) ? meta : [meta]),
  ].filter(Boolean).join(" ");
}

function collectorShowcaseRarityTone(value = "", meta = []) {
  const text = normalizeSearchText(collectorShowcaseRaritySource(value, meta));
  if (!text) return "neutral";
  if (text.includes("promo") || text.includes("stamp") || text.includes("prerelease")) return "promo";
  if (text.includes("secret") || text.includes("hyper") || text.includes("rainbow") || text.includes("gold")) return "secret";
  if (text.includes("special illustration") || text.includes("illustration rare") || text.includes("alt art")) return "illustration";
  if (text.includes("ultra") || text.includes("full art") || text.includes("ex") || text.includes("vmax") || text.includes("vstar") || text.includes("tera")) return "ultra";
  if (text.includes("reverse holo") || text.includes("reverse foil") || text.includes("reverse")) return "reverse";
  if (text.includes("holo") || text.includes("foil") || text.includes("shiny")) return "holo";
  if (text.includes("rare")) return "rare";
  if (text.includes("uncommon")) return "uncommon";
  if (text.includes("common")) return "common";
  return "neutral";
}

function collectorShowcaseRarityLabel(value = "", meta = []) {
  const label = String(value || "").trim();
  if (label) return label;
  const text = normalizeSearchText(collectorShowcaseRaritySource("", meta));
  if (text.includes("promo")) return "Promo";
  if (text.includes("reverse holo") || text.includes("reverse foil") || text.includes("reverse")) return "Reverse Holo";
  if (text.includes("holo")) return "Holo";
  if (text.includes("foil")) return "Foil";
  return "Unknown";
}

function isCatalogCardProduct(product = {}) {
    const kind = getCatalogDisplayKind(product);
    return kind === "card" || kind === "code_card";
  }

const GRADE_ASSIST_LOCAL_STORAGE_KEY = "et-grade-assist-checklists";

function gradeAssistRecordKey(item = {}) {
  return String(
    item.id ||
    item.groupId ||
    item.catalogVariantId ||
    item.catalog_variant_id ||
    item.catalogProductId ||
    item.catalog_product_id ||
    item.externalProductId ||
    item.external_product_id ||
    item.name ||
    "",
  ).trim();
}

function readGradeAssistLocalStore() {
  if (typeof localStorage === "undefined") return {};
  return safeReadBrowserJson(localStorage, GRADE_ASSIST_LOCAL_STORAGE_KEY, {});
}

function loadGradeAssistDraft(item = {}) {
  const key = gradeAssistRecordKey(item);
  const localStore = readGradeAssistLocalStore();
  return normalizeGradeAssistChecklist(
    localStore[key] ||
    item.gradeAssistChecklist ||
    item.grade_assist_checklist ||
    item.gradeAssist ||
    {},
  );
}

function saveGradeAssistDraft(item = {}, checklist = {}) {
  const normalized = normalizeGradeAssistChecklist({
    ...checklist,
    updatedAt: new Date().toISOString(),
  });
  const key = gradeAssistRecordKey(item);
  if (!key || typeof localStorage === "undefined") {
    return { mode: "session", checklist: normalized };
  }
  const localStore = readGradeAssistLocalStore();
  const saved = safeWriteBrowserJson(localStorage, GRADE_ASSIST_LOCAL_STORAGE_KEY, {
    ...localStore,
    [key]: normalized,
  });
  return { mode: saved ? "local" : "session", checklist: normalized };
}

function gradeAssistValueComparison(item = {}, moneyFormatter = money) {
  const rawValue = firstKnownVaultNumber(
    item.marketValue,
    item.market_value,
    item.marketPrice,
    item.market_price,
    item.estimatedMarketValue,
    item.estimated_market_value,
  );
  const gradedValue = firstKnownVaultNumber(
    item.marketValueGraded,
    item.market_value_graded,
    item.gradedMarketValue,
    item.graded_market_value,
    item.psaMarketValue,
    item.psa_market_value,
    item.bgsMarketValue,
    item.bgs_market_value,
    item.cgcMarketValue,
    item.cgc_market_value,
  );

  if (!rawValue && !gradedValue) {
    return {
      label: "Not enough market data yet.",
      helper: "Open Market Watch or review value data before comparing raw and graded references.",
    };
  }

  if (rawValue && gradedValue) {
    return {
      label: `Raw ${moneyFormatter(rawValue)} / graded reference ${moneyFormatter(gradedValue)}`,
      helper: "Use sourced market data only as a comparison. Values are not guaranteed.",
    };
  }

  return {
    label: rawValue ? `Raw reference ${moneyFormatter(rawValue)}` : `Graded reference ${moneyFormatter(gradedValue)}`,
    helper: rawValue
      ? "Graded comparison needs sourced graded market data."
      : "Raw comparison needs sourced raw market data.",
  };
}

export { renderGenericProductImageFallback, PURCHASER_NAME_MAX_LENGTH, CATEGORIES, STATUSES, VAULT_STATUS_OPTIONS, VAULT_STORAGE_LOCATIONS, VAULT_CONDITIONS, FORGE_PHYSICAL_LOCATION_OPTIONS, ITEM_COMPARE_TYPES, normalizeItemCompareType, normalizeVaultStatus, vaultStatusLabel, isWishlistLikeVaultItem, hasValue, money, normalizeSearchText, catalogClassificationText, isCatalogCodeCardLike, catalogCardDetailsForClassification, catalogHasAnyValue, catalogSourceSuggestsSealed, catalogNameSuggestsSealedProduct, isInventorySealedProduct, isInventoryCardProduct, detectCollectorItemVisualType, collectorVisualTypeLabel, vaultItemDisplayImage, MASTER_CARD_VARIANT_LABELS, MASTER_CARD_CONDITION_LABELS, inferMasterCardVariantType, vaultItemTypeLabel, vaultItemSetLabel, vaultCardNumberLabel, vaultVariantLabel, vaultItemLocationLabel, firstKnownVaultNumber, vaultItemLastUpdatedLabel, catalogHasStrongCardIndicators, classifyCatalogItem, getCatalogDisplayKind, toNumber, getCatalogImage, getImageSourceLabel, shortDate, forgePhysicalLocationLabel, PERSON_TYPE_OPTIONS, INFO_TOOLTIP_COPY, friendlyInventoryLabel, itemPurchaserName, itemPurchaserKey, summarizeBreakdownRows, inventoryGroupEntries, inventoryEntryLabel, statusClass, COLLECTOR_SHOWCASE_KIND_LABELS, sealedProductFrameMeta, normalizeCollectorShowcaseKind, collectorShowcaseInitials, COLLECTOR_SHOWCASE_RARITY_HELPER, collectorShowcaseRaritySource, collectorShowcaseRarityTone, collectorShowcaseRarityLabel, isCatalogCardProduct, GRADE_ASSIST_LOCAL_STORAGE_KEY, gradeAssistRecordKey, readGradeAssistLocalStore, loadGradeAssistDraft, saveGradeAssistDraft, gradeAssistValueComparison };
