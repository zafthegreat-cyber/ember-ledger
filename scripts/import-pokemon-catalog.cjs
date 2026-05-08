const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const seedDir = path.join(rootDir, "seeds", "catalog");
const generatedDir = path.join(rootDir, "src", "data", "generated");

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function numberOrEmpty(value) {
  if (value === undefined || value === null || value === "") return "";
  const next = Number(value);
  return Number.isFinite(next) ? next : "";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.sets)) return value.sets;
  if (Array.isArray(value?.cards)) return value.cards;
  return [];
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonArray(filePath) {
  if (!(await exists(filePath))) return [];
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  return asArray(parsed);
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

async function readCsv(filePath) {
  if (!(await exists(filePath))) return [];
  const text = await fs.readFile(filePath, "utf8");
  return parseCsv(text);
}

async function readCardJsonFiles() {
  const cards = [];
  const singleFile = path.join(seedDir, "pokemon-tcg", "cards.json");
  cards.push(...(await readJsonArray(singleFile)));

  const cardsDir = path.join(seedDir, "pokemon-tcg", "cards");
  if (await exists(cardsDir)) {
    const fileNames = await fs.readdir(cardsDir);
    for (const fileName of fileNames.filter((name) => name.endsWith(".json")).sort()) {
      cards.push(...(await readJsonArray(path.join(cardsDir, fileName))));
    }
  }

  return cards;
}

function marketFromPokemonTcgPrices(card = {}) {
  const prices = card.tcgplayer?.prices || {};
  const preferred = prices.holofoil || prices.normal || prices.reverseHolofoil || prices["1stEditionHolofoil"] || {};
  return {
    marketValueRaw: numberOrEmpty(preferred.market),
    marketValueNearMint: numberOrEmpty(preferred.market),
    marketValueReverseHolo: numberOrEmpty(prices.reverseHolofoil?.market),
    marketValueHolofoil: numberOrEmpty(prices.holofoil?.market),
    marketValueFirstEdition: numberOrEmpty(prices["1stEditionHolofoil"]?.market),
    marketSource: preferred.market ? "Pokemon TCG API cached tcgplayer price" : "Unknown",
    marketStatus: preferred.market ? "cached" : "unknown",
    marketLastUpdated: card.tcgplayer?.updatedAt || "",
  };
}

function normalizeSet(raw = {}) {
  const id = raw.id || raw.setId || slug(raw.name || raw.setName);
  return {
    id,
    setId: id,
    setName: raw.name || raw.setName || "",
    setCode: raw.ptcgoCode || raw.setCode || raw.code || raw.id || "",
    ptcgoCode: raw.ptcgoCode || "",
    aliases: [raw.ptcgoCode, raw.id, raw.name].filter(Boolean),
    series: raw.series || "",
    era: raw.series || raw.era || "",
    releaseDate: raw.releaseDate || "",
    printedTotal: raw.printedTotal || "",
    total: raw.total || "",
    logoUrl: raw.images?.logo || raw.logoUrl || "",
    symbolUrl: raw.images?.symbol || raw.symbolUrl || "",
    imageSource: raw.images?.logo || raw.images?.symbol ? "pokemon_tcg_api" : "placeholder",
    imageStatus: raw.images?.logo || raw.images?.symbol ? "api" : "placeholder",
    sourceType: raw.sourceType || "pokemon_tcg_api_json",
    sourceId: raw.id || "",
    lastUpdated: new Date().toISOString(),
  };
}

function normalizeCard(raw = {}) {
  const cardName = raw.name || raw.cardName || "";
  const set = raw.set || {};
  const setName = set.name || raw.setName || "";
  const market = marketFromPokemonTcgPrices(raw);
  return {
    id: raw.id || raw.cardId || `card-${slug(set.id || setName)}-${slug(raw.number || raw.cardNumber)}-${slug(cardName)}`,
    externalCardId: raw.id || raw.externalCardId || "",
    catalogType: "card",
    cardName,
    pokemonName: raw.pokemonName || cardName,
    setId: set.id || raw.setId || "",
    setName,
    setCode: set.ptcgoCode || set.id || raw.setCode || "",
    cardNumber: raw.number || raw.cardNumber || "",
    printedNumber: raw.number || raw.printedNumber || "",
    printedTotal: set.printedTotal || raw.printedTotal || "",
    rarity: raw.rarity || "",
    supertype: raw.supertype || "",
    subtypes: raw.subtypes || [],
    types: raw.types || [],
    variant: raw.variant || "",
    artist: raw.artist || "",
    imageSmall: raw.images?.small || raw.imageSmall || "",
    imageLarge: raw.images?.large || raw.imageLarge || "",
    imageSource: raw.images?.small || raw.images?.large ? "pokemon_tcg_api" : "placeholder",
    imageStatus: raw.images?.small || raw.images?.large ? "api" : "placeholder",
    imageLastUpdated: new Date().toISOString(),
    tcgplayerUrl: raw.tcgplayer?.url || raw.tcgplayerUrl || "",
    ...market,
    sourceType: raw.sourceType || "pokemon_tcg_api_json",
    sourceId: raw.id || "",
    lastUpdated: new Date().toISOString(),
  };
}

function normalizeSealedProduct(row = {}) {
  const productName = row.productName || row.name || row.product_name || "";
  return {
    id: row.id || row.productId || row.externalProductId || `sealed-${slug(productName)}-${slug(row.setCode || row.setName)}`,
    externalProductId: row.externalProductId || row.external_product_id || "",
    catalogType: "sealed",
    productName,
    productType: row.productType || row.product_type || "",
    setId: row.setId || row.set_id || "",
    setName: row.setName || row.set_name || "",
    setCode: row.setCode || row.set_code || "",
    series: row.series || "",
    era: row.era || row.series || "",
    releaseDate: row.releaseDate || row.release_date || "",
    releaseYear: row.releaseYear || row.release_year || "",
    msrp: row.MSRP || row.msrp || "Unknown",
    upc: row.UPC || row.upc || "Unknown",
    sku: row.SKU || row.sku || "Unknown",
    packCount: row.packCount || row.pack_count || "Unknown",
    imageUrl: row.imageUrl || row.image_url || "",
    imageSmall: row.imageSmall || "",
    imageLarge: row.imageLarge || row.imageUrl || row.image_url || "",
    imageSource: row.imageSource || row.image_source || (row.imageUrl || row.image_url ? "manual" : "placeholder"),
    imageStatus: row.imageStatus || row.image_status || (row.imageUrl || row.image_url ? "manual" : "placeholder"),
    imageSourceUrl: row.imageSourceUrl || row.image_source_url || "",
    imageLastUpdated: row.imageLastUpdated || "",
    imageNeedsReview: row.imageNeedsReview === "true" || row.image_needs_review === "true",
    marketValue: numberOrEmpty(row.marketValue || row.market_value),
    marketSource: row.marketSource || row.market_source || "Unknown",
    marketStatus: row.marketStatus || row.market_status || (row.marketValue || row.market_value ? "manual" : "unknown"),
    marketLastUpdated: row.marketLastUpdated || row.market_last_updated || "",
    sourceType: row.sourceType || row.source_type || "manual_csv",
    sourceId: row.sourceId || row.source_id || "",
    lastUpdated: new Date().toISOString(),
    notes: row.notes || "",
  };
}

function normalizeMarketPrice(row = {}) {
  return {
    id: row.id || `market-${slug(row.catalogItemId)}-${slug(row.source)}-${slug(row.priceType)}-${slug(row.condition)}-${slug(row.timestamp)}`,
    catalogItemId: row.catalogItemId || row.catalog_item_id || "",
    catalogType: row.catalogType || row.catalog_type || "",
    source: row.source || "manual_csv",
    priceType: row.priceType || row.price_type || "market",
    condition: row.condition || "",
    variant: row.variant || "",
    currency: row.currency || "USD",
    price: numberOrEmpty(row.price),
    lowPrice: numberOrEmpty(row.lowPrice || row.low_price),
    midPrice: numberOrEmpty(row.midPrice || row.mid_price),
    highPrice: numberOrEmpty(row.highPrice || row.high_price),
    marketPrice: numberOrEmpty(row.marketPrice || row.market_price),
    directLow: numberOrEmpty(row.directLow || row.direct_low),
    timestamp: row.timestamp || new Date().toISOString(),
    sourceUrl: row.sourceUrl || row.source_url || "",
  };
}

function normalizeAlias(row = {}) {
  return {
    id: row.id || `alias-${slug(row.targetType)}-${slug(row.alias)}-${slug(row.targetName || row.targetId)}`,
    alias: row.alias || "",
    targetType: row.targetType || row.target_type || "",
    targetId: row.targetId || row.target_id || "",
    targetName: row.targetName || row.target_name || "",
    weight: numberOrEmpty(row.weight) || 1,
    sourceType: row.sourceType || row.source_type || "manual_csv",
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: row.updatedAt || new Date().toISOString(),
  };
}

function generatedAliasesFromSetsAndProducts(sets, products, cards) {
  const aliases = [];
  for (const set of sets) {
    for (const alias of [set.setCode, set.ptcgoCode, set.sourceId, set.setName, ...(set.aliases || [])].filter(Boolean)) {
      aliases.push(normalizeAlias({ alias, targetType: "set", targetId: set.setId, targetName: set.setName, weight: 2, sourceType: "generated" }));
    }
  }
  for (const product of products) {
    for (const alias of [product.productType, product.setCode, product.productName].filter(Boolean)) {
      aliases.push(normalizeAlias({ alias, targetType: "product", targetId: product.id, targetName: product.productName, weight: 1, sourceType: "generated" }));
    }
  }
  for (const card of cards) {
    for (const alias of [card.cardName, card.pokemonName, card.cardNumber, card.setCode].filter(Boolean)) {
      aliases.push(normalizeAlias({ alias, targetType: "card", targetId: card.id, targetName: card.cardName, weight: 1, sourceType: "generated" }));
    }
  }
  const deduped = new Map();
  aliases.forEach((alias) => {
    const key = `${alias.targetType}|${alias.targetId}|${String(alias.alias).toLowerCase()}`;
    if (!deduped.has(key)) deduped.set(key, alias);
  });
  return [...deduped.values()];
}

async function writeJson(fileName, data) {
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(path.join(generatedDir, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  const rawSets = await readJsonArray(path.join(seedDir, "pokemon-tcg", "sets.json"));
  const rawCards = await readCardJsonFiles();
  const sealedRows = await readCsv(path.join(seedDir, "sealed-products.csv"));
  const marketRows = await readCsv(path.join(seedDir, "market-prices.csv"));
  const aliasRows = await readCsv(path.join(seedDir, "search-aliases.csv"));

  const sets = rawSets.map(normalizeSet);
  const cards = rawCards.map(normalizeCard);
  const sealedProducts = sealedRows.filter((row) => row.productName || row.name || row.product_name).map(normalizeSealedProduct);
  const marketPrices = marketRows.filter((row) => row.catalogItemId || row.catalog_item_id).map(normalizeMarketPrice);
  const importedAliases = aliasRows.filter((row) => row.alias).map(normalizeAlias);
  const generatedAliases = generatedAliasesFromSetsAndProducts(sets, sealedProducts, cards);
  const aliases = [...importedAliases, ...generatedAliases];

  const status = {
    lastImportedAt: new Date().toISOString(),
    setsImported: sets.length,
    cardsImported: cards.length,
    sealedProductsImported: sealedProducts.length,
    marketPricesImported: marketPrices.length,
    aliasesImported: aliases.length,
    source: "local-json-csv-import",
    notes: "Generated from seeds/catalog local files. Empty counts mean no source export has been dropped in yet.",
  };

  await writeJson("pokemonTcgSets.json", sets);
  await writeJson("pokemonTcgCards.json", cards);
  await writeJson("sealedProducts.json", sealedProducts);
  await writeJson("marketPrices.json", marketPrices);
  await writeJson("searchAliases.json", aliases);
  await writeJson("catalogImportStatus.json", status);

  console.log(`Catalog import complete: ${sets.length} sets, ${cards.length} cards, ${sealedProducts.length} sealed products, ${marketPrices.length} market prices, ${aliases.length} aliases.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
