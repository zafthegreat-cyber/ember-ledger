-- The catalog knows each item's language, and new app builds search every language.
--
-- Why (owner, Nov 27 2026): Japanese cards come next (20261127211000_catalog_japanese_cards.sql),
-- then other languages. The search view had no language, so a Japanese card and the English card
-- with the same name and number ("Pikachu 025/165" is in both 151 sets) could not be told apart.
--
-- What changes:
--   * master_catalog_items.language, "English" unless a feed says otherwise. Same words the app and
--     inventory_items already use ("English", "Japanese", "Chinese (Simplified)"...).
--   * catalog_search_all_languages: the search view with that language as its last column. New app
--     builds read it.
--   * catalog_search_lightweight keeps exactly its rows and columns, plus the language column, and
--     shows English items only. Older app builds (Android installs that are not updated) read this
--     view, so they keep finding English cards only and cannot file an English scan as the
--     Japanese card with the same number.
--
-- Rules:
--   * Additive: a column with a constant default (no table rewrite), a new view, the old view
--     narrowed to the language every row has today. No row is changed.
--   * Row security is unchanged: both views run as the caller (security_invoker).
--
-- Checks:
--   select language, count(*) from public.master_catalog_items group by 1;
--   select count(*) from public.catalog_search_lightweight;   -- the same count as before
--   select language, count(*) from public.catalog_search_all_languages group by 1;

begin;

alter table public.master_catalog_items
  add column if not exists language text not null default 'English';

-- Searches for one language other than English (most rows are English, so only the rest is indexed).
create index if not exists master_catalog_items_language_idx
  on public.master_catalog_items (language)
  where language <> 'English';

