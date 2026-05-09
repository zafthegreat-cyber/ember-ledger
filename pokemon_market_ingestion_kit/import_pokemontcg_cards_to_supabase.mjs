import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;
const POKEMON_TCG_API_KEY = process.env.POKEMON_TCG_API_KEY;
const PRODUCT_BATCH_SIZE = Number(process.env.PRODUCT_BATCH_SIZE || 250);

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

async function fetchPokemonCardsPage(page) {
  const url = new URL('https://api.pokemontcg.io/v2/cards');
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', '250');
  url.searchParams.set('select', 'id,name,supertype,subtypes,set,number,rarity,images,tcgplayer,cardmarket,nationalPokedexNumbers');

  const headers = { 'User-Agent': 'PokemonTCGApiImporter/1.0' };
  if (POKEMON_TCG_API_KEY) headers['X-Api-Key'] = POKEMON_TCG_API_KEY;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Pokemon TCG API failed ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

function priceChoices(card) {
  const prices = card?.tcgplayer?.prices || {};
  return Object.entries(prices).map(([subtype, value]) => ({ subtype, ...value }));
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

function toNumberOrNull(value) {
  return value === undefined || value === null || value === '' ? null : Number(value);
}

async function upsertRows(rows) {
  for (const batch of chunk(rows, PRODUCT_BATCH_SIZE)) {
    const { error } = await supabase
      .from('product_catalog')
      .upsert(batch, { onConflict: 'market_source,external_product_id' });
    if (error) throw error;
  }
}

async function main() {
  let page = 1;
  let totalCount = Infinity;
  let imported = 0;

  while (imported < totalCount) {
    const payload = await fetchPokemonCardsPage(page);
    const cards = payload.data || [];
    totalCount = payload.totalCount ?? imported + cards.length;
    const checkedAt = new Date().toISOString();

    const rows = cards.map((card) => {
      const price = pickPrimaryPrice(card);
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
        market_price: toNumberOrNull(price?.market),
        low_price: toNumberOrNull(price?.low),
        mid_price: toNumberOrNull(price?.mid),
        high_price: toNumberOrNull(price?.high),
        last_price_checked: checkedAt,
        set_code: card.set?.id || '',
        expansion: card.set?.series || card.set?.name || '',
        product_line: 'Pokemon',
        price_subtype: price?.subtype || null,
        is_sealed: false,
        card_number: card.number || null,
        rarity: card.rarity || null,
        raw_source: card,
        updated_at: checkedAt,
      };
    });

    await upsertRows(rows);
    imported += cards.length;
    console.log(`Imported Pokémon TCG API page ${page}: ${cards.length} cards. Total ${imported}/${totalCount}.`);

    if (!cards.length) break;
    page += 1;
    await sleep(150);
  }

  console.log(`Done. Imported/updated ${imported} Pokémon TCG API card rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
