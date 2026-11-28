import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

// New sets reach the catalog on their own (supabase/migrations/20261126213000_catalog_new_sets.sql),
// and each single card arrives with its card facts row (20261127040000_catalog_card_details_for_new_cards.sql).
// Japanese sets come from TCGCSV's category 85 and are filed as Japanese (20261127210000_catalog_language.sql,
// 20261127211000_catalog_japanese_cards.sql); the English search view keeps English items only.
// Runs the real migrations in a disposable loopback database and plays TCGCSV's part: the daily
// job asks for the set list, product lists and price files through a stand-in for pg_net, and this
// test answers with small copies of what TCGCSV sends. Needs Postgres on 127.0.0.1:55439 (user
// code3qa, trust), the same one scripts/test-account-sessions-postgres.mjs uses. Creates and
// removes only its own uniquely named database.
const database = `code3_test_catalog_${randomUUID().replaceAll("-", "")}`;
const connection = { host: "127.0.0.1", port: Number(process.env.CODE3_TEST_PG_PORT || 55439), user: process.env.CODE3_TEST_PG_USER || "code3qa", database: "postgres" };
const admin = new pg.Client(connection);
await admin.connect();
await admin.query(`create database ${database}`);
const db = new pg.Client({ ...connection, database });
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

// ---- What TCGCSV serves. Real products, trimmed to the fields the catalog reads. ----
const ext = (fields) => Object.entries(fields).map(([name, value]) => ({ name, displayName: name, value }));
const product = (groupId, productId, name, fields = {}) => ({
  productId, name, cleanName: name.replace(/[^A-Za-z0-9 ]/g, ""), groupId, categoryId: 3,
  url: `https://www.tcgplayer.com/product/${productId}`,
  imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
  extendedData: ext(fields),
});
const price = (productId, subTypeName, marketPrice, lowPrice = marketPrice, midPrice = marketPrice, highPrice = marketPrice) =>
  ({ productId, subTypeName, marketPrice, lowPrice, midPrice, highPrice, directLowPrice: null });
const card = (number, rarity, more = {}) => ({ Number: number, Rarity: rarity, "Card Type": "Colorless", HP: "70", Stage: "Basic", ...more });

// Dates are relative to today: a set under a year old is re-read daily, an older one weekly.
const daysAgo = (days) => `${new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)}T00:00:00`;
const PERFECT_ORDER = 24587; // in the catalog already, nothing new
const PITCH_BLACK = 24688; // in the catalog with sealed pre-orders only, filed under the code ME05
const DELTA_REIGN = 24831; // not in the catalog
const MCDONALDS_2026 = 24938; // not in the catalog
const JP_151 = 23599; // Japanese (TCGCSV category 85), not in the catalog
const tcgcsv = {
  // TCGCSV category 85, "Pokemon Japan": English card names, the printed set code, Japanese prices.
  japanGroups: [
    { groupId: JP_151, name: "SV2a: Pokemon Card 151", abbreviation: "SV2a", isSupplemental: false, publishedOn: daysAgo(1000), modifiedOn: "2026-11-20T10:00:00.1", categoryId: 85 },
  ],
  groups: [
    { groupId: PERFECT_ORDER, name: "ME03: Perfect Order", abbreviation: "POR", isSupplemental: false, publishedOn: daysAgo(240), modifiedOn: "2026-11-23T10:00:00.1", categoryId: 3 },
    { groupId: PITCH_BLACK, name: "ME05: Pitch Black", abbreviation: "PBL", isSupplemental: false, publishedOn: daysAgo(130), modifiedOn: "2026-11-20T10:00:00.1", categoryId: 3 },
    { groupId: DELTA_REIGN, name: "ME06: Delta Reign", abbreviation: "DLR", isSupplemental: false, publishedOn: daysAgo(20), modifiedOn: "2026-11-11T10:00:00.1", categoryId: 3 },
    { groupId: MCDONALDS_2026, name: "McDonald's Promos 2026", abbreviation: "M26", isSupplemental: true, publishedOn: daysAgo(-30), modifiedOn: "2026-11-18T10:00:00.1", categoryId: 3 },
  ],
  products: {
    [PERFECT_ORDER]: [
      product(PERFECT_ORDER, 684397, "Spinarak (renamed by the source)", card("001/088", "Common")),
      product(PERFECT_ORDER, 684398, "Ariados", card("002/088", "Uncommon", { HP: "110", Stage: "Stage 1" })),
    ],
    [PITCH_BLACK]: [
      product(PITCH_BLACK, 700001, "Pitch Black Booster Bundle", { UPC: "196214120001" }),
      product(PITCH_BLACK, 704814, "Maschiff", card("057/084", "Common")),
      product(PITCH_BLACK, 704900, "Pitch Black 3-Pack Blister [Binacle]"),
      product(PITCH_BLACK, 704901, "Code Card - Pitch Black Booster Pack", { Rarity: "Code Card" }),
      product(PITCH_BLACK, 704902, "Pitch Black Booster Box Case"),
      product(PITCH_BLACK, 704903, "Pitch Black Booster Box", { UPC: "196214129999" }),
      product(PITCH_BLACK, 704904, "Pitch Black Pokemon Center Elite Trainer Box"),
    ],
    [DELTA_REIGN]: [
      // Names that hold "tin" and "box": single cards all the same.
      product(DELTA_REIGN, 726500, "Giratina", card("061/103", "Rare")),
      product(DELTA_REIGN, 726501, "Mantine", card("029/103", "Uncommon")),
      product(DELTA_REIGN, 726566, "Azurill - 115/103", card("115/103", "Illustration Rare")),
      // No rarity worth the name and no number, but card stats: still a card.
      product(DELTA_REIGN, 726600, "Secret Box - 2026 (Championship Deck)", { Rarity: "None", "Card Type": "Trainer" }),
      product(DELTA_REIGN, 726601, "Delta Reign Mini Tin [Azurill]"),
      // Listed with no price row at all.
      product(DELTA_REIGN, 726602, "Delta Reign Elite Trainer Box"),
    ],
    [MCDONALDS_2026]: [product(MCDONALDS_2026, 730004, "Pikachu", card("004/015", "Promo"))],
    [JP_151]: [
      { ...product(JP_151, 566370, "Pikachu - 025/165", card("025/165", "Common", { "Card Type": "Lightning", HP: "60" })), categoryId: 85 },
      { ...product(JP_151, 566371, "Pikachu - 025/165 (Master Ball Pattern)", card("025/165", "Common", { "Card Type": "Lightning", HP: "60" })), categoryId: 85 },
      { ...product(JP_151, 513001, "Pokemon Card 151 Booster Box"), categoryId: 85 },
    ],
  },
  prices: {
    [PERFECT_ORDER]: [price(684397, "Normal", 0.08), price(684397, "Reverse Holofoil", 0.18)],
    [PITCH_BLACK]: [
      price(700001, "Normal", 31.5), price(704814, "Normal", 0.07, 0.01, 0.1, 5), price(704814, "Reverse Holofoil", 0.21),
      price(704900, "Normal", 14.25), price(704901, "Normal", 0.05), price(704902, "Normal", null), price(704903, "Normal", 160),
      price(704904, "Normal", 95),
    ],
    [DELTA_REIGN]: [
      price(726500, "Holofoil", 1.4), price(726500, "Reverse Holofoil", 1.9), price(726501, "Normal", 0.1),
      price(726566, "Holofoil", 12), price(726600, "Normal", 0.5), price(726601, "Normal", 11),
    ],
    [MCDONALDS_2026]: [price(730004, "Holofoil", 1.25)],
    // A second printing on the first Pikachu so both printing steps run for a Japanese card.
    [JP_151]: [price(566370, "Normal", 0.24), price(566370, "Holofoil", 1.1), price(566371, "Holofoil", 6.5), price(513001, "Normal", 95)],
  },
};