create or replace view public.catalog_search_all_languages with (security_invoker = true) as
 SELECT COALESCE(mci.legacy_product_catalog_id, mci.id) AS id,
    mci.id AS master_catalog_item_id,
    'Pokemon'::text AS category,
    mci.catalog_item_type,
    mci.catalog_item_type AS catalog_type,
    mci.name,
    COALESCE(NULLIF(mci.product_name, ''::text), mci.name) AS product_name,
    mci.set_name,
    COALESCE(NULLIF(mci.series, ''::text), NULLIF(mci.product_line, ''::text), mci.set_name) AS series,
    mci.product_type,
    COALESCE(NULLIF(mci.upc, ''::text), primary_identifier.identifier_value) AS barcode,
    COALESCE(NULLIF(mci.upc, ''::text), primary_identifier.identifier_value) AS upc,
    COALESCE(NULLIF(mci.sku, ''::text), sku_identifier.identifier_value) AS sku,
    COALESCE(external_identifier.identifier_value, mci.external_links ->> 'external_product_id'::text) AS external_product_id,
    COALESCE(mci.tcgplayer_product_id, tcgplayer_identifier.identifier_value) AS tcgplayer_product_id,
    best_source.source_url AS market_url,
    mci.image_url,
    ms.recommended_market_value AS market_price,
    best_source.low_price,
    best_source.mid_price,
    best_source.high_price,
    COALESCE(ms.last_updated_at, best_source.last_updated_at, mci.last_verified_at) AS last_price_checked,
    COALESCE(mci.msrp, ms.msrp) AS msrp_price,
    mci.set_code,
    mci.release_date,
    mci.set_name AS expansion,
    mci.product_line,
    NULL::numeric AS pack_count,
    NULL::integer AS source_group_id,
    NULL::text AS source_group_name,
    best_source.price_type AS price_subtype,
    mci.catalog_item_type = 'sealed'::text AS is_sealed,
        CASE
            WHEN mci.retailer_skus <> '{}'::jsonb THEN mci.retailer_skus
            ELSE COALESCE(retailer_sku_summary.retailer_skus, '{}'::jsonb)
        END AS retailer_skus,
    concat_ws(' '::text, mci.retailer_skus::text, retailer_sku_summary.retailer_skus_search) AS retailer_skus_search,
    mci.contents,
    mci.related_cards,
    mci.card_number,
    mci.rarity,
    NULL::text AS card_number_prefix,
    NULLIF(regexp_replace(COALESCE(mci.card_number, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text)::integer AS card_number_sort,
    NULL::text AS card_number_suffix,
    NULL::integer AS printed_total,
        CASE
            WHEN mci.catalog_item_type = 'sealed'::text THEN 'Sealed'::text
            WHEN mci.catalog_item_type = 'card'::text THEN 'Cards'::text
            WHEN mci.catalog_item_type = 'slab'::text THEN 'Slabs'::text
            ELSE 'Other'::text
        END AS catalog_group,
        CASE
            WHEN mci.catalog_item_type = 'sealed'::text THEN 1
            WHEN mci.catalog_item_type = 'card'::text THEN 2
            WHEN mci.catalog_item_type = 'slab'::text THEN 3
            ELSE 4
        END AS catalog_group_sort,
    COALESCE(NULLIF(mci.set_name, ''::text), 'Unknown Set'::text) AS set_sort_name,
    ''::text AS card_prefix_sort,
    COALESCE(NULLIF(regexp_replace(COALESCE(mci.card_number, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text)::integer, 999999) AS card_number_sort_safe,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM COALESCE(mci.card_number, ''::text)), ''::text) IS NULL THEN 1
            ELSE 0
        END AS card_number_missing_sort,
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
    ms.source_count AS market_source_count,
    mci.data_confidence_score,
    mci.last_verified_at,
    mci.created_at,
    mci.updated_at,
    mci.language
   FROM master_catalog_items mci
     LEFT JOIN master_market_summaries ms ON ms.catalog_item_id = mci.id
     LEFT JOIN LATERAL ( SELECT master_catalog_identifiers.identifier_value
           FROM master_catalog_identifiers
          WHERE master_catalog_identifiers.catalog_item_id = mci.id AND (master_catalog_identifiers.identifier_type = ANY (ARRAY['UPC'::text, 'EAN'::text, 'GTIN'::text])) AND master_catalog_identifiers.status <> 'rejected'::text
          ORDER BY (
                CASE master_catalog_identifiers.identifier_type
                    WHEN 'UPC'::text THEN 1
                    WHEN 'EAN'::text THEN 2
                    ELSE 3
                END), master_catalog_identifiers.created_at
         LIMIT 1) primary_identifier ON true
     LEFT JOIN LATERAL ( SELECT master_catalog_identifiers.identifier_value
           FROM master_catalog_identifiers
          WHERE master_catalog_identifiers.catalog_item_id = mci.id AND (master_catalog_identifiers.identifier_type = ANY (ARRAY['SKU'::text, 'RETAILER_SKU'::text, 'BEST_BUY_SKU'::text, 'TARGET_TCIN'::text, 'WALMART_ITEM_ID'::text, 'WALMART_SKU'::text, 'GAMESTOP_SKU'::text, 'POKEMON_CENTER_SKU'::text])) AND master_catalog_identifiers.status <> 'rejected'::text
          ORDER BY master_catalog_identifiers.created_at
         LIMIT 1) sku_identifier ON true
     LEFT JOIN LATERAL ( SELECT master_catalog_identifiers.identifier_value
           FROM master_catalog_identifiers
          WHERE master_catalog_identifiers.catalog_item_id = mci.id AND (master_catalog_identifiers.identifier_type = ANY (ARRAY['OTHER'::text, 'BEST_BUY_SKU'::text, 'TARGET_TCIN'::text, 'WALMART_ITEM_ID'::text, 'GAMESTOP_SKU'::text, 'POKEMON_CENTER_ID'::text, 'PRICECHARTING_ID'::text])) AND master_catalog_identifiers.status <> 'rejected'::text
          ORDER BY master_catalog_identifiers.created_at
         LIMIT 1) external_identifier ON true
     LEFT JOIN LATERAL ( SELECT master_catalog_identifiers.identifier_value
           FROM master_catalog_identifiers
          WHERE master_catalog_identifiers.catalog_item_id = mci.id AND master_catalog_identifiers.identifier_type = 'TCGPLAYER_PRODUCT_ID'::text AND master_catalog_identifiers.status <> 'rejected'::text
          ORDER BY master_catalog_identifiers.created_at
         LIMIT 1) tcgplayer_identifier ON true
     LEFT JOIN LATERAL ( SELECT master_market_price_sources.id,
            master_market_price_sources.catalog_item_id,
            master_market_price_sources.variant_id,
            master_market_price_sources.source,
            master_market_price_sources.source_item_id,
            master_market_price_sources.source_group_id,
            master_market_price_sources.price_type,
            master_market_price_sources.market_price,
            master_market_price_sources.low_price,
            master_market_price_sources.mid_price,
            master_market_price_sources.high_price,
            master_market_price_sources.sold_average,
            master_market_price_sources.currency,
            master_market_price_sources.sample_size,
            master_market_price_sources.source_url,
            master_market_price_sources.last_updated_at,
            master_market_price_sources.confidence_score,
            master_market_price_sources.status,
            master_market_price_sources.raw_payload,
            master_market_price_sources.created_at,
            master_market_price_sources.updated_at
           FROM master_market_price_sources
          WHERE master_market_price_sources.catalog_item_id = mci.id
          ORDER BY master_market_price_sources.confidence_score DESC, master_market_price_sources.last_updated_at DESC NULLS LAST, master_market_price_sources.created_at DESC
         LIMIT 1) best_source ON true
     LEFT JOIN LATERAL ( SELECT string_agg((master_catalog_identifiers.identifier_type || ':'::text) || master_catalog_identifiers.identifier_value, ' '::text ORDER BY master_catalog_identifiers.identifier_type, master_catalog_identifiers.identifier_value) AS identifier_search
           FROM master_catalog_identifiers
          WHERE master_catalog_identifiers.catalog_item_id = mci.id AND master_catalog_identifiers.status <> 'rejected'::text) identifier_summary ON true
     LEFT JOIN LATERAL ( SELECT jsonb_object_agg(COALESCE(NULLIF(master_catalog_identifiers.retailer, ''::text), master_catalog_identifiers.identifier_type), master_catalog_identifiers.identifier_value) AS retailer_skus,
            string_agg((COALESCE(master_catalog_identifiers.retailer, master_catalog_identifiers.identifier_type) || ':'::text) || master_catalog_identifiers.identifier_value, ' '::text ORDER BY master_catalog_identifiers.identifier_type, master_catalog_identifiers.identifier_value) AS retailer_skus_search
           FROM master_catalog_identifiers
          WHERE master_catalog_identifiers.catalog_item_id = mci.id AND (master_catalog_identifiers.identifier_type = ANY (ARRAY['SKU'::text, 'RETAILER_SKU'::text, 'BEST_BUY_SKU'::text, 'TARGET_TCIN'::text, 'WALMART_ITEM_ID'::text, 'WALMART_SKU'::text, 'GAMESTOP_SKU'::text, 'POKEMON_CENTER_SKU'::text])) AND master_catalog_identifiers.status <> 'rejected'::text) retailer_sku_summary ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS variant_count,
            string_agg(master_catalog_variants.variant_name, ', '::text ORDER BY master_catalog_variants.is_default DESC, master_catalog_variants.display_order, master_catalog_variants.variant_name) AS variant_names,
            (array_agg(master_catalog_variants.id ORDER BY master_catalog_variants.is_default DESC, master_catalog_variants.display_order, master_catalog_variants.variant_name))[1] AS default_variant_id
           FROM master_catalog_variants
          WHERE master_catalog_variants.catalog_item_id = mci.id) variant_summary ON true
  WHERE mci.archived_at IS NULL AND mci.duplicate_of IS NULL;

-- Same columns as before, in the same order, with language added last; English items only.
create or replace view public.catalog_search_lightweight with (security_invoker = true) as
  select * from public.catalog_search_all_languages where language = 'English';

grant select on public.catalog_search_all_languages to anon, authenticated, service_role;

-- A card's details page (catalog_item_details, looked up by id) works for every language and
-- says which one. It is edited in place: only where it reads from changes, plus the new last
-- column. pokemon_catalog_browse and the price-drop alerts keep reading the English view.
do $do$
declare
  d text;
  from_line constant text := 'FROM catalog_search_lightweight csl';
  last_column constant text := 'NULL::jsonb AS card_details';
begin
  if to_regclass('public.catalog_item_details') is null then
    raise notice 'catalog_item_details does not exist here: nothing to do';
    return;
  end if;
  d := pg_get_viewdef('public.catalog_item_details'::regclass, true);
  if position('catalog_search_all_languages' in d) > 0 then
    raise notice 'catalog_item_details already reads every language: nothing to do';
    return;
  end if;
  if (length(d) - length(replace(d, from_line, ''))) / length(from_line) <> 1 then
    raise exception 'catalog_item_details: "%" not found exactly once', from_line;
  end if;
  if (length(d) - length(replace(d, last_column, ''))) / length(last_column) <> 1 then
    raise exception 'catalog_item_details: "%" not found exactly once', last_column;
  end if;
  d := replace(d, from_line, 'FROM catalog_search_all_languages csl');
  d := replace(d, last_column, last_column || ', csl.language');
  execute 'create or replace view public.catalog_item_details with (security_invoker = true) as ' || d;
end
$do$;

comment on view public.catalog_search_all_languages is
  'Catalog search, every language (language is the last column). App builds from Nov 27 2026 read this.';
comment on view public.catalog_search_lightweight is
  'Catalog search, English items only, for app builds from before Nov 27 2026. See catalog_search_all_languages.';

commit;
