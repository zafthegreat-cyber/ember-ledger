-- Pokemon market-data ingestion additions for the existing ember-ledger Supabase schema.
-- Safe to run in the Supabase SQL editor before running the import scripts.
-- Existing table detected: public.product_catalog

begin;

-- Extend the existing per-user product catalog so it can hold API-imported Pokémon cards and sealed products.
alter table public.product_catalog
  add column if not exists source_group_id integer,
  add column if not exists source_group_name text,
  add column if not exists price_subtype text,
  add column if not exists is_sealed boolean default false,
  add column if not exists card_number text,
  add column if not exists card_number_sort integer,
  add column if not exists card_number_prefix text,
  add column if not exists card_number_suffix text,
  add column if not exists printed_total integer,
  add column if not exists rarity text,
  add column if not exists raw_source jsonb;

-- Enables idempotent upserts from the importer.
create unique index if not exists product_catalog_market_source_external_id_uidx
  on public.product_catalog (market_source, external_product_id);

-- Current price table: one row per product/printing/source.
create table if not exists public.product_market_price_current (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid references public.product_catalog(id) on delete cascade,
  source text not null default 'TCGCSV',
  source_product_id text not null,
  source_group_id integer,
  price_subtype text not null default 'Default',
  low_price numeric,
  mid_price numeric,
  high_price numeric,
  market_price numeric,
  direct_low_price numeric,
  currency text not null default 'USD',
  raw_source jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists product_market_price_current_source_product_subtype_uidx
  on public.product_market_price_current (source, source_product_id, price_subtype);

create index if not exists product_market_price_current_catalog_product_id_idx
  on public.product_market_price_current (catalog_product_id);

-- Optional history table. The importer writes to it only when WRITE_PRICE_HISTORY=true.
create table if not exists public.product_market_price_history (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid references public.product_catalog(id) on delete set null,
  external_product_id text,
  tcgplayer_product_id text,
  source text not null,
  source_product_id text not null,
  source_group_id integer,
  price_subtype text not null default 'Default',
  condition text default 'Unopened',
  most_recent_sale numeric,
  listed_median numeric,
  low_sale_price numeric,
  high_sale_price numeric,
  low_price numeric,
  mid_price numeric,
  high_price numeric,
  market_price numeric,
  direct_low_price numeric,
  currency text not null default 'USD',
  snapshot_window text,
  raw_source jsonb,
  checked_at timestamptz not null default now(),
  price_checked_at timestamptz not null default now(),
  created_at timestamptz default now()
);

alter table public.product_market_price_history
  add column if not exists external_product_id text,
  add column if not exists tcgplayer_product_id text,
  add column if not exists condition text default 'Unopened',
  add column if not exists most_recent_sale numeric,
  add column if not exists listed_median numeric,
  add column if not exists low_sale_price numeric,
  add column if not exists high_sale_price numeric,
  add column if not exists snapshot_window text,
  add column if not exists price_checked_at timestamptz default now();

create index if not exists product_market_price_history_source_product_checked_idx
  on public.product_market_price_history (source, source_product_id, checked_at desc);

create index if not exists product_market_price_history_catalog_product_id_idx
  on public.product_market_price_history(catalog_product_id);

create index if not exists product_market_price_history_checked_at_idx
  on public.product_market_price_history(price_checked_at desc);

create index if not exists product_market_price_history_external_product_id_idx
  on public.product_market_price_history(external_product_id);

-- Virginia Pokémon retailer/location table.
create table if not exists public.pokemon_retail_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text not null,
  state text not null default 'VA',
  postal_code text,
  phone text,
  website_url text,
  source text not null default 'manual',
  source_url text,
  sells_pokemon boolean not null default true,
  sells_singles boolean,
  sells_sealed boolean,
  store_type text not null default 'Local Game Store',
  notes text,
  raw_source jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists pokemon_retail_stores_name_city_state_uidx
  on public.pokemon_retail_stores (name, city, state);

create index if not exists product_catalog_pokemon_browse_sort_idx
  on public.product_catalog (
    category,
    is_sealed,
    set_name,
    expansion,
    card_number_prefix,
    card_number_sort,
    name
  );

create or replace view public.pokemon_catalog_browse
with (security_invoker = true)
as
select
  pc.*,
  case
    when coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 'Sealed'
    when coalesce(pc.product_type, '') ~* '(card)'
      or nullif(trim(coalesce(pc.card_number, '')), '') is not null
      then 'Cards'
    else 'Other'
  end as catalog_group,
  case
    when coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 1
    when coalesce(pc.product_type, '') ~* '(card)'
      or nullif(trim(coalesce(pc.card_number, '')), '') is not null
      then 2
    else 3
  end as catalog_group_sort,
  coalesce(nullif(pc.set_name, ''), nullif(pc.expansion, ''), 'Unknown Set') as set_sort_name,
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

create or replace view public.pokemon_market_history_import_status
with (security_invoker = true)
as
select
  (select count(*) from public.product_market_price_history) as total_price_history_rows,
  (
    select count(distinct coalesce(catalog_product_id::text, tcgplayer_product_id, external_product_id, source_product_id))
    from public.product_market_price_history
  ) as products_with_history,
  (select max(price_checked_at) from public.product_market_price_history) as latest_history_snapshot,
  (
    select count(*)
    from public.product_market_price_current c
    where c.market_price is not null
      and not exists (
        select 1
        from public.product_market_price_history h
        where (h.catalog_product_id is not null and h.catalog_product_id = c.catalog_product_id)
          or (h.source = c.source and h.source_product_id = c.source_product_id)
      )
  ) as products_with_current_price_no_history;

grant select on public.pokemon_market_history_import_status to anon, authenticated;

alter table public.product_market_price_current enable row level security;
alter table public.product_market_price_history enable row level security;
alter table public.pokemon_retail_stores enable row level security;

-- Public read policies for catalog-supporting reference data. Writes should be done server-side with service role.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='product_market_price_current' and policyname='Public read current product prices'
  ) then
    create policy "Public read current product prices" on public.product_market_price_current
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='product_market_price_history' and policyname='Public read Pokemon market price history'
  ) then
    create policy "Public read Pokemon market price history" on public.product_market_price_history
      for select using (
        exists (
          select 1
          from public.product_catalog pc
          where pc.id = product_market_price_history.catalog_product_id
            and pc.category = 'Pokemon'
        )
        or source in ('TCGCSV', 'PokemonTCGAPI')
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='pokemon_retail_stores' and policyname='Public read pokemon retail stores'
  ) then
    create policy "Public read pokemon retail stores" on public.pokemon_retail_stores
      for select using (true);
  end if;
end $$;

commit;
