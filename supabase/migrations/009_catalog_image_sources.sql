-- Image source/status fields for TideTradr catalog, Forge inventory, and shared Pokemon products.
-- Safe to run more than once. This does not download/copy external images.

alter table if exists public.product_catalog
  add column if not exists image_small text,
  add column if not exists image_large text,
  add column if not exists image_source text default 'unknown',
  add column if not exists image_source_url text,
  add column if not exists image_status text default 'unknown',
  add column if not exists image_last_updated timestamptz,
  add column if not exists image_needs_review boolean default false;

alter table if exists public.pokemon_products
  add column if not exists image_small text,
  add column if not exists image_large text,
  add column if not exists image_source text default 'unknown',
  add column if not exists image_source_url text,
  add column if not exists image_status text default 'unknown',
  add column if not exists image_last_updated timestamptz,
  add column if not exists image_needs_review boolean default false;

alter table if exists public.inventory_items
  add column if not exists item_image_source text default 'unknown',
  add column if not exists item_image_status text default 'unknown',
  add column if not exists item_image_source_url text,
  add column if not exists item_image_last_updated timestamptz,
  add column if not exists item_image_needs_review boolean default false;

