const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "src", "data", "generated");
const seedCatalogDir = path.join(rootDir, "seeds", "catalog");
const seedStoreDir = path.join(rootDir, "seeds", "stores");

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const POKEMON_CATEGORY_ID = Number(process.env.TCGCSV_CATEGORY_ID || 3);
const DEFAULT_GROUP_LIMIT = Number(process.env.TCGCSV_GROUP_LIMIT || 0);
const REQUEST_DELAY_MS = Number(process.env.SYNC_REQUEST_DELAY_MS || 120);
const SYNC_TIMESTAMP = "2026-05-20T00:00:00.000Z";

const SEALED_KEYWORDS = [
  "elite trainer box",
  "pokemon center elite trainer box",
  "booster box",
  "booster bundle",
  "booster pack",
  "sleeved booster",
  "build & battle",
  "build and battle",
  "stadium",
  "collection",
  "premium collection",
  "special collection",
  "poster collection",
  "binder collection",
  "tech sticker",
  "accessory pouch",
  "super premium collection",
  "ultra premium",
  "collector chest",
  "collector's chest",
  "mini portfolio",
  "portfolio",
  "pencil case",
  "blister",
  "checklane",
  "tin",
  "mini tin",
  "pokeball",
  "poke ball",
  "deck",
  "toolkit",
  "lunchbox",
  "calendar",
];

const ACCESSORY_KEYWORDS = [
  "sleeves",
  "playmat",
  "binder",
  "portfolio",
  "pencil case",
  "dice",
  "coin",
  "deck box",
  "accessory",
];

const STORE_CHAIN_PATTERNS = [
  "Target",
  "Walmart",
  "GameStop",
  "Barnes & Noble",
  "Best Buy",
  "Costco",
  "Sam's Club",
  "BJ's Wholesale Club",
  "Walgreens",
  "CVS",
  "Dollar General",
  "Family Dollar",
  "Dollar Tree",
  "Five Below",
  "DICK'S Sporting Goods",
  "Hobby Lobby",
  "Michaels",
  "Kohl's",
];

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[e\u00e9]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrEmpty(value) {
  if (value === null || value === undefined || value === "") return "";
  const next = Number(value);
  return Number.isFinite(next) ? Number(next.toFixed(2)) : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  if (!(await exists(filePath))) return fallback;
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readCsv(filePath) {
  if (!(await exists(filePath))) return [];
  const text = await fs.readFile(filePath, "utf8");
  return parseCsv(text);
}

function parseCsv(text = "") {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || "").trim()]))
  );
}

async function fetchJson(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": "EmberAndTideCatalogSync/1.0 (public data cache; contact via app owner)",
        ...(options.headers || {}),
      },
    });
    if (response.ok) return response.json();
    const body = await response.text().catch(() => "");
    if (attempt === retries) throw new Error(`Fetch failed ${response.status} ${url}: ${body.slice(0, 300)}`);
    await sleep(500 * attempt);
  }
  return null;
}

function extendedDataObject(product = {}) {
  const out = {};
  for (const entry of product.extendedData || []) {
    const key = normalizeSearch(entry.name || entry.displayName || entry.propertyName || entry.key).replace(/\s+/g, "_");
    if (key) out[key] = entry.value ?? entry.displayValue ?? entry.text ?? "";
  }
  return out;
}

