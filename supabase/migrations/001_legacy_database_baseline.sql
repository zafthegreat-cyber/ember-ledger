-- The original three tables predate migration 002.
-- Restore them before the historical chain on a fresh database.
-- Existing tables, rows, policies and grants are left intact.
begin;
do $baseline$ begin
  if to_regclass('public.product_catalog') is null then
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
  end if;
end $baseline$;
do $baseline$ begin
  if to_regclass('public.inventory_items') is null then
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
  end if;
end $baseline$;
do $baseline$ begin
  if to_regclass('public.sales_records') is null then
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
  end if;
end $baseline$;
commit;
