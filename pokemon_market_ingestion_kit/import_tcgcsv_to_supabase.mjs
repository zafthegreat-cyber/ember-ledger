import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parsePokemonCardNumber } from './card_number_utils.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;
const CATEGORY_ID = Number(process.env.TCGCSV_CATEGORY_ID || 3); // 3 = Pokemon
const GROUP_LIMIT = Number(process.env.GROUP_LIMIT || 0); // 0 = all groups
const PRODUCT_BATCH_SIZE = Number(process.env.PRODUCT_BATCH_SIZE || 250);
const PRICE_BATCH_SIZE = Number(process.env.PRICE_BATCH_SIZE || 500);
const PRICE_HISTORY_MODE = String(process.env.PRICE_HISTORY_MODE || 'append').toLowerCase();
const WRITE_PRICE_HISTORY =
  PRICE_HISTORY_MODE === 'append' ||
  String(process.env.WRITE_PRICE_HISTORY || '').toLowerCase() === 'true';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEFAULT_USER_ID) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or DEFAULT_USER_ID in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BASE = 'https://tcgcsv.com/tcgplayer';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PokemonMarketImporter/1.0' },
    });
    if (response.ok) return response.json();
    const body = await response.text().catch(() => '');
    if (attempt === retries) {
      throw new Error(`Fetch failed ${response.status} ${url}: ${body.slice(0, 300)}`);
    }
    await sleep(500 * attempt);
  }
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extendedDataObject(product) {
  const out = {};
  for (const item of product.extendedData || []) {
    const key = normalizeKey(item.name || item.displayName || item.propertyName || item.key);
    if (key) out[key] = item.value ?? item.displayValue ?? item.text ?? null;
  }
  return out;
}

function inferPackCount(name) {
  const text = String(name || '').toLowerCase();
  const explicit = text.match(/(\d+)\s*(pack|packs|booster packs)/i);
  if (explicit) return Number(explicit[1]);
  if (/booster box/.test(text)) return 36;
  if (/elite trainer box|\betb\b/.test(text)) return 8;
  if (/booster bundle/.test(text)) return 6;
  if (/build\s*&\s*battle/.test(text)) return 4;
  if (/single pack|sleeved booster|booster pack/.test(text)) return 1;
  return 0;
}

function inferSealed(product, ext) {
  const name = String(product.name || product.cleanName || '').toLowerCase();
  const productType = String(ext.product_type || ext.producttype || ext.type || '').toLowerCase();

  if (/sealed|booster|box|pack|tin|collection|bundle|case|blister|deck|trainer kit|premium|portfolio|binder|sleeves/.test(productType)) {
    return true;
  }
  if (/\b(card|single)\b/.test(productType) && !/code card/.test(productType)) {
    return false;
  }

  return /booster|elite trainer|\betb\b|box|pack|tin|collection|bundle|case|blister|deck|build\s*&\s*battle|theme deck|trainer kit|premium collection|ultra premium|checklane|sleeved|portfolio|binder|playmat|sleeves/.test(name);
}

function priceScore(price, isSealed) {
  const subtype = String(price?.subTypeName || '').toLowerCase();
  const hasMarket = price?.marketPrice != null ? 0 : 100;
  const order = isSealed
    ? ['normal', 'sealed', 'unlimited']
    : ['normal', 'holofoil', 'reverse holofoil', '1st edition normal', 'unlimited'];
  const idx = order.indexOf(subtype);
  return hasMarket + (idx === -1 ? 50 : idx);
}

function pickPrimaryPrice(prices, isSealed) {
  if (!prices?.length) return null;
  return [...prices].sort((a, b) => priceScore(a, isSealed) - priceScore(b, isSealed))[0];
}

function toNumberOrNull(value) {
  return value === undefined || value === null || value === '' ? null : Number(value);
}