function inferProductType(name = "") {
  const text = normalizeSearch(name);
  if (text.includes("pokemon center") && text.includes("elite trainer box")) return "Pokemon Center Elite Trainer Box";
  if (text.includes("elite trainer box") || /\betb\b/.test(text)) return "Elite Trainer Box";
  if (text.includes("booster box")) return "Booster Box";
  if (text.includes("booster bundle")) return "Booster Bundle";
  if (text.includes("sleeved booster")) return "Sleeved Booster Pack";
  if (text.includes("booster pack")) return "Booster Pack";
  if (text.includes("build") && text.includes("battle") && text.includes("stadium")) return "Build & Battle Stadium";
  if (text.includes("build") && text.includes("battle")) return "Build & Battle Box";
  if (text.includes("3 pack") || text.includes("three pack")) return "3-Pack Blister";
  if (text.includes("checklane")) return "Checklane Blister";
  if (text.includes("blister")) return "Blister Pack";
  if (text.includes("collector chest") || text.includes("collector s chest")) return "Collector's Chest";
  if (text.includes("mini portfolio") || text.includes("4 pocket portfolio")) return "Mini Portfolio";
  if (text.includes("binder collection") || text.includes("9 pocket portfolio")) return "Binder Collection";
  if (text.includes("poster collection")) return "Poster Collection";
  if (text.includes("tech sticker")) return "Tech Sticker Collection";
  if (text.includes("accessory pouch")) return "Accessory Pouch Special Collection";
  if (text.includes("super premium")) return "Super Premium Collection";
  if (text.includes("ultra premium") || /\bupc\b/.test(text)) return "Ultra Premium Collection";
  if (text.includes("premium collection")) return "Premium Collection";
  if (text.includes("special collection")) return "Special Collection";
  if (text.includes("collection")) return "Collection Box";
  if (text.includes("mini tin")) return "Mini Tin";
  if (text.includes("booster tin")) return "Booster Tin";
  if (text.includes("tin")) return "Tin";
  if (text.includes("trainer toolkit") || text.includes("trainer s toolkit")) return "Trainer Toolkit";
  if (text.includes("league battle deck")) return "League Battle Deck";
  if (text.includes("deluxe battle deck")) return "Deluxe Battle Deck";
  if (text.includes("ex battle deck")) return "ex Battle Deck";
  if (text.includes("battle deck")) return "Battle Deck";
  if (text.includes("pencil case")) return "Back to School Pencil Case";
  if (text.includes("knock out")) return "Knock Out Collection";
  if (ACCESSORY_KEYWORDS.some((keyword) => text.includes(keyword))) return "Accessories";
  if (SEALED_KEYWORDS.some((keyword) => text.includes(keyword))) return "Other sealed product";
  return "";
}

function isSealedOrAccessory(product = {}) {
  const text = normalizeSearch(product.name || product.cleanName);
  return Boolean(inferProductType(text)) || SEALED_KEYWORDS.some((keyword) => text.includes(keyword));
}

function pricingConfidence(price = {}) {
  if (Number(price.marketPrice || 0) > 0 && price.productId) return "high";
  if (Number(price.midPrice || price.lowPrice || 0) > 0 && price.productId) return "medium";
  return "unavailable";
}

function imageConfidence(product = {}) {
  if (product.imageUrl && Number(product.imageCount || 0) > 0) return "high";
  if (product.imageUrl) return "medium";
  return "unavailable";
}

function pickPrice(prices = []) {
  if (!prices.length) return {};
  return [...prices].sort((a, b) => {
    const aMarket = a.marketPrice == null ? 1 : 0;
    const bMarket = b.marketPrice == null ? 1 : 0;
    if (aMarket !== bMarket) return aMarket - bMarket;
    const subtypeOrder = ["normal", "sealed", "unlimited", "holofoil", "reverse holofoil"];
    const ai = subtypeOrder.indexOf(normalizeSearch(a.subTypeName));
    const bi = subtypeOrder.indexOf(normalizeSearch(b.subTypeName));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  })[0] || {};
}