// Answers every request the job has made and not yet had an answer to.
const requested = [];
async function serve() {
  const { rows } = await db.query("select r.id, r.url from net.requests r where not exists (select 1 from net._http_response h where h.id = r.id) order by r.id");
  for (const row of rows) {
    requested.push(row.url);
    const groups = /\/tcgplayer\/(3|85)\/groups$/.exec(row.url);
    const match = /\/tcgplayer\/(3|85)\/(\d+)\/(products|prices)$/.exec(row.url);
    // A set is served under its own category only: asking category 3 for a Japanese set is a 404.
    const japanese = match && tcgcsv.japanGroups.some((group) => group.groupId === Number(match[2]));
    const results = groups ? (groups[1] === "85" ? tcgcsv.japanGroups : tcgcsv.groups)
      : match && (match[1] === "85") === japanese ? tcgcsv[match[3]][match[2]] : null;
    if (!results) {
      await db.query("insert into net._http_response(id, status_code, content) values($1, 404, 'not found')", [row.id]);
    } else {
      await db.query("insert into net._http_response(id, status_code, content) values($1, 200, $2)",
        [row.id, JSON.stringify({ success: true, errors: [], totalItems: results.length, results })]);
    }
  }
  return rows.length;
}
// One daily run from start to finish: a tick of the every-minute job, then TCGCSV's answers.
async function run(startSql) {
  const runId = (await db.query(`select ${startSql} as id`)).rows[0].id;
  for (let tick = 0; tick < 40; tick++) {
    await db.query("select * from public.catalog_price_apply()");
    const finished = (await db.query("select finished_at from public.catalog_price_refresh_runs where id = $1", [runId])).rows[0].finished_at;
    if (finished) return (await db.query("select * from public.catalog_price_refresh_runs where id = $1", [runId])).rows[0];
    await serve();
  }
  const queue = (await db.query("select source, group_id, attempts, request_id, done_at is not null as done, error from public.catalog_price_refresh_queue where run_id = $1 order by source, group_id", [runId])).rows;
  assert.fail(`run ${runId} did not finish: ${JSON.stringify(queue)}`);
}
const one = async (sql, parameters) => (await db.query(sql, parameters)).rows[0];
const all = async (sql, parameters) => (await db.query(sql, parameters)).rows;
const item = (productId) => one(`
  select pc.*, m.id as master_id, m.catalog_item_type, m.set_code as master_set_code, m.product_type as master_product_type,
    m.card_number as master_card_number, m.name as master_name, ms.recommended_market_value
  from public.product_catalog pc
  left join public.master_catalog_items m on m.legacy_product_catalog_id = pc.id
  left join public.master_market_summaries ms on ms.catalog_item_id = m.id
  where pc.market_source = 'TCGCSV' and pc.external_product_id = $1`, [String(productId)]);

