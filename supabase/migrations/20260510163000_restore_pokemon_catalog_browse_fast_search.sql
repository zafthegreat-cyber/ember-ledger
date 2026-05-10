-- Restore the Pokemon catalog browse Data API view and make fuzzy catalog
-- searches fast enough for smart-match UX.
--
-- Supabase migration runners apply files transactionally in this repo, so these
-- indexes intentionally use plain CREATE INDEX IF NOT EXISTS instead of CREATE
-- INDEX CONCURRENTLY. For a very large production table, apply the same index
-- definitions concurrently in a manual maintenance window.

begin;

create extension if not exists pg_trgm with schema extensions;

alter table public.product_catalog
  add column if not exists card_number_sort integer,
  add column if not exists card_number_prefix text,
  add column if not exists card_number_suffix text,
  add column if not exists printed_total integer;

update public.product_catalog
set
  card_number_prefix = coalesce(upper(substring(trim(card_number) from '^([[:alpha:]]+)')), ''),
  card_number_sort = case
    when substring(card_number from '([0-9]+)') is not null then substring(card_number from '([0-9]+)')::integer
    else null
  end,
  card_number_suffix = coalesce(upper(substring(trim(card_number) from '^[[:alpha:]]*[0-9]+\s*([[:alpha:]]+)$')), '')
where category = 'Pokemon'
  and nullif(trim(coalesce(card_number, '')), '') is not null;

create index if not exists product_catalog_name_trgm_idx
  on public.product_catalog using gin (name extensions.gin_trgm_ops);

create index if not exists product_catalog_set_name_trgm_idx
  on public.product_catalog using gin (set_name extensions.gin_trgm_ops);

create index if not exists product_catalog_expansion_trgm_idx
  on public.product_catalog using gin (expansion extensions.gin_trgm_ops);

create index if not exists product_catalog_product_type_trgm_idx
  on public.product_catalog using gin (product_type extensions.gin_trgm_ops);

create index if not exists product_catalog_product_line_trgm_idx
  on public.product_catalog using gin (product_line extensions.gin_trgm_ops);

create index if not exists product_catalog_barcode_trgm_idx
  on public.product_catalog using gin (barcode extensions.gin_trgm_ops);

create index if not exists product_catalog_external_product_id_trgm_idx
  on public.product_catalog using gin (external_product_id extensions.gin_trgm_ops);

create index if not exists product_catalog_tcgplayer_product_id_trgm_idx
  on public.product_catalog using gin (tcgplayer_product_id extensions.gin_trgm_ops);

create index if not exists product_catalog_card_number_trgm_idx
  on public.product_catalog using gin (card_number extensions.gin_trgm_ops);

create index if not exists product_catalog_set_code_trgm_idx
  on public.product_catalog using gin (set_code extensions.gin_trgm_ops);

create index if not exists product_catalog_category_barcode_idx
  on public.product_catalog (category, barcode)
  where barcode is not null and barcode <> '';

create index if not exists product_catalog_category_tcgplayer_id_idx
  on public.product_catalog (category, tcgplayer_product_id)
  where tcgplayer_product_id is not null and tcgplayer_product_id <> '';

create index if not exists product_catalog_category_external_id_idx
  on public.product_catalog (category, external_product_id)
  where external_product_id is not null and external_product_id <> '';

create index if not exists product_catalog_category_card_number_idx
  on public.product_catalog (category, card_number)
  where card_number is not null and card_number <> '';

create index if not exists product_catalog_category_name_idx
  on public.product_catalog (category, name);

create index if not exists product_catalog_category_price_checked_name_idx
  on public.product_catalog (category, last_price_checked desc nulls last, name asc);

drop view if exists public.pokemon_catalog_browse;

create view public.pokemon_catalog_browse
with (security_invoker = true) as
select
  id,
  name,
  category,
  set_name,
  product_type,
  barcode,
  external_product_id,
  tcgplayer_product_id,
  market_url,
  image_url,
  market_price,
  low_price,
  mid_price,
  high_price,
  last_price_checked,
  msrp_price,
  set_code,
  expansion,
  product_line,
  pack_count,
  source_group_id,
  source_group_name,
  price_subtype,
  is_sealed,
  card_number,
  rarity,
  card_number_prefix,
  card_number_sort,
  card_number_suffix,
  printed_total,
  case
    when coalesce(is_sealed, false)
      or coalesce(product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 'Sealed'
    when coalesce(product_type, '') ~* '(card)'
      or nullif(trim(coalesce(card_number, '')), '') is not null
      then 'Cards'
    else 'Other'
  end as catalog_group,
  case
    when coalesce(is_sealed, false)
      or coalesce(product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 1
    when coalesce(product_type, '') ~* '(card)'
      or nullif(trim(coalesce(card_number, '')), '') is not null
      then 2
    else 3
  end as catalog_group_sort,
  coalesce(nullif(set_name, ''), nullif(expansion, ''), 'Unknown Set') as set_sort_name,
  coalesce(nullif(card_number_prefix, ''), '') as card_prefix_sort,
  coalesce(card_number_sort, 999999) as card_number_sort_safe,
  case
    when nullif(trim(coalesce(card_number, '')), '') is null
      and card_number_sort is null
      then 1
    else 0
  end as card_number_missing_sort
from public.product_catalog;

grant select on public.pokemon_catalog_browse to anon, authenticated;

notify pgrst, 'reload schema';

commit;