function normalizeTcgCsvSealed(product = {}, group = {}, price = {}) {
  const ext = extendedDataObject(product);
  const name = product.cleanName || product.name || "";
  const productType = inferProductType(name) || "Other sealed product";
  const marketPrice = numberOrEmpty(price.marketPrice);
  const midPrice = numberOrEmpty(price.midPrice);
  const lowPrice = numberOrEmpty(price.lowPrice);
  const highPrice = numberOrEmpty(price.highPrice);
  return {
    id: `tcgcsv-${product.productId}`,
    source: "TCGCSV",
    sourceType: "tcgcsv",
    sourceProductId: String(product.productId || ""),
    externalProductId: String(product.productId || ""),
    tcgplayerProductId: String(product.productId || ""),
    catalogType: "sealed",
    catalogItemType: productType === "Accessories" ? "accessory" : "sealed",
    name,
    productName: name,
    cleanName: product.cleanName || name,
    searchName: normalizeSearch(`${name} ${group.name || ""} ${productType} Pokemon TCG`),
    category: "Pokemon",
    game: "Pokemon TCG",
    groupId: String(group.groupId || product.groupId || ""),
    groupName: group.name || "",
    setName: group.name || "",
    setCode: group.abbreviation || "",
    expansion: group.name || "",
    series: "",
    era: "",
    productType,
    productLine: group.name || "",
    sealedSubtype: productType,
    isSealed: productType !== "Accessories",
    is_sealed: productType !== "Accessories",
    isAccessory: productType === "Accessories",
    imageUrl: product.imageUrl || "",
    photoUrl: product.imageUrl || "",
    imageSmall: product.imageUrl || "",
    imageLarge: product.imageUrl || "",
    imageSource: product.imageUrl ? "tcgcsv" : "placeholder",
    imageStatus: product.imageUrl ? "source" : "placeholder",
    imageConfidence: imageConfidence(product),
    productUrl: product.url || "",
    marketUrl: product.url || "",
    sourceUrl: product.url || "",
    upc: ext.upc || ext.gtin || ext.ean || "",
    barcode: ext.upc || ext.gtin || ext.ean || "",
    sku: ext.sku || ext.tcgplayer_sku || ext.pokemon_center_sku || "",
    packCount: ext.pack_count || "",
    msrp: numberOrEmpty(ext.msrp || ext.manufacturer_s_suggested_retail_price),
    msrpPrice: numberOrEmpty(ext.msrp || ext.manufacturer_s_suggested_retail_price),
    marketPrice: marketPrice || midPrice || "",
    marketValue: marketPrice || midPrice || "",
    lowPrice,
    midPrice,
    directLowPrice: numberOrEmpty(price.directLowPrice),
    highPrice,
    marketSource: marketPrice || midPrice ? "TCGCSV" : "Unknown",
    marketStatus: marketPrice || midPrice ? "cached" : "unknown",
    pricingConfidence: pricingConfidence(price),
    marketConfidenceLevel: pricingConfidence(price),
    sourceUpdatedAt: product.modifiedOn || group.modifiedOn || "",
    marketLastUpdated: product.modifiedOn || group.modifiedOn || "",
    releaseDate: product.presaleInfo?.releasedOn || group.publishedOn || "",
    releaseYear: String(product.presaleInfo?.releasedOn || group.publishedOn || "").slice(0, 4),
    lastUpdated: SYNC_TIMESTAMP,
    notes: "Imported from public TCGCSV product and price data. Restock and availability are not implied.",
  };
}

function normalizeTcgCsvCard(product = {}, group = {}, price = {}) {
  const ext = extendedDataObject(product);
  const name = product.cleanName || product.name || "";
  return {
    id: `tcgcsv-card-${product.productId}`,
    externalCardId: String(product.productId || ""),
    source: "TCGCSV",
    sourceType: "tcgcsv",
    sourceProductId: String(product.productId || ""),
    tcgplayerProductId: String(product.productId || ""),
    catalogType: "card",
    catalogItemType: "single",
    cardName: name,
    name,
    cleanName: product.cleanName || name,
    searchName: normalizeSearch(`${name} ${group.name || ""} ${ext.number || ""} Pokemon TCG`),
    category: "Pokemon",
    game: "Pokemon TCG",
    groupId: String(group.groupId || product.groupId || ""),
    setName: group.name || "",
    setCode: group.abbreviation || "",
    expansion: group.name || "",
    cardNumber: ext.number || ext.card_number || "",
    setNumber: ext.number || ext.card_number || "",
    rarity: ext.rarity || "",
    imageSmall: product.imageUrl || "",
    imageLarge: product.imageUrl || "",
    imageUrl: product.imageUrl || "",
    photoUrl: product.imageUrl || "",
    imageSource: product.imageUrl ? "tcgcsv" : "placeholder",
    imageStatus: product.imageUrl ? "source" : "placeholder",
    imageConfidence: imageConfidence(product),
    tcgplayerUrl: product.url || "",
    productUrl: product.url || "",
    marketUrl: product.url || "",
    marketValueRaw: numberOrEmpty(price.marketPrice),
    marketValueNearMint: numberOrEmpty(price.marketPrice || price.midPrice),
    marketPrice: numberOrEmpty(price.marketPrice || price.midPrice),
    lowPrice: numberOrEmpty(price.lowPrice),
    midPrice: numberOrEmpty(price.midPrice),
    directLowPrice: numberOrEmpty(price.directLowPrice),
    highPrice: numberOrEmpty(price.highPrice),
    marketSource: price.marketPrice || price.midPrice ? "TCGCSV" : "Unknown",
    marketStatus: price.marketPrice || price.midPrice ? "cached" : "unknown",
    pricingConfidence: pricingConfidence(price),
    marketConfidenceLevel: pricingConfidence(price),
    sourceUpdatedAt: product.modifiedOn || group.modifiedOn || "",
    marketLastUpdated: product.modifiedOn || group.modifiedOn || "",
    lastUpdated: SYNC_TIMESTAMP,
  };
}