try {
  await db.connect();
  // The tables the catalog job writes, with the columns, defaults and unique rules it relies on.
  await db.query(`
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;
    create schema extensions;
    create schema cron;
    create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean default true);
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command)values($1,$2,$3) on conflict(jobname) do update set schedule=$2,command=$3 returning jobid$$;
    create function cron.alter_job(job_id bigint,active boolean)returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
    create schema net;
    create sequence net.request_ids;
    create table net.requests(id bigint primary key, url text not null);
    create table net._http_response(id bigint primary key, status_code integer, content text, error_msg text, timed_out boolean default false);
    create function net.http_get(url text, timeout_milliseconds integer default 5000) returns bigint language plpgsql as $$
      declare v_id bigint := nextval('net.request_ids');
      begin insert into net.requests values (v_id, url); return v_id; end $$;

    create table public.product_catalog(
      id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, category text default 'Pokemon',
      set_name text, product_type text, barcode text, market_source text default 'Manual', external_product_id text,
      tcgplayer_product_id text, market_url text, image_url text, market_price numeric default 0, low_price numeric default 0,
      mid_price numeric default 0, high_price numeric default 0, last_price_checked timestamptz, created_at timestamptz default now(),
      updated_at timestamptz default now(), msrp_price numeric default 0, set_code text default '', expansion text default '',
      product_line text default '', pack_count numeric default 0, source_group_id integer, source_group_name text, price_subtype text,
      is_sealed boolean default false, card_number text, rarity text, raw_source jsonb, card_number_sort integer,
      card_number_prefix text, card_number_suffix text, printed_total integer,
      product_kind text not null default 'unknown' check (product_kind in ('single_card','sealed_product','code_card','accessory','bundle','promo','unknown')),
      sealed_product_type text check (sealed_product_type is null or sealed_product_type in ('elite_trainer_box','pokemon_center_elite_trainer_box','booster_pack','sleeved_booster_pack','booster_bundle','booster_display_box','build_and_battle_box','build_and_battle_stadium','collection_box','premium_collection','poster_collection','tin','mini_tin','blister_pack','league_battle_deck','battle_deck','starter_deck','other')),
      region text not null default 'US', language text not null default 'English',
      is_pokemon_center_exclusive boolean not null default false, contents jsonb not null default '{}');
    create unique index on public.product_catalog(market_source, external_product_id);
    create index on public.product_catalog(tcgplayer_product_id);
    create table public.master_catalog_items(
      id uuid primary key default gen_random_uuid(), legacy_product_catalog_id uuid unique references public.product_catalog(id),
      catalog_item_type text not null check (catalog_item_type in ('card','sealed','slab','accessory')), name text not null,
      set_name text, set_code text, product_type text, product_line text, card_number text, rarity text, image_url text, msrp numeric,
      tcgplayer_product_id text, external_links jsonb not null default '{}', last_verified_at timestamptz,
      data_confidence_score numeric not null default 0.5, source text not null default 'legacy_product_catalog',
      raw_source jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      product_name text, series text, duplicate_of uuid, archived_at timestamptz);
    create table public.master_catalog_identifiers(
      id uuid primary key default gen_random_uuid(), catalog_item_id uuid not null references public.master_catalog_items(id),
      identifier_type text not null check (identifier_type in ('UPC','EAN','GTIN','SKU','RETAILER_SKU','TCGPLAYER_PRODUCT_ID','TCGPLAYER_SKU_ID','CARD_NUMBER','SET_CODE','OTHER')),
      identifier_value text not null, retailer text, source text, source_url text,
      status text not null default 'source_imported', confidence_score numeric);
    create unique index on public.master_catalog_identifiers(catalog_item_id, identifier_type, lower(identifier_value), coalesce(retailer, ''));
    create table public.master_catalog_variants(
      id uuid primary key default gen_random_uuid(), catalog_item_id uuid not null references public.master_catalog_items(id),
      variant_type text not null default 'standard' check (variant_type in ('normal','holo','reverse_holo','first_edition','unlimited','sealed','standard','other')),
      variant_name text not null, finish text, printing text, language text not null default 'English',
      condition_name text not null default '', is_default boolean not null default false, external_ids jsonb not null default '{}',
      market_price numeric, display_order integer not null default 0, updated_at timestamptz not null default now(),
      unique (catalog_item_id, variant_name, language, condition_name));
    create table public.master_market_price_sources(
      id uuid primary key default gen_random_uuid(), catalog_item_id uuid not null references public.master_catalog_items(id),
      source text not null, source_item_id text, source_group_id integer, price_type text, market_price numeric, low_price numeric,
      mid_price numeric, high_price numeric, currency text not null default 'USD', source_url text, last_updated_at timestamptz,
      confidence_score numeric not null default 0.5, status text not null default 'cached', raw_payload jsonb not null default '{}',
      created_at timestamptz not null default now());
    create table public.master_market_summaries(
      id uuid primary key default gen_random_uuid(), catalog_item_id uuid not null unique references public.master_catalog_items(id),
      recommended_market_value numeric, msrp numeric, price_confidence text not null default 'unknown',
      source_count integer not null default 0, sample_size integer, last_updated_at timestamptz, computed_at timestamptz not null default now());
    create table public.product_market_price_current(
      id uuid primary key default gen_random_uuid(), catalog_product_id uuid references public.product_catalog(id),
      source text not null default 'TCGCSV', source_product_id text not null, source_group_id integer,
      price_subtype text not null default 'Default', low_price numeric, mid_price numeric, high_price numeric, market_price numeric,
      direct_low_price numeric, currency text not null default 'USD', raw_source jsonb, checked_at timestamptz not null default now(),
      created_at timestamptz default now(), updated_at timestamptz default now(), unique (source, source_product_id, price_subtype));
    create table public.product_identifiers(
      id uuid primary key default gen_random_uuid(), catalog_product_id uuid not null references public.product_catalog(id),
      identifier_type text not null check (identifier_type in ('UPC','EAN','GTIN','RETAILER_SKU','TCGPLAYER_PRODUCT_ID','TCGPLAYER_SKU_ID','POKEMONTCG_IO_ID','OTHER')),
      identifier_value text not null, source text, source_url text,
      confidence text not null default 'unverified', status text not null default 'needs_review', unique (identifier_type, identifier_value));
    create table public.catalog_product_variants(
      id uuid primary key default gen_random_uuid(), catalog_product_id uuid not null references public.product_catalog(id),
      variant_name text not null, printing text, finish text, language text not null default 'English', condition_name text,
      is_default boolean not null default false, unique (catalog_product_id, variant_name, language, condition_name));
    create table public.tcg_card_details(
      catalog_product_id uuid primary key references public.product_catalog(id) on delete cascade, card_name text not null,
      supertype text, subtypes text[], stage text, evolves_from text, hp integer, types text[],
      abilities jsonb not null default '[]', attacks jsonb not null default '[]', weaknesses jsonb not null default '[]',
      resistances jsonb not null default '[]', retreat_cost text[], converted_retreat_cost integer, card_number text,
      printed_total integer, rarity text, artist text, flavor_text text, regulation_mark text, legalities jsonb not null default '{}',
      national_pokedex_numbers integer[], raw_source jsonb not null default '{}',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    -- What the search view (20261127210000) reads besides the columns above.
    alter table public.master_catalog_items add column upc text, add column sku text, add column retailer_skus jsonb not null default '{}',
      add column contents jsonb not null default '{}', add column related_cards jsonb not null default '[]', add column release_date date,
      add column admin_review_status text, add column is_verified boolean not null default false, add column source_url text;
    alter table public.master_catalog_identifiers add column created_at timestamptz not null default now();
    alter table public.master_market_price_sources add column variant_id uuid, add column sold_average numeric, add column sample_size integer,
      add column updated_at timestamptz not null default now();
  `);
  for (const file of [
    "20261125090000_catalog_price_refresh.sql",
    "20261125093000_catalog_price_refresh_pokemontcg.sql",
    "20261126090000_catalog_single_cards_not_sealed.sql",
    "20261126213000_catalog_new_sets.sql",
    // Later changes edit the same functions in place; the new-set path must hold with them applied.
    "20261127010000_catalog_add_missing_printings.sql",
    "20261127020000_catalog_default_printings_named.sql",
    "20261127030000_catalog_price_pokemontcg_only_unmatched.sql",
    // Single cards the job adds get their card facts row (tcg_card_details).
    "20261127040000_catalog_card_details_for_new_cards.sql",
    // Each item's language, the search views, and the Japanese sets.
    "20261127210000_catalog_language.sql",
    "20261127211000_catalog_japanese_cards.sql",
  ]) {
    await db.query(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }

  // ---- The single-card rule: what the product carries decides, never its name. ----
  equal((await one("select count(*)::int n from cron.job where active")).n,0,"fresh catalog jobs require explicit activation");
  const isCard = async (fields) => (await one("select public.catalog_tcgcsv_is_card(public.catalog_tcgcsv_extended_data($1::jsonb)) as v", [JSON.stringify({ extendedData: ext(fields) })])).v;
  equal(await isCard({ Number: "061/103", Rarity: "Rare" }), true, "a rarity and a number make a card");
  equal(await isCard({ Rarity: "None", "Card Type": "Trainer" }), true, "card stats make a card when the rarity says nothing");
  equal(await isCard({ Rarity: "None", Number: "007" }), true, "a numbered energy with no rarity is a card");
  equal(await isCard({ Rarity: "Code Card" }), false, "a code card is not a single card");
  equal(await isCard({ UPC: "196214120001" }), false, "a barcode alone is a sealed product");
  equal(await isCard({}), false, "nothing to go on: not a single card");
  const sealedType = async (name) => (await one("select public.catalog_tcgcsv_sealed_type($1) as v", [name])).v;
  equal(await sealedType("Pitch Black Pokémon Center Elite Trainer Box"), "pokemon_center_elite_trainer_box");
  equal(await sealedType("Delta Reign Mini Tin [Azurill]"), "mini_tin");
  equal(await sealedType("Code Card - Pitch Black Booster Box"), "other", "a code card is not the box it came from");
  equal(await sealedType("Chaos Rising Build & Battle Stadium"), "build_and_battle_stadium");
  const packs = async (name) => (await one("select public.catalog_tcgcsv_pack_count($1, public.catalog_tcgcsv_sealed_type($1)) as v", [name])).v;
  equal([await packs("Pitch Black Booster Box"), await packs("Pitch Black Booster Box Case"), await packs("Pitch Black 3-Pack Blister [Binacle]"),
    await packs("Scarlet & Violet 151 Booster Bundle"), await packs("Code Card - Pitch Black Booster Pack"), await packs("Delta Reign Mini Tin")],
    [36, 0, 3, 6, 0, 0], "pack counts come from the name or the kind, and stay 0 when neither settles it");

  // ---- The catalog as the one-time import left it. ----
  const owner = randomUUID();
  const seed = async (row, masterType, variants = []) => {
    const pc = await one(`insert into public.product_catalog(user_id, name, set_name, product_type, market_source, external_product_id,
        tcgplayer_product_id, market_price, set_code, source_group_id, source_group_name, price_subtype, is_sealed, card_number, rarity, product_kind, raw_source)
      values($1,$2,$3,$4,'TCGCSV',$5,$5,$6,$7,$8,$3,$9,$10,$11,$12,$13,$14) returning id`,
      [owner, row.name, row.setName, masterType === "card" ? "Card" : "Sealed Product", String(row.productId), row.marketPrice ?? null,
        row.setCode, row.groupId, row.subtype ?? null, masterType !== "card", row.number ?? null, row.rarity ?? null,
        masterType === "card" ? "single_card" : "sealed_product", row.rawSource ? JSON.stringify(row.rawSource) : null]);
    const master = await one(`insert into public.master_catalog_items(legacy_product_catalog_id, catalog_item_type, name, set_name, set_code, card_number, rarity, tcgplayer_product_id, source)
      values($1,$2,$3,$4,$5,$6,$7,$8,'TCGCSV') returning id`, [pc.id, masterType, row.name, row.setName, row.setCode, row.number ?? null, row.rarity ?? null, String(row.productId)]);
    await db.query("insert into public.master_catalog_identifiers(catalog_item_id, identifier_type, identifier_value, source) values($1,'SET_CODE',$2,'legacy_product_catalog')", [master.id, row.setCode]);
    for (const name of variants) {
      await db.query("insert into public.catalog_product_variants(catalog_product_id, variant_name, condition_name, is_default) values($1,$2,'',true)", [pc.id, name]);
      await db.query("insert into public.master_catalog_variants(catalog_item_id, variant_name, is_default) values($1,$2,true)", [master.id, name]);
    }
    return pc.id;
  };
  // The source record the first import kept on each row, in the shape the job gives new rows.
  const sourceRecord = (groupId, productId, name, fields) => {
    const source = product(groupId, productId, name, fields);
    return { group: tcgcsv.groups.find((group) => group.groupId === groupId), product: source, extendedData: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]+/g, "_"), value])) };
  };
  // Spinarak: an older card that has its source record and no card facts row. It stays that way.
  await seed({ productId: 684397, name: "Spinarak", setName: "ME03: Perfect Order", setCode: "POR", groupId: PERFECT_ORDER, subtype: "Normal", number: "001/088", rarity: "Common", marketPrice: 0.09,
    rawSource: sourceRecord(PERFECT_ORDER, 684397, "Spinarak", card("001/088", "Common")) }, "card", ["Normal"]);
  // Ariados: an older card that has a card facts row already. The job never rewrites it.
  const ariadosId = await seed({ productId: 684398, name: "Ariados", setName: "ME03: Perfect Order", setCode: "POR", groupId: PERFECT_ORDER, subtype: "Normal", number: "002/088", rarity: "Uncommon", marketPrice: 0.12,
    rawSource: sourceRecord(PERFECT_ORDER, 684398, "Ariados", card("002/088", "Uncommon")) }, "card", ["Normal"]);
  await db.query("insert into public.tcg_card_details(catalog_product_id, card_name, hp, rarity, raw_source, created_at, updated_at) values($1,'Ariados (first import)',110,'Uncommon',$2,'2026-05-10T12:00:00Z','2026-05-10T12:00:00Z')",
    [ariadosId, JSON.stringify({ group: { publishedOn: "2026-03-27T00:00:00" }, kept: "as the first import wrote it" })]);
  const factsRow = async (productId) => one(`select to_jsonb(d) as row from public.tcg_card_details d join public.product_catalog pc on pc.id = d.catalog_product_id
    where pc.market_source = 'TCGCSV' and pc.external_product_id = $1`, [String(productId)]).then((found) => found?.row);
  const ariadosFacts = await factsRow(684398);
  equal([ariadosFacts.card_name, ariadosFacts.hp, await factsRow(684397)], ["Ariados (first import)", 110, undefined], "before any run: one older card has card facts, one has none");
  await seed({ productId: 700001, name: "Pitch Black Booster Bundle", setName: "ME05: Pitch Black", setCode: "ME05", groupId: PITCH_BLACK, subtype: "Normal", marketPrice: 30 }, "sealed", ["Normal"]);

  // ---- Run 1: a check for new sets only (no price refresh for sets already in the catalog). ----
  const first = await run("public.catalog_price_refresh(0, false)");
  equal(first.sets_added, 3, "Delta Reign, McDonald's Promos 2026 and the Japanese 151 are new to the catalog");
  equal(first.products_added, 16, "every product the catalog lacked was added");
  equal(first.groups_failed, 0);
  equal(requested.slice(0, 2).sort(), ["https://tcgcsv.com/tcgplayer/3/groups", "https://tcgcsv.com/tcgplayer/85/groups"], "the run reads both of TCGCSV's set lists first");
  for (const groupId of [PERFECT_ORDER, PITCH_BLACK, DELTA_REIGN, MCDONALDS_2026]) {
    ok(requested.includes(`https://tcgcsv.com/tcgplayer/3/${groupId}/products`), `product list read for set ${groupId}`);
  }
  ok(!requested.includes(`https://tcgcsv.com/tcgplayer/3/${PERFECT_ORDER}/prices`), "a set with nothing new is not re-priced by a new-sets check");
  equal((await one("select count(*)::int n from public.catalog_tcgcsv_groups")).n, 5, "the set lists are recorded");
  equal(await all("select category_id, count(*)::int n from public.catalog_tcgcsv_groups group by 1 order by 1"), [{ category_id: 3, n: 4 }, { category_id: 85, n: 1 }], "each set knows its category");
  ok(requested.includes(`https://tcgcsv.com/tcgplayer/85/${JP_151}/products`) && requested.includes(`https://tcgcsv.com/tcgplayer/85/${JP_151}/prices`), "a Japanese set is read from category 85");
  ok(!requested.some((url) => url.includes(`/tcgplayer/3/${JP_151}/`)), "and never asked for under the English category");

  // Japanese: each row says so, in both catalogs and on every printing. English rows say English.
  const jpPikachu = await item(566370);
  const masterLanguage = async (productId) => (await one("select m.language from public.master_catalog_items m join public.product_catalog pc on pc.id = m.legacy_product_catalog_id where pc.external_product_id = $1", [String(productId)])).language;
  equal([jpPikachu.language, await masterLanguage(566370), jpPikachu.set_code, jpPikachu.set_name, jpPikachu.card_number, jpPikachu.catalog_item_type, jpPikachu.price_subtype, Number(jpPikachu.market_price), Number(jpPikachu.recommended_market_value)],
    ["Japanese", "Japanese", "SV2a", "SV2a: Pokemon Card 151", "025/165", "card", "Normal", 0.24, 0.24], "a Japanese card is filed as Japanese, with its set code, number and price");
  equal(await all("select variant_name, language from public.catalog_product_variants where catalog_product_id = $1 order by 1", [jpPikachu.id]),
    [{ variant_name: "Holofoil", language: "Japanese" }, { variant_name: "Normal", language: "Japanese" }], "its printings say Japanese");
  equal(await all("select variant_name, language from public.master_catalog_variants where catalog_item_id = $1 order by 1", [jpPikachu.master_id]),
    [{ variant_name: "Holofoil", language: "Japanese" }, { variant_name: "Normal", language: "Japanese" }], "in the master catalog too (the second printing by catalog_add_missing_printings)");
  const jpBox = await item(513001);
  equal([jpBox.language, await masterLanguage(513001), jpBox.catalog_item_type, jpBox.sealed_product_type, Number(jpBox.market_price)], ["Japanese", "Japanese", "sealed", "booster_display_box", 95], "a Japanese booster box is a Japanese sealed product");
  equal([(await item(566371)).language, Number((await item(566371)).market_price)], ["Japanese", 6.5]);
  equal((await factsRow(566370)).raw_source.product.extendedData.find((entry) => entry.name === "HP").value, "60", "a Japanese card has its card facts");
  equal(await all(`select distinct pc.language as a, m.language as b,
        (select string_agg(distinct v.language, ',') from public.master_catalog_variants v where v.catalog_item_id = m.id) as c,
        (select string_agg(distinct v.language, ',') from public.catalog_product_variants v where v.catalog_product_id = pc.id) as d
      from public.product_catalog pc join public.master_catalog_items m on m.legacy_product_catalog_id = pc.id
      where pc.source_group_id is distinct from $1 and exists (select 1 from public.master_catalog_variants v where v.catalog_item_id = m.id)`, [JP_151]),
    [{ a: "English", b: "English", c: "English", d: "English" }], "every English row and printing still says English");

  // Search: new builds read every language; the view older builds read shows English items only.
  equal(await all("select language, count(*)::int n from public.catalog_search_all_languages group by 1 order by 1"),
    [{ language: "English", n: 16 }, { language: "Japanese", n: 3 }], "the all-languages view has both");
  equal(await all("select language, count(*)::int n from public.catalog_search_lightweight group by 1"), [{ language: "English", n: 16 }], "the older view has the same English rows and nothing else");
  equal((await one("select market_price::float8 as p from public.catalog_search_all_languages where tcgplayer_product_id = '566370'")).p, 0.24, "with its price");
  const columns = async (view) => (await all("select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position", [view])).map((row) => row.column_name);
  equal(await columns("catalog_search_lightweight"), await columns("catalog_search_all_languages"), "both views have the same columns");
  equal((await columns("catalog_search_all_languages")).at(-1), "language", "language comes last, after the columns older builds know");

  // A new set: its cards arrive as cards, with set code, number, rarity, printings and prices.
  const pikachu = await item(730004);
  equal([pikachu.set_code, pikachu.set_name, pikachu.card_number, pikachu.card_number_sort, pikachu.printed_total, pikachu.rarity, pikachu.source_group_id],
    ["M26", "McDonald's Promos 2026", "004/015", 4, 15, "Promo", MCDONALDS_2026]);
  equal([pikachu.is_sealed, pikachu.product_type, pikachu.product_kind, pikachu.catalog_item_type, pikachu.master_set_code, pikachu.master_card_number],
    [false, "Card", "single_card", "card", "M26", "004/015"]);
  equal([pikachu.user_id, pikachu.price_subtype, Number(pikachu.market_price), Number(pikachu.recommended_market_value)], [owner, "Holofoil", 1.25, 1.25],
    "the new card is owned like the rest of the catalog and priced from the same run");
  equal(pikachu.raw_source.group.abbreviation, "M26", "the source record is kept");
  equal(pikachu.raw_source.extendedData.card_type, "Colorless");

  // Card facts (20261127040000): a single card the job adds gets its tcg_card_details row in the
  // same step, holding what the card scanner reads: the set's release date and the printed stats.
  const releaseDate = (groupId) => tcgcsv.groups.find((group) => group.groupId === groupId).publishedOn;
  const pikachuFacts = await factsRow(730004);
  ok(pikachuFacts, "a card the job adds has a card facts row");
  equal([pikachuFacts.card_name, pikachuFacts.raw_source.group.publishedOn, pikachuFacts.raw_source.product.extendedData.find((entry) => entry.name === "HP").value],
    ["Pikachu", releaseDate(MCDONALDS_2026), "70"], "a new card's facts row carries group.publishedOn and product.extendedData");
  equal(pikachuFacts.raw_source, pikachu.raw_source, "the source record is copied whole");
  equal([pikachuFacts.hp, pikachuFacts.rarity, pikachuFacts.subtypes, pikachuFacts.attacks, pikachuFacts.legalities], [null, null, null, [], {}],
    "the other columns are filled the way the first import filled them for TCGCSV cards");

  // Giratina, Mantine and a trainer called Secret Box are cards, whatever their names hold.
  for (const [productId, number] of [[726500, "061/103"], [726501, "029/103"], [726566, "115/103"], [726600, null]]) {
    const row = await item(productId);
    equal([row.is_sealed, row.product_type, row.product_kind, row.sealed_product_type, row.catalog_item_type, row.card_number, Number(row.pack_count)],
      [false, "Card", "single_card", null, "card", number, 0], `${row.name} is a single card`);
    equal((await factsRow(productId)).raw_source.group.publishedOn, releaseDate(DELTA_REIGN), `${row.name} has its card facts`);
  }
  equal((await item(726566)).printed_total, 103);
  const tin = await item(726601);
  equal([tin.is_sealed, tin.product_type, tin.product_kind, tin.sealed_product_type, tin.catalog_item_type, tin.card_number], [true, "Sealed Product", "sealed_product", "mini_tin", "sealed", null]);

  // Printings: every printing TCGplayer sells, in both tables, the item's own marked as the default
  // (the master catalog gets the others from catalog_add_missing_printings, 20261127010000).
  const maschiff = await item(704814);
  equal([maschiff.set_code, maschiff.card_number, maschiff.price_subtype, Number(maschiff.market_price), Number(maschiff.low_price), Number(maschiff.high_price)],
    ["PBL", "057/084", "Normal", 0.07, 0.01, 5]);
  equal(await all("select variant_name, finish, is_default from public.catalog_product_variants where catalog_product_id = $1 order by variant_name", [maschiff.id]),
    [{ variant_name: "Normal", finish: "Normal", is_default: true }, { variant_name: "Reverse Holofoil", finish: "Reverse Holofoil", is_default: false }]);
  equal(await all("select variant_name, variant_type, is_default, market_price::float8 as market_price from public.master_catalog_variants where catalog_item_id = $1 order by variant_name", [maschiff.master_id]),
    [{ variant_name: "Normal", variant_type: "standard", is_default: true, market_price: 0.07 },
      { variant_name: "Reverse Holofoil", variant_type: "reverse_holo", is_default: false, market_price: 0.21 }]);
  equal((await all("select price_subtype, market_price::float8 as market_price from public.product_market_price_current where catalog_product_id = $1 order by price_subtype", [maschiff.id])),
    [{ price_subtype: "Normal", market_price: 0.07 }, { price_subtype: "Reverse Holofoil", market_price: 0.21 }], "each printing has a current price");
  equal((await all("select price_type, confidence_score::float8 as confidence_score from public.master_market_price_sources where catalog_item_id = $1 order by price_type", [maschiff.master_id])),
    [{ price_type: "Normal", confidence_score: 0.9 }, { price_type: "Reverse Holofoil", confidence_score: 0.8 }]);
  equal((await all("select identifier_type, identifier_value from public.master_catalog_identifiers where catalog_item_id = $1 order by identifier_type", [maschiff.master_id])),
    [{ identifier_type: "CARD_NUMBER", identifier_value: "057/084" }, { identifier_type: "SET_CODE", identifier_value: "PBL" }, { identifier_type: "TCGPLAYER_PRODUCT_ID", identifier_value: "704814" }]);
  equal((await all("select identifier_type, identifier_value, confidence from public.product_identifiers where catalog_product_id = $1", [maschiff.id])),
    [{ identifier_type: "TCGPLAYER_PRODUCT_ID", identifier_value: "704814", confidence: "imported" }]);
  const giratina = await item(726500);
  equal([giratina.price_subtype, (await one("select variant_type from public.master_catalog_variants where catalog_item_id = $1 and is_default", [giratina.master_id])).variant_type], ["Holofoil", "holo"]);

  // Sealed products of a set that was already there.
  const box = await item(704903);
  equal([box.is_sealed, box.sealed_product_type, Number(box.pack_count), box.contents, box.barcode, box.catalog_item_type],
    [true, "booster_display_box", 36, { pack_count_source: "sealed_product_type_default", pack_count_confidence: "unverified_default" }, "196214129999", "sealed"]);
  ok((await one("select 1 as found from public.master_catalog_identifiers where catalog_item_id = $1 and identifier_type = 'UPC' and identifier_value = '196214129999'", [box.master_id]))?.found, "a barcode is searchable");
  const blister = await item(704900);
  equal([blister.sealed_product_type, Number(blister.pack_count), blister.contents.pack_count_source], ["blister_pack", 3, "name"]);
  const pcEtb = await item(704904);
  equal([pcEtb.sealed_product_type, pcEtb.is_pokemon_center_exclusive, Number(pcEtb.pack_count)], ["pokemon_center_elite_trainer_box", true, 11]);
  const codeCard = await item(704901);
  equal([codeCard.is_sealed, codeCard.sealed_product_type, Number(codeCard.pack_count), codeCard.rarity, codeCard.catalog_item_type], [true, "other", 0, "Code Card", "sealed"]);
  const boxCase = await item(704902);
  equal([Number(boxCase.pack_count), boxCase.market_price, boxCase.price_subtype], [0, null, null], "listed with a price row but no price yet: no price is invented");
  const unpriced = await item(726602);
  equal([unpriced.market_price, unpriced.price_subtype, unpriced.sealed_product_type, (await one("select count(*)::int n from public.product_market_price_current where catalog_product_id = $1", [unpriced.id])).n],
    [null, null, "elite_trainer_box", 0], "a product with no price row is in the catalog, unpriced");

  // Card facts go to single cards only: the six cards this run added, next to the one row that was there.
  equal((await all("select pc.name from public.tcg_card_details d join public.product_catalog pc on pc.id = d.catalog_product_id")).map((row) => row.name).sort(),
    ["Ariados", "Azurill - 115/103", "Giratina", "Mantine", "Maschiff", "Pikachu", "Pikachu - 025/165", "Pikachu - 025/165 (Master Ball Pattern)", "Secret Box - 2026 (Championship Deck)"],
    "no card facts row for a sealed product or a code card, and none for the older card that had none");

  // The set's code changed (ME05 -> PBL): the items already there follow, and are otherwise untouched.
  const bundle = await item(700001);
  equal([bundle.set_code, bundle.master_set_code, bundle.name, bundle.barcode], ["PBL", "PBL", "Pitch Black Booster Bundle", null]);
  equal((await all("select identifier_value from public.master_catalog_identifiers where catalog_item_id = $1 and identifier_type = 'SET_CODE' order by 1", [bundle.master_id])).map((row) => row.identifier_value),
    ["ME05", "PBL"], "the old code still finds the item");
  equal(Number(bundle.market_price), 31.5, "its set gained products, so its prices were refreshed too");
  equal((await all("select distinct set_code from public.product_catalog where source_group_id = $1", [PITCH_BLACK])).map((row) => row.set_code), ["PBL"], "one set, one code");

  // A product already in the catalog is not rewritten, and gains no extra printings.
  const spinarak = await item(684397);
  equal([spinarak.name, spinarak.master_name, Number(spinarak.market_price)], ["Spinarak", "Spinarak", 0.09]);
  equal((await one("select count(*)::int n from public.catalog_product_variants where catalog_product_id = $1", [spinarak.id])).n, 1);

  // ---- Run 2: the same answers again. Nothing is added twice. ----
  const before = await one("select (select count(*) from public.product_catalog)::int pc, (select count(*) from public.master_catalog_items)::int m, (select count(*) from public.master_catalog_variants)::int mv, (select count(*) from public.catalog_product_variants)::int cv, (select count(*) from public.product_market_price_current)::int prices, (select count(*) from public.master_market_price_sources)::int sources, (select count(*) from public.master_catalog_identifiers)::int ids, (select count(*) from public.product_identifiers)::int pids, (select count(*) from public.tcg_card_details)::int facts");
  equal([before.pc, before.facts], [19, 9]);
  const second = await run("public.catalog_price_refresh(0, false)");
  equal([second.sets_added, second.products_added, second.groups_failed], [0, 0, 0]);
  equal(await one("select (select count(*) from public.product_catalog)::int pc, (select count(*) from public.master_catalog_items)::int m, (select count(*) from public.master_catalog_variants)::int mv, (select count(*) from public.catalog_product_variants)::int cv, (select count(*) from public.product_market_price_current)::int prices, (select count(*) from public.master_market_price_sources)::int sources, (select count(*) from public.master_catalog_identifiers)::int ids, (select count(*) from public.product_identifiers)::int pids, (select count(*) from public.tcg_card_details)::int facts"), before, "a second run changes no counts");
  equal([await factsRow(730004), await factsRow(684398)], [pikachuFacts, ariadosFacts], "a second run leaves every card facts row as it was");
  equal((await one("select count(*)::int n from (select tcgplayer_product_id from public.product_catalog group by 1 having count(*) > 1) d")).n, 0, "one row per TCGplayer product");
  equal((await one("select count(*)::int n from public.master_catalog_items m join public.product_catalog pc on pc.id = m.legacy_product_catalog_id where m.catalog_item_type = 'sealed' and (pc.card_number is not null or public.catalog_is_single_card(m.card_number, m.rarity))")).n, 0, "no single card is filed as sealed");

  // ---- Run 3: the daily run. An older set gains a card; its price file gives it away. ----
  // An older set is only re-read on its weekly turn, so pick an id whose turn is not today.
  const weekday = (await one("select extract(dow from now())::int d")).d;
  const OLDER_SET = 2800 + ((weekday + 3) % 7);
  tcgcsv.groups.push({ groupId: OLDER_SET, name: "SWSH: Older Set", abbreviation: "OLD", isSupplemental: false, publishedOn: daysAgo(1900), modifiedOn: "2026-01-05T10:00:00.1", categoryId: 3 });
  tcgcsv.products[OLDER_SET] = [product(OLDER_SET, 250001, "Dratini", card("055/203", "Common"))];
  tcgcsv.prices[OLDER_SET] = [price(250001, "Normal", 0.2)];
  const third = await run("public.catalog_price_refresh(null, false)");
  equal([third.sets_added, third.products_added], [1, 1], "a set TCGCSV starts listing is picked up by the daily run");
  equal([(await item(250001)).catalog_item_type, Number((await item(250001)).market_price)], ["card", 0.2]);
  ok(requested.includes(`https://tcgcsv.com/tcgplayer/3/${PERFECT_ORDER}/prices`), "the daily run still refreshes prices for every set in the catalog");
  ok(requested.includes(`https://tcgcsv.com/tcgplayer/85/${JP_151}/prices`), "Japanese sets included, from their own category");
  equal(Number((await item(684397)).market_price), 0.08, "and applies them");

  requested.length = 0;
  tcgcsv.products[OLDER_SET].push(product(OLDER_SET, 250002, "Dragonair", card("056/203", "Uncommon")));
  tcgcsv.products[MCDONALDS_2026].push(product(MCDONALDS_2026, 730015, "Wooloo", card("015/015", "Promo")));
  tcgcsv.prices[MCDONALDS_2026].push(price(730015, "Normal", 0.4));
  const quiet = await run("public.catalog_price_refresh(null, false)");
  ok(!requested.includes(`https://tcgcsv.com/tcgplayer/3/${OLDER_SET}/products`), "an older set with no new price is left for its weekly turn");
  equal([quiet.products_added, Number((await item(730015)).market_price), (await item(730015)).set_code], [1, 0.4, "M26"], "a recent set is re-read every day, so a late card arrives the next run");
  equal(await item(250002), undefined);

  requested.length = 0;
  tcgcsv.prices[OLDER_SET].push(price(250002, "Normal", 0.3), price(250002, "Reverse Holofoil", 0.6));
  const fourth = await run("public.catalog_price_refresh(null, false)");
  ok(requested.includes(`https://tcgcsv.com/tcgplayer/3/${OLDER_SET}/products`), "a price for a product the catalog lacks gets that set's product list read the same run");
  equal(requested.filter((url) => url === `https://tcgcsv.com/tcgplayer/3/${OLDER_SET}/prices`).length, 2, "and its prices asked for again, to price the new card");
  const dragonair = await item(250002);
  equal([fourth.products_added, dragonair.set_code, dragonair.card_number, Number(dragonair.market_price), dragonair.catalog_item_type], [1, "OLD", "056/203", 0.3, "card"]);
  equal((await one("select count(*)::int n from public.product_market_price_current where catalog_product_id = $1", [dragonair.id])).n, 2);

  equal((await one("select count(*)::int n from (select tcgplayer_product_id from public.product_catalog group by 1 having count(*) > 1) d")).n, 0);

  // Card facts after the daily runs: each card a run added has its row, whichever way it was found
  // (a new set, a late card in a recent set, a price for a card the catalog lacked).
  for (const [productId, groupId] of [[250001, OLDER_SET], [730015, MCDONALDS_2026], [250002, OLDER_SET]]) {
    const facts = await factsRow(productId);
    equal([facts.raw_source.group.publishedOn, Array.isArray(facts.raw_source.product.extendedData)], [releaseDate(groupId), true], `card ${productId} has its card facts`);
  }
  // Older cards are as they were: a row that existed is untouched, a card without one still has none.
  equal(await factsRow(684398), ariadosFacts, "a card facts row that was already there is left untouched");
  equal((await all(`select pc.name from public.product_catalog pc where pc.product_kind = 'single_card' and pc.raw_source is not null
    and not exists (select 1 from public.tcg_card_details d where d.catalog_product_id = pc.id)`)).map((row) => row.name), ["Spinarak"],
    "the only card without card facts is the older one that had none: the job fills in what it adds, nothing else");
  equal((await one("select count(*)::int n from public.tcg_card_details d join public.product_catalog pc on pc.id = d.catalog_product_id where pc.product_kind <> 'single_card'")).n, 0,
    "sealed products and code cards have no card facts row");

  // ---- Older sealed products that the first import filed as cards (20261126223000). ----
  // Their names hold none of the old sealed words, so they sat under Cards. Seeded with no set
  // id, the way the runs above would never have met them.
  const misfiled = async (productId, name, fields, { number = null, subtype = null, marketPrice = null, kind = "single_card" } = {}) => {
    const pc = await one(`insert into public.product_catalog(user_id, name, set_name, product_type, market_source, external_product_id,
        tcgplayer_product_id, market_price, price_subtype, is_sealed, card_number, rarity, product_kind, raw_source)
      values($1,$2,'Miscellaneous Cards & Products','Card','TCGCSV',$3,$3,$4,$5,false,$6,$7,$8,$9) returning id`,
      [owner, name, String(productId), marketPrice, subtype, number, fields.Rarity ?? null, kind, JSON.stringify({ product: product(0, productId, name, fields) })]);
    const master = await one(`insert into public.master_catalog_items(legacy_product_catalog_id, catalog_item_type, name, product_type, card_number, rarity, tcgplayer_product_id, source)
      values($1,'card',$2,'Card',$3,$4,$5,'TCGCSV') returning id`, [pc.id, name, number, fields.Rarity ?? null, String(productId)]);
    await db.query("insert into public.master_catalog_variants(catalog_item_id, variant_name, is_default) values($1,$2,true)", [master.id, subtype ?? "Default"]);
  };
  await misfiled(900001, "Fall 2022 Collector Chest", { UPC: "820650850431" }, { subtype: "Normal", marketPrice: 83.77 });
  await misfiled(900002, "Code Card - Holiday Calendar", { Rarity: "Code Card" }, { kind: "code_card" });
  await misfiled(900003, "Unified Minds Prerelease Kit", {});
  await misfiled(900004, "Pikachu", card("058/102", "Common"), { number: "058/102", subtype: "Normal" });
  // The source record says nothing, but someone gave it a card number by hand: it stays a card.
  await misfiled(900005, "Unlisted Promo", {}, { number: "12/34" });
  const refile = await readFile(new URL("../supabase/migrations/20261126223000_catalog_sealed_products_not_cards.sql", import.meta.url), "utf8");
  await db.query(refile);
  const filing = async (productId) => {
    const row = await item(productId);
    const variant = await one("select variant_type, variant_name, finish from public.master_catalog_variants where catalog_item_id = $1", [row.master_id]);
    return [row.is_sealed, row.product_type, row.product_kind, row.sealed_product_type, row.catalog_item_type, row.master_product_type, variant.variant_type, variant.variant_name, variant.finish];
  };
  equal(await filing(900001), [true, "Sealed Product", "sealed_product", "other", "sealed", "Sealed Product", "sealed", "Normal", "Sealed"], "a Collector Chest is a sealed product");
  equal(await filing(900002), [true, "Sealed Product", "sealed_product", "other", "sealed", "Sealed Product", "sealed", "Sealed", "Sealed"], "a code card is filed with sealed products, like the others");
  equal((await filing(900003)).slice(0, 5), [true, "Sealed Product", "sealed_product", "other", "sealed"], "a Prerelease Kit is a sealed product");
  equal(await filing(900004), [false, "Card", "single_card", null, "card", "Card", "standard", "Normal", null], "a card stays a card");
  equal((await filing(900005)).slice(0, 5), [false, "Card", "single_card", null, "card"], "a hand-numbered item stays a card");
  const chest = await item(900001);
  equal([chest.name, Number(chest.market_price), chest.price_subtype, chest.rarity, (await item(900002)).rarity], ["Fall 2022 Collector Chest", 83.77, "Normal", null, "Code Card"], "only the filing changes");
  equal([(await item(726500)).catalog_item_type, (await item(704900)).catalog_item_type, (await item(250001)).catalog_item_type], ["card", "sealed", "card"], "items the daily job added are untouched");
  await db.query(refile);
  equal((await item(900001)).updated_at, chest.updated_at, "running it again changes nothing");
  equal((await one(`select count(*)::int n from public.product_catalog pc join public.master_catalog_items m on m.legacy_product_catalog_id = pc.id
    where pc.market_source = 'TCGCSV' and m.catalog_item_type = 'card' and jsonb_typeof(pc.raw_source->'product') = 'object'
      and not public.catalog_tcgcsv_is_card(public.catalog_tcgcsv_extended_data(pc.raw_source->'product'))
      and not public.catalog_is_single_card(pc.card_number, pc.rarity)`)).n, 0, "no sealed product is left filed as a card");
  console.log(`catalog new sets: ${checks} checks passed`);
} finally {
  await db.end().catch(() => {});
  await admin.query(`drop database if exists ${database} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
