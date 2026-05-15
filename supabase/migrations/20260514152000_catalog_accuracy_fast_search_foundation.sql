-- Catalog accuracy and fast search foundation.
-- Additive follow-up to the master catalog foundation. This keeps runtime
-- catalog data Supabase-backed, adds sealed-product fields, expands card
-- variant types, and exposes one fast indexed search RPC for mobile search
-- and scanner/smart-match flows.

begin;

create extension if not exists pg_trgm with schema extensions;

alter table public.master_catalog_items
  add column if not exists product_name text,
  add column if not exists series text,
  add column if not exists upc text,
  add column if not exists sku text,
  add column if not exists retailer_skus jsonb not null default '{}'::jsonb,
  add column if not exists contents jsonb not null default '[]'::jsonb,
  add column if not exists related_cards jsonb not null default '[]'::jsonb,
  add column if not exists admin_review_status text not null default 'unreviewed',
  add column if not exists is_verified boolean not null default false,
  add column if not exists duplicate_of uuid references public.master_catalog_items(id) on delete set null,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists source_url text;

update public.master_catalog_items
set
  product_name = coalesce(nullif(product_name, ''), name),
  series = coalesce(nullif(series, ''), nullif(product_line, ''), nullif(set_name, ''))
where product_name is null
   or product_name = ''
   or series is null
   or series = '';

update public.master_catalog_items item
set
  upc = coalesce(nullif(item.upc, ''), (
    select identifier_value
    from public.master_catalog_identifiers
    where catalog_item_id = item.id
      and identifier_type in ('UPC', 'EAN', 'GTIN')
      and status <> 'rejected'
    order by case identifier_type when 'UPC' then 1 when 'EAN' then 2 else 3 end, created_at
    limit 1
  )),
  sku = coalesce(nullif(item.sku, ''), (
    select identifier_value
    from public.master_catalog_identifiers
    where catalog_item_id = item.id
      and identifier_type in ('SKU', 'RETAILER_SKU', 'BEST_BUY_SKU', 'TARGET_TCIN', 'WALMART_ITEM_ID', 'WALMART_SKU', 'GAMESTOP_SKU', 'POKEMON_CENTER_SKU')
      and status <> 'rejected'
    order by created_at
    limit 1
  ))
where item.upc is null
   or item.upc = ''
   or item.sku is null
   or item.sku = '';

update public.master_catalog_items item
set retailer_skus = (
  select jsonb_object_agg(
    coalesce(nullif(retailer, ''), identifier_type),
    identifier_value
  )
  from public.master_catalog_identifiers
  where catalog_item_id = item.id
    and identifier_type in ('SKU', 'RETAILER_SKU', 'BEST_BUY_SKU', 'TARGET_TCIN', 'WALMART_ITEM_ID', 'WALMART_SKU', 'GAMESTOP_SKU', 'POKEMON_CENTER_SKU')
    and status <> 'rejected'
)
where item.retailer_skus = '{}'::jsonb
  and exists (
    select 1
    from public.master_catalog_identifiers
    where catalog_item_id = item.id
      and identifier_type in ('SKU', 'RETAILER_SKU', 'BEST_BUY_SKU', 'TARGET_TCIN', 'WALMART_ITEM_ID', 'WALMART_SKU', 'GAMESTOP_SKU', 'POKEMON_CENTER_SKU')
      and status <> 'rejected'
  );

alter table public.master_catalog_variants
  add column if not exists image_url text,
  add column if not exists market_price numeric,
  add column if not exists source_url text,
  add column if not exists display_order integer not null default 0;

alter table public.master_catalog_variants
  drop constraint if exists master_catalog_variants_variant_type_check;