function normalizeMarketPrice(product = {}, group = {}, price = {}, catalogType = "sealed") {
  const marketPrice = numberOrEmpty(price.marketPrice || price.midPrice);
  return {
    id: `tcgcsv-price-${product.productId}-${slug(price.subTypeName || "normal")}`,
    catalogItemId: catalogType === "card" ? `tcgcsv-card-${product.productId}` : `tcgcsv-${product.productId}`,
    productId: catalogType === "card" ? `tcgcsv-card-${product.productId}` : `tcgcsv-${product.productId}`,
    sourceProductId: String(product.productId || ""),
    tcgplayerProductId: String(product.productId || ""),
    catalogType,
    itemType: catalogType,
    source: "TCGCSV",
    externalSource: "TCGCSV",
    externalId: String(product.productId || ""),
    name: product.cleanName || product.name || "",
    setName: group.name || "",
    productType: catalogType === "card" ? "Card" : inferProductType(product.name || product.cleanName),
    sourceUrl: product.url || "",
    priceType: "market",
    condition: price.subTypeName || "Normal",
    variant: price.subTypeName || "Normal",
    currency: "USD",
    price: marketPrice,
    marketPrice,
    lowPrice: numberOrEmpty(price.lowPrice),
    midPrice: numberOrEmpty(price.midPrice),
    highPrice: numberOrEmpty(price.highPrice),
    directLow: numberOrEmpty(price.directLowPrice),
    directLowPrice: numberOrEmpty(price.directLowPrice),
    timestamp: product.modifiedOn || group.modifiedOn || SYNC_TIMESTAMP,
    marketStatus: marketPrice ? "cached" : "unknown",
    pricingConfidence: pricingConfidence(price),
    confidenceScore: pricingConfidence(price) === "high" ? 88 : pricingConfidence(price) === "medium" ? 68 : 0,
    sourceUpdatedAt: product.modifiedOn || group.modifiedOn || "",
    createdAt: SYNC_TIMESTAMP,
    updatedAt: SYNC_TIMESTAMP,
  };
}

