import 'dotenv/config';
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCRAPE_TCG_LIST = String(process.env.SCRAPE_TCG_LIST || 'true').toLowerCase() === 'true';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'PokemonStoreImporter/1.0' } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

function absoluteUrl(href) {
  if (!href) return null;
  return href.startsWith('http') ? href : `https://tcglist.org${href}`;
}

function parseStoreCards(html, pageUrl) {
  const $ = cheerio.load(html);
  const stores = [];
  $('a[href*="/stores/virginia/"]').each((_, el) => {
    const href = absoluteUrl($(el).attr('href'));
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const match = text.match(/^([A-Z])\s+(.+?)\s+([^,]+)\s*,\s*VA\s+Games/i);
    if (match) {
      stores.push({
        name: match[2].trim(),
        city: match[3].trim(),
        state: 'VA',
        source: 'TCGList scrape',
        source_url: href || pageUrl,
        sells_pokemon: /pokemon/i.test(text),
        store_type: 'Local Game Store',
        notes: 'Scraped from TCGList listing page; verify inventory before relying on it.',
        raw_source: { listingText: text },
      });
    }
  });
  return stores;
}

async function scrapeTcgListVirginia() {
  const urls = ['https://tcglist.org/stores/virginia', 'https://tcglist.org/stores/virginia?page=2'];
  const stores = [];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      stores.push(...parseStoreCards(html, url));
      console.log(`Scraped ${url}`);
    } catch (error) {
      console.warn(`Could not scrape ${url}: ${error.message}`);
    }
  }
  return stores;
}

function normalizeStore(input) {
  const now = new Date().toISOString();
  return {
    name: input.name,
    address: input.address || null,
    city: input.city,
    state: input.state || 'VA',
    postal_code: input.postal_code || null,
    phone: input.phone || null,
    website_url: input.website_url || null,
    source: input.source || 'manual',
    source_url: input.source_url || null,
    sells_pokemon: input.sells_pokemon ?? true,
    sells_singles: input.sells_singles ?? null,
    sells_sealed: input.sells_sealed ?? null,
    store_type: input.store_type || 'Local Game Store',
    notes: input.notes || null,
    raw_source: input.raw_source || input,
    updated_at: now,
  };
}

function dedupe(stores) {
  const map = new Map();
  for (const store of stores) {
    const key = `${store.name}|${store.city}|${store.state || 'VA'}`.toLowerCase();
    map.set(key, { ...(map.get(key) || {}), ...store });
  }
  return [...map.values()];
}

async function main() {
  const seedPath = new URL('./va_pokemon_stores_seed.json', import.meta.url);
  const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
  const scraped = SCRAPE_TCG_LIST ? await scrapeTcgListVirginia() : [];
  const stores = dedupe([...seed, ...scraped]).map(normalizeStore);

  const { error } = await supabase
    .from('pokemon_retail_stores')
    .upsert(stores, { onConflict: 'name,city,state' });
  if (error) throw error;

  console.log(`Done. Upserted ${stores.length} Virginia Pokémon retailer rows.`);
  console.log('Note: TCGList lists 39 Virginia TCG stores that carry Pokémon; seed file includes the verified subset discovered in this environment, and the scraper attempts page 1 + page 2 at runtime.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
