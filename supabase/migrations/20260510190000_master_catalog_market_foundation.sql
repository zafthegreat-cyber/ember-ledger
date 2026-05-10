-- Phase 1 master catalog and market source foundation.
-- Additive: keeps product_catalog as the legacy/import table while exposing
-- lightweight search and deeper detail views backed by normalized records.

begin;

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.master_catalog_items (
  id uuid primary key default gen_random_uuid(),
  legacy_product_catalog_id uuid unique references public.product_catalog(id) on delete set null,
  catalog_item_type text not null
    check (catalog_item_type in ('card', 'sealed', 'slab', 'accessory')),
  name text not null,
  set_name text,
  set_code text,
  release_date date,
  release_year integer,
  product_type text,
  product_line text,
  card_number text,
  rarity text,
  image_url text,
  msrp numeric,
  tcgplayer_product_id text,
  pricecharting_id text,
  ebay_search_query text,
  external_links jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  data_confidence_score numeric not null default 0.5,
  source text not null default 'legacy_product_catalog',
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_catalog_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.master_catalog_items(id) on delete cascade,
  variant_type text not null default 'standard'
    check (variant_type in ('normal', 'holo', 'reverse_holo', 'promo', 'stamped', 'first_edition', 'unlimited', 'graded', 'sealed', 'standard', 'other')),
  variant_name text not null,
  finish text,
  printing text,
  language text not null default 'English',
  condition_name text not null default '',
  grading_company text,
  grade text,
  is_default boolean not null default false,
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_item_id, variant_name, language, condition_name)
);

