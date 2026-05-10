#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const loadedEnvFiles = [];

function loadEnvFile(fileName) {
  try {
    const filePath = path.join(ROOT, fileName);
    if (!fs.existsSync(filePath)) return;
    require('dotenv').config({ path: filePath, override: false, quiet: true });
    loadedEnvFiles.push(fileName);
  } catch (_) {
    // dotenv is optional for this operational script.
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const args = process.argv.slice(2);

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

const sectionName = readOption('section', 'all');
const batchSize = Number.parseInt(readOption('batch-size', '250'), 10);
const dryRun = args.includes('--dry-run');
const maxBatches = Number.parseInt(readOption('max-batches', '0'), 10);
const connectionSource = process.env.SUPABASE_DB_URL ? 'SUPABASE_DB_URL' : process.env.DATABASE_URL ? 'DATABASE_URL' : '';
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const sslNoVerify = process.env.SUPABASE_DB_SSL_NO_VERIFY === 'true';

console.log(`Loaded env files: ${loadedEnvFiles.length ? loadedEnvFiles.join(', ') : 'none'}`);
console.log(`SUPABASE_DB_URL is ${process.env.SUPABASE_DB_URL ? 'set' : 'missing'}`);
console.log(`DATABASE_URL is ${process.env.DATABASE_URL ? 'set' : 'missing'}`);
console.log(`Active DB URL source: ${connectionSource || 'none'}`);
console.log(`SUPABASE_DB_SSL_NO_VERIFY is ${sslNoVerify ? 'enabled' : 'disabled'}`);
if (sslNoVerify) {
  console.log('WARNING: SSL certificate verification is disabled for this local backfill run only.');
}

if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL or DATABASE_URL. No connection was attempted.');
  process.exit(1);
}

function buildPgConfig() {
  const parsedUrl = new URL(connectionString);
  const strippedSslMode = parsedUrl.searchParams.has('sslmode');
  parsedUrl.searchParams.delete('sslmode');
  console.log(`sslmode stripped from backfill connection: ${strippedSslMode ? 'yes' : 'no'}`);
  return {
    connectionString: parsedUrl.toString(),
    ssl: {
      rejectUnauthorized: !sslNoVerify,
    },
    statement_timeout: 120000,
    query_timeout: 120000,
    application_name: 'ember-ledger-normalized-catalog-backfill',
  };
}

if (!Number.isFinite(batchSize) || batchSize <= 0 || batchSize > 5000) {
  console.error('--batch-size must be between 1 and 5000.');
  process.exit(1);
}

const sections = [
  {
    name: 'product-kind',
    countSql: `
      select count(*)::int as count
      from public.product_catalog
      where product_kind is null or product_kind = 'unknown'
    `,
    runSql: `
      with todo as (
        select id
        from public.product_catalog
        where product_kind is null or product_kind = 'unknown'
        order by id
        limit $1
      )
      update public.product_catalog pc
      set product_kind = case
        when coalesce(pc.is_sealed, false)
          or lower(coalesce(pc.product_type, '')) like any (array['%sealed%', '%booster%', '%elite trainer%', '%box%', '%tin%', '%collection%', '%bundle%', '%pack%', '%deck%', '%blister%'])
          or lower(coalesce(pc.name, '')) like any (array['%booster%', '%elite trainer%', '% etb%', '%box%', '%pack%', '%tin%', '%collection%', '%bundle%', '%blister%', '%deck%', '%build%battle%'])
          then 'sealed_product'
        when lower(coalesce(pc.product_type, '')) like '%code card%' or lower(coalesce(pc.name, '')) like '%code card%'
          then 'code_card'
        when lower(coalesce(pc.product_type, '')) like '%promo%' or lower(coalesce(pc.name, '')) like '%promo%'
          then 'promo'
        when lower(coalesce(pc.product_type, '')) like '%card%' or nullif(trim(coalesce(pc.card_number, '')), '') is not null
          then 'single_card'
        else coalesce(nullif(pc.product_kind, ''), 'unknown')
      end
      from todo
      where pc.id = todo.id
      returning pc.id
    `,
  },
  {
    name: 'sealed-type',
    countSql: `
      select count(*)::int as count
      from public.product_catalog
      where product_kind = 'sealed_product'
        and (sealed_product_type is null or sealed_product_type = 'other' or is_pokemon_center_exclusive is false)
        and lower(coalesce(name, '')) like any (array[
          '%pokemon center%elite trainer box%', '%elite trainer box%pokemon center%', '%elite trainer box%', '% etb%',
          '%sleeved booster%', '%booster bundle%', '%booster display%', '%display box%', '%booster box%', '%booster pack%',
          '%build%battle stadium%', '%build and battle stadium%', '%build%battle box%', '%build and battle box%',
          '%premium collection%', '%ultra premium collection%', '%ultra-premium collection%', '%poster collection%',
          '%mini tin%', '% tin%', '%blister%', '%checklane%', '%league battle deck%', '%battle deck%',
          '%starter deck%', '%theme deck%', '%collection%'
        ])
    `,
    runSql: `
      with todo as (
        select id
        from public.product_catalog
        where product_kind = 'sealed_product'
          and (sealed_product_type is null or sealed_product_type = 'other' or is_pokemon_center_exclusive is false)
          and lower(coalesce(name, '')) like any (array[
            '%pokemon center%elite trainer box%', '%elite trainer box%pokemon center%', '%elite trainer box%', '% etb%',
            '%sleeved booster%', '%booster bundle%', '%booster display%', '%display box%', '%booster box%', '%booster pack%',
            '%build%battle stadium%', '%build and battle stadium%', '%build%battle box%', '%build and battle box%',
            '%premium collection%', '%ultra premium collection%', '%ultra-premium collection%', '%poster collection%',
            '%mini tin%', '% tin%', '%blister%', '%checklane%', '%league battle deck%', '%battle deck%',
            '%starter deck%', '%theme deck%', '%collection%'
          ])
        order by id
        limit $1
      )
      update public.product_catalog pc
      set
        sealed_product_type = case
          when lower(coalesce(pc.name, '')) like '%pokemon center%elite trainer box%' or lower(coalesce(pc.name, '')) like '%elite trainer box%pokemon center%' then 'pokemon_center_elite_trainer_box'
          when lower(coalesce(pc.name, '')) like '%elite trainer box%' or lower(coalesce(pc.name, '')) like '% etb%' then 'elite_trainer_box'
          when lower(coalesce(pc.name, '')) like '%sleeved booster%' then 'sleeved_booster_pack'
          when lower(coalesce(pc.name, '')) like '%booster bundle%' then 'booster_bundle'
          when lower(coalesce(pc.name, '')) like '%booster display%' or lower(coalesce(pc.name, '')) like '%display box%' or lower(coalesce(pc.name, '')) like '%booster box%' then 'booster_display_box'
          when lower(coalesce(pc.name, '')) like '%booster pack%' then 'booster_pack'
          when lower(coalesce(pc.name, '')) like '%build%battle stadium%' or lower(coalesce(pc.name, '')) like '%build and battle stadium%' then 'build_and_battle_stadium'
          when lower(coalesce(pc.name, '')) like '%build%battle box%' or lower(coalesce(pc.name, '')) like '%build and battle box%' then 'build_and_battle_box'
          when lower(coalesce(pc.name, '')) like '%premium collection%' or lower(coalesce(pc.name, '')) like '%ultra premium collection%' or lower(coalesce(pc.name, '')) like '%ultra-premium collection%' then 'premium_collection'
          when lower(coalesce(pc.name, '')) like '%poster collection%' then 'poster_collection'
          when lower(coalesce(pc.name, '')) like '%mini tin%' then 'mini_tin'
          when lower(coalesce(pc.name, '')) like '% tin%' then 'tin'
          when lower(coalesce(pc.name, '')) like '%blister%' or lower(coalesce(pc.name, '')) like '%checklane%' then 'blister_pack'
          when lower(coalesce(pc.name, '')) like '%league battle deck%' then 'league_battle_deck'
          when lower(coalesce(pc.name, '')) like '%battle deck%' then 'battle_deck'
          when lower(coalesce(pc.name, '')) like '%starter deck%' or lower(coalesce(pc.name, '')) like '%theme deck%' then 'starter_deck'
          when lower(coalesce(pc.name, '')) like '%collection%' then 'collection_box'
          else pc.sealed_product_type
        end,
        is_pokemon_center_exclusive = case
          when lower(coalesce(pc.name, '')) like '%pokemon center%elite trainer box%' or lower(coalesce(pc.name, '')) like '%elite trainer box%pokemon center%' then true
          else pc.is_pokemon_center_exclusive
        end
      from todo
      where pc.id = todo.id
      returning pc.id
    `,
  },
  {
    name: 'pack-count',
    countSql: `
      select count(*)::int as count
      from public.product_catalog
      where product_kind = 'sealed_product'
        and sealed_product_type in ('pokemon_center_elite_trainer_box', 'elite_trainer_box', 'booster_bundle', 'booster_display_box', 'booster_pack', 'sleeved_booster_pack')
        and (coalesce(pack_count, 0) = 0 or not (coalesce(contents, '{}'::jsonb) ? 'pack_count_source'))
    `,
    runSql: `
      with todo as (
        select id
        from public.product_catalog
        where product_kind = 'sealed_product'
          and sealed_product_type in ('pokemon_center_elite_trainer_box', 'elite_trainer_box', 'booster_bundle', 'booster_display_box', 'booster_pack', 'sleeved_booster_pack')
          and (coalesce(pack_count, 0) = 0 or not (coalesce(contents, '{}'::jsonb) ? 'pack_count_source'))
        order by id
        limit $1
      )
      update public.product_catalog pc
      set
        pack_count = case
          when coalesce(pc.pack_count, 0) > 0 then pc.pack_count
          when pc.sealed_product_type = 'pokemon_center_elite_trainer_box' then 11
          when pc.sealed_product_type = 'elite_trainer_box' then 9
          when pc.sealed_product_type = 'booster_bundle' then 6
          when pc.sealed_product_type = 'booster_display_box' then 36
          when pc.sealed_product_type in ('booster_pack', 'sleeved_booster_pack') then 1
          else pc.pack_count
        end,
        contents = coalesce(pc.contents, '{}'::jsonb) || jsonb_build_object(
          'pack_count_source',
          case when coalesce(pc.pack_count, 0) > 0 then 'existing_source' else 'sealed_product_type_default' end,
          'pack_count_confidence',
          case when coalesce(pc.pack_count, 0) > 0 then 'imported' else 'unverified_default' end
        )
      from todo
      where pc.id = todo.id
      returning pc.id
    `,
  },
  {
    name: 'msrp-metadata',
    countSql: `
      select count(*)::int as count
      from public.product_catalog
      where coalesce(msrp_price, 0) > 0
        and (msrp_confidence is null or msrp_source is null)
    `,
    runSql: `
      with todo as (
        select id
        from public.product_catalog
        where coalesce(msrp_price, 0) > 0
          and (msrp_confidence is null or msrp_source is null)
        order by id
        limit $1
      )
      update public.product_catalog pc
      set
        msrp_confidence = coalesce(pc.msrp_confidence, 'imported'),
        msrp_source = coalesce(pc.msrp_source, pc.market_source, 'catalog_import')
      from todo
      where pc.id = todo.id
      returning pc.id
    `,
  },
  {
    name: 'barcode-identifiers',
    countSql: `
      with source_rows as (
        select
          case
            when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 12 then 'UPC'
            when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 13 then 'EAN'
            else 'GTIN'
          end as identifier_type,
          trim(pc.barcode) as identifier_value
        from public.product_catalog pc
        where nullif(trim(coalesce(pc.barcode, '')), '') is not null
      )
      select count(*)::int as count
      from source_rows sr
      where not exists (
        select 1 from public.product_identifiers pi
        where pi.identifier_type = sr.identifier_type
          and pi.identifier_value = sr.identifier_value
      )
    `,
    runSql: `
      with source_rows as (
        select
          pc.id,
          case
            when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 12 then 'UPC'
            when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 13 then 'EAN'
            else 'GTIN'
          end as identifier_type,
          trim(pc.barcode) as identifier_value,
          coalesce(pc.market_source, 'catalog_import') as source,
          pc.market_url
        from public.product_catalog pc
        where nullif(trim(coalesce(pc.barcode, '')), '') is not null
          and not exists (
            select 1 from public.product_identifiers pi
            where pi.identifier_type = case
                when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 12 then 'UPC'
                when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 13 then 'EAN'
                else 'GTIN'
              end
              and pi.identifier_value = trim(pc.barcode)
          )
        order by pc.id
        limit $1
      )
      insert into public.product_identifiers (catalog_product_id, identifier_type, identifier_value, source, source_url, confidence)
      select id, identifier_type, identifier_value, source, market_url, 'imported'
      from source_rows
      on conflict(identifier_type, identifier_value) do nothing
      returning id
    `,
  },
  {
    name: 'tcgplayer-product-identifiers',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      where nullif(trim(coalesce(pc.tcgplayer_product_id, '')), '') is not null
        and not exists (
          select 1 from public.product_identifiers pi
          where pi.identifier_type = 'TCGPLAYER_PRODUCT_ID'
            and pi.identifier_value = trim(pc.tcgplayer_product_id)
        )
    `,
    runSql: `
      with source_rows as (
        select pc.id, trim(pc.tcgplayer_product_id) as identifier_value, coalesce(pc.market_source, 'TCGCSV') as source, pc.market_url
        from public.product_catalog pc
        where nullif(trim(coalesce(pc.tcgplayer_product_id, '')), '') is not null
          and not exists (
            select 1 from public.product_identifiers pi
            where pi.identifier_type = 'TCGPLAYER_PRODUCT_ID'
              and pi.identifier_value = trim(pc.tcgplayer_product_id)
          )
        order by pc.id
        limit $1
      )
      insert into public.product_identifiers (catalog_product_id, identifier_type, identifier_value, source, source_url, confidence)
      select id, 'TCGPLAYER_PRODUCT_ID', identifier_value, source, market_url, 'imported'
      from source_rows
      on conflict(identifier_type, identifier_value) do nothing
      returning id
    `,
  },
  {
    name: 'tcgplayer-external-identifiers',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      where nullif(trim(coalesce(pc.external_product_id, '')), '') is not null
        and lower(coalesce(pc.market_source, '')) in ('tcgcsv', 'tcgplayer')
        and not exists (
          select 1 from public.product_identifiers pi
          where pi.identifier_type = 'TCGPLAYER_PRODUCT_ID'
            and pi.identifier_value = trim(pc.external_product_id)
        )
    `,
    runSql: `
      with source_rows as (
        select pc.id, trim(pc.external_product_id) as identifier_value, coalesce(pc.market_source, 'TCGCSV') as source, pc.market_url
        from public.product_catalog pc
        where nullif(trim(coalesce(pc.external_product_id, '')), '') is not null
          and lower(coalesce(pc.market_source, '')) in ('tcgcsv', 'tcgplayer')
          and not exists (
            select 1 from public.product_identifiers pi
            where pi.identifier_type = 'TCGPLAYER_PRODUCT_ID'
              and pi.identifier_value = trim(pc.external_product_id)
          )
        order by pc.id
        limit $1
      )
      insert into public.product_identifiers (catalog_product_id, identifier_type, identifier_value, source, source_url, confidence)
      select id, 'TCGPLAYER_PRODUCT_ID', identifier_value, source, market_url, 'imported'
      from source_rows
      on conflict(identifier_type, identifier_value) do nothing
      returning id
    `,
  },
  {
    name: 'pokemontcg-identifiers',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      where nullif(trim(coalesce(pc.external_product_id, '')), '') is not null
        and lower(coalesce(pc.market_source, '')) in ('pokemontcgapi', 'pokemon tcg api', 'pokemon tcg api v2')
        and not exists (
          select 1 from public.product_identifiers pi
          where pi.identifier_type = 'POKEMONTCG_IO_ID'
            and pi.identifier_value = trim(pc.external_product_id)
        )
    `,
    runSql: `
      with source_rows as (
        select pc.id, trim(pc.external_product_id) as identifier_value, pc.market_url
        from public.product_catalog pc
        where nullif(trim(coalesce(pc.external_product_id, '')), '') is not null
          and lower(coalesce(pc.market_source, '')) in ('pokemontcgapi', 'pokemon tcg api', 'pokemon tcg api v2')
          and not exists (
            select 1 from public.product_identifiers pi
            where pi.identifier_type = 'POKEMONTCG_IO_ID'
              and pi.identifier_value = trim(pc.external_product_id)
          )
        order by pc.id
        limit $1
      )
      insert into public.product_identifiers (catalog_product_id, identifier_type, identifier_value, source, source_url, confidence)
      select id, 'POKEMONTCG_IO_ID', identifier_value, 'PokemonTCGAPI', market_url, 'imported'
      from source_rows
      on conflict(identifier_type, identifier_value) do nothing
      returning id
    `,
  },
  {
    name: 'variants-from-current',
    countSql: `
      select count(*)::int as count
      from public.product_market_price_current p
      where p.catalog_product_id is not null
        and nullif(trim(coalesce(p.price_subtype, '')), '') is not null
        and not exists (
          select 1 from public.catalog_product_variants v
          where v.catalog_product_id = p.catalog_product_id
            and v.variant_name = nullif(trim(p.price_subtype), '')
            and v.language = 'English'
            and v.condition_name = ''
        )
    `,
    runSql: `
      with source_rows as (
        select distinct
          p.catalog_product_id,
          nullif(trim(p.price_subtype), '') as variant_name,
          case when lower(p.price_subtype) like '%1st edition%' then '1st Edition' when lower(p.price_subtype) like '%unlimited%' then 'Unlimited' else null end as printing,
          case when lower(p.price_subtype) like '%reverse%' then 'Reverse Holofoil' when lower(p.price_subtype) like '%holo%' then 'Holofoil' when lower(p.price_subtype) like '%normal%' then 'Normal' when lower(p.price_subtype) like '%sealed%' or lower(p.price_subtype) like '%unopened%' then 'Sealed' else p.price_subtype end as finish
        from public.product_market_price_current p
        where p.catalog_product_id is not null
          and nullif(trim(coalesce(p.price_subtype, '')), '') is not null
          and not exists (
            select 1 from public.catalog_product_variants v
            where v.catalog_product_id = p.catalog_product_id
              and v.variant_name = nullif(trim(p.price_subtype), '')
              and v.language = 'English'
              and v.condition_name = ''
          )
        order by p.catalog_product_id
        limit $1
      )
      insert into public.catalog_product_variants (catalog_product_id, variant_name, printing, finish, language, condition_name, is_default)
      select catalog_product_id, variant_name, printing, finish, 'English', '', false
      from source_rows
      on conflict(catalog_product_id, variant_name, language, condition_name) do nothing
      returning id
    `,
  },
  {
    name: 'variants-from-catalog',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      where nullif(trim(coalesce(pc.price_subtype, '')), '') is not null
        and not exists (
          select 1 from public.catalog_product_variants v
          where v.catalog_product_id = pc.id
            and v.variant_name = nullif(trim(pc.price_subtype), '')
            and v.language = coalesce(nullif(pc.language, ''), 'English')
            and v.condition_name = ''
        )
    `,
    runSql: `
      with source_rows as (
        select distinct
          pc.id as catalog_product_id,
          nullif(trim(pc.price_subtype), '') as variant_name,
          case when lower(pc.price_subtype) like '%1st edition%' then '1st Edition' when lower(pc.price_subtype) like '%unlimited%' then 'Unlimited' else null end as printing,
          case when lower(pc.price_subtype) like '%reverse%' then 'Reverse Holofoil' when lower(pc.price_subtype) like '%holo%' then 'Holofoil' when lower(pc.price_subtype) like '%normal%' then 'Normal' when lower(pc.price_subtype) like '%sealed%' or lower(pc.price_subtype) like '%unopened%' then 'Sealed' else pc.price_subtype end as finish,
          coalesce(nullif(pc.language, ''), 'English') as language
        from public.product_catalog pc
        where nullif(trim(coalesce(pc.price_subtype, '')), '') is not null
          and not exists (
            select 1 from public.catalog_product_variants v
            where v.catalog_product_id = pc.id
              and v.variant_name = nullif(trim(pc.price_subtype), '')
              and v.language = coalesce(nullif(pc.language, ''), 'English')
              and v.condition_name = ''
          )
        order by pc.id
        limit $1
      )
      insert into public.catalog_product_variants (catalog_product_id, variant_name, printing, finish, language, condition_name, is_default)
      select catalog_product_id, variant_name, printing, finish, language, '', true
      from source_rows
      on conflict(catalog_product_id, variant_name, language, condition_name) do nothing
      returning id
    `,
  },
  {
    name: 'default-variant',
    countSql: `
      with ranked as (
        select
          v.id,
          row_number() over (
            partition by v.catalog_product_id
            order by
              case when v.variant_name = pc.price_subtype then 0 else 1 end,
              case when lower(v.variant_name) in ('normal', 'sealed', 'unopened') then 0 when lower(v.variant_name) like '%holo%' then 1 else 2 end,
              v.created_at,
              v.id
          ) = 1 as should_be_default
        from public.catalog_product_variants v
        join public.product_catalog pc on pc.id = v.catalog_product_id
      )
      select count(*)::int as count
      from ranked r
      join public.catalog_product_variants v on v.id = r.id
      where v.is_default is distinct from r.should_be_default
    `,
    runSql: `
      with ranked as (
        select
          v.id,
          row_number() over (
            partition by v.catalog_product_id
            order by
              case when v.variant_name = pc.price_subtype then 0 else 1 end,
              case when lower(v.variant_name) in ('normal', 'sealed', 'unopened') then 0 when lower(v.variant_name) like '%holo%' then 1 else 2 end,
              v.created_at,
              v.id
          ) = 1 as should_be_default
        from public.catalog_product_variants v
        join public.product_catalog pc on pc.id = v.catalog_product_id
      ),
      todo as (
        select r.id, r.should_be_default
        from ranked r
        join public.catalog_product_variants v on v.id = r.id
        where v.is_default is distinct from r.should_be_default
        order by r.id
        limit $1
      )
      update public.catalog_product_variants v
      set is_default = todo.should_be_default
      from todo
      where v.id = todo.id
      returning v.id
    `,
  },
  {
    name: 'tcg-card-details',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      where pc.product_kind = 'single_card'
        and pc.raw_source is not null
        and not exists (
          select 1 from public.tcg_card_details d
          where d.catalog_product_id = pc.id
        )
    `,
    runSql: `
      with source_rows as (
        select pc.*
        from public.product_catalog pc
        where pc.product_kind = 'single_card'
          and pc.raw_source is not null
          and not exists (
            select 1 from public.tcg_card_details d
            where d.catalog_product_id = pc.id
          )
        order by pc.id
        limit $1
      )
      insert into public.tcg_card_details (
        catalog_product_id, card_name, supertype, subtypes, stage, evolves_from, hp, types,
        abilities, attacks, weaknesses, resistances, retreat_cost, converted_retreat_cost,
        rarity, artist, flavor_text, regulation_mark, legalities, raw_source
      )
      select
        pc.id,
        pc.name,
        pc.raw_source ->> 'supertype',
        case when jsonb_typeof(pc.raw_source -> 'subtypes') = 'array' then pc.raw_source -> 'subtypes' else '[]'::jsonb end,
        case
          when jsonb_typeof(pc.raw_source -> 'subtypes') = 'array' then (
            select value
            from jsonb_array_elements_text(pc.raw_source -> 'subtypes') as subtype(value)
            where value in ('Basic', 'Stage 1', 'Stage 2', 'VSTAR', 'VMAX', 'Mega', 'Restored')
            limit 1
          )
          else null
        end,
        pc.raw_source ->> 'evolvesFrom',
        nullif(pc.raw_source ->> 'hp', '')::integer,
        case when jsonb_typeof(pc.raw_source -> 'types') = 'array' then pc.raw_source -> 'types' else '[]'::jsonb end,
        coalesce(pc.raw_source -> 'abilities', '[]'::jsonb),
        coalesce(pc.raw_source -> 'attacks', '[]'::jsonb),
        coalesce(pc.raw_source -> 'weaknesses', '[]'::jsonb),
        coalesce(pc.raw_source -> 'resistances', '[]'::jsonb),
        coalesce(pc.raw_source -> 'retreatCost', '[]'::jsonb),
        nullif(pc.raw_source ->> 'convertedRetreatCost', '')::integer,
        pc.raw_source ->> 'rarity',
        pc.raw_source ->> 'artist',
        pc.raw_source ->> 'flavorText',
        pc.raw_source ->> 'regulationMark',
        coalesce(pc.raw_source -> 'legalities', '{}'::jsonb),
        pc.raw_source
      from source_rows pc
      on conflict(catalog_product_id) do nothing
      returning catalog_product_id
    `,
  },
  {
    name: 'expansion-pokemontcg',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      where pc.expansion_id is null
        and lower(coalesce(pc.market_source, '')) in ('pokemontcgapi', 'pokemon tcg api', 'pokemon tcg api v2')
        and nullif(trim(coalesce(pc.set_code, '')), '') is not null
        and exists (
          select 1 from public.tcg_expansions e
          where lower(e.pokemon_tcg_io_id) = lower(pc.set_code)
             or lower(e.ptcgo_code) = lower(pc.set_code)
        )
    `,
    runSql: `
      with todo as (
        select pc.id, e.id as expansion_id
        from public.product_catalog pc
        join public.tcg_expansions e on lower(e.pokemon_tcg_io_id) = lower(pc.set_code) or lower(e.ptcgo_code) = lower(pc.set_code)
        where pc.expansion_id is null
          and lower(coalesce(pc.market_source, '')) in ('pokemontcgapi', 'pokemon tcg api', 'pokemon tcg api v2')
          and nullif(trim(coalesce(pc.set_code, '')), '') is not null
        order by pc.id
        limit $1
      )
      update public.product_catalog pc
      set expansion_id = todo.expansion_id
      from todo
      where pc.id = todo.id
      returning pc.id
    `,
  },
  {
    name: 'expansion-tcgplayer',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      where pc.expansion_id is null
        and pc.source_group_id is not null
        and exists (
          select 1 from public.tcg_expansions e
          where e.tcgplayer_group_id = pc.source_group_id
        )
    `,
    runSql: `
      with todo as (
        select pc.id, e.id as expansion_id
        from public.product_catalog pc
        join public.tcg_expansions e on e.tcgplayer_group_id = pc.source_group_id
        where pc.expansion_id is null
          and pc.source_group_id is not null
        order by pc.id
        limit $1
      )
      update public.product_catalog pc
      set expansion_id = todo.expansion_id
      from todo
      where pc.id = todo.id
      returning pc.id
    `,
  },
];

const selected = sectionName === 'all'
  ? sections
  : sections.filter((section) => section.name === sectionName);

if (selected.length === 0) {
  console.error(`Unknown section "${sectionName}". Available: all, ${sections.map((section) => section.name).join(', ')}`);
  process.exit(1);
}

async function tableExists(client, tableName) {
  const result = await client.query('select to_regclass($1) as table_name', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function runSection(client, section) {
  const countResult = await client.query(section.countSql);
  const initialCount = Number(countResult.rows[0]?.count || 0);
  console.log(`[${section.name}] pending=${initialCount}`);

  if (dryRun || initialCount === 0) {
    return { section: section.name, pending: initialCount, changed: 0 };
  }

  let changedTotal = 0;
  let batch = 0;
  while (true) {
    batch += 1;
    const result = await client.query('begin');
    try {
      void result;
      const writeResult = await client.query(section.runSql, [batchSize]);
      await client.query('commit');
      const changed = writeResult.rowCount || 0;
      changedTotal += changed;
      console.log(`[${section.name}] batch=${batch} changed=${changed} total=${changedTotal}`);
      if (changed === 0 || (maxBatches > 0 && batch >= maxBatches)) break;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    }
  }

  return { section: section.name, pending: initialCount, changed: changedTotal };
}

(async () => {
  const client = new Client(buildPgConfig());
  await client.connect();
  await client.query('select current_database()');
  console.log('Connection preflight passed.');

  const requiredTables = ['product_catalog', 'product_identifiers', 'catalog_product_variants', 'tcg_card_details'];
  for (const tableName of requiredTables) {
    if (!(await tableExists(client, tableName))) {
      throw new Error(`Missing required table public.${tableName}. Apply schema migrations before running backfills.`);
    }
  }

  console.log(`normalized catalog backfill: sections=${selected.map((section) => section.name).join(', ')} batchSize=${batchSize} dryRun=${dryRun}`);
  const results = [];
  for (const section of selected) {
    results.push(await runSection(client, section));
  }
  await client.end();

  console.log(JSON.stringify({ ok: true, dryRun, batchSize, results }, null, 2));
})().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
