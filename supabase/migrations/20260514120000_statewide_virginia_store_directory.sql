-- Statewide Virginia Store Directory foundation.
-- Safe to review/apply later: adds nullable metadata columns and indexes only.
-- Does not seed stores, backfill rows, delete data, or change provider integrations.

alter table if exists public.stores
  add column if not exists country text default 'United States',
  add column if not exists retailer text,
  add column if not exists store_name text,
  add column if not exists zip_code text,
  add column if not exists store_number text,
  add column if not exists retailer_store_id text,
  add column if not exists active boolean default true,
  add column if not exists pokemon_stock_likelihood text default 'unknown',
  add column if not exists source text,
  add column if not exists source_url text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists confidence text,
  add column if not exists merged_into_store_id uuid references public.stores(id) on delete set null,
  add column if not exists deactivation_reason text;

alter table if exists public.stores
  alter column country set default 'United States',
  alter column state set default 'Virginia';

do $$
begin
  if to_regclass('public.stores') is not null then
    update public.stores
    set
      country = coalesce(nullif(country, ''), 'United States'),
      state = case when state is null or state = '' or upper(state) = 'VA' then 'Virginia' else state end,
      retailer = coalesce(nullif(retailer, ''), nullif(chain, '')),
      store_name = coalesce(nullif(store_name, ''), nullif(name, '')),
      zip_code = coalesce(nullif(zip_code, ''), nullif(zip, '')),
      active = coalesce(active, true),
      pokemon_stock_likelihood = coalesce(nullif(pokemon_stock_likelihood, ''), 'unknown')
    where country is null or country = ''
      or state is null or state = '' or upper(state) = 'VA'
      or retailer is null or retailer = ''
      or store_name is null or store_name = ''
      or zip_code is null or zip_code = ''
      or active is null
      or pokemon_stock_likelihood is null or pokemon_stock_likelihood = '';
  end if;
end $$;

do $$
begin
  if to_regclass('public.stores') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'stores_pokemon_stock_likelihood_chk'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_pokemon_stock_likelihood_chk
      check (
        pokemon_stock_likelihood is null
        or lower(pokemon_stock_likelihood) in ('high', 'medium', 'low', 'unknown')
      ) not valid;
  end if;
end $$;

create index if not exists stores_state_region_city_idx
  on public.stores (state, region, city);

create index if not exists stores_retailer_region_idx
  on public.stores (retailer, region);

create index if not exists stores_active_idx
  on public.stores (active);

create unique index if not exists stores_retailer_store_id_uidx
  on public.stores (retailer, retailer_store_id)
  where retailer_store_id is not null and retailer_store_id <> '';

create table if not exists public.store_regions (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'United States',
  state text not null default 'Virginia',
  region text not null,
  sort_order integer not null default 100,
  is_default_home_region boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, state, region)
);

insert into public.store_regions (country, state, region, sort_order, is_default_home_region, notes)
values
  ('United States', 'Virginia', 'Hampton Roads / 757', 10, true, 'Default/home region for Zena and 757 beta testing.'),
  ('United States', 'Virginia', 'Richmond / Central Virginia', 20, false, 'Central Virginia store directory region.'),
  ('United States', 'Virginia', 'Northern Virginia', 30, false, 'Northern Virginia store directory region.'),
  ('United States', 'Virginia', 'Fredericksburg', 40, false, 'Fredericksburg, Stafford, and nearby store directory region.'),
  ('United States', 'Virginia', 'Charlottesville / Albemarle', 50, false, 'Charlottesville and Albemarle store directory region.'),
  ('United States', 'Virginia', 'Roanoke / Southwest Virginia', 60, false, 'Roanoke, New River Valley, and Southwest Virginia store directory region.'),
  ('United States', 'Virginia', 'Lynchburg', 70, false, 'Lynchburg store directory region.'),
  ('United States', 'Virginia', 'Shenandoah Valley', 80, false, 'Shenandoah Valley store directory region.'),
  ('United States', 'Virginia', 'Eastern Shore', 90, false, 'Eastern Shore store directory region.'),
  ('United States', 'Virginia', 'Southside Virginia', 100, false, 'Southside Virginia store directory region.'),
  ('United States', 'Virginia', 'Other Virginia', 110, false, 'Catch-all region for verified Virginia stores that do not fit another region.')
on conflict (country, state, region) do update
set
  sort_order = excluded.sort_order,
  is_default_home_region = excluded.is_default_home_region,
  active = true,
  notes = excluded.notes,
  updated_at = now();

create table if not exists public.store_user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  favorite boolean not null default true,
  watched boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, store_id)
);

create index if not exists store_regions_state_region_idx
  on public.store_regions (state, region);

create index if not exists store_user_watchlist_user_idx
  on public.store_user_watchlist (user_id, updated_at desc);

create index if not exists store_user_watchlist_store_idx
  on public.store_user_watchlist (store_id);

alter table public.store_regions enable row level security;
alter table public.store_user_watchlist enable row level security;

do $$
begin
  if not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'store_regions'
         and policyname = 'Authenticated read Virginia store regions'
     ) then
    create policy "Authenticated read Virginia store regions"
      on public.store_regions
      for select
      to authenticated
      using (active = true);
  end if;

  if not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'store_user_watchlist'
         and policyname = 'Users manage own store watchlist'
     ) then
    create policy "Users manage own store watchlist"
      on public.store_user_watchlist
      for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if to_regclass('public.stores') is not null
     and to_regprocedure('public.is_admin_or_moderator()') is not null
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'stores'
         and policyname = 'Admins manage Virginia store directory'
     ) then
    execute $policy$
      create policy "Admins manage Virginia store directory"
        on public.stores
        for insert
        to authenticated
        with check (public.is_admin_or_moderator())
    $policy$;
  end if;

  if to_regclass('public.stores') is not null
     and to_regprocedure('public.is_admin_or_moderator()') is not null
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'stores'
         and policyname = 'Admins update Virginia store directory'
     ) then
    execute $policy$
      create policy "Admins update Virginia store directory"
        on public.stores
        for update
        to authenticated
        using (public.is_admin_or_moderator())
        with check (public.is_admin_or_moderator())
    $policy$;
  end if;

  if to_regclass('public.store_regions') is not null
     and to_regprocedure('public.is_admin_or_moderator()') is not null
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'store_regions'
         and policyname = 'Admins manage Virginia store regions'
     ) then
    execute $policy$
      create policy "Admins manage Virginia store regions"
        on public.store_regions
        for all
        to authenticated
        using (public.is_admin_or_moderator())
        with check (public.is_admin_or_moderator())
    $policy$;
  end if;
end $$;

comment on column public.stores.country is 'Store country. Ember & Tide beta defaults to United States.';
comment on column public.stores.region is 'Virginia store directory region, e.g. Hampton Roads / 757 or Northern Virginia.';
comment on column public.stores.pokemon_stock_likelihood is 'Admin-reviewed likelihood that this store carries Pokemon/TCG stock: high, medium, low, unknown.';
comment on column public.stores.merged_into_store_id is 'Soft merge pointer for duplicate store cleanup. Do not hard-delete duplicate public store rows.';
comment on table public.store_regions is 'Statewide Virginia Scout directory regions. Hampton Roads / 757 remains the default home region.';
comment on table public.store_user_watchlist is 'Per-user store watch/favorite preferences for Scout store reports, guesses, forecasts, and alerts.';

notify pgrst, 'reload schema';
