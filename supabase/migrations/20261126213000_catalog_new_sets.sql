-- New sets and new products reach the catalog on their own.
--
-- Why: the catalog (product_catalog -> master_catalog_items -> catalog_search_lightweight)
-- was loaded once, on 2026-05-09. The daily refresh (20261125090000_catalog_price_refresh.sql)
-- only re-prices products that are already in it, and only asks TCGCSV about sets that already
-- have catalog items. So nothing TCGplayer listed after May 9 ever arrived: whole sets
-- (30th Celebration, Delta Reign, McDonald's Promos 2026), the cards of sets that only had
-- sealed pre-orders that day (Chaos Rising, Pitch Black), and later promos (Mega Evolution
-- Promo 071 onward).
--
-- Now every daily run also:
--   1. reads TCGCSV's set list (https://tcgcsv.com/tcgplayer/3/groups) into catalog_tcgcsv_groups;
--   2. reads a set's product list (.../3/<groupId>/products) when the set has never been read,
--      came out within the last year (or is not out yet), is on its weekly turn, or has a price
--      for a product the catalog lacks, and adds the products that are missing;
--   3. prices what it added from the same day's price file.
--
-- Rules:
--   * Additive. A product already in the catalog is never rewritten. The one exception is the
--     set code: TCGCSV names it late (Pitch Black was "ME05" until its cards were listed, then
--     "PBL"), and items filed under the old code follow so a set is not split in two.
--   * A product is a single card when it carries a card rarity or a collector number
--     (public.catalog_is_single_card, 20261126090000) or card stats. Its name is not evidence:
--     Giratina, Mantine and Victini all hold "tin". Everything else on a set's product list is
--     a sealed product or a code card.
--   * One row per TCGplayer product id; a second run adds nothing.
--   * New rows have the shape the first import gave: product_catalog, master_catalog_items,
--     master_catalog_identifiers, product_identifiers, then printings and prices from the
--     price file (catalog_product_variants, master_catalog_variants,
--     product_market_price_current, master_market_price_sources, master_market_summaries).
--
-- Check for new sets by hand (no price refresh):  select public.catalog_price_refresh(0, false);
-- What a run added:  select id, sets_added, products_added from public.catalog_price_refresh_runs order by id desc limit 3;
-- Per set:           select * from public.catalog_tcgcsv_groups order by group_id desc limit 10;

begin;

do $$
begin
  if to_regprocedure('public.catalog_is_single_card(text, text)') is null then
    raise exception 'public.catalog_is_single_card is missing: apply 20261126090000_catalog_single_cards_not_sealed.sql first';
  end if;
end
$$;

-- TCGCSV's set list. Products are filed under the name and code recorded here.
create table if not exists public.catalog_tcgcsv_groups (
  group_id integer primary key,
  name text not null,
  abbreviation text,
  published_on date,
  modified_on timestamptz,
  is_supplemental boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  products_checked_at timestamptz,
  products_seen integer,
  products_added integer not null default 0
);
alter table public.catalog_tcgcsv_groups enable row level security;

alter table public.catalog_price_refresh_queue add column if not exists products_added integer;
alter table public.catalog_price_refresh_runs add column if not exists products_added integer not null default 0;
alter table public.catalog_price_refresh_runs add column if not exists sets_added integer not null default 0;

-- A product's extendedData ([{name, value}, ...]) as one object, keyed the way the first
-- import keyed it: "Card Type" -> card_type, "RetreatCost" -> retreatcost.
create or replace function public.catalog_tcgcsv_extended_data(p_product jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k.key, e.item->'value') filter (where k.key <> ''), '{}'::jsonb)
  from jsonb_array_elements(
    case when jsonb_typeof(p_product->'extendedData') = 'array' then p_product->'extendedData' else '[]'::jsonb end
  ) as e(item)
  cross join lateral (
    select btrim(regexp_replace(lower(coalesce(e.item->>'name', e.item->>'displayName', '')), '[^a-z0-9]+', '_', 'g'), '_') as key
  ) k;
$$;

