-- Missing pre-migration legacy tables. Fresh, empty staging/local databases only.
-- Run before the historical chain; never use as a production history repair.
begin;
do $guard$ begin
  if current_setting('app.code3_isolated_validation',true) is distinct from 'on' then
    raise exception 'Use the isolated staging bootstrap runner; this is not a production migration.';
  end if;
end $guard$;
create table if not exists public.product_catalog (
  id uuid default gen_random_uuid() not null primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text default 'Pokemon'::text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  msrp_price numeric default 0
);
alter table public.product_catalog enable row level security;
revoke all on public.product_catalog from public,anon;
grant select,insert,update,delete on public.product_catalog to authenticated,service_role;
drop policy if exists legacy_bootstrap_product_catalog_select on public.product_catalog;
create policy legacy_bootstrap_product_catalog_select on public.product_catalog for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_product_catalog_insert on public.product_catalog;
create policy legacy_bootstrap_product_catalog_insert on public.product_catalog for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_product_catalog_update on public.product_catalog;
create policy legacy_bootstrap_product_catalog_update on public.product_catalog for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_product_catalog_delete on public.product_catalog;
create policy legacy_bootstrap_product_catalog_delete on public.product_catalog for delete to authenticated using ((select auth.uid())=user_id);
create table if not exists public.inventory_items (
  id uuid default gen_random_uuid() not null primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text,
  buyer text default 'Zena'::text,
  category text default 'Pokemon'::text,
  store text,
  quantity integer default 1,
  unit_cost numeric default 0,
  sale_price numeric default 0,
  receipt_image text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  item_image text,
  status text default 'In Stock'::text,
  listing_platform text,
  listing_url text,
  listed_price numeric default 0,
  action_notes text,
  msrp_price numeric default 0
);
alter table public.inventory_items enable row level security;
revoke all on public.inventory_items from public,anon;
grant select,insert,update,delete on public.inventory_items to authenticated,service_role;
drop policy if exists legacy_bootstrap_inventory_items_select on public.inventory_items;
create policy legacy_bootstrap_inventory_items_select on public.inventory_items for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_inventory_items_insert on public.inventory_items;
create policy legacy_bootstrap_inventory_items_insert on public.inventory_items for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_inventory_items_update on public.inventory_items;
create policy legacy_bootstrap_inventory_items_update on public.inventory_items for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_inventory_items_delete on public.inventory_items;
create policy legacy_bootstrap_inventory_items_delete on public.inventory_items for delete to authenticated using ((select auth.uid())=user_id);
create table if not exists public.sales_records (
  id uuid default gen_random_uuid() not null primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid,
  item_name text not null,
  sku text,
  original_buyer text,
  category text,
  store text,
  platform text default 'eBay'::text,
  quantity_sold integer default 1,
  final_sale_price numeric default 0,
  gross_sale numeric default 0,
  item_cost numeric default 0,
  shipping_cost numeric default 0,
  platform_fees numeric default 0,
  net_profit numeric default 0,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.sales_records enable row level security;
revoke all on public.sales_records from public,anon;
grant select,insert,update,delete on public.sales_records to authenticated,service_role;
drop policy if exists legacy_bootstrap_sales_records_select on public.sales_records;
create policy legacy_bootstrap_sales_records_select on public.sales_records for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_sales_records_insert on public.sales_records;
create policy legacy_bootstrap_sales_records_insert on public.sales_records for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_sales_records_update on public.sales_records;
create policy legacy_bootstrap_sales_records_update on public.sales_records for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists legacy_bootstrap_sales_records_delete on public.sales_records;
create policy legacy_bootstrap_sales_records_delete on public.sales_records for delete to authenticated using ((select auth.uid())=user_id);
-- Migration 009 used ALTER TABLE IF EXISTS before these tables existed on the
-- failed branch, so its image metadata must also be restored during recovery.
alter table public.product_catalog
  add column if not exists image_small text,
  add column if not exists image_large text,
  add column if not exists image_source text default 'unknown',
  add column if not exists image_source_url text,
  add column if not exists image_status text default 'unknown',
  add column if not exists image_last_updated timestamptz,
  add column if not exists image_needs_review boolean default false;
alter table public.inventory_items
  add column if not exists item_image_source text default 'unknown',
  add column if not exists item_image_status text default 'unknown',
  add column if not exists item_image_source_url text,
  add column if not exists item_image_last_updated timestamptz,
  add column if not exists item_image_needs_review boolean default false;
commit;