alter table public.master_catalog_variants
  add constraint master_catalog_variants_variant_type_check
  check (variant_type in (
    'normal',
    'holo',
    'reverse_holo',
    'cosmos_holo',
    'cracked_ice',
    'promo',
    'stamped',
    'stamped_promo',
    'staff',
    'first_edition',
    'shadowless',
    'unlimited',
    'alternate_art',
    'full_art',
    'secret_rare',
    'illustration_rare',
    'special_illustration_rare',
    'master_ball',
    'poke_ball',
    'graded',
    'sealed',
    'standard',
    'other'
  ));

create table if not exists public.catalog_admin_corrections (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid references public.master_catalog_items(id) on delete set null,
  variant_id uuid references public.master_catalog_variants(id) on delete set null,
  correction_type text not null,
  previous_data jsonb not null default '{}'::jsonb,
  corrected_data jsonb not null default '{}'::jsonb,
  reason text,
  admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.catalog_admin_corrections enable row level security;

drop policy if exists "Admins manage catalog admin corrections" on public.catalog_admin_corrections;
create policy "Admins manage catalog admin corrections"
on public.catalog_admin_corrections for all
to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

grant select, insert, update, delete on public.catalog_admin_corrections to authenticated;

create index if not exists master_catalog_items_product_name_trgm_idx
  on public.master_catalog_items using gin (product_name extensions.gin_trgm_ops);

create index if not exists master_catalog_items_series_trgm_idx
  on public.master_catalog_items using gin (series extensions.gin_trgm_ops);

create index if not exists master_catalog_items_upc_idx
  on public.master_catalog_items (upc)
  where upc is not null and upc <> '';

create index if not exists master_catalog_items_sku_idx
  on public.master_catalog_items (sku)
  where sku is not null and sku <> '';

create index if not exists master_catalog_items_upc_trgm_idx
  on public.master_catalog_items using gin (upc extensions.gin_trgm_ops);

create index if not exists master_catalog_items_sku_trgm_idx
  on public.master_catalog_items using gin (sku extensions.gin_trgm_ops);

create index if not exists master_catalog_items_retailer_skus_gin_idx
  on public.master_catalog_items using gin (retailer_skus);

create index if not exists master_catalog_items_verified_review_idx
  on public.master_catalog_items (is_verified, admin_review_status, last_verified_at desc nulls last);

create index if not exists master_catalog_items_duplicate_of_idx
  on public.master_catalog_items (duplicate_of)
  where duplicate_of is not null;

create index if not exists master_catalog_variants_type_idx
  on public.master_catalog_variants(catalog_item_id, variant_type, is_default desc, display_order, variant_name);

create index if not exists catalog_admin_corrections_item_idx
  on public.catalog_admin_corrections(catalog_item_id, created_at desc);

drop function if exists public.search_catalog_fast(text, text, integer);
drop view if exists public.catalog_item_details;
drop view if exists public.pokemon_catalog_browse;
drop view if exists public.catalog_search_lightweight;

create view public.catalog_search_lightweight
with (security_invoker = true) as
select
  coalesce(mci.legacy_product_catalog_id, mci.id) as id,
  mci.id as master_catalog_item_id,
  'Pokemon'::text as category,
  mci.catalog_item_type,
  mci.catalog_item_type as catalog_type,
  mci.name,
  coalesce(nullif(mci.product_name, ''), mci.name) as product_name,
  mci.set_name,
  coalesce(nullif(mci.series, ''), nullif(mci.product_line, ''), mci.set_name) as series,
  mci.product_type,
  coalesce(nullif(mci.upc, ''), primary_identifier.identifier_value) as barcode,
  coalesce(nullif(mci.upc, ''), primary_identifier.identifier_value) as upc,
  coalesce(nullif(mci.sku, ''), sku_identifier.identifier_value) as sku,
  coalesce(external_identifier.identifier_value, mci.external_links ->> 'external_product_id') as external_product_id,
  coalesce(mci.tcgplayer_product_id, tcgplayer_identifier.identifier_value) as tcgplayer_product_id,
  best_source.source_url as market_url,
  mci.image_url,
  ms.recommended_market_value as market_price,
  best_source.low_price,
  best_source.mid_price,
  best_source.high_price,
  coalesce(ms.last_updated_at, best_source.last_updated_at, mci.last_verified_at) as last_price_checked,
  coalesce(mci.msrp, ms.msrp) as msrp_price,
  mci.set_code,
  mci.release_date,
  mci.set_name as expansion,
  mci.product_line,
  null::numeric as pack_count,
  null::integer as source_group_id,
  null::text as source_group_name,
  best_source.price_type as price_subtype,
  (mci.catalog_item_type = 'sealed') as is_sealed,
  case
    when mci.retailer_skus <> '{}'::jsonb then mci.retailer_skus
    else coalesce(retailer_sku_summary.retailer_skus, '{}'::jsonb)
  end as retailer_skus,
  concat_ws(
    ' ',
    mci.retailer_skus::text,
    retailer_sku_summary.retailer_skus_search
  ) as retailer_skus_search,
  mci.contents,
  mci.related_cards,
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
  variant_summary.variant_count,
  variant_summary.variant_names,
  variant_summary.default_variant_id,
  mci.source,
  mci.source_url,
  mci.admin_review_status,
  mci.is_verified,
  mci.duplicate_of,
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
    and identifier_type in ('SKU', 'RETAILER_SKU', 'BEST_BUY_SKU', 'TARGET_TCIN', 'WALMART_ITEM_ID', 'WALMART_SKU', 'GAMESTOP_SKU', 'POKEMON_CENTER_SKU')
    and status <> 'rejected'
  order by created_at
  limit 1
) sku_identifier on true
left join lateral (
  select identifier_value
  from public.master_catalog_identifiers
  where catalog_item_id = mci.id
    and identifier_type in ('OTHER', 'BEST_BUY_SKU', 'TARGET_TCIN', 'WALMART_ITEM_ID', 'GAMESTOP_SKU', 'POKEMON_CENTER_ID', 'PRICECHARTING_ID')
    and status <> 'rejected'
  order by created_at
  limit 1
) external_identifier on true
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
  select
    jsonb_object_agg(coalesce(nullif(retailer, ''), identifier_type), identifier_value) as retailer_skus,
    string_agg(coalesce(retailer, identifier_type) || ':' || identifier_value, ' ' order by identifier_type, identifier_value) as retailer_skus_search
  from public.master_catalog_identifiers
  where catalog_item_id = mci.id
    and identifier_type in ('SKU', 'RETAILER_SKU', 'BEST_BUY_SKU', 'TARGET_TCIN', 'WALMART_ITEM_ID', 'WALMART_SKU', 'GAMESTOP_SKU', 'POKEMON_CENTER_SKU')
    and status <> 'rejected'
) retailer_sku_summary on true
left join lateral (
  select
    count(*)::integer as variant_count,
    string_agg(variant_name, ', ' order by is_default desc, display_order, variant_name) as variant_names,
    (array_agg(id order by is_default desc, display_order, variant_name))[1] as default_variant_id
  from public.master_catalog_variants
  where catalog_item_id = mci.id
) variant_summary on true;

