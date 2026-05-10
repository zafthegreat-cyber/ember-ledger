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
const maxBatches = Number.parseInt(readOption('max-batches', '0'), 10);
const dryRun = args.includes('--dry-run');
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
    application_name: 'ember-ledger-master-catalog-backfill',
  };
}

if (!Number.isFinite(batchSize) || batchSize <= 0 || batchSize > 5000) {
  console.error('--batch-size must be between 1 and 5000.');
  process.exit(1);
}

const sections = [
  {
    name: 'items',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      where pc.category = 'Pokemon'
        and not exists (
          select 1
          from public.master_catalog_items mci
          where mci.legacy_product_catalog_id = pc.id
        )
    `,
    runSql: `
      with todo as (
        select pc.*
        from public.product_catalog pc
        where pc.category = 'Pokemon'
          and not exists (
            select 1
            from public.master_catalog_items mci
            where mci.legacy_product_catalog_id = pc.id
          )
        order by pc.id
        limit $1
      )
      insert into public.master_catalog_items (
        legacy_product_catalog_id,
        catalog_item_type,
        name,
        set_name,
        set_code,
        release_year,
        product_type,
        product_line,
        card_number,
        rarity,
        image_url,
        msrp,
        tcgplayer_product_id,
        external_links,
        last_verified_at,
        data_confidence_score,
        source,
        raw_source,
        created_at,
        updated_at
      )
      select
        pc.id,
        case
          when lower(coalesce(pc.product_type, '')) like any (array['%slab%', '%graded%', '%psa%', '%bgs%', '%cgc%']) then 'slab'
          when coalesce(pc.is_sealed, false)
            or lower(coalesce(pc.product_type, '')) like any (array['%sealed%', '%booster%', '%elite trainer%', '%box%', '%tin%', '%collection%', '%bundle%', '%pack%', '%deck%', '%blister%'])
            or lower(coalesce(pc.name, '')) like any (array['%booster%', '%elite trainer%', '% etb%', '%box%', '%pack%', '%tin%', '%collection%', '%bundle%', '%blister%', '%deck%', '%build%battle%'])
            then 'sealed'
          when lower(coalesce(pc.product_type, '')) like any (array['%sleeve%', '%binder%', '%playmat%', '%accessory%', '%supplies%']) then 'accessory'
          else 'card'
        end,
        coalesce(nullif(trim(pc.name), ''), 'Unnamed catalog item'),
        nullif(trim(coalesce(pc.set_name, pc.expansion, pc.source_group_name, '')), ''),
        nullif(trim(pc.set_code), ''),
        nullif(regexp_replace(coalesce(pc.raw_source->>'releaseDate', ''), '[^0-9].*$', ''), '')::integer,
        nullif(trim(pc.product_type), ''),
        nullif(trim(pc.product_line), ''),
        nullif(trim(pc.card_number), ''),
        nullif(trim(pc.rarity), ''),
        nullif(trim(pc.image_url), ''),
        pc.msrp_price,
        nullif(trim(pc.tcgplayer_product_id), ''),
        jsonb_strip_nulls(jsonb_build_object(
          'market_url', nullif(trim(pc.market_url), ''),
          'legacy_external_product_id', nullif(trim(pc.external_product_id), '')
        )),
        pc.last_price_checked,
        case
          when pc.last_price_checked is not null and (pc.market_price > 0 or pc.mid_price > 0) then 0.85
          when pc.image_url is not null or pc.tcgplayer_product_id is not null then 0.70
          else 0.50
        end,
        coalesce(nullif(trim(pc.market_source), ''), 'legacy_product_catalog'),
        coalesce(pc.raw_source, '{}'::jsonb),
        coalesce(pc.created_at, now()),
        coalesce(pc.updated_at, now())
      from todo pc
      on conflict (legacy_product_catalog_id) do update set
        catalog_item_type = excluded.catalog_item_type,
        name = excluded.name,
        set_name = excluded.set_name,
        set_code = excluded.set_code,
        release_year = excluded.release_year,
        product_type = excluded.product_type,
        product_line = excluded.product_line,
        card_number = excluded.card_number,
        rarity = excluded.rarity,
        image_url = excluded.image_url,
        msrp = excluded.msrp,
        tcgplayer_product_id = excluded.tcgplayer_product_id,
        external_links = excluded.external_links,
        last_verified_at = excluded.last_verified_at,
        data_confidence_score = excluded.data_confidence_score,
        source = excluded.source,
        raw_source = excluded.raw_source,
        updated_at = now()
      returning id
    `,
  },
  {
    name: 'identifiers',
    countSql: `
      with source_rows as (
        select
          mci.id as catalog_item_id,
          case
            when nullif(trim(coalesce(pc.barcode, '')), '') is not null then
              case
                when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 12 then 'UPC'
                when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 13 then 'EAN'
                else 'GTIN'
              end
            when nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id, '')), '') is not null
              and lower(coalesce(pc.market_source, '')) like any (array['%tcgcsv%', '%tcgplayer%']) then 'TCGPLAYER_PRODUCT_ID'
            when nullif(trim(coalesce(pc.external_product_id, '')), '') is not null then 'OTHER'
            when nullif(trim(coalesce(pc.card_number, '')), '') is not null then 'CARD_NUMBER'
            when nullif(trim(coalesce(pc.set_code, '')), '') is not null then 'SET_CODE'
          end as identifier_type,
          coalesce(
            nullif(trim(pc.barcode), ''),
            nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id)), ''),
            nullif(trim(pc.external_product_id), ''),
            nullif(trim(pc.card_number), ''),
            nullif(trim(pc.set_code), '')
          ) as identifier_value
        from public.product_catalog pc
        join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
      )
      select count(*)::int as count
      from source_rows sr
      where sr.identifier_type is not null
        and sr.identifier_value is not null
        and not exists (
          select 1 from public.master_catalog_identifiers existing
          where existing.catalog_item_id = sr.catalog_item_id
            and existing.identifier_type = sr.identifier_type
            and lower(existing.identifier_value) = lower(sr.identifier_value)
            and coalesce(existing.retailer, '') = ''
        )
    `,
    runSql: `
      with source_rows as (
        select * from (
          select mci.id as catalog_item_id,
            case
              when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 12 then 'UPC'
              when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 13 then 'EAN'
              else 'GTIN'
            end as identifier_type,
            trim(pc.barcode) as identifier_value,
            coalesce(pc.market_source, 'legacy_product_catalog') as source,
            pc.market_url as source_url,
            0.8::numeric as confidence_score
          from public.product_catalog pc
          join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
          where nullif(trim(coalesce(pc.barcode, '')), '') is not null

          union all

          select mci.id, 'TCGPLAYER_PRODUCT_ID', trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id)),
            coalesce(pc.market_source, 'TCGplayer'), pc.market_url, 0.85::numeric
          from public.product_catalog pc
          join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
          where nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id, '')), '') is not null
            and lower(coalesce(pc.market_source, '')) like any (array['%tcgcsv%', '%tcgplayer%'])

          union all

          select mci.id, 'OTHER', trim(pc.external_product_id), coalesce(pc.market_source, 'legacy_product_catalog'), pc.market_url, 0.6::numeric
          from public.product_catalog pc
          join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
          where nullif(trim(coalesce(pc.external_product_id, '')), '') is not null
            and lower(coalesce(pc.market_source, '')) not like all (array['%tcgcsv%', '%tcgplayer%'])

          union all

          select mci.id, 'CARD_NUMBER', trim(pc.card_number), 'legacy_product_catalog', null::text, 0.75::numeric
          from public.product_catalog pc
          join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
          where nullif(trim(coalesce(pc.card_number, '')), '') is not null

          union all

          select mci.id, 'SET_CODE', trim(pc.set_code), 'legacy_product_catalog', null::text, 0.75::numeric
          from public.product_catalog pc
          join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
          where nullif(trim(coalesce(pc.set_code, '')), '') is not null
        ) sr
        where not exists (
          select 1 from public.master_catalog_identifiers existing
          where existing.catalog_item_id = sr.catalog_item_id
            and existing.identifier_type = sr.identifier_type
            and lower(existing.identifier_value) = lower(sr.identifier_value)
            and coalesce(existing.retailer, '') = ''
        )
        order by catalog_item_id, identifier_type, identifier_value
        limit $1
      )
      insert into public.master_catalog_identifiers (
        catalog_item_id,
        identifier_type,
        identifier_value,
        source,
        source_url,
        status,
        confidence_score
      )
      select catalog_item_id, identifier_type, identifier_value, source, source_url, 'source_imported', confidence_score
      from source_rows
      on conflict do nothing
      returning id
    `,
  },
  {
    name: 'variants',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
      where not exists (
        select 1 from public.master_catalog_variants existing
        where existing.catalog_item_id = mci.id
          and existing.variant_name = coalesce(nullif(trim(pc.price_subtype), ''), case when mci.catalog_item_type = 'sealed' then 'Sealed' else 'Default' end)
          and existing.language = 'English'
          and existing.condition_name = ''
      )
    `,
    runSql: `
      with source_rows as (
        select
          mci.id as catalog_item_id,
          case
            when lower(coalesce(pc.price_subtype, '')) like '%reverse%' then 'reverse_holo'
            when lower(coalesce(pc.price_subtype, '')) like '%holo%' then 'holo'
            when lower(coalesce(pc.price_subtype, '')) like '%promo%' then 'promo'
            when lower(coalesce(pc.price_subtype, '')) like '%1st edition%' then 'first_edition'
            when lower(coalesce(pc.price_subtype, '')) like '%unlimited%' then 'unlimited'
            when mci.catalog_item_type = 'sealed' then 'sealed'
            else 'standard'
          end as variant_type,
          coalesce(nullif(trim(pc.price_subtype), ''), case when mci.catalog_item_type = 'sealed' then 'Sealed' else 'Default' end) as variant_name,
          case
            when lower(coalesce(pc.price_subtype, '')) like '%reverse%' then 'Reverse Holofoil'
            when lower(coalesce(pc.price_subtype, '')) like '%holo%' then 'Holofoil'
            when mci.catalog_item_type = 'sealed' then 'Sealed'
            else null
          end as finish,
          case
            when lower(coalesce(pc.price_subtype, '')) like '%1st edition%' then '1st Edition'
            when lower(coalesce(pc.price_subtype, '')) like '%unlimited%' then 'Unlimited'
            else null
          end as printing,
          jsonb_strip_nulls(jsonb_build_object('tcgplayer_product_id', nullif(trim(pc.tcgplayer_product_id), ''))) as external_ids
        from public.product_catalog pc
        join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
        where not exists (
          select 1 from public.master_catalog_variants existing
          where existing.catalog_item_id = mci.id
            and existing.variant_name = coalesce(nullif(trim(pc.price_subtype), ''), case when mci.catalog_item_type = 'sealed' then 'Sealed' else 'Default' end)
            and existing.language = 'English'
            and existing.condition_name = ''
        )
        order by mci.id
        limit $1
      )
      insert into public.master_catalog_variants (
        catalog_item_id,
        variant_type,
        variant_name,
        finish,
        printing,
        language,
        condition_name,
        is_default,
        external_ids
      )
      select catalog_item_id, variant_type, variant_name, finish, printing, 'English', '', true, external_ids
      from source_rows
      on conflict do nothing
      returning id
    `,
  },
  {
    name: 'price-sources-product-catalog',
    countSql: `
      select count(*)::int as count
      from public.product_catalog pc
      join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
      where coalesce(pc.market_price, pc.low_price, pc.mid_price, pc.high_price) is not null
        and not exists (
          select 1 from public.master_market_price_sources existing
          where existing.catalog_item_id = mci.id
            and existing.source = coalesce(nullif(trim(pc.market_source), ''), 'legacy_product_catalog')
            and coalesce(existing.source_item_id, '') = coalesce(nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id, '')), ''), '')
            and coalesce(existing.price_type, '') = coalesce(nullif(trim(pc.price_subtype), ''), '')
        )
    `,
    runSql: `
      with source_rows as (
        select
          mci.id as catalog_item_id,
          coalesce(nullif(trim(pc.market_source), ''), 'legacy_product_catalog') as source,
          nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id, '')), '') as source_item_id,
          pc.source_group_id,
          nullif(trim(pc.price_subtype), '') as price_type,
          pc.market_price,
          pc.low_price,
          pc.mid_price,
          pc.high_price,
          pc.market_url as source_url,
          pc.last_price_checked as last_updated_at,
          case when pc.last_price_checked is not null then 0.75 else 0.5 end as confidence_score,
          case when pc.last_price_checked is not null then 'cached' else 'imported' end as status,
          coalesce(pc.raw_source, '{}'::jsonb) as raw_payload
        from public.product_catalog pc
        join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
        where coalesce(pc.market_price, pc.low_price, pc.mid_price, pc.high_price) is not null
          and not exists (
            select 1 from public.master_market_price_sources existing
            where existing.catalog_item_id = mci.id
              and existing.source = coalesce(nullif(trim(pc.market_source), ''), 'legacy_product_catalog')
              and coalesce(existing.source_item_id, '') = coalesce(nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id, '')), ''), '')
              and coalesce(existing.price_type, '') = coalesce(nullif(trim(pc.price_subtype), ''), '')
          )
        order by mci.id
        limit $1
      )
      insert into public.master_market_price_sources (
        catalog_item_id,
        source,
        source_item_id,
        source_group_id,
        price_type,
        market_price,
        low_price,
        mid_price,
        high_price,
        currency,
        source_url,
        last_updated_at,
        confidence_score,
        status,
        raw_payload
      )
      select catalog_item_id, source, source_item_id, source_group_id, price_type, market_price, low_price, mid_price, high_price, 'USD', source_url, last_updated_at, confidence_score, status, raw_payload
      from source_rows
      returning id
    `,
  },
  {
    name: 'price-sources-current',
    countSql: `
      select count(*)::int as count
      from public.product_market_price_current pmp
      join public.master_catalog_items mci on mci.legacy_product_catalog_id = pmp.catalog_product_id
      where not exists (
        select 1 from public.master_market_price_sources existing
        where existing.catalog_item_id = mci.id
          and existing.source = coalesce(nullif(trim(pmp.source), ''), 'market_import')
          and coalesce(existing.source_item_id, '') = coalesce(nullif(trim(pmp.source_product_id), ''), '')
          and coalesce(existing.price_type, '') = coalesce(nullif(trim(pmp.price_subtype), ''), '')
      )
    `,
    runSql: `
      with source_rows as (
        select
          mci.id as catalog_item_id,
          coalesce(nullif(trim(pmp.source), ''), 'market_import') as source,
          nullif(trim(pmp.source_product_id), '') as source_item_id,
          pmp.source_group_id,
          nullif(trim(pmp.price_subtype), '') as price_type,
          pmp.market_price,
          pmp.low_price,
          pmp.mid_price,
          pmp.high_price,
          coalesce(pmp.currency, 'USD') as currency,
          pmp.checked_at as last_updated_at,
          case when pmp.checked_at is not null then 0.8 else 0.6 end as confidence_score,
          coalesce(pmp.raw_source, '{}'::jsonb) as raw_payload
        from public.product_market_price_current pmp
        join public.master_catalog_items mci on mci.legacy_product_catalog_id = pmp.catalog_product_id
        where not exists (
          select 1 from public.master_market_price_sources existing
          where existing.catalog_item_id = mci.id
            and existing.source = coalesce(nullif(trim(pmp.source), ''), 'market_import')
            and coalesce(existing.source_item_id, '') = coalesce(nullif(trim(pmp.source_product_id), ''), '')
            and coalesce(existing.price_type, '') = coalesce(nullif(trim(pmp.price_subtype), ''), '')
        )
        order by mci.id
        limit $1
      )
      insert into public.master_market_price_sources (
        catalog_item_id,
        source,
        source_item_id,
        source_group_id,
        price_type,
        market_price,
        low_price,
        mid_price,
        high_price,
        currency,
        last_updated_at,
        confidence_score,
        status,
        raw_payload
      )
      select catalog_item_id, source, source_item_id, source_group_id, price_type, market_price, low_price, mid_price, high_price, currency, last_updated_at, confidence_score, 'cached', raw_payload
      from source_rows
      returning id
    `,
  },
  {
    name: 'summaries',
    countSql: `
      select count(*)::int as count
      from public.master_catalog_items mci
      where not exists (
        select 1
        from public.master_market_summaries ms
        where ms.catalog_item_id = mci.id
      )
    `,
    runSql: `
      with todo as (
        select mci.id
        from public.master_catalog_items mci
        where not exists (
          select 1
          from public.master_market_summaries ms
          where ms.catalog_item_id = mci.id
        )
        order by mci.id
        limit $1
      ),
      summary_rows as (
        select
          mci.id as catalog_item_id,
          coalesce(
            max(mps.market_price) filter (where mps.market_price > 0),
            max(mps.mid_price) filter (where mps.mid_price > 0),
            max(mps.low_price) filter (where mps.low_price > 0),
            max(mps.high_price) filter (where mps.high_price > 0)
          ) as recommended_market_value,
          mci.msrp,
          case
            when count(mps.id) filter (where mps.market_price > 0 or mps.mid_price > 0) >= 2 then 'high'
            when count(mps.id) filter (where mps.market_price > 0 or mps.mid_price > 0 or mps.low_price > 0) = 1 then 'medium'
            when mci.msrp > 0 then 'low'
            else 'unknown'
          end as price_confidence,
          count(distinct mps.source)::integer as source_count,
          coalesce(sum(mps.sample_size), 0)::integer as sample_size,
          max(mps.last_updated_at) as last_updated_at
        from todo
        join public.master_catalog_items mci on mci.id = todo.id
        left join public.master_market_price_sources mps on mps.catalog_item_id = mci.id
        group by mci.id, mci.msrp
      )
      insert into public.master_market_summaries (
        catalog_item_id,
        recommended_market_value,
        msrp,
        price_confidence,
        source_count,
        sample_size,
        last_updated_at,
        computed_at
      )
      select catalog_item_id, recommended_market_value, msrp, price_confidence, source_count, sample_size, last_updated_at, now()
      from summary_rows
      on conflict (catalog_item_id) do update set
        recommended_market_value = excluded.recommended_market_value,
        msrp = excluded.msrp,
        price_confidence = excluded.price_confidence,
        source_count = excluded.source_count,
        sample_size = excluded.sample_size,
        last_updated_at = excluded.last_updated_at,
        computed_at = now(),
        updated_at = now()
      returning id
    `,
  },
];

