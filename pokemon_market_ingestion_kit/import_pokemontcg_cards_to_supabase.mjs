import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parsePokemonCardNumber } from './card_number_utils.mjs';
import {
  buildCardDetailsRow,
  formatPriceSubtype,
  inferExpansionKind,
  toNumberOrNull,
  variantMetaFromName,
} from './catalog_normalization_utils.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;
const POKEMON_TCG_API_KEY = process.env.POKEMON_TCG_API_KEY;
const PRODUCT_BATCH_SIZE = Number(process.env.PRODUCT_BATCH_SIZE || 250);
const PRICE_BATCH_SIZE = Number(process.env.PRICE_BATCH_SIZE || 500);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEFAULT_USER_ID) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or DEFAULT_USER_ID in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function fetchPokemonApi(path, params = {}) {
  const url = new URL(`https://api.pokemontcg.io/v2/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const headers = { 'User-Agent': 'PokemonTCGApiImporter/2.0' };
  if (POKEMON_TCG_API_KEY) headers['X-Api-Key'] = POKEMON_TCG_API_KEY;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Pokemon TCG API failed ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function fetchAllPokemonSets() {
  const payload = await fetchPokemonApi('sets', {
    page: 1,
    pageSize: 250,
    orderBy: 'releaseDate',
  });
  return payload.data || [];
}

async function fetchPokemonCardsPage(page) {
  return fetchPokemonApi('cards', {
    page,
    pageSize: 250,
    select:
      'id,name,supertype,subtypes,hp,types,evolvesFrom,abilities,attacks,weaknesses,resistances,retreatCost,convertedRetreatCost,set,number,artist,rarity,flavorText,regulationMark,legalities,images,tcgplayer,cardmarket,nationalPokedexNumbers',
  });
}

function priceChoices(card) {
  const prices = card?.tcgplayer?.prices || {};
  return Object.entries(prices).map(([subtype, value]) => ({
    subtype,
    variantName: formatPriceSubtype(subtype),
    ...value,
  }));
}

function pickPrimaryPrice(card) {
  const preferred = ['normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil', '1stEditionNormal'];
  const choices = priceChoices(card);
  if (!choices.length) return null;
  return choices.sort((a, b) => {
    const ai = preferred.indexOf(a.subtype);
    const bi = preferred.indexOf(b.subtype);
    const aScore = (a.market == null ? 100 : 0) + (ai === -1 ? 50 : ai);
    const bScore = (b.market == null ? 100 : 0) + (bi === -1 ? 50 : bi);
    return aScore - bScore;
  })[0];
}

async function upsertExpansionRows(rows) {
  const out = [];
  for (const batch of chunk(rows, PRODUCT_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('tcg_expansions')
      .upsert(batch, { onConflict: 'pokemon_tcg_io_id' })
      .select('id,pokemon_tcg_io_id,official_name');
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

async function upsertCatalogRows(rows) {
  const out = [];
  for (const batch of chunk(rows, PRODUCT_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('product_catalog')
      .upsert(batch, { onConflict: 'market_source,external_product_id' })
      .select('id,external_product_id');
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

async function upsertPriceRows(rows) {
  for (const batch of chunk(rows, PRICE_BATCH_SIZE)) {
    const { error } = await supabase
      .from('product_market_price_current')
      .upsert(batch, { onConflict: 'source,source_product_id,price_subtype' });
    if (error) throw error;
  }
}

async function upsertIdentifierRows(rows) {
  for (const batch of chunk(rows, PRICE_BATCH_SIZE)) {
    const { error } = await supabase
      .from('product_identifiers')
      .upsert(batch, { onConflict: 'identifier_type,identifier_value' });
    if (error) throw error;
  }
}

async function upsertVariantRows(rows) {
  for (const batch of chunk(rows, PRICE_BATCH_SIZE)) {
    const { error } = await supabase
      .from('catalog_product_variants')
      .upsert(batch, { onConflict: 'catalog_product_id,variant_name,language,condition_name' });
    if (error) throw error;
  }
}

async function upsertCardDetailsRows(rows) {
  for (const batch of chunk(rows, PRICE_BATCH_SIZE)) {
    const { error } = await supabase
      .from('tcg_card_details')
      .upsert(batch, { onConflict: 'catalog_product_id' });
    if (error) throw error;
  }
}

function expansionRowFromSet(set = {}) {
  return {
    official_name: set.name,
    display_name: set.name,
    series: set.series || null,
    set_code: set.id || null,
    ptcgo_code: set.ptcgoCode || null,
    pokemon_tcg_io_id: set.id,
    release_date: set.releaseDate || null,
    printed_total: toNumberOrNull(set.printedTotal),
    total: toNumberOrNull(set.total),
    symbol_url: set.images?.symbol || null,
    logo_url: set.images?.logo || null,
    expansion_kind: inferExpansionKind(set),
    legalities: set.legalities || {},
    raw_pokemontcg: set,
    updated_at: new Date().toISOString(),
  };
}

function variantRowsForCard(card = {}, catalogProductId = '') {
  const prices = priceChoices(card);
  if (!prices.length || !catalogProductId) return [];
  return prices.map((price, index) => {
    const meta = variantMetaFromName(price.variantName || price.subtype);
    return {
      catalog_product_id: catalogProductId,
      variant_name: meta.variantName,
      printing: meta.printing,
      finish: meta.finish,
      language: 'English',
      condition_name: '',
      is_default: index === 0,
    };
  });
}

function priceRowsForCard(card = {}, catalogProductId = '', checkedAt = '') {
  return priceChoices(card).map((price) => ({
    catalog_product_id: catalogProductId || null,
    source: 'PokemonTCGAPI',
    source_product_id: card.id,
    source_group_id: null,
    price_subtype: price.variantName,
    low_price: toNumberOrNull(price.low),
    mid_price: toNumberOrNull(price.mid),
    high_price: toNumberOrNull(price.high),
    market_price: toNumberOrNull(price.market),
    direct_low_price: toNumberOrNull(price.directLow),
    currency: 'USD',
    raw_source: { subtype: price.subtype, price },
    checked_at: checkedAt,
    updated_at: checkedAt,
  }));
}

async function main() {
  console.log('Fetching Pokemon TCG API expansion/set records...');
  const sets = await fetchAllPokemonSets();
  const expansions = await upsertExpansionRows(sets.map(expansionRowFromSet));
  const expansionByPokemonId = new Map(expansions.map((row) => [row.pokemon_tcg_io_id, row.id]));
  console.log(`Upserted ${expansions.length} normalized expansion records.`);

  let page = 1;
  let totalCount = Infinity;
  let imported = 0;
  let totalVariants = 0;
  let totalPrices = 0;

  while (imported < totalCount) {
    const payload = await fetchPokemonCardsPage(page);
    const cards = payload.data || [];
    totalCount = payload.totalCount ?? imported + cards.length;
    const checkedAt = new Date().toISOString();

    const catalogRows = cards.map((card) => {
      const price = pickPrimaryPrice(card);
      const cardNumberMeta = parsePokemonCardNumber(card.number, card.set?.printedTotal ?? card.set?.total);
      const expansionId = expansionByPokemonId.get(card.set?.id) || null;
      return {
        user_id: DEFAULT_USER_ID,
        name: card.name,
        category: 'Pokemon',
        set_name: card.set?.name || null,
        product_type: 'Card',
        market_source: 'PokemonTCGAPI',
        external_product_id: card.id,
        market_url: card.tcgplayer?.url || card.cardmarket?.url || null,
        image_url: card.images?.large || card.images?.small || null,
        image_small: card.images?.small || null,
        image_large: card.images?.large || null,
        market_price: toNumberOrNull(price?.market),
        low_price: toNumberOrNull(price?.low),
        mid_price: toNumberOrNull(price?.mid),
        high_price: toNumberOrNull(price?.high),
        last_price_checked: checkedAt,
        set_code: card.set?.id || '',
        expansion: card.set?.series || card.set?.name || '',
        expansion_id: expansionId,
        product_line: 'Pokemon',
        price_subtype: price?.variantName || null,
        is_sealed: false,
        product_kind: 'single_card',
        release_date: card.set?.releaseDate || null,
        region: 'US',
        language: 'English',
        ...cardNumberMeta,
        rarity: card.rarity || null,
        raw_source: card,
        updated_at: checkedAt,
      };
    });

    const upserted = await upsertCatalogRows(catalogRows);
    const idByCardId = new Map(upserted.map((row) => [String(row.external_product_id), row.id]));

    const identifierRows = [];
    const variantRows = [];
    const priceRows = [];
    const cardDetailsRows = [];

    for (const card of cards) {
      const catalogProductId = idByCardId.get(String(card.id));
      if (!catalogProductId) continue;
      identifierRows.push({
        catalog_product_id: catalogProductId,
        identifier_type: 'POKEMONTCG_IO_ID',
        identifier_value: card.id,
        source: 'PokemonTCGAPI',
        source_url: card.tcgplayer?.url || card.cardmarket?.url || null,
        confidence: 'imported',
      });
      variantRows.push(...variantRowsForCard(card, catalogProductId));
      priceRows.push(...priceRowsForCard(card, catalogProductId, checkedAt));
      cardDetailsRows.push(buildCardDetailsRow(catalogProductId, card));
    }

    if (identifierRows.length) await upsertIdentifierRows(identifierRows);
    if (variantRows.length) await upsertVariantRows(variantRows);
    if (priceRows.length) await upsertPriceRows(priceRows);
    if (cardDetailsRows.length) await upsertCardDetailsRows(cardDetailsRows);

    imported += cards.length;
    totalVariants += variantRows.length;
    totalPrices += priceRows.length;
    console.log(`Imported Pokemon TCG API page ${page}: ${cards.length} cards. Total ${imported}/${totalCount}.`);

    if (!cards.length) break;
    page += 1;
    await sleep(150);
  }

  console.log(`Done. Imported/updated ${imported} Pokemon TCG API cards, ${totalVariants} variants, and ${totalPrices} price rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