function normalizeManualSealed(row = {}) {
  const name = row.productName || row.name || "";
  const id = row.id || row.productId || row.externalProductId || `sealed-${slug(name)}-${slug(row.setCode || row.setName)}`;
  return {
    id,
    externalProductId: row.externalProductId || row.external_product_id || "",
    catalogType: "sealed",
    productName: name,
    name,
    productType: row.productType || row.product_type || "Other sealed product",
    setId: row.setId || row.set_id || "",
    setName: row.setName || row.set_name || "",
    setCode: row.setCode || row.set_code || "",
    series: row.series || "",
    era: row.era || row.series || "",
    releaseDate: row.releaseDate || row.release_date || "",
    releaseYear: row.releaseYear || row.release_year || "",
    msrp: row.MSRP || row.msrp || "",
    msrpPrice: numberOrEmpty(row.MSRP || row.msrp),
    upc: row.UPC || row.upc || "",
    barcode: row.UPC || row.upc || "",
    sku: row.SKU || row.sku || "",
    packCount: row.packCount || row.pack_count || "",
    imageUrl: row.imageUrl || row.image_url || "",
    photoUrl: row.imageUrl || row.image_url || "",
    imageSmall: row.imageSmall || row.imageUrl || row.image_url || "",
    imageLarge: row.imageLarge || row.imageUrl || row.image_url || "",
    imageSource: row.imageSource || row.image_source || (row.imageUrl || row.image_url ? "manual" : "placeholder"),
    imageStatus: row.imageStatus || row.image_status || (row.imageUrl || row.image_url ? "manual" : "placeholder"),
    imageConfidence: row.imageUrl || row.image_url ? "medium" : "unavailable",
    marketValue: numberOrEmpty(row.marketValue || row.market_value),
    marketPrice: numberOrEmpty(row.marketPrice || row.marketValue || row.market_value),
    marketSource: row.marketSource || row.market_source || "Unknown",
    marketStatus: row.marketStatus || row.market_status || (row.marketValue || row.market_value ? "manual" : "unknown"),
    pricingConfidence: row.marketValue || row.market_value ? "medium" : "unavailable",
    sourceType: row.sourceType || row.source_type || "manual_csv",
    source: row.source || row.sourceType || row.source_type || "manual_csv",
    sourceId: row.sourceId || row.source_id || "",
    sourceProductId: row.sourceId || row.source_id || "",
    lastUpdated: SYNC_TIMESTAMP,
    sourceUpdatedAt: row.marketLastUpdated || row.market_last_updated || "",
    marketLastUpdated: row.marketLastUpdated || row.market_last_updated || "",
    notes: row.notes || "",
  };
}

function mergeProducts(manualRows = [], importedRows = []) {
  const byKey = new Map();
  for (const row of [...manualRows, ...importedRows]) {
    const key = String(row.tcgplayerProductId || row.externalProductId || `${normalizeSearch(row.productName || row.name)}|${normalizeSearch(row.setName)}|${normalizeSearch(row.productType)}`);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...row,
      id: existing.id || row.id,
      msrp: existing.msrp || row.msrp,
      msrpPrice: existing.msrpPrice || row.msrpPrice,
      notes: existing.notes || row.notes,
    });
  }
  return [...byKey.values()].sort((a, b) => String(a.productName || a.name).localeCompare(String(b.productName || b.name)) || String(a.id).localeCompare(String(b.id)));
}