create table if not exists public.master_catalog_identifiers (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.master_catalog_items(id) on delete cascade,
  identifier_type text not null
    check (identifier_type in (
      'UPC',
      'EAN',
      'GTIN',
      'SKU',
      'RETAILER_SKU',
      'BEST_BUY_SKU',
      'TARGET_TCIN',
      'WALMART_ITEM_ID',
      'WALMART_SKU',
      'GAMESTOP_SKU',
      'POKEMON_CENTER_SKU',
      'TCGPLAYER_PRODUCT_ID',
      'TCGPLAYER_SKU_ID',
      'PRICECHARTING_ID',
      'POKEMONTCG_IO_ID',
      'CARD_NUMBER',
      'SET_CODE',
      'OTHER'
    )),
  identifier_value text not null,
  retailer text,
  source text,
  source_url text,
  status text not null default 'source_imported'
    check (status in ('verified', 'user_submitted', 'needs_review', 'ambiguous', 'rejected', 'source_imported')),
  confidence_score numeric,
  raw_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_market_price_sources (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.master_catalog_items(id) on delete cascade,
  variant_id uuid references public.master_catalog_variants(id) on delete set null,
  source text not null,
  source_item_id text,
  source_group_id integer,
  price_type text,
  market_price numeric,
  low_price numeric,
  mid_price numeric,
  high_price numeric,
  sold_average numeric,
  currency text not null default 'USD',
  sample_size integer,
  source_url text,
  last_updated_at timestamptz,
  confidence_score numeric not null default 0.5,
  status text not null default 'cached'
    check (status in ('live', 'cached', 'manual', 'imported', 'unavailable', 'needs_review')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_market_summaries (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null unique references public.master_catalog_items(id) on delete cascade,
  recommended_market_value numeric,
  msrp numeric,
  price_confidence text not null default 'unknown'
    check (price_confidence in ('high', 'medium', 'low', 'unknown')),
  price_trend_7d numeric,
  price_trend_30d numeric,
  price_trend_90d numeric,
  volatility text,
  source_count integer not null default 0,
  sample_size integer,
  last_updated_at timestamptz,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.universal_data_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  target_entity_type text not null
    check (target_entity_type in ('catalog_item', 'catalog_variant', 'catalog_identifier', 'market_source', 'store', 'retailer', 'restock_pattern', 'other')),
  target_table text not null,
  target_record_id text,
  suggestion_type text not null,
  submitted_data jsonb not null default '{}'::jsonb,
  current_data_snapshot jsonb,
  notes text,
  proof_url text,
  source text not null default 'user',
  status text not null default 'Submitted'
    check (status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Needs More Info', 'Merged')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists master_catalog_identifiers_unique_idx
  on public.master_catalog_identifiers (catalog_item_id, identifier_type, lower(identifier_value), coalesce(retailer, ''));

create index if not exists master_catalog_items_type_idx
  on public.master_catalog_items(catalog_item_type);

create index if not exists master_catalog_items_name_trgm_idx
  on public.master_catalog_items using gin (name extensions.gin_trgm_ops);

create index if not exists master_catalog_items_set_name_trgm_idx
  on public.master_catalog_items using gin (set_name extensions.gin_trgm_ops);

create index if not exists master_catalog_items_product_type_trgm_idx
  on public.master_catalog_items using gin (product_type extensions.gin_trgm_ops);

create index if not exists master_catalog_items_card_number_idx
  on public.master_catalog_items(card_number)
  where card_number is not null and card_number <> '';

create index if not exists master_catalog_items_tcgplayer_idx
  on public.master_catalog_items(tcgplayer_product_id)
  where tcgplayer_product_id is not null and tcgplayer_product_id <> '';

create index if not exists master_catalog_items_verified_name_idx
  on public.master_catalog_items(last_verified_at desc nulls last, name asc);

create index if not exists master_catalog_identifiers_lookup_idx
  on public.master_catalog_identifiers(identifier_type, identifier_value);

create index if not exists master_catalog_identifiers_value_trgm_idx
  on public.master_catalog_identifiers using gin (identifier_value extensions.gin_trgm_ops);

create index if not exists master_catalog_variants_item_idx
  on public.master_catalog_variants(catalog_item_id, is_default desc, variant_name);

create index if not exists master_market_sources_item_idx
  on public.master_market_price_sources(catalog_item_id, last_updated_at desc nulls last);

create index if not exists master_market_sources_lookup_idx
  on public.master_market_price_sources(source, source_item_id, price_type);

create index if not exists universal_data_suggestions_status_idx
  on public.universal_data_suggestions(status, created_at desc);

create index if not exists universal_data_suggestions_target_idx
  on public.universal_data_suggestions(target_entity_type, target_record_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_master_catalog_items_updated_at on public.master_catalog_items;
create trigger set_master_catalog_items_updated_at
before update on public.master_catalog_items
for each row execute function public.set_updated_at();

drop trigger if exists set_master_catalog_variants_updated_at on public.master_catalog_variants;
create trigger set_master_catalog_variants_updated_at
before update on public.master_catalog_variants
for each row execute function public.set_updated_at();

drop trigger if exists set_master_catalog_identifiers_updated_at on public.master_catalog_identifiers;
create trigger set_master_catalog_identifiers_updated_at
before update on public.master_catalog_identifiers
for each row execute function public.set_updated_at();

drop trigger if exists set_master_market_price_sources_updated_at on public.master_market_price_sources;
create trigger set_master_market_price_sources_updated_at
before update on public.master_market_price_sources
for each row execute function public.set_updated_at();

drop trigger if exists set_master_market_summaries_updated_at on public.master_market_summaries;
create trigger set_master_market_summaries_updated_at
before update on public.master_market_summaries
for each row execute function public.set_updated_at();

drop trigger if exists set_universal_data_suggestions_updated_at on public.universal_data_suggestions;
create trigger set_universal_data_suggestions_updated_at
before update on public.universal_data_suggestions
for each row execute function public.set_updated_at();

-- Large master catalog backfills are intentionally not run by this schema migration.
-- Run them later, after schema stability is confirmed, with explicit small batches:
--   npm run backfill:master-catalog -- --dry-run
--   npm run backfill:master-catalog -- --section all
-- See scripts/backfill-master-catalog-batches.cjs.
/*
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
    when coalesce(pc.product_type, '') ~* '(slab|graded|psa|bgs|cgc)' then 'slab'
    when coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack|deck|blister)'
      or coalesce(pc.name, '') ~* '(booster|elite trainer|\m(etb)\M|box|pack|tin|collection|bundle|blister|deck|build\s*&\s*battle)'
      then 'sealed'
    when coalesce(pc.product_type, '') ~* '(sleeve|binder|playmat|accessory|supplies)' then 'accessory'
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
from public.product_catalog pc
where pc.category = 'Pokemon'
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
  updated_at = now();

insert into public.master_catalog_identifiers (
  catalog_item_id,
  identifier_type,
  identifier_value,
  source,
  source_url,
  status,
  confidence_score
)
select
  mci.id,
  case
    when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 12 then 'UPC'
    when length(regexp_replace(pc.barcode, '[^0-9]', '', 'g')) = 13 then 'EAN'
    else 'GTIN'
  end,
  trim(pc.barcode),
  coalesce(pc.market_source, 'legacy_product_catalog'),
  pc.market_url,
  'source_imported',
  0.8
from public.product_catalog pc
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where nullif(trim(coalesce(pc.barcode, '')), '') is not null
on conflict do nothing;

insert into public.master_catalog_identifiers (
  catalog_item_id,
  identifier_type,
  identifier_value,
  source,
  source_url,
  status,
  confidence_score
)
select
  mci.id,
  'TCGPLAYER_PRODUCT_ID',
  trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id)),
  coalesce(pc.market_source, 'TCGplayer'),
  pc.market_url,
  'source_imported',
  0.85
from public.product_catalog pc
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id, '')), '') is not null
  and coalesce(pc.market_source, '') ~* '(tcgcsv|tcgplayer)'
on conflict do nothing;

insert into public.master_catalog_identifiers (
  catalog_item_id,
  identifier_type,
  identifier_value,
  source,
  source_url,
  status,
  confidence_score
)
select
  mci.id,
  'OTHER',
  trim(pc.external_product_id),
  coalesce(pc.market_source, 'legacy_product_catalog'),
  pc.market_url,
  'source_imported',
  0.6
from public.product_catalog pc
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where nullif(trim(coalesce(pc.external_product_id, '')), '') is not null
  and coalesce(pc.market_source, '') !~* '(tcgcsv|tcgplayer)'
on conflict do nothing;

insert into public.master_catalog_identifiers (
  catalog_item_id,
  identifier_type,
  identifier_value,
  source,
  status,
  confidence_score
)
select mci.id, 'CARD_NUMBER', trim(pc.card_number), 'legacy_product_catalog', 'source_imported', 0.75
from public.product_catalog pc
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where nullif(trim(coalesce(pc.card_number, '')), '') is not null
on conflict do nothing;

insert into public.master_catalog_identifiers (
  catalog_item_id,
  identifier_type,
  identifier_value,
  source,
  status,
  confidence_score
)
select mci.id, 'SET_CODE', trim(pc.set_code), 'legacy_product_catalog', 'source_imported', 0.75
from public.product_catalog pc
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where nullif(trim(coalesce(pc.set_code, '')), '') is not null
on conflict do nothing;

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
select
  mci.id,
  case
    when coalesce(pc.price_subtype, '') ~* 'reverse' then 'reverse_holo'
    when coalesce(pc.price_subtype, '') ~* 'holo' then 'holo'
    when coalesce(pc.price_subtype, '') ~* 'promo' then 'promo'
    when coalesce(pc.price_subtype, '') ~* '1st edition' then 'first_edition'
    when coalesce(pc.price_subtype, '') ~* 'unlimited' then 'unlimited'
    when mci.catalog_item_type = 'sealed' then 'sealed'
    else 'standard'
  end,
  coalesce(nullif(trim(pc.price_subtype), ''), case when mci.catalog_item_type = 'sealed' then 'Sealed' else 'Default' end),
  case
    when coalesce(pc.price_subtype, '') ~* 'reverse' then 'Reverse Holofoil'
    when coalesce(pc.price_subtype, '') ~* 'holo' then 'Holofoil'
    when mci.catalog_item_type = 'sealed' then 'Sealed'
    else null
  end,
  case
    when coalesce(pc.price_subtype, '') ~* '1st edition' then '1st Edition'
    when coalesce(pc.price_subtype, '') ~* 'unlimited' then 'Unlimited'
    else null
  end,
  'English',
  '',
  true,
  jsonb_strip_nulls(jsonb_build_object('tcgplayer_product_id', nullif(trim(pc.tcgplayer_product_id), '')))
from public.product_catalog pc
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
on conflict do nothing;

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
select
  mci.id,
  coalesce(nullif(trim(pc.market_source), ''), 'legacy_product_catalog'),
  nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id, '')), ''),
  pc.source_group_id,
  nullif(trim(pc.price_subtype), ''),
  pc.market_price,
  pc.low_price,
  pc.mid_price,
  pc.high_price,
  'USD',
  pc.market_url,
  pc.last_price_checked,
  case when pc.last_price_checked is not null then 0.75 else 0.5 end,
  case when pc.last_price_checked is not null then 'cached' else 'imported' end,
  coalesce(pc.raw_source, '{}'::jsonb)
from public.product_catalog pc
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where coalesce(pc.market_price, pc.low_price, pc.mid_price, pc.high_price) is not null
  and not exists (
    select 1
    from public.master_market_price_sources existing
    where existing.catalog_item_id = mci.id
      and existing.source = coalesce(nullif(trim(pc.market_source), ''), 'legacy_product_catalog')
      and coalesce(existing.source_item_id, '') = coalesce(nullif(trim(coalesce(pc.tcgplayer_product_id, pc.external_product_id, '')), ''), '')
      and coalesce(existing.price_type, '') = coalesce(nullif(trim(pc.price_subtype), ''), '')
  );

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
select
  mci.id,
  coalesce(nullif(trim(pmp.source), ''), 'market_import'),
  nullif(trim(pmp.source_product_id), ''),
  pmp.source_group_id,
  nullif(trim(pmp.price_subtype), ''),
  pmp.market_price,
  pmp.low_price,
  pmp.mid_price,
  pmp.high_price,
  coalesce(pmp.currency, 'USD'),
  pmp.checked_at,
  case when pmp.checked_at is not null then 0.8 else 0.6 end,
  'cached',
  coalesce(pmp.raw_source, '{}'::jsonb)
from public.product_market_price_current pmp
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pmp.catalog_product_id
where not exists (
  select 1
  from public.master_market_price_sources existing
  where existing.catalog_item_id = mci.id
    and existing.source = coalesce(nullif(trim(pmp.source), ''), 'market_import')
    and coalesce(existing.source_item_id, '') = coalesce(nullif(trim(pmp.source_product_id), ''), '')
    and coalesce(existing.price_type, '') = coalesce(nullif(trim(pmp.price_subtype), ''), '')
);

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
select
  mci.id,
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
  max(mps.last_updated_at) as last_updated_at,
  now()
from public.master_catalog_items mci
left join public.master_market_price_sources mps on mps.catalog_item_id = mci.id
group by mci.id, mci.msrp
on conflict (catalog_item_id) do update set
  recommended_market_value = excluded.recommended_market_value,
  msrp = excluded.msrp,
  price_confidence = excluded.price_confidence,
  source_count = excluded.source_count,
  sample_size = excluded.sample_size,
  last_updated_at = excluded.last_updated_at,
  computed_at = now(),
  updated_at = now();
*/

alter table public.master_catalog_items enable row level security;
alter table public.master_catalog_variants enable row level security;
alter table public.master_catalog_identifiers enable row level security;
alter table public.master_market_price_sources enable row level security;
alter table public.master_market_summaries enable row level security;
alter table public.universal_data_suggestions enable row level security;

drop policy if exists "Public read master catalog items" on public.master_catalog_items;
create policy "Public read master catalog items"
on public.master_catalog_items for select
using (true);

drop policy if exists "Public read master catalog variants" on public.master_catalog_variants;
create policy "Public read master catalog variants"
on public.master_catalog_variants for select
using (
  exists (
    select 1 from public.master_catalog_items item
    where item.id = master_catalog_variants.catalog_item_id
  )
);

drop policy if exists "Public read approved catalog identifiers" on public.master_catalog_identifiers;
create policy "Public read approved catalog identifiers"
on public.master_catalog_identifiers for select
using (status <> 'rejected');

drop policy if exists "Public read master market price sources" on public.master_market_price_sources;
create policy "Public read master market price sources"
on public.master_market_price_sources for select
using (true);

drop policy if exists "Public read master market summaries" on public.master_market_summaries;
create policy "Public read master market summaries"
on public.master_market_summaries for select
using (true);

drop policy if exists "Users create universal data suggestions" on public.universal_data_suggestions;
create policy "Users create universal data suggestions"
on public.universal_data_suggestions for insert
to authenticated
with check ((select auth.uid()) = user_id and status in ('Draft', 'Submitted'));

drop policy if exists "Users read own universal data suggestions" on public.universal_data_suggestions;
create policy "Users read own universal data suggestions"
on public.universal_data_suggestions for select
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_or_moderator());

drop policy if exists "Admins manage master catalog items" on public.master_catalog_items;
create policy "Admins manage master catalog items"
on public.master_catalog_items for all
to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "Admins manage master catalog variants" on public.master_catalog_variants;
create policy "Admins manage master catalog variants"
on public.master_catalog_variants for all
to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "Admins manage master catalog identifiers" on public.master_catalog_identifiers;
create policy "Admins manage master catalog identifiers"
on public.master_catalog_identifiers for all
to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "Admins manage master market price sources" on public.master_market_price_sources;
create policy "Admins manage master market price sources"
on public.master_market_price_sources for all
to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "Admins manage master market summaries" on public.master_market_summaries;
create policy "Admins manage master market summaries"
on public.master_market_summaries for all
to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "Admins manage universal data suggestions" on public.universal_data_suggestions;
create policy "Admins manage universal data suggestions"
on public.universal_data_suggestions for all
to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

grant select on public.master_catalog_items to anon, authenticated;
grant select on public.master_catalog_variants to anon, authenticated;
grant select on public.master_catalog_identifiers to anon, authenticated;
grant select on public.master_market_price_sources to anon, authenticated;
grant select on public.master_market_summaries to anon, authenticated;
grant select, insert, update on public.universal_data_suggestions to authenticated;

create or replace view public.catalog_search_lightweight
with (security_invoker = true) as
select
  coalesce(mci.legacy_product_catalog_id, mci.id) as id,
  mci.id as master_catalog_item_id,
  'Pokemon'::text as category,
  mci.catalog_item_type as catalog_item_type,
  mci.catalog_item_type as catalog_type,
  mci.name,
  mci.set_name,
  mci.product_type,
  primary_identifier.identifier_value as barcode,
  other_identifier.identifier_value as external_product_id,
  coalesce(mci.tcgplayer_product_id, tcgplayer_identifier.identifier_value) as tcgplayer_product_id,
  best_source.source_url as market_url,
  mci.image_url,
  ms.recommended_market_value as market_price,
  best_source.low_price,
  best_source.mid_price,
  best_source.high_price,
  coalesce(ms.last_updated_at, mci.last_verified_at) as last_price_checked,
  mci.msrp as msrp_price,
  mci.set_code,
  mci.set_name as expansion,
  mci.product_line,
  null::numeric as pack_count,
  null::integer as source_group_id,
  null::text as source_group_name,
  best_source.price_type as price_subtype,
  (mci.catalog_item_type = 'sealed') as is_sealed,
  mci.card_number,
  mci.rarity,
  null::text as card_number_prefix,
  nullif(regexp_replace(coalesce(mci.card_number, ''), '[^0-9]', '', 'g'), '')::integer as card_number_sort,
  null::text as card_number_suffix,
  null::integer as printed_total,
  case
    when mci.catalog_item_type = 'sealed' then 'Sealed'
    when mci.catalog_item_type = 'card' then 'Cards'
    when mci.catalog_item_type = 'slab' then 'Slabs'
    else 'Other'
  end as catalog_group,
  case
    when mci.catalog_item_type = 'sealed' then 1
    when mci.catalog_item_type = 'card' then 2
    when mci.catalog_item_type = 'slab' then 3
    else 4
  end as catalog_group_sort,
  coalesce(nullif(mci.set_name, ''), 'Unknown Set') as set_sort_name,
  ''::text as card_prefix_sort,
  coalesce(nullif(regexp_replace(coalesce(mci.card_number, ''), '[^0-9]', '', 'g'), '')::integer, 999999) as card_number_sort_safe,
  case when nullif(trim(coalesce(mci.card_number, '')), '') is null then 1 else 0 end as card_number_missing_sort,
  identifier_summary.identifier_search,
  variant_summary.variant_names,
  ms.price_confidence,
  ms.source_count as market_source_count,
  mci.data_confidence_score,
  mci.last_verified_at,
  mci.created_at,
  mci.updated_at
from public.master_catalog_items mci
left join public.master_market_summaries ms on ms.catalog_item_id = mci.id
left join lateral (
  select identifier_value
  from public.master_catalog_identifiers
  where catalog_item_id = mci.id
    and identifier_type in ('UPC', 'EAN', 'GTIN')
    and status <> 'rejected'
  order by case identifier_type when 'UPC' then 1 when 'EAN' then 2 else 3 end, created_at
  limit 1
) primary_identifier on true
left join lateral (
  select identifier_value
  from public.master_catalog_identifiers
  where catalog_item_id = mci.id
    and identifier_type in ('OTHER', 'SKU', 'RETAILER_SKU', 'BEST_BUY_SKU', 'TARGET_TCIN', 'WALMART_ITEM_ID', 'WALMART_SKU', 'GAMESTOP_SKU', 'POKEMON_CENTER_SKU')
    and status <> 'rejected'
  order by created_at
  limit 1
) other_identifier on true
left join lateral (
  select identifier_value
  from public.master_catalog_identifiers
  where catalog_item_id = mci.id
    and identifier_type = 'TCGPLAYER_PRODUCT_ID'
    and status <> 'rejected'
  order by created_at
  limit 1
) tcgplayer_identifier on true
left join lateral (
  select *
  from public.master_market_price_sources
  where catalog_item_id = mci.id
  order by confidence_score desc, last_updated_at desc nulls last, created_at desc
  limit 1
) best_source on true
left join lateral (
  select string_agg(identifier_type || ':' || identifier_value, ' ' order by identifier_type, identifier_value) as identifier_search
  from public.master_catalog_identifiers
  where catalog_item_id = mci.id
    and status <> 'rejected'
) identifier_summary on true
left join lateral (
  select string_agg(variant_name, ', ' order by is_default desc, variant_name) as variant_names
  from public.master_catalog_variants
  where catalog_item_id = mci.id
) variant_summary on true;

grant select on public.catalog_search_lightweight to anon, authenticated;

create or replace view public.catalog_item_details
with (security_invoker = true) as
select
  csl.*,
  mci.release_date,
  mci.release_year,
  mci.pricecharting_id,
  mci.ebay_search_query,
  mci.external_links,
  mci.source,
  mci.raw_source,
  coalesce(identifier_rows.identifiers, '[]'::jsonb) as identifiers,
  coalesce(variant_rows.variants, '[]'::jsonb) as variants,
  coalesce(market_rows.market_sources, '[]'::jsonb) as market_sources,
  to_jsonb(ms.*) - 'id' - 'catalog_item_id' as market_summary,
  null::jsonb as card_details
from public.catalog_search_lightweight csl
join public.master_catalog_items mci on mci.id = csl.master_catalog_item_id
left join public.master_market_summaries ms on ms.catalog_item_id = mci.id
left join lateral (
  select jsonb_agg(to_jsonb(i.*) - 'raw_payload' order by i.identifier_type, i.identifier_value) as identifiers
  from public.master_catalog_identifiers i
  where i.catalog_item_id = mci.id
    and i.status <> 'rejected'
) identifier_rows on true
left join lateral (
  select jsonb_agg(to_jsonb(v.*) order by v.is_default desc, v.variant_name) as variants
  from public.master_catalog_variants v
  where v.catalog_item_id = mci.id
) variant_rows on true
left join lateral (
  select jsonb_agg(to_jsonb(s.*) - 'raw_payload' order by s.confidence_score desc, s.last_updated_at desc nulls last) as market_sources
  from public.master_market_price_sources s
  where s.catalog_item_id = mci.id
) market_rows on true;

grant select on public.catalog_item_details to anon, authenticated;

drop view if exists public.pokemon_catalog_browse;

create view public.pokemon_catalog_browse
with (security_invoker = true) as
select * from public.catalog_search_lightweight;

grant select on public.pokemon_catalog_browse to anon, authenticated;

create or replace view public.universal_data_review_queue
with (security_invoker = true) as
select
  id,
  user_id,
  target_entity_type,
  target_table,
  target_record_id,
  suggestion_type,
  submitted_data,
  current_data_snapshot,
  notes,
  proof_url,
  source,
  status,
  admin_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at
from public.universal_data_suggestions;

grant select on public.universal_data_review_queue to authenticated;

comment on table public.master_catalog_items is 'Normalized universal catalog foundation for cards, sealed products, slabs, and accessories. product_catalog remains the legacy/import source.';
comment on table public.master_catalog_variants is 'Variants, finishes, printings, graded/slab options, and sealed/default versions for master catalog items.';
comment on table public.master_catalog_identifiers is 'UPC/SKU/external identifier records with review status and source provenance.';
comment on table public.master_market_price_sources is 'Per-source market prices, sold averages, and price confidence inputs.';
comment on table public.master_market_summaries is 'Calculated recommended market value and confidence for catalog list/detail UI.';
comment on table public.universal_data_suggestions is 'User-submitted universal data changes requiring admin review before changing catalog, store, SKU, or restock defaults.';

notify pgrst, 'reload schema';

commit;