const selectedSections = sectionName === 'all'
  ? sections
  : sections.filter((section) => section.name === sectionName);

if (selectedSections.length === 0) {
  console.error(`Unknown section "${sectionName}". Available sections: all, ${sections.map((section) => section.name).join(', ')}`);
  process.exit(1);
}

async function readCount(client, section) {
  const result = await client.query(section.countSql);
  return Number(result.rows[0]?.count || 0);
}

async function runSection(client, section) {
  console.log(`\n[${section.name}] checking pending work...`);
  const pendingBefore = await readCount(client, section);
  console.log(`[${section.name}] pending before: ${pendingBefore}`);

  if (dryRun || pendingBefore === 0) {
    return { name: section.name, pendingBefore, changed: 0, pendingAfter: pendingBefore };
  }

  let changed = 0;
  let batches = 0;

  while (true) {
    batches += 1;
    const result = await client.query(section.runSql, [batchSize]);
    const batchChanged = result.rowCount || 0;
    changed += batchChanged;
    console.log(`[${section.name}] batch ${batches}: ${batchChanged} rows`);

    if (batchChanged === 0) break;
    if (maxBatches > 0 && batches >= maxBatches) {
      console.log(`[${section.name}] stopped at --max-batches=${maxBatches}`);
      break;
    }
  }

  const pendingAfter = await readCount(client, section);
  console.log(`[${section.name}] pending after: ${pendingAfter}`);
  return { name: section.name, pendingBefore, changed, pendingAfter };
}

async function main() {
  const client = new Client(buildPgConfig());

  await client.connect();
  await client.query('select current_database()');
  console.log('Connection preflight passed.');

  try {
    console.log(`Master catalog backfill starting. section=${sectionName} batchSize=${batchSize} dryRun=${dryRun}`);
    const results = [];
    for (const section of selectedSections) {
      results.push(await runSection(client, section));
    }
    console.log('\nSummary:');
    for (const result of results) {
      console.log(`- ${result.name}: pendingBefore=${result.pendingBefore} changed=${result.changed} pendingAfter=${result.pendingAfter}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