-- True when a TCGCSV product is a single card: a card rarity or collector number
-- (catalog_is_single_card), or card stats. "Code Card" is a rarity TCGCSV gives code cards.
create or replace function public.catalog_tcgcsv_is_card(p_ext jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.catalog_is_single_card(p_ext->>'number', p_ext->>'rarity')
    or (
      btrim(coalesce(p_ext->>'rarity', '')) !~* '^code card$'
      and (
        nullif(btrim(coalesce(p_ext->>'number', '')), '') is not null
        or nullif(btrim(coalesce(p_ext->>'card_type', '')), '') is not null
        or nullif(btrim(coalesce(p_ext->>'hp', '')), '') is not null
        or nullif(btrim(coalesce(p_ext->>'stage', '')), '') is not null
      )
    );
$$;

-- What kind of sealed product a name describes (only asked for products that are not cards).
-- A code card is the code, not the box it came from, so it is always 'other'.
create or replace function public.catalog_tcgcsv_sealed_type(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when t.x ~ '^code card' then 'other'
    when t.x ~ 'pokemon center.*elite trainer box|elite trainer box.*pokemon center' then 'pokemon_center_elite_trainer_box'
    when t.x ~ 'elite trainer box|\metb\M' then 'elite_trainer_box'
    when t.x ~ 'sleeved booster' then 'sleeved_booster_pack'
    when t.x ~ 'booster bundle' then 'booster_bundle'
    when t.x ~ 'booster display|display box|booster box' then 'booster_display_box'
    when t.x ~ 'booster pack' then 'booster_pack'
    when t.x ~ 'build (and )?battle stadium' then 'build_and_battle_stadium'
    when t.x ~ 'build (and )?battle box' then 'build_and_battle_box'
    when t.x ~ 'premium collection|ultra premium' then 'premium_collection'
    when t.x ~ 'poster collection' then 'poster_collection'
    when t.x ~ 'mini tin' then 'mini_tin'
    when t.x ~ '\mtins?\M' then 'tin'
    when t.x ~ 'blister|checklane' then 'blister_pack'
    when t.x ~ 'league battle deck' then 'league_battle_deck'
    when t.x ~ 'battle deck' then 'battle_deck'
    when t.x ~ 'starter deck|theme deck' then 'starter_deck'
    when t.x ~ 'collection' then 'collection_box'
    else 'other'
  end
  from (
    select btrim(regexp_replace(translate(lower(coalesce(p_name, '')), 'é', 'e'), '[^a-z0-9]+', ' ', 'g')) as x
  ) t;
$$;

-- Booster packs inside a sealed product, or 0 when the name does not settle it. A count in the
-- name wins ("3 Pack Blister"); otherwise the usual count for the kind of product. Cases,
-- displays, half boxes and "set of" bundles hold several products, so they stay 0.
create or replace function public.catalog_tcgcsv_pack_count(p_name text, p_sealed_type text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_sealed_type is null or t.x ~ '^code card' then 0
    when t.x ~ '\m(case|cases|display|displays|half)\M|set of' then 0
    when t.x ~ '\m[0-9]{1,3} ?(pack|packs|booster packs)\M'
      then substring(t.x from '\m([0-9]{1,3}) ?(?:pack|packs|booster packs)\M')::integer
    when p_sealed_type = 'pokemon_center_elite_trainer_box' then 11
    when p_sealed_type = 'elite_trainer_box' then 9
    when p_sealed_type = 'booster_bundle' then 6
    when p_sealed_type = 'booster_display_box' then 36
    when p_sealed_type = 'build_and_battle_box' then 4
    when p_sealed_type in ('booster_pack', 'sleeved_booster_pack') then 1
    else 0
  end
  from (
    select btrim(regexp_replace(translate(lower(coalesce(p_name, '')), 'é', 'e'), '[^a-z0-9]+', ' ', 'g')) as x
  ) t;
$$;

-- Applies one TCGCSV products file (the "results" array) for one set: adds the products the
-- catalog does not have yet. Returns how many it added. Prices and printings follow when the
-- set's price file is applied (catalog_price_apply_group).
create or replace function public.catalog_products_apply_group(p_group integer, p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  g public.catalog_tcgcsv_groups%rowtype;
  v_owner uuid;
  v_code text;
  v_seen integer;
  v_added integer;
begin
  select * into g from public.catalog_tcgcsv_groups where group_id = p_group;
  if not found then
    raise exception 'set % is not in the TCGCSV set list', p_group;
  end if;
  v_code := nullif(btrim(coalesce(g.abbreviation, '')), '');

  -- New rows belong to the account that owns the rest of the shared catalog.
  select pc.user_id into v_owner from public.product_catalog pc where pc.market_source = 'TCGCSV' limit 1;
  if v_owner is null then
    raise exception 'the catalog has no TCGCSV items, so there is no owner for new ones';
  end if;

  create temp table if not exists _cpa_products (
    pid text primary key, name text, url text, image_url text, product jsonb, ext jsonb,
    card_number text, rarity text, barcode text, is_card boolean, sealed_type text, pack_count integer
  ) on commit drop;
  create temp table if not exists _cpa_new (pc_id uuid primary key, pid text, mci_id uuid) on commit drop;
  truncate _cpa_products;
  truncate _cpa_new;

  insert into _cpa_products
  select distinct on (b.pid) b.pid, b.name, b.url, b.image_url, b.product, b.ext,
    case when c.is_card then nullif(btrim(coalesce(b.ext->>'number', '')), '') end,
    nullif(btrim(coalesce(b.ext->>'rarity', '')), ''),
    nullif(btrim(coalesce(b.ext->>'upc', b.ext->>'gtin', b.ext->>'ean', '')), ''),
    c.is_card,
    s.sealed_type,
    public.catalog_tcgcsv_pack_count(b.name, s.sealed_type)
  from (
    select x->>'productId' as pid,
      coalesce(nullif(btrim(x->>'name'), ''), nullif(btrim(x->>'cleanName'), '')) as name,
      nullif(btrim(x->>'url'), '') as url,
      nullif(btrim(x->>'imageUrl'), '') as image_url,
      x as product,
      public.catalog_tcgcsv_extended_data(x) as ext
    from jsonb_array_elements(case when jsonb_typeof(p_results) = 'array' then p_results else '[]'::jsonb end) x
    where (x->>'productId') ~ '^[0-9]+$'
  ) b
  cross join lateral (select public.catalog_tcgcsv_is_card(b.ext) as is_card) c
  cross join lateral (select case when not c.is_card then public.catalog_tcgcsv_sealed_type(b.name) end as sealed_type) s
  where b.name is not null
  order by b.pid;

  -- The set's code changed: items already filed under the old one follow. The master catalog
  -- follows only where it still mirrors product_catalog, so a hand-corrected code stays.
  if v_code is not null then
    update public.master_catalog_items mci
    set set_code = v_code
    from public.product_catalog pc
    where mci.legacy_product_catalog_id = pc.id
      and pc.market_source = 'TCGCSV'
      and pc.source_group_id = p_group
      and coalesce(pc.set_code, '') <> v_code
      and coalesce(mci.set_code, '') = coalesce(pc.set_code, '');

    insert into public.master_catalog_identifiers
      (catalog_item_id, identifier_type, identifier_value, source, status, confidence_score)
    select mci.id, 'SET_CODE', v_code, 'legacy_product_catalog', 'source_imported', 0.75
    from public.product_catalog pc
    join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
    where pc.market_source = 'TCGCSV'
      and pc.source_group_id = p_group
      and coalesce(pc.set_code, '') <> v_code
      and mci.set_code = v_code
    on conflict do nothing;

    update public.product_catalog pc
    set set_code = v_code, updated_at = now()
    where pc.market_source = 'TCGCSV'
      and pc.source_group_id = p_group
      and coalesce(pc.set_code, '') <> v_code;
  end if;

  -- Products the catalog does not have, by TCGplayer product id.
  with ins as (
    insert into public.product_catalog as pc (
      user_id, name, category, set_name, product_type, barcode, market_source, external_product_id,
      tcgplayer_product_id, market_url, image_url, market_price, low_price, mid_price, high_price,
      set_code, expansion, product_line, pack_count, source_group_id, source_group_name,
      is_sealed, product_kind, sealed_product_type, is_pokemon_center_exclusive, contents,
      card_number, card_number_prefix, card_number_suffix, card_number_sort, printed_total, rarity,
      raw_source, last_price_checked)
    select v_owner, p.name, 'Pokemon', g.name, case when p.is_card then 'Card' else 'Sealed Product' end,
      p.barcode, 'TCGCSV', p.pid,
      p.pid, p.url, p.image_url, null, null, null, null,
      coalesce(v_code, ''), g.name, 'Pokemon', coalesce(p.pack_count, 0), p_group, g.name,
      not p.is_card, case when p.is_card then 'single_card' else 'sealed_product' end, p.sealed_type,
      coalesce(p.sealed_type = 'pokemon_center_elite_trainer_box', false),
      case
        when coalesce(p.pack_count, 0) = 0 then '{}'::jsonb
        -- the count was read from the name ("3 Pack Blister") rather than assumed from the kind
        when public.catalog_tcgcsv_pack_count(p.name, 'other') > 0
          then jsonb_build_object('pack_count_source', 'name', 'pack_count_confidence', 'imported')
        else jsonb_build_object(
          'pack_count_source', 'sealed_product_type_default', 'pack_count_confidence', 'unverified_default')
      end,
      p.card_number, n.prefix, n.suffix, n.sort, n.total, p.rarity,
      jsonb_build_object('group', g.raw, 'product', p.product, 'extendedData', p.ext), now()
    from _cpa_products p
    cross join lateral (
      select
        case when p.card_number is not null
          then upper(coalesce(substring(split_part(p.card_number, '/', 1) from '^[A-Za-z]+'), '')) end as prefix,
        case when p.card_number is not null
          then upper(coalesce(substring(split_part(p.card_number, '/', 1) from '^[A-Za-z]*[0-9]+\s*([A-Za-z]+)$'), '')) end as suffix,
        left(substring(p.card_number from '[0-9]+'), 9)::integer as sort,
        left(substring(split_part(p.card_number, '/', 2) from '[0-9]+'), 9)::integer as total
    ) n
    where not exists (select 1 from public.product_catalog e where e.tcgplayer_product_id = p.pid)
      and not exists (
        select 1 from public.product_catalog e where e.market_source = 'TCGCSV' and e.external_product_id = p.pid)
    on conflict (market_source, external_product_id) do nothing
    returning pc.id, pc.external_product_id
  )
  insert into _cpa_new (pc_id, pid)
  select ins.id, ins.external_product_id from ins;

  -- The master catalog, which catalog_search_lightweight reads.
  with ins as (
    insert into public.master_catalog_items (
      legacy_product_catalog_id, catalog_item_type, name, product_name, set_name, set_code, series,
      product_type, product_line, card_number, rarity, image_url, msrp, tcgplayer_product_id,
      external_links, last_verified_at, data_confidence_score, source, raw_source)
    select pc.id, case when pc.is_sealed then 'sealed' else 'card' end, pc.name, pc.name, pc.set_name,
      nullif(pc.set_code, ''), 'Pokemon',
      pc.product_type, pc.product_line, pc.card_number, pc.rarity, pc.image_url, pc.msrp_price, pc.tcgplayer_product_id,
      jsonb_strip_nulls(jsonb_build_object(
        'market_url', pc.market_url, 'legacy_external_product_id', pc.external_product_id)),
      pc.last_price_checked, 0.70, 'TCGCSV', coalesce(pc.raw_source, '{}'::jsonb)
    from _cpa_new n
    join public.product_catalog pc on pc.id = n.pc_id
    on conflict (legacy_product_catalog_id) do nothing
    returning id, legacy_product_catalog_id
  )
  update _cpa_new n set mci_id = ins.id from ins where ins.legacy_product_catalog_id = n.pc_id;

  insert into public.master_catalog_identifiers
    (catalog_item_id, identifier_type, identifier_value, source, source_url, status, confidence_score)
  select n.mci_id, v.identifier_type, v.identifier_value, v.source, v.source_url, 'source_imported', v.confidence_score
  from _cpa_new n
  join public.product_catalog pc on pc.id = n.pc_id
  cross join lateral (values
    ('TCGPLAYER_PRODUCT_ID', pc.tcgplayer_product_id, 'TCGCSV', pc.market_url, 0.85::numeric),
    ('CARD_NUMBER', pc.card_number, 'legacy_product_catalog', null::text, 0.75::numeric),
    ('SET_CODE', nullif(pc.set_code, ''), 'legacy_product_catalog', null::text, 0.75::numeric),
    (case length(regexp_replace(coalesce(pc.barcode, ''), '[^0-9]', '', 'g'))
       when 12 then 'UPC' when 13 then 'EAN' else 'GTIN' end,
     pc.barcode, 'TCGCSV', pc.market_url, 0.80::numeric)
  ) as v(identifier_type, identifier_value, source, source_url, confidence_score)
  where n.mci_id is not null and v.identifier_value is not null
  on conflict do nothing;

  -- The older identifier table the product page reads.
  insert into public.product_identifiers
    (catalog_product_id, identifier_type, identifier_value, source, source_url, confidence)
  select n.pc_id, v.identifier_type, v.identifier_value, v.source, pc.market_url, 'imported'
  from _cpa_new n
  join public.product_catalog pc on pc.id = n.pc_id
  cross join lateral (values
    ('TCGPLAYER_PRODUCT_ID', pc.tcgplayer_product_id, 'TCGCSV'),
    (case length(regexp_replace(coalesce(pc.barcode, ''), '[^0-9]', '', 'g'))
       when 12 then 'UPC' when 13 then 'EAN' when 14 then 'GTIN' else 'OTHER' end,
     pc.barcode, 'TCGCSV extendedData')
  ) as v(identifier_type, identifier_value, source)
  where v.identifier_value is not null
  on conflict (identifier_type, identifier_value) do nothing;

  select count(*)::integer into v_seen from _cpa_products;
  select count(*)::integer into v_added from _cpa_new;
  update public.catalog_tcgcsv_groups
    set products_checked_at = now(), products_seen = v_seen, products_added = products_added + v_added
    where group_id = p_group;
  return v_added;
end;
$$;

-- Applies TCGCSV's set list for a run: records every set, and queues a products check for
-- the sets that are due one. Returns how many sets the catalog had no items for.
create or replace function public.catalog_groups_apply(p_run bigint, p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_new integer;
begin
  create temp table if not exists _cga_groups (
    group_id integer primary key, name text, abbreviation text, published_on date,
    modified_on timestamptz, is_supplemental boolean, raw jsonb
  ) on commit drop;
  truncate _cga_groups;

  insert into _cga_groups
  select distinct on ((x->>'groupId')::integer)
    (x->>'groupId')::integer,
    btrim(x->>'name'),
    nullif(btrim(coalesce(x->>'abbreviation', '')), ''),
    case when x->>'publishedOn' ~ '^[0-9]{4}-[01][0-9]-[0-3][0-9]' then left(x->>'publishedOn', 10)::date end,
    case when x->>'modifiedOn' ~ '^[0-9]{4}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'
      then left(x->>'modifiedOn', 19)::timestamp at time zone 'UTC' end,
    coalesce(x->>'isSupplemental', '') = 'true',
    x
  from jsonb_array_elements(case when jsonb_typeof(p_results) = 'array' then p_results else '[]'::jsonb end) x
  where (x->>'groupId') ~ '^[0-9]{1,9}$'
    and nullif(btrim(coalesce(x->>'name', '')), '') is not null
  order by (x->>'groupId')::integer;

  insert into public.catalog_tcgcsv_groups as g
    (group_id, name, abbreviation, published_on, modified_on, is_supplemental, raw)
  select l.group_id, l.name, l.abbreviation, l.published_on, l.modified_on, l.is_supplemental, l.raw
  from _cga_groups l
  on conflict (group_id) do update set
    name = excluded.name,
    abbreviation = coalesce(excluded.abbreviation, g.abbreviation),
    published_on = coalesce(excluded.published_on, g.published_on),
    modified_on = coalesce(excluded.modified_on, g.modified_on),
    is_supplemental = excluded.is_supplemental,
    raw = excluded.raw,
    last_seen_at = now();

  select count(*)::integer into v_new
  from _cga_groups l
  where l.group_id not in (
    select pc.source_group_id from public.product_catalog pc
    where pc.market_source = 'TCGCSV' and pc.source_group_id is not null);

  -- Due for a products check: never read, out within the last year or not out yet (new sets
  -- gain products for months), or the set's weekly turn.
  insert into public.catalog_price_refresh_queue (run_id, source, group_id)
  select p_run, 'tcgcsv-products', g.group_id
  from public.catalog_tcgcsv_groups g
  join _cga_groups l on l.group_id = g.group_id
  where g.products_checked_at is null
    or g.published_on is null
    or g.published_on > current_date - 365
    or g.group_id % 7 = extract(dow from now())::integer
  on conflict do nothing;

  update public.catalog_price_refresh_runs set sets_added = v_new where id = p_run;
  return v_new;
end;
$$;

-- Applies one TCGCSV prices file (the "results" array) for one set.
-- Returns how many catalog items got a fresh market price.
-- Same as 20261125090000, plus: an item with no printings listed yet (one the daily run has
-- just added) gets them from this file.
create or replace function public.catalog_price_apply_group(p_group integer, p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_items integer;
begin
  create temp table if not exists _cpr_prices (
    pid text, sub text, low numeric, mid numeric, high numeric, market numeric, direct_low numeric, raw jsonb
  ) on commit drop;
  create temp table if not exists _cpr_pick (
    pc_id uuid, mci_id uuid, pid text, sub text, low numeric, mid numeric, high numeric, market numeric
  ) on commit drop;
  truncate _cpr_prices;
  truncate _cpr_pick;

  insert into _cpr_prices
  select x->>'productId', x->>'subTypeName',
    case when (x->>'lowPrice')::numeric > 0 then (x->>'lowPrice')::numeric end,
    case when (x->>'midPrice')::numeric > 0 then (x->>'midPrice')::numeric end,
    case when (x->>'highPrice')::numeric > 0 then (x->>'highPrice')::numeric end,
    case when (x->>'marketPrice')::numeric > 0 then (x->>'marketPrice')::numeric end,
    case when (x->>'directLowPrice')::numeric > 0 then (x->>'directLowPrice')::numeric end,
    x
  from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) x
  where coalesce(x->>'productId', '') <> '' and coalesce(x->>'subTypeName', '') <> '';

  -- Each catalog item's own printing (or the fallback when TCGCSV lacks it).
  insert into _cpr_pick
  select distinct on (pc.id) pc.id, mci.id, r.pid, r.sub, r.low, r.mid, r.high, r.market
  from public.product_catalog pc
  join _cpr_prices r on r.pid = pc.tcgplayer_product_id
  left join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
  where r.sub = pc.price_subtype
     or (r.market is not null
         and not exists (select 1 from _cpr_prices o where o.pid = r.pid and o.sub = pc.price_subtype))
  order by pc.id,
    (r.sub = pc.price_subtype) desc nulls last,
    array_position(array['Normal', 'Holofoil', 'Reverse Holofoil', 'Unlimited', 'Unlimited Holofoil',
      '1st Edition', '1st Edition Holofoil'], r.sub) nulls last,
    r.sub;

  -- Every printing, for price charts and price-drop alerts.
  insert into public.product_market_price_current as c
    (catalog_product_id, source, source_product_id, source_group_id, price_subtype,
     low_price, mid_price, high_price, market_price, direct_low_price, currency, raw_source, checked_at, updated_at)
  select pc.id, 'TCGCSV', r.pid, p_group, r.sub,
    r.low, r.mid, r.high, r.market, r.direct_low, 'USD', r.raw, now(), now()
  from _cpr_prices r
  join lateral (select p.id from public.product_catalog p where p.tcgplayer_product_id = r.pid limit 1) pc on true
  on conflict (source, source_product_id, price_subtype) do update set
    catalog_product_id = coalesce(c.catalog_product_id, excluded.catalog_product_id),
    source_group_id = excluded.source_group_id,
    low_price = coalesce(excluded.low_price, c.low_price),
    mid_price = coalesce(excluded.mid_price, c.mid_price),
    high_price = coalesce(excluded.high_price, c.high_price),
    market_price = coalesce(excluded.market_price, c.market_price),
    direct_low_price = coalesce(excluded.direct_low_price, c.direct_low_price),
    raw_source = excluded.raw_source,
    checked_at = now(),
    updated_at = now();

  update public.product_catalog pc set
    market_price = coalesce(p.market, pc.market_price),
    low_price = coalesce(p.low, pc.low_price),
    mid_price = coalesce(p.mid, pc.mid_price),
    high_price = coalesce(p.high, pc.high_price),
    price_subtype = p.sub,
    last_price_checked = case when p.market is not null then now() else pc.last_price_checked end,
    updated_at = now()
  from _cpr_pick p
  where pc.id = p.pc_id;

  -- TCGCSV source rows per printing. The item's own printing ranks first
  -- (confidence 0.9) so the catalog view's low/mid/high match its market price.
  update public.master_market_price_sources s set
    source_group_id = p_group,
    market_price = coalesce(r.market, s.market_price),
    low_price = coalesce(r.low, s.low_price),
    mid_price = coalesce(r.mid, s.mid_price),
    high_price = coalesce(r.high, s.high_price),
    last_updated_at = case when r.market is not null then now() else s.last_updated_at end,
    confidence_score = case when p.sub = r.sub then 0.9 else 0.8 end,
    status = 'cached',
    raw_payload = r.raw
  from _cpr_prices r
  join _cpr_pick p on p.pid = r.pid
  where s.source = 'TCGCSV'
    and s.source_item_id = r.pid
    and s.price_type = r.sub
    and s.catalog_item_id = p.mci_id;

  insert into public.master_market_price_sources
    (catalog_item_id, source, source_item_id, source_group_id, price_type, market_price, low_price, mid_price,
     high_price, currency, source_url, last_updated_at, confidence_score, status, raw_payload)
  select p.mci_id, 'TCGCSV', r.pid, p_group, r.sub, r.market, r.low, r.mid,
    r.high, 'USD', 'https://www.tcgplayer.com/product/' || r.pid,
    case when r.market is not null then now() end,
    case when p.sub = r.sub then 0.9 else 0.8 end, 'cached', r.raw
  from _cpr_pick p
  join _cpr_prices r on r.pid = p.pid
  where p.mci_id is not null
    and coalesce(r.market, r.mid, r.low, r.high) is not null
    and not exists (
      select 1 from public.master_market_price_sources s
      where s.source = 'TCGCSV' and s.source_item_id = r.pid and s.price_type = r.sub
        and s.catalog_item_id = p.mci_id
    );

  -- What the app shows as market_price / last_price_checked.
  insert into public.master_market_summaries as ms
    (catalog_item_id, recommended_market_value, msrp, price_confidence, source_count, sample_size,
     last_updated_at, computed_at)
  select p.mci_id, coalesce(pc.market_price, pc.mid_price, pc.low_price), mci.msrp, 'medium',
    (select count(distinct s.source)::integer from public.master_market_price_sources s where s.catalog_item_id = p.mci_id),
    0,
    case when p.market is not null then now() end,
    now()
  from _cpr_pick p
  join public.product_catalog pc on pc.id = p.pc_id
  join public.master_catalog_items mci on mci.id = p.mci_id
  on conflict (catalog_item_id) do update set
    recommended_market_value = coalesce(excluded.recommended_market_value, ms.recommended_market_value),
    source_count = excluded.source_count,
    last_updated_at = coalesce(excluded.last_updated_at, ms.last_updated_at),
    computed_at = now();

  -- Printings for items that have none listed yet (the daily run has just added them): every
  -- printing in the older table the product page reads, and the item's own printing in the
  -- master catalog, as the first import did. Items that already have printings are left alone.
  insert into public.catalog_product_variants
    (catalog_product_id, variant_name, printing, finish, language, condition_name, is_default)
  select n.pc_id, n.sub,
    case when n.sub ilike '%1st edition%' then '1st Edition' when n.sub ilike '%unlimited%' then 'Unlimited' end,
    case when n.sub ilike '%reverse%' then 'Reverse Holofoil' when n.sub ilike '%holo%' then 'Holofoil'
      when n.sub ilike '%normal%' then 'Normal' end,
    'English', '', n.rn = 1
  from (
    select pc.id as pc_id, r.sub,
      row_number() over (partition by pc.id order by
        (r.sub = pc.price_subtype) desc nulls last,
        array_position(array['Normal', 'Holofoil', 'Reverse Holofoil', 'Unlimited', 'Unlimited Holofoil',
          '1st Edition', '1st Edition Holofoil'], r.sub) nulls last,
        r.sub) as rn
    from (select distinct pid, sub from _cpr_prices) r
    join public.product_catalog pc on pc.market_source = 'TCGCSV' and pc.external_product_id = r.pid
    where not exists (select 1 from public.catalog_product_variants v where v.catalog_product_id = pc.id)
  ) n
  on conflict (catalog_product_id, variant_name, language, condition_name) do nothing;

  insert into public.master_catalog_variants
    (catalog_item_id, variant_type, variant_name, finish, printing, language, condition_name, is_default, external_ids)
  select p.mci_id,
    case
      when p.sub ilike '%reverse%' then 'reverse_holo'
      when p.sub ilike '%holo%' then 'holo'
      when p.sub ilike '%1st edition%' then 'first_edition'
      when p.sub ilike '%unlimited%' then 'unlimited'
      when mci.catalog_item_type = 'sealed' then 'sealed'
      else 'standard'
    end,
    p.sub,
    case
      when p.sub ilike '%reverse%' then 'Reverse Holofoil'
      when p.sub ilike '%holo%' then 'Holofoil'
      when mci.catalog_item_type = 'sealed' then 'Sealed'
    end,
    case when p.sub ilike '%1st edition%' then '1st Edition' when p.sub ilike '%unlimited%' then 'Unlimited' end,
    'English', '', true, jsonb_build_object('tcgplayer_product_id', p.pid)
  from _cpr_pick p
  join public.master_catalog_items mci on mci.id = p.mci_id
  where not exists (select 1 from public.master_catalog_variants v where v.catalog_item_id = p.mci_id)
  on conflict (catalog_item_id, variant_name, language, condition_name) do nothing;

  select count(*)::integer into v_items from _cpr_pick where market is not null;
  return v_items;
end;
$$;

drop function if exists public.catalog_price_refresh(integer, boolean);

-- Starts a run: prices for every TCGCSV set with catalog items, pokemontcg.io page 1 (which
-- queues the other pages), and TCGCSV's set list (which queues the products checks).
-- p_group_limit queues only that many sets for prices (0 = none); p_pokemontcg = false leaves
-- pokemontcg.io out; p_new_sets = false leaves the set list out.
create or replace function public.catalog_price_refresh(
  p_group_limit integer default null, p_pokemontcg boolean default true, p_new_sets boolean default true)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_run bigint;
begin
  select id into v_run from public.catalog_price_refresh_runs
    where finished_at is null and started_at > now() - interval '20 hours'
    order by id desc limit 1;
  if v_run is not null then
    return v_run;
  end if;
  update public.catalog_price_refresh_runs set finished_at = now() where finished_at is null;

  insert into public.catalog_price_refresh_runs default values returning id into v_run;
  insert into public.catalog_price_refresh_queue (run_id, source, group_id)
  select v_run, 'tcgcsv', g.source_group_id
  from (
    select distinct pc.source_group_id
    from public.product_catalog pc
    where pc.tcgplayer_product_id is not null and pc.source_group_id is not null
    order by pc.source_group_id desc
    limit p_group_limit
  ) g;
  if p_pokemontcg then
    insert into public.catalog_price_refresh_queue (run_id, source, group_id) values (v_run, 'pokemontcg', 1);
  end if;
  if p_new_sets then
    -- group_id holds the TCGCSV category here: 3 = Pokemon.
    insert into public.catalog_price_refresh_queue (run_id, source, group_id) values (v_run, 'tcgcsv-groups', 3);
  end if;
  update public.catalog_price_refresh_runs
    set groups_total = (select count(*) from public.catalog_price_refresh_queue q where q.run_id = v_run)
    where id = v_run;

  delete from public.catalog_price_refresh_runs where started_at < now() - interval '60 days';
  return v_run;
end;
$$;

-- Runs every minute: applies fetched files, fetches the next few (at most 15 in flight, 4 of
-- them pokemontcg.io pages and 8 of them product lists), and closes a run when all are done.
-- A failed fetch is retried up to 5 times, waiting longer each time.
-- Queue sources: 'tcgcsv' a set's prices, 'tcgcsv-products' a set's product list,
-- 'tcgcsv-groups' the set list, 'pokemontcg' a page of pokemontcg.io cards.
create or replace function public.catalog_price_apply(p_batch integer default 15)
returns table (run_id bigint, groups_loaded integer, groups_open integer, groups_failed integer, items_priced integer)
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  r record;
  v_doc jsonb;
  v_items integer;
  v_count integer;
  v_added integer;
  v_pages integer;
  v_inflight integer;
  v_inflight_ptcg integer;
  v_inflight_products integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('public.catalog_price_apply')) then
    return;
  end if;

  for r in
    select q.run_id, q.source, q.group_id, q.attempts, h.status_code, h.content, h.error_msg, h.timed_out
    from public.catalog_price_refresh_queue q
    join net._http_response h on h.id = q.request_id
    where q.done_at is null
    -- the set list first, then product lists, so a set's prices land on its new items
    order by (q.source = 'tcgcsv-groups') desc, (q.source = 'tcgcsv-products') desc, q.group_id
  loop
    begin
      if r.status_code is distinct from 200 then
        raise exception '%', coalesce(r.error_msg, case when r.timed_out then 'timed out' end,
          'HTTP ' || coalesce(r.status_code::text, '?'));
      end if;
      v_doc := r.content::jsonb;
      v_added := null;
      if r.source = 'pokemontcg' then
        if jsonb_typeof(v_doc->'data') is distinct from 'array' then
          raise exception 'pokemontcg.io did not return cards';
        end if;
        v_items := public.catalog_price_apply_pokemontcg_page(v_doc->'data');
        v_count := jsonb_array_length(v_doc->'data');
        if r.group_id = 1 then
          v_pages := least(ceil(coalesce((v_doc->>'totalCount')::numeric, 0) / 250.0)::integer, 400);
          insert into public.catalog_price_refresh_queue (run_id, source, group_id)
          select r.run_id, 'pokemontcg', g from generate_series(2, v_pages) g
          on conflict do nothing;
        end if;
      elsif r.source = 'tcgcsv-groups' then
        if (v_doc->>'success') is distinct from 'true'
           or jsonb_typeof(v_doc->'results') is distinct from 'array'
           or jsonb_array_length(v_doc->'results') = 0 then
          raise exception 'TCGCSV did not return its set list';
        end if;
        v_count := jsonb_array_length(v_doc->'results');
        v_items := 0;
        perform public.catalog_groups_apply(r.run_id, v_doc->'results');
      elsif r.source = 'tcgcsv-products' then
        if (v_doc->>'success') is distinct from 'true' or jsonb_typeof(v_doc->'results') is distinct from 'array' then
          raise exception 'TCGCSV did not return products';
        end if;
        v_count := jsonb_array_length(v_doc->'results');
        v_items := 0;
        v_added := public.catalog_products_apply_group(r.group_id, v_doc->'results');
        if v_added > 0 then
          -- Price what was just added: ask for this set's prices, again if they were already applied.
          insert into public.catalog_price_refresh_queue as q (run_id, source, group_id)
          values (r.run_id, 'tcgcsv', r.group_id)
          -- (named constraint: "run_id" alone would be read as this function's output column)
          on conflict on constraint catalog_price_refresh_queue_pkey do update
            set done_at = null, request_id = null, requested_at = null, attempts = 0, error = null
            where q.done_at is not null;
        end if;
      else
        if (v_doc->>'success') is distinct from 'true' then
          raise exception 'TCGCSV did not return prices';
        end if;
        v_items := public.catalog_price_apply_group(r.group_id, v_doc->'results');
        v_count := jsonb_array_length(v_doc->'results');
        -- A price for a product the catalog lacks: read this set's product list in this run.
        if exists (select 1 from public.catalog_tcgcsv_groups g where g.group_id = r.group_id)
           and exists (
             select 1 from jsonb_array_elements(v_doc->'results') x
             where coalesce(x->>'productId', '') <> ''
               and not exists (
                 select 1 from public.product_catalog pc where pc.tcgplayer_product_id = x->>'productId')
           ) then
          insert into public.catalog_price_refresh_queue (run_id, source, group_id)
          values (r.run_id, 'tcgcsv-products', r.group_id)
          on conflict do nothing;
        end if;
      end if;
      update public.catalog_price_refresh_queue q
        set done_at = now(), error = null, prices_seen = v_count, items_priced = v_items, products_added = v_added
        where q.run_id = r.run_id and q.source = r.source and q.group_id = r.group_id;
    exception when others then
      update public.catalog_price_refresh_queue q
        set error = left(sqlerrm, 300), request_id = null,
            done_at = case when r.attempts >= 5 then now() end
        where q.run_id = r.run_id and q.source = r.source and q.group_id = r.group_id;
    end;
  end loop;

  update public.catalog_price_refresh_queue q
    set request_id = null,
        error = 'no response',
        done_at = case when q.attempts >= 5 then now() end
    where q.done_at is null and q.request_id is not null and q.requested_at < now() - interval '15 minutes'
      and not exists (select 1 from net._http_response h where h.id = q.request_id);

  select count(*)::integer,
      count(*) filter (where q.source = 'pokemontcg')::integer,
      count(*) filter (where q.source = 'tcgcsv-products')::integer
    into v_inflight, v_inflight_ptcg, v_inflight_products
    from public.catalog_price_refresh_queue q where q.done_at is null and q.request_id is not null;

  for r in
    with open as (
      select q.run_id, q.source, q.group_id, q.attempts,
        row_number() over (partition by q.source order by q.attempts, q.group_id desc) rn
      from public.catalog_price_refresh_queue q
      join public.catalog_price_refresh_runs run on run.id = q.run_id and run.finished_at is null
      where q.done_at is null and q.request_id is null
        -- a failed fetch waits 3, 6, 9... minutes before the next try
        and (q.requested_at is null or q.requested_at < now() - q.attempts * interval '3 minutes')
    )
    select o.run_id, o.source, o.group_id
    from open o
    where case o.source
        when 'pokemontcg' then o.rn <= greatest(4 - v_inflight_ptcg, 0)
        when 'tcgcsv-products' then o.rn <= greatest(8 - v_inflight_products, 0)
        else true
      end
    order by (o.source = 'tcgcsv-groups') desc, o.attempts, (o.source = 'pokemontcg') desc, o.rn
    limit greatest(p_batch - v_inflight, 0)
  loop
    update public.catalog_price_refresh_queue q
      set request_id = net.http_get(
            url := case r.source
              when 'pokemontcg' then format(
                'https://api.pokemontcg.io/v2/cards?page=%s&pageSize=250&orderBy=id&select=id,tcgplayer', r.group_id)
              when 'tcgcsv-groups' then format('https://tcgcsv.com/tcgplayer/%s/groups', r.group_id)
              when 'tcgcsv-products' then format('https://tcgcsv.com/tcgplayer/3/%s/products', r.group_id)
              else format('https://tcgcsv.com/tcgplayer/3/%s/prices', r.group_id)
            end,
            timeout_milliseconds := 90000),
          requested_at = now(),
          attempts = q.attempts + 1
      where q.run_id = r.run_id and q.source = r.source and q.group_id = r.group_id;
  end loop;

  update public.catalog_price_refresh_runs run set
    groups_total = s.total, groups_loaded = s.loaded, groups_failed = s.failed,
    prices_seen = s.prices, items_priced = s.items, products_added = s.added,
    finished_at = case when s.open = 0 then now() end
  from (
    select q.run_id,
      count(*)::integer total,
      count(*) filter (where q.done_at is not null and q.error is null)::integer loaded,
      count(*) filter (where q.done_at is not null and q.error is not null)::integer failed,
      count(*) filter (where q.done_at is null)::integer open,
      coalesce(sum(q.prices_seen) filter (where q.source in ('tcgcsv', 'pokemontcg')), 0)::integer prices,
      coalesce(sum(q.items_priced), 0)::integer items,
      coalesce(sum(q.products_added), 0)::integer added
    from public.catalog_price_refresh_queue q
    group by q.run_id
  ) s
  where run.id = s.run_id and run.finished_at is null;

  return query
    select run.id, run.groups_loaded, run.groups_total - run.groups_loaded - run.groups_failed,
      run.groups_failed, run.items_priced
    from public.catalog_price_refresh_runs run
    order by run.id desc limit 1;
end;
$$;

revoke all on function public.catalog_tcgcsv_extended_data(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_tcgcsv_is_card(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_tcgcsv_sealed_type(text) from public, anon, authenticated;
revoke all on function public.catalog_tcgcsv_pack_count(text, text) from public, anon, authenticated;
revoke all on function public.catalog_products_apply_group(integer, jsonb) from public, anon, authenticated;
revoke all on function public.catalog_groups_apply(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.catalog_price_apply_group(integer, jsonb) from public, anon, authenticated;
revoke all on function public.catalog_price_refresh(integer, boolean, boolean) from public, anon, authenticated;
revoke all on function public.catalog_price_apply(integer) from public, anon, authenticated;

commit;