grant select on public.catalog_search_lightweight to anon, authenticated;

create view public.catalog_item_details
with (security_invoker = true) as
select
  csl.*,
  mci.release_year,
  mci.pricecharting_id,
  mci.ebay_search_query,
  mci.external_links,
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
  select jsonb_agg(to_jsonb(v.*) order by v.is_default desc, v.display_order, v.variant_name) as variants
  from public.master_catalog_variants v
  where v.catalog_item_id = mci.id
) variant_rows on true
left join lateral (
  select jsonb_agg(to_jsonb(s.*) - 'raw_payload' order by s.confidence_score desc, s.last_updated_at desc nulls last) as market_sources
  from public.master_market_price_sources s
  where s.catalog_item_id = mci.id
) market_rows on true;

grant select on public.catalog_item_details to anon, authenticated;

create view public.pokemon_catalog_browse
with (security_invoker = true) as
select * from public.catalog_search_lightweight;

grant select on public.pokemon_catalog_browse to anon, authenticated;

create or replace function public.search_catalog_fast(
  search_text text,
  product_group text default 'All',
  max_results integer default 30
)
returns setof public.catalog_search_lightweight
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select
      trim(lower(coalesce(search_text, ''))) as term,
      regexp_replace(trim(lower(coalesce(search_text, ''))), '[^a-z0-9]', '', 'g') as compact,
      least(greatest(coalesce(max_results, 30), 1), 50) as result_limit
  )
  select c.*
  from public.catalog_search_lightweight c, q
  where length(q.term) >= 2
    and (
      coalesce(product_group, 'All') = 'All'
      or (product_group = 'Sealed' and c.catalog_type = 'sealed')
      or (product_group = 'Cards' and c.catalog_type in ('card', 'slab'))
    )
    and (
      lower(coalesce(c.upc, c.barcode, '')) = q.term
      or lower(coalesce(c.sku, '')) = q.term
      or lower(coalesce(c.tcgplayer_product_id, '')) = q.term
      or lower(coalesce(c.external_product_id, '')) = q.term
      or lower(coalesce(c.card_number, '')) = q.term
      or regexp_replace(lower(coalesce(c.upc, c.barcode, '')), '[^a-z0-9]', '', 'g') = q.compact
      or regexp_replace(lower(coalesce(c.sku, '')), '[^a-z0-9]', '', 'g') = q.compact
      or coalesce(c.name, '') ilike '%' || q.term || '%'
      or coalesce(c.product_name, '') ilike '%' || q.term || '%'
      or coalesce(c.set_name, '') ilike '%' || q.term || '%'
      or coalesce(c.series, '') ilike '%' || q.term || '%'
      or coalesce(c.expansion, '') ilike '%' || q.term || '%'
      or coalesce(c.product_type, '') ilike '%' || q.term || '%'
      or coalesce(c.product_line, '') ilike '%' || q.term || '%'
      or coalesce(c.identifier_search, '') ilike '%' || q.term || '%'
      or coalesce(c.retailer_skus_search, '') ilike '%' || q.term || '%'
      or coalesce(c.variant_names, '') ilike '%' || q.term || '%'
      or coalesce(c.card_number, '') ilike '%' || q.term || '%'
      or coalesce(c.set_code, '') ilike '%' || q.term || '%'
    )
  order by
    case
      when lower(coalesce(c.upc, c.barcode, '')) = q.term then 0
      when lower(coalesce(c.sku, '')) = q.term then 1
      when lower(coalesce(c.tcgplayer_product_id, '')) = q.term then 2
      when lower(coalesce(c.external_product_id, '')) = q.term then 3
      when lower(coalesce(c.name, '')) = q.term or lower(coalesce(c.product_name, '')) = q.term then 4
      else 10
    end,
    greatest(
      similarity(lower(coalesce(c.name, '')), q.term),
      similarity(lower(coalesce(c.product_name, '')), q.term),
      similarity(lower(coalesce(c.set_name, '')), q.term),
      similarity(lower(coalesce(c.series, '')), q.term),
      similarity(lower(coalesce(c.product_type, '')), q.term),
      similarity(lower(coalesce(c.identifier_search, '')), q.term)
    ) desc,
    c.is_verified desc,
    c.last_verified_at desc nulls last,
    c.name asc
  limit (select result_limit from q);
$$;

grant execute on function public.search_catalog_fast(text, text, integer) to anon, authenticated;

comment on function public.search_catalog_fast(text, text, integer) is 'Fast indexed catalog search for mobile catalog, scanner, and smart-match flows. Exact UPC/SKU/id matches rank first.';
comment on table public.catalog_admin_corrections is 'Admin-only catalog correction audit trail for verified fixes, bad-data flags, merges, and duplicate handling.';

notify pgrst, 'reload schema';

commit;
