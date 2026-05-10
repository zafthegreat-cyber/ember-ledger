-- Normalized Pokemon / TCG catalog model.
-- Additive only: this migration does not delete product_catalog or inventory_items rows.
-- TCGCSV price identity is productId + subTypeName, represented by source_product_id + price_subtype.

begin;

create table if not exists public.tcg_expansions (
  id uuid primary key default gen_random_uuid(),
  official_name text not null,
  display_name text not null,
  series text,
  set_code text,
  ptcgo_code text,
  pokemon_tcg_io_id text unique,
  tcgplayer_group_id integer unique,
  tcgplayer_group_name text,
  tcgplayer_abbreviation text,
  release_date date,
  printed_total integer,
  total integer,
  symbol_url text,
  logo_url text,
  expansion_kind text not null default 'main'
    check (expansion_kind in ('main', 'special', 'promo', 'subset', 'mcdonalds', 'world_championship', 'other')),
  parent_expansion_id uuid references public.tcg_expansions(id),
  legalities jsonb not null default '{}'::jsonb,
  raw_pokemontcg jsonb,
  raw_tcgplayer jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_catalog
  add column if not exists expansion_id uuid references public.tcg_expansions(id),
  add column if not exists product_kind text not null default 'unknown',
  add column if not exists sealed_product_type text,
  add column if not exists release_date date,
  add column if not exists region text not null default 'US',
  add column if not exists language text not null default 'English',
  add column if not exists is_pokemon_center_exclusive boolean not null default false,
  add column if not exists contents jsonb not null default '{}'::jsonb,
  add column if not exists msrp_source text,
  add column if not exists msrp_source_url text,
  add column if not exists msrp_confidence text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_catalog_product_kind_check'
      and conrelid = 'public.product_catalog'::regclass
  ) then
    alter table public.product_catalog
      add constraint product_catalog_product_kind_check
      check (product_kind in ('single_card', 'sealed_product', 'code_card', 'accessory', 'bundle', 'promo', 'unknown'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_catalog_sealed_product_type_check'
      and conrelid = 'public.product_catalog'::regclass
  ) then
    alter table public.product_catalog
      add constraint product_catalog_sealed_product_type_check
      check (
        sealed_product_type is null or sealed_product_type in (
          'elite_trainer_box',
          'pokemon_center_elite_trainer_box',
          'booster_pack',
          'sleeved_booster_pack',
          'booster_bundle',
          'booster_display_box',
          'build_and_battle_box',
          'build_and_battle_stadium',
          'collection_box',
          'premium_collection',
          'poster_collection',
          'tin',
          'mini_tin',
          'blister_pack',
          'league_battle_deck',
          'battle_deck',
          'starter_deck',
          'other'
        )
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_catalog_msrp_confidence_check'
      and conrelid = 'public.product_catalog'::regclass
  ) then
    alter table public.product_catalog
      add constraint product_catalog_msrp_confidence_check
      check (
        msrp_confidence is null or msrp_confidence in ('verified', 'trusted_source', 'imported', 'user_submitted', 'unverified')
      )
      not valid;
  end if;
end $$;

create table if not exists public.product_identifiers (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid not null references public.product_catalog(id) on delete cascade,
  identifier_type text not null
    check (identifier_type in ('UPC', 'EAN', 'GTIN', 'RETAILER_SKU', 'POKEMON_CENTER_SKU', 'TCGPLAYER_PRODUCT_ID', 'TCGPLAYER_SKU_ID', 'POKEMONTCG_IO_ID', 'OTHER')),
  identifier_value text not null,
  source text,
  source_url text,
  confidence text not null default 'unverified'
    check (confidence in ('verified', 'trusted_source', 'imported', 'user_submitted', 'unverified')),
  created_at timestamptz not null default now(),
  unique(identifier_type, identifier_value)
);

create table if not exists public.catalog_product_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid not null references public.product_catalog(id) on delete cascade,
  variant_name text not null,
  printing text,
  finish text,
  language text not null default 'English',
  tcgplayer_sku_id text,
  condition_id integer,
  condition_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique(catalog_product_id, variant_name, language, condition_name)
);