async function syncTcgCsvCatalog() {
  const groupsPayload = await fetchJson(`${TCGCSV_BASE}/${POKEMON_CATEGORY_ID}/groups`);
  const allGroups = (groupsPayload?.results || []).sort((a, b) => new Date(b.modifiedOn || b.publishedOn || 0) - new Date(a.modifiedOn || a.publishedOn || 0));
  const explicitGroupIds = String(process.env.TCGCSV_GROUP_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const groups = explicitGroupIds.length
    ? allGroups.filter((group) => explicitGroupIds.includes(String(group.groupId)))
    : DEFAULT_GROUP_LIMIT > 0
      ? allGroups.slice(0, DEFAULT_GROUP_LIMIT)
      : allGroups;
  const sealed = [];
  const cards = [];
  const marketPrices = [];
  const failedGroups = [];

  for (const group of groups) {
    try {
      const [productsPayload, pricesPayload] = await Promise.all([
        fetchJson(`${TCGCSV_BASE}/${POKEMON_CATEGORY_ID}/${group.groupId}/products`),
        fetchJson(`${TCGCSV_BASE}/${POKEMON_CATEGORY_ID}/${group.groupId}/prices`),
      ]);
      const pricesByProduct = new Map();
      for (const price of pricesPayload?.results || []) {
        const key = String(price.productId || "");
        if (!pricesByProduct.has(key)) pricesByProduct.set(key, []);
        pricesByProduct.get(key).push(price);
      }
      for (const product of productsPayload?.results || []) {
        const primaryPrice = pickPrice(pricesByProduct.get(String(product.productId)) || []);
        const catalogType = isSealedOrAccessory(product) ? "sealed" : "card";
        if (catalogType === "sealed") sealed.push(normalizeTcgCsvSealed(product, group, primaryPrice));
        else cards.push(normalizeTcgCsvCard(product, group, primaryPrice));
        if (primaryPrice.productId) marketPrices.push(normalizeMarketPrice(product, group, primaryPrice, catalogType));
      }
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      failedGroups.push({ groupId: group.groupId, name: group.name, error: error.message || String(error) });
    }
  }

  const manualSealed = (await readCsv(path.join(seedCatalogDir, "sealed-products.csv"))).map(normalizeManualSealed);
  return {
    groups: allGroups,
    syncedGroups: groups,
    sealedProducts: mergeProducts(manualSealed, sealed),
    cards: cards.sort((a, b) => String(a.setName).localeCompare(String(b.setName)) || String(a.cardName).localeCompare(String(b.cardName))),
    marketPrices: marketPrices.sort((a, b) => String(a.catalogItemId).localeCompare(String(b.catalogItemId)) || String(a.variant).localeCompare(String(b.variant))),
    failedGroups,
  };
}

function normalizeChainName(value = "") {
  const text = String(value || "").trim();
  const lower = normalizeSearch(text);
  if (lower.includes("walmart")) return "Walmart";
  if (lower.includes("target")) return "Target";
  if (lower.includes("best buy")) return "Best Buy";
  if (lower.includes("barnes")) return "Barnes & Noble";
  if (lower.includes("gamestop") || lower.includes("game stop")) return "GameStop";
  if (lower.includes("sam")) return "Sam's Club";
  if (lower.includes("bj")) return "BJ's Wholesale Club";
  if (lower.includes("costco")) return "Costco";
  if (lower.includes("five below")) return "Five Below";
  if (lower.includes("dollar general")) return "Dollar General";
  if (lower.includes("family dollar")) return "Family Dollar";
  if (lower.includes("dollar tree")) return "Dollar Tree";
  if (lower.includes("kohl")) return "Kohl's";
  if (lower.includes("michaels")) return "Michaels";
  if (lower.includes("hobby lobby")) return "Hobby Lobby";
  if (lower.includes("dick")) return "DICK'S Sporting Goods";
  if (lower.includes("walgreens")) return "Walgreens";
  if (lower.includes("cvs")) return "CVS";
  if (/card|collectible|comic|hobby|game/.test(lower)) return "Local Game / Card Store";
  return text;
}

function storeAddress(tags = {}) {
  return [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
}

function storeCity(tags = {}) {
  return tags["addr:city"] || tags["is_in:city"] || tags["addr:county"] || "";
}

function osmStoreFromElement(element = {}) {
  const tags = element.tags || {};
  const name = tags.name || tags.brand || tags.operator || "";
  const chain = normalizeChainName(tags.brand || tags.operator || name);
  const lat = element.lat ?? element.center?.lat ?? "";
  const lon = element.lon ?? element.center?.lon ?? "";
  return {
    id: `osm-${element.type}-${element.id}`,
    storeId: `osm-${element.type}-${element.id}`,
    source: "OpenStreetMap Overpass",
    sourcePlaceId: `${element.type}/${element.id}`,
    osmId: String(element.id || ""),
    chain,
    retailer: chain,
    storeName: name,
    name,
    normalizedName: normalizeSearch(`${chain} ${name}`),
    nickname: "",
    address: storeAddress(tags),
    city: storeCity(tags),
    state: tags["addr:state"] || "Virginia",
    zip: tags["addr:postcode"] || "",
    zipCode: tags["addr:postcode"] || "",
    postalCode: tags["addr:postcode"] || "",
    latitude: lat,
    longitude: lon,
    phone: tags.phone || tags["contact:phone"] || "",
    website: tags.website || tags["contact:website"] || "",
    region: "",
    county: tags["addr:county"] || "",
    categories: [tags.shop, tags.amenity, tags.brand].filter(Boolean),
    tags: {
      shop: tags.shop || "",
      amenity: tags.amenity || "",
      brand: tags.brand || "",
      operator: tags.operator || "",
    },
    confidence: "directory_match",
    sourceConfidence: "directory_match",
    pokemonConfidence: "unknown",
    pokemonStockLikelihood: "unknown",
    carriesPokemonLikely: STORE_CHAIN_PATTERNS.some((pattern) => normalizeSearch(chain).includes(normalizeSearch(pattern))) || /card|hobby|game|toy|book/.test(normalizeSearch(`${tags.shop || ""} ${name}`)),
    storeType: tags.shop || "Retail",
    type: tags.shop || "Retail",
    notes: "Directory match from OpenStreetMap. Restock days, truck days, and purchase limits stay Unknown until Scout reports verify them.",
    sourceUpdatedAt: SYNC_TIMESTAMP,
    updatedAt: SYNC_TIMESTAMP,
    createdAt: SYNC_TIMESTAMP,
  };
}

function isRelevantOsmStore(store = {}) {
  const chainText = normalizeSearch(store.chain || store.retailer || "");
  const nameText = normalizeSearch(`${store.name || ""} ${store.storeName || ""}`);
  const categoryText = normalizeSearch((store.categories || []).join(" "));
  const knownChain = STORE_CHAIN_PATTERNS.some((pattern) => chainText === normalizeSearch(pattern));
  const localGameStore = /card|collectible|comic|hobby|game/.test(`${chainText} ${nameText} ${categoryText}`);
  return knownChain || localGameStore;
}

async function readExistingStoreSeeds() {
  const fileNames = (await fs.readdir(seedStoreDir)).filter((fileName) => fileName.endsWith(".json")).sort();
  const rows = [];
  for (const fileName of fileNames) {
    const parsed = await readJson(path.join(seedStoreDir, fileName), { stores: [] });
    for (const store of parsed.stores || []) {
      rows.push({
        ...store,
        id: `seed-${slug(`${store.chain || store.retailer}-${store.address}-${store.city}-${store.zip || store.zipCode}`)}`,
        source: parsed.source || fileName,
        region: store.region || parsed.region || "",
        state: store.state || parsed.state || "Virginia",
        confidence: store.confidence || "local_seed",
        sourceUpdatedAt: SYNC_TIMESTAMP,
      });
    }
  }
  return rows;
}

function storeMergeKey(store = {}) {
  const address = normalizeSearch(store.address);
  if (address) return `${normalizeSearch(store.chain || store.retailer)}|${address}|${normalizeSearch(store.city)}|${store.zip || store.zipCode || store.postalCode || ""}`;
  return `${normalizeSearch(store.chain || store.retailer)}|${normalizeSearch(store.name || store.storeName)}|${normalizeSearch(store.city)}|${store.zip || store.zipCode || store.postalCode || ""}`;
}

function mergeStores(seedStores = [], osmStores = []) {
  const byKey = new Map();
  for (const store of [...osmStores, ...seedStores]) {
    const key = storeMergeKey(store);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, store);
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...store,
      id: store.id || existing.id,
      storeId: store.storeId || existing.storeId,
      source: [existing.source, store.source].filter(Boolean).join(" + "),
      nickname: store.nickname || existing.nickname || "",
      notes: store.notes || existing.notes,
      confidence: store.confidence || existing.confidence,
    });
  }
  return [...byKey.values()].sort((a, b) =>
    String(a.chain || a.retailer).localeCompare(String(b.chain || b.retailer)) ||
    String(a.city || "").localeCompare(String(b.city || "")) ||
    String(a.name || a.storeName || "").localeCompare(String(b.name || b.storeName || ""))
  );
}