async function upsertCatalogRows(rows) {
  const returned = [];
  for (const batch of chunk(rows, PRODUCT_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('product_catalog')
      .upsert(batch, { onConflict: 'market_source,external_product_id' })
      .select('id, external_product_id');
    if (error) throw error;
    returned.push(...(data || []));
  }
  return returned;
}

async function upsertPriceRows(rows) {
  for (const batch of chunk(rows, PRICE_BATCH_SIZE)) {
    const { error } = await supabase
      .from('product_market_price_current')
      .upsert(batch, { onConflict: 'source,source_product_id,price_subtype' });
    if (error) throw error;
  }

  if (WRITE_PRICE_HISTORY) {
    const historyRows = await filterDuplicateHistoryRows(rows.map(historyRowFromPriceRow));
    for (const batch of chunk(historyRows, PRICE_BATCH_SIZE)) {
      const { error } = await supabase.from('product_market_price_history').insert(batch);
      if (error) throw error;
    }
  }
}

function dayBounds(isoDate) {
  const date = new Date(isoDate);
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function priceFingerprint(row) {
  return [
    row.source,
    row.source_product_id,
    row.price_subtype || '',
    row.condition || '',
    String(row.market_price ?? ''),
    String(row.most_recent_sale ?? ''),
    String(row.listed_median ?? ''),
    String(row.low_sale_price ?? ''),
    String(row.high_sale_price ?? ''),
    String(row.low_price ?? ''),
    String(row.mid_price ?? ''),
    String(row.high_price ?? ''),
  ].join('|');
}

function historyRowFromPriceRow(row) {
  const { id, updated_at, ...priceRow } = row;
  const checkedAt = priceRow.checked_at || new Date().toISOString();
  const condition = priceRow.price_subtype || 'Unopened';
  return {
    ...priceRow,
    external_product_id: priceRow.source_product_id,
    tcgplayer_product_id: priceRow.source_product_id,
    condition,
    most_recent_sale: null,
    listed_median: priceRow.mid_price,
    low_sale_price: priceRow.low_price,
    high_sale_price: priceRow.high_price,
    snapshot_window: 'import',
    checked_at: checkedAt,
    price_checked_at: checkedAt,
  };
}

async function filterDuplicateHistoryRows(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const { start, end } = dayBounds(row.price_checked_at || row.checked_at);
    const key = `${row.source}|${start}|${end}`;
    if (!byDay.has(key)) byDay.set(key, { start, end, source: row.source, rows: [] });
    byDay.get(key).rows.push(row);
  }

  const filtered = [];
  for (const bucket of byDay.values()) {
    const productIds = [...new Set(bucket.rows.map((row) => row.source_product_id).filter(Boolean))];
    const existingFingerprints = new Set();
    for (const idBatch of chunk(productIds, 100)) {
      const { data, error } = await supabase
        .from('product_market_price_history')
        .select('source,source_product_id,price_subtype,condition,market_price,most_recent_sale,listed_median,low_sale_price,high_sale_price,low_price,mid_price,high_price')
        .eq('source', bucket.source)
        .in('source_product_id', idBatch)
        .gte('price_checked_at', bucket.start)
        .lt('price_checked_at', bucket.end);
      if (error) throw error;
      for (const row of data || []) existingFingerprints.add(priceFingerprint(row));
    }
    filtered.push(...bucket.rows.filter((row) => !existingFingerprints.has(priceFingerprint(row))));
  }

  return filtered;
}

async function main() {
  console.log(`Fetching TCGCSV Pokémon groups from category ${CATEGORY_ID}...`);
  const groupsJson = await fetchJson(`${BASE}/${CATEGORY_ID}/groups`);
  let groups = groupsJson.results || [];
  if (GROUP_LIMIT > 0) groups = groups.slice(0, GROUP_LIMIT);
  console.log(`Found ${groups.length} groups to process.`);

  let totalProducts = 0;
  let totalPriceRows = 0;

  for (const [index, group] of groups.entries()) {
    const label = `${group.groupId} ${group.name}`;
    console.log(`[${index + 1}/${groups.length}] ${label}`);

    const [productsJson, pricesJson] = await Promise.all([
      fetchJson(`${BASE}/${CATEGORY_ID}/${group.groupId}/products`),
      fetchJson(`${BASE}/${CATEGORY_ID}/${group.groupId}/prices`),
    ]);

    const products = productsJson.results || [];
    const prices = pricesJson.results || [];
    const pricesByProduct = new Map();
    for (const price of prices) {
      const key = String(price.productId);
      if (!pricesByProduct.has(key)) pricesByProduct.set(key, []);
      pricesByProduct.get(key).push(price);
    }

    const checkedAt = new Date().toISOString();
    const catalogRows = products.map((product) => {
      const ext = extendedDataObject(product);
      const isSealed = inferSealed(product, ext);
      const primaryPrice = pickPrimaryPrice(pricesByProduct.get(String(product.productId)), isSealed);
      const cardNumberMeta = isSealed
        ? parsePokemonCardNumber(null, null)
        : parsePokemonCardNumber(ext.number || ext.card_number || ext.card_no || null, ext.printed_total || ext.total || ext.set_total);
      return {
        user_id: DEFAULT_USER_ID,
        name: product.name || product.cleanName || `TCGplayer Product ${product.productId}`,
        category: 'Pokemon',
        set_name: group.name || null,
        product_type: isSealed ? 'Sealed Product' : 'Card',
        barcode: ext.upc || ext.gtin || ext.ean || null,
        market_source: 'TCGCSV',
        external_product_id: String(product.productId),
        tcgplayer_product_id: String(product.productId),
        market_url: product.url || null,
        image_url: product.imageUrl || null,
        market_price: toNumberOrNull(primaryPrice?.marketPrice),
        low_price: toNumberOrNull(primaryPrice?.lowPrice),
        mid_price: toNumberOrNull(primaryPrice?.midPrice),
        high_price: toNumberOrNull(primaryPrice?.highPrice),
        last_price_checked: checkedAt,
        set_code: group.abbreviation || '',
        expansion: group.name || '',
        product_line: 'Pokemon',
        pack_count: inferPackCount(product.name),
        source_group_id: group.groupId,
        source_group_name: group.name || null,
        price_subtype: primaryPrice?.subTypeName || null,
        is_sealed: isSealed,
        ...cardNumberMeta,
        rarity: ext.rarity || null,
        raw_source: { group, product, extendedData: ext },
        updated_at: checkedAt,
      };
    });

    const upserted = await upsertCatalogRows(catalogRows);
    const idByProductId = new Map(upserted.map((row) => [String(row.external_product_id), row.id]));

    const priceRows = [];
    for (const price of prices) {
      const productId = String(price.productId);
      priceRows.push({
        catalog_product_id: idByProductId.get(productId) || null,
        source: 'TCGCSV',
        source_product_id: productId,
        source_group_id: group.groupId,
        price_subtype: price.subTypeName || 'Default',
        low_price: toNumberOrNull(price.lowPrice),
        mid_price: toNumberOrNull(price.midPrice),
        high_price: toNumberOrNull(price.highPrice),
        market_price: toNumberOrNull(price.marketPrice),
        direct_low_price: toNumberOrNull(price.directLowPrice),
        currency: 'USD',
        raw_source: price,
        checked_at: checkedAt,
        updated_at: checkedAt,
      });
    }

    await upsertPriceRows(priceRows);

    totalProducts += products.length;
    totalPriceRows += priceRows.length;
    console.log(`  Upserted ${products.length} products and ${priceRows.length} current price rows.`);
  }

  console.log(`Done. Upserted/updated ${totalProducts} products and ${totalPriceRows} current price rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