create table if not exists public.tcg_card_details (
  catalog_product_id uuid primary key references public.product_catalog(id) on delete cascade,
  card_name text not null,
  supertype text,
  subtypes text[],
  stage text,
  evolves_from text,
  hp integer,
  types text[],
  abilities jsonb not null default '[]'::jsonb,
  attacks jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  resistances jsonb not null default '[]'::jsonb,
  retreat_cost text[],
  converted_retreat_cost integer,
  card_number text,
  printed_total integer,
  rarity text,
  artist text,
  flavor_text text,
  regulation_mark text,
  legalities jsonb not null default '{}'::jsonb,
  national_pokedex_numbers integer[],
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_msrp_rules (
  id uuid primary key default gen_random_uuid(),
  product_kind text not null,
  sealed_product_type text,
  region text not null default 'US',
  currency text not null default 'USD',
  msrp numeric not null,
  effective_start date,
  effective_end date,
  source text,
  source_url text,
  confidence text not null default 'trusted_source',
  created_at timestamptz not null default now(),
  check (product_kind in ('single_card', 'sealed_product', 'code_card', 'accessory', 'bundle', 'promo', 'unknown')),
  check (
    sealed_product_type is null or sealed_product_type in (
      'elite_trainer_box',
      'pokemon_center_elite_trainer_box',
      'booster_pack',
      'sleeved_booster_pack',
      'booster_bundle',
      'booster_display_box',
      'build_and_battle_box',
      'build_and_battle_stadium',
      'collection_box',
      'premium_collection',
      'poster_collection',
      'tin',
      'mini_tin',
      'blister_pack',
      'league_battle_deck',
      'battle_deck',
      'starter_deck',
      'other'
    )
  ),
  check (confidence in ('verified', 'trusted_source', 'imported', 'user_submitted', 'unverified'))
);

alter table public.inventory_items
  add column if not exists catalog_variant_id uuid references public.catalog_product_variants(id),
  add column if not exists condition_name text not null default 'Near Mint',
  add column if not exists language text not null default 'English',
  add column if not exists finish text,
  add column if not exists printing text;

create index if not exists tcg_expansions_pokemon_tcg_io_id_idx
  on public.tcg_expansions(pokemon_tcg_io_id);

create index if not exists tcg_expansions_tcgplayer_group_id_idx
  on public.tcg_expansions(tcgplayer_group_id);

create index if not exists tcg_expansions_names_idx
  on public.tcg_expansions using gin (
    to_tsvector('simple', coalesce(official_name, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(series, '') || ' ' || coalesce(set_code, '') || ' ' || coalesce(ptcgo_code, ''))
  );

create index if not exists product_catalog_expansion_id_idx
  on public.product_catalog(expansion_id);

create index if not exists product_catalog_tcgplayer_product_id_idx
  on public.product_catalog(tcgplayer_product_id);

create index if not exists product_catalog_kind_type_idx
  on public.product_catalog(product_kind, sealed_product_type);

create index if not exists product_identifiers_catalog_product_id_idx
  on public.product_identifiers(catalog_product_id);

create index if not exists product_identifiers_lookup_idx
  on public.product_identifiers(identifier_type, identifier_value);

create index if not exists product_identifiers_value_lower_idx
  on public.product_identifiers(lower(identifier_value));

create index if not exists catalog_product_variants_product_lookup_idx
  on public.catalog_product_variants(catalog_product_id, variant_name, language, condition_name);

create index if not exists catalog_product_variants_tcgplayer_sku_idx
  on public.catalog_product_variants(tcgplayer_sku_id);

create index if not exists inventory_items_catalog_variant_id_idx
  on public.inventory_items(catalog_variant_id);

-- Large catalog backfills are intentionally not run by this schema migration.
-- They are resumable operational work and can create substantial temporary
-- storage pressure on managed Postgres. Run them explicitly with:
--   npm run backfill:normalized-catalog -- --dry-run
--   npm run backfill:normalized-catalog -- --section all
-- See scripts/backfill-normalized-catalog-batches.cjs.
drop view if exists public.pokemon_catalog_browse;

create view public.pokemon_catalog_browse
with (security_invoker = true)
as
select
  pc.*,
  e.official_name as official_expansion_name,
  e.display_name as expansion_display_name,
  e.series as expansion_series,
  e.pokemon_tcg_io_id,
  e.tcgplayer_group_id as mapped_tcgplayer_group_id,
  e.symbol_url as expansion_symbol_url,
  e.logo_url as expansion_logo_url,
  coalesce(identifier_summary.identifier_search, '') as identifier_search,
  coalesce(variant_summary.variant_names, '') as variant_names,
  case
    when pc.product_kind = 'sealed_product'
      or coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 'Sealed'
    when pc.product_kind = 'single_card'
      or coalesce(pc.product_type, '') ~* '(card)'
      or nullif(trim(coalesce(pc.card_number, '')), '') is not null
      then 'Cards'
    else 'Other'
  end as catalog_group,
  case
    when pc.product_kind = 'sealed_product'
      or coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 1
    when pc.product_kind = 'single_card'
      or coalesce(pc.product_type, '') ~* '(card)'
      or nullif(trim(coalesce(pc.card_number, '')), '') is not null
      then 2
    else 3
  end as catalog_group_sort,
  coalesce(nullif(e.official_name, ''), nullif(pc.set_name, ''), nullif(pc.expansion, ''), 'Unknown Set') as set_sort_name,
  coalesce(nullif(pc.card_number_prefix, ''), '') as card_prefix_sort,
  coalesce(pc.card_number_sort, 999999) as card_number_sort_safe,
  case
    when nullif(trim(coalesce(pc.card_number, '')), '') is null
      and pc.card_number_sort is null
      then 1
    else 0
  end as card_number_missing_sort,
  coalesce(history_summary.history_snapshot_count, 0) as history_snapshot_count,
  history_summary.latest_history_snapshot,
  history_summary.history_volatility
from public.product_catalog pc
left join public.tcg_expansions e on e.id = pc.expansion_id
left join lateral (
  select string_agg(pi.identifier_type || ':' || pi.identifier_value, ' ' order by pi.identifier_type, pi.identifier_value) as identifier_search
  from public.product_identifiers pi
  where pi.catalog_product_id = pc.id
) identifier_summary on true
left join lateral (
  select string_agg(v.variant_name, ' ' order by v.variant_name) as variant_names
  from public.catalog_product_variants v
  where v.catalog_product_id = pc.id
) variant_summary on true
left join lateral (
  select
    count(*) as history_snapshot_count,
    max(h.price_checked_at) as latest_history_snapshot,
    case
      when count(*) filter (where h.market_price > 0) < 3 then 'Unknown Volatility'
      when (max(h.market_price) filter (where h.market_price > 0) - min(h.market_price) filter (where h.market_price > 0))
        / nullif(avg(h.market_price) filter (where h.market_price > 0), 0) < 0.10 then 'Low Volatility'
      when (max(h.market_price) filter (where h.market_price > 0) - min(h.market_price) filter (where h.market_price > 0))
        / nullif(avg(h.market_price) filter (where h.market_price > 0), 0) <= 0.25 then 'Medium Volatility'
      else 'High Volatility'
    end as history_volatility
  from public.product_market_price_history h
  where h.catalog_product_id = pc.id
    or h.source_product_id = pc.external_product_id
    or h.source_product_id = pc.tcgplayer_product_id
) history_summary on true;

grant select on public.pokemon_catalog_browse to anon, authenticated;

create or replace view public.pokemon_catalog_normalization_report
with (security_invoker = true)
as
select
  count(*) filter (where category = 'Pokemon') as total_pokemon_products,
  count(*) filter (where category = 'Pokemon' and expansion_id is not null) as linked_to_expansions,
  count(*) filter (where category = 'Pokemon' and expansion_id is null) as unmatched_expansion_products,
  count(*) filter (where category = 'Pokemon' and product_kind = 'sealed_product') as sealed_products,
  count(*) filter (where category = 'Pokemon' and sealed_product_type = 'elite_trainer_box') as elite_trainer_boxes,
  count(*) filter (where category = 'Pokemon' and sealed_product_type = 'pokemon_center_elite_trainer_box') as pokemon_center_elite_trainer_boxes,
  count(*) filter (where category = 'Pokemon' and product_kind = 'single_card') as single_cards,
  (select count(*) from public.catalog_product_variants) as catalog_variants,
  (select count(*) from public.product_identifiers) as product_identifiers
from public.product_catalog;

grant select on public.pokemon_catalog_normalization_report to anon, authenticated;

create or replace view public.pokemon_catalog_unmatched_expansions
with (security_invoker = true)
as
select
  pc.id,
  pc.name,
  pc.market_source,
  pc.external_product_id,
  pc.tcgplayer_product_id,
  pc.set_name,
  pc.set_code,
  pc.expansion,
  pc.source_group_id,
  pc.source_group_name,
  pc.product_type,
  pc.product_kind,
  pc.updated_at
from public.product_catalog pc
where pc.category = 'Pokemon'
  and pc.expansion_id is null
order by pc.source_group_name nulls last, pc.set_name nulls last, pc.name;

grant select on public.pokemon_catalog_unmatched_expansions to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tcg_expansions_updated_at on public.tcg_expansions;
create trigger set_tcg_expansions_updated_at
before update on public.tcg_expansions
for each row execute function public.set_updated_at();

drop trigger if exists set_tcg_card_details_updated_at on public.tcg_card_details;
create trigger set_tcg_card_details_updated_at
before update on public.tcg_card_details
for each row execute function public.set_updated_at();

alter table public.tcg_expansions enable row level security;
alter table public.product_identifiers enable row level security;
alter table public.catalog_product_variants enable row level security;
alter table public.tcg_card_details enable row level security;
alter table public.product_msrp_rules enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tcg_expansions'
      and policyname = 'Public read Pokemon TCG expansions'
  ) then
    create policy "Public read Pokemon TCG expansions"
      on public.tcg_expansions for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_identifiers'
      and policyname = 'Public read Pokemon product identifiers'
  ) then
    create policy "Public read Pokemon product identifiers"
      on public.product_identifiers for select
      using (
        exists (
          select 1
          from public.product_catalog pc
          where pc.id = product_identifiers.catalog_product_id
            and pc.category = 'Pokemon'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'catalog_product_variants'
      and policyname = 'Public read Pokemon catalog product variants'
  ) then
    create policy "Public read Pokemon catalog product variants"
      on public.catalog_product_variants for select
      using (
        exists (
          select 1
          from public.product_catalog pc
          where pc.id = catalog_product_variants.catalog_product_id
            and pc.category = 'Pokemon'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tcg_card_details'
      and policyname = 'Public read Pokemon card details'
  ) then
    create policy "Public read Pokemon card details"
      on public.tcg_card_details for select
      using (
        exists (
          select 1
          from public.product_catalog pc
          where pc.id = tcg_card_details.catalog_product_id
            and pc.category = 'Pokemon'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_msrp_rules'
      and policyname = 'Public read Pokemon MSRP rules'
  ) then
    create policy "Public read Pokemon MSRP rules"
      on public.product_msrp_rules for select
      using (true);
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_admin_or_moderator'
  ) then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'tcg_expansions'
        and policyname = 'Admins manage Pokemon TCG expansions'
    ) then
      create policy "Admins manage Pokemon TCG expansions"
        on public.tcg_expansions for all
        to authenticated
        using (public.is_admin_or_moderator())
        with check (public.is_admin_or_moderator());
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'product_identifiers'
        and policyname = 'Admins manage Pokemon product identifiers'
    ) then
      create policy "Admins manage Pokemon product identifiers"
        on public.product_identifiers for all
        to authenticated
        using (public.is_admin_or_moderator())
        with check (public.is_admin_or_moderator());
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'catalog_product_variants'
        and policyname = 'Admins manage Pokemon catalog product variants'
    ) then
      create policy "Admins manage Pokemon catalog product variants"
        on public.catalog_product_variants for all
        to authenticated
        using (public.is_admin_or_moderator())
        with check (public.is_admin_or_moderator());
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'tcg_card_details'
        and policyname = 'Admins manage Pokemon card details'
    ) then
      create policy "Admins manage Pokemon card details"
        on public.tcg_card_details for all
        to authenticated
        using (public.is_admin_or_moderator())
        with check (public.is_admin_or_moderator());
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'product_msrp_rules'
        and policyname = 'Admins manage Pokemon MSRP rules'
    ) then
      create policy "Admins manage Pokemon MSRP rules"
        on public.product_msrp_rules for all
        to authenticated
        using (public.is_admin_or_moderator())
        with check (public.is_admin_or_moderator());
    end if;
  end if;
end $$;

comment on table public.tcg_expansions is 'Official normalized Pokemon expansion/set records. Pokemon TCG API set identity is preferred; TCGplayer group data is mapping metadata.';
comment on table public.product_identifiers is 'Separate UPC/EAN/GTIN, retailer SKU, Pokemon Center SKU, TCGplayer product IDs, TCGplayer SKU IDs, and PokemonTCG.io IDs.';
comment on table public.catalog_product_variants is 'Card/product versions and TCGplayer price variants such as Normal, Holofoil, Reverse Holofoil. Condition is separate.';
comment on table public.tcg_card_details is 'Pokemon TCG API card anatomy/details for catalog detail pages.';
comment on table public.product_msrp_rules is 'Source-backed MSRP rules used only when a product lacks explicit MSRP data.';

commit;