function overpassQuery() {
  const chainRegex = STORE_CHAIN_PATTERNS.map((chain) => chain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return `
[out:json][timeout:180];
area["ISO3166-2"="US-VA"][admin_level=4]->.searchArea;
(
  nwr["name"~"${chainRegex}",i](area.searchArea);
  nwr["brand"~"${chainRegex}",i](area.searchArea);
  nwr["shop"~"games|toys|books|department_store|supermarket|variety_store|chemist|craft|sports|wholesale",i](area.searchArea);
);
out center tags;
`;
}

async function syncVirginiaStores() {
  const seedStores = await readExistingStoreSeeds();
  if (String(process.env.SKIP_OVERPASS || "").toLowerCase() === "true") {
    return { stores: mergeStores(seedStores, []), importedFromOverpass: 0, overpassError: "" };
  }
  try {
    const body = new URLSearchParams({ data: overpassQuery() });
    const payload = await fetchJson("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    }, 2);
    const osmStores = (payload?.elements || [])
      .map(osmStoreFromElement)
      .filter((store) => store.name && store.chain && (store.latitude || store.longitude || store.address))
      .filter(isRelevantOsmStore);
    return { stores: mergeStores(seedStores, osmStores), importedFromOverpass: osmStores.length, overpassError: "" };
  } catch (error) {
    return { stores: mergeStores(seedStores, []), importedFromOverpass: 0, overpassError: error.message || String(error) };
  }
}

function chainCounts(stores = []) {
  return stores.reduce((counts, store) => {
    const key = store.chain || store.retailer || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

async function writeGenerated(fileName, data) {
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(path.join(generatedDir, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  const beforeSealed = await readJson(path.join(generatedDir, "sealedProducts.json"), []);
  const beforeCards = await readJson(path.join(generatedDir, "pokemonTcgCards.json"), []);
  const beforePrices = await readJson(path.join(generatedDir, "marketPrices.json"), []);
  const beforeStores = await readJson(path.join(generatedDir, "virginiaStores.json"), []);

  const catalog = await syncTcgCsvCatalog();
  const stores = await syncVirginiaStores();

  const status = {
    lastImportedAt: SYNC_TIMESTAMP,
    source: "tcgcsv-plus-local-seeds",
    tcgcsvCategoryId: POKEMON_CATEGORY_ID,
    tcgcsvGroupsAvailable: catalog.groups.length,
    tcgcsvGroupsSynced: catalog.syncedGroups.length,
    cardsImported: catalog.cards.length,
    sealedProductsImported: catalog.sealedProducts.length,
    marketPricesImported: catalog.marketPrices.length,
    aliasesImported: (await readJson(path.join(generatedDir, "searchAliases.json"), [])).length,
    productsWithPhotos: catalog.sealedProducts.filter((item) => item.imageUrl).length + catalog.cards.filter((item) => item.imageUrl).length,
    productsWithReferencePrices: catalog.marketPrices.filter((price) => Number(price.marketPrice || 0) > 0).length,
    virginiaStoresImported: stores.stores.length,
    virginiaStoresFromOverpass: stores.importedFromOverpass,
    virginiaStoreCountsByChain: chainCounts(stores.stores),
    failedTcgcsvGroups: catalog.failedGroups,
    overpassError: stores.overpassError,
    notes: "Generated from public TCGCSV product/price JSON and cached Virginia store directory data. No retailer scraping and no TCGplayer page scraping. Pricing is reference data, not a live offer.",
  };

  await writeGenerated("sealedProducts.json", catalog.sealedProducts);
  await writeGenerated("pokemonTcgCards.json", catalog.cards);
  await writeGenerated("marketPrices.json", catalog.marketPrices);
  await writeGenerated("virginiaStores.json", stores.stores);
  await writeGenerated("catalogImportStatus.json", status);

  console.log(JSON.stringify({
    ok: true,
    before: {
      catalogProducts: beforeSealed.length + beforeCards.length,
      sealedProducts: beforeSealed.length,
      cards: beforeCards.length,
      marketPrices: beforePrices.length,
      virginiaStores: beforeStores.length,
    },
    after: {
      catalogProducts: catalog.sealedProducts.length + catalog.cards.length,
      sealedProducts: catalog.sealedProducts.length,
      cards: catalog.cards.length,
      productsWithPhotos: status.productsWithPhotos,
      marketPrices: catalog.marketPrices.length,
      virginiaStores: stores.stores.length,
      virginiaStoresFromOverpass: stores.importedFromOverpass,
    },
    failedTcgcsvGroups: catalog.failedGroups.length,
    overpassError: stores.overpassError || "",
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  inferProductType,
  isSealedOrAccessory,
  normalizeSearch,
  normalizeTcgCsvSealed,
  normalizeTcgCsvCard,
  normalizeMarketPrice,
  pricingConfidence,
  imageConfidence,
  storeMergeKey,
  mergeStores,
  osmStoreFromElement,
  isRelevantOsmStore,
};
