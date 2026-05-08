-- Shared Scout / E&T TCG tables.
-- Safe to run more than once. This file does not drop existing data.
-- RLS is enabled with logged-in read access for shared master data.

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain text not null,
  nickname text,
  address text not null,
  city text not null,
  state text not null default 'VA',
  zip text,
  region text,
  county text,
  phone text,
  website text,
  sells_pokemon boolean not null default true,
  store_type text,
  notes text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stores
  add column if not exists name text,
  add column if not exists chain text,
  add column if not exists nickname text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text default 'VA',
  add column if not exists zip text,
  add column if not exists region text,
  add column if not exists county text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists sells_pokemon boolean default true,
  add column if not exists store_type text,
  add column if not exists notes text,
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists stores_chain_address_key
  on public.stores (chain, address);

create table if not exists public.pokemon_products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  set_name text not null,
  product_type text not null,
  era text,
  release_year integer,
  msrp numeric(12, 2),
  upc text,
  tcgplayer_url text,
  image_url text,
  market_price numeric(12, 2),
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pokemon_products_unique_product_key
  on public.pokemon_products (product_name, set_name, product_type);

create table if not exists public.user_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.pokemon_products(id) on delete restrict,
  quantity integer not null default 1,
  cost_each numeric(12, 2),
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  product_id uuid references public.pokemon_products(id) on delete set null,
  report_type text not null,
  quantity_seen integer,
  price_seen numeric(12, 2),
  photo_url text,
  notes text,
  reported_at timestamptz not null default now(),
  verification_status text not null default 'unverified'
);

alter table public.stores enable row level security;
alter table public.pokemon_products enable row level security;
alter table public.user_inventory enable row level security;
alter table public.store_reports enable row level security;

drop policy if exists "Logged in users can read shared stores" on public.stores;
create policy "Logged in users can read shared stores"
  on public.stores for select
  to authenticated
  using (true);

drop policy if exists "Logged in users can read shared pokemon products" on public.pokemon_products;
create policy "Logged in users can read shared pokemon products"
  on public.pokemon_products for select
  to authenticated
  using (true);

drop policy if exists "Users can read own inventory" on public.user_inventory;
create policy "Users can read own inventory"
  on public.user_inventory for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own inventory" on public.user_inventory;
create policy "Users can insert own inventory"
  on public.user_inventory for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own inventory" on public.user_inventory;
create policy "Users can update own inventory"
  on public.user_inventory for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own inventory" on public.user_inventory;
create policy "Users can delete own inventory"
  on public.user_inventory for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Logged in users can read community store reports" on public.store_reports;
create policy "Logged in users can read community store reports"
  on public.store_reports for select
  to authenticated
  using (true);

drop policy if exists "Logged in users can create store reports" on public.store_reports;
create policy "Logged in users can create store reports"
  on public.store_reports for insert
  to authenticated
  with check (auth.uid() = user_id);
