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
  source text not null,
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
  created_at timestamptz default now()
);

create index if not exists product_market_price_history_source_product_checked_idx
  on public.product_market_price_history (source, source_product_id, checked_at desc);

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
    select 1 from pg_policies where schemaname='public' and tablename='pokemon_retail_stores' and policyname='Public read pokemon retail stores'
  ) then
    create policy "Public read pokemon retail stores" on public.pokemon_retail_stores
      for select using (true);
  end if;
end $$;

commit;
