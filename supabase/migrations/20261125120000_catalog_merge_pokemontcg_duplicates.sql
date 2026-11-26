-- pokemontcg.io cards (product_catalog.market_source = 'PokemonTCGAPI') turned out to be
-- duplicates: 19,938 of the 20,237 match a TCGplayer product (set -> TCGCSV group, card number,
-- name) that is already in the catalog as a TCGCSV item with daily prices. The data step
-- (scripts/catalog/map-pokemontcg-to-tcgplayer.sql) links each one to its TCGplayer id and marks
-- its master_catalog_items row duplicate_of the TCGCSV item, archived. Nothing user-owned pointed
-- at those rows. This migration holds the schema side:
--
-- 1. catalog_search_lightweight (and pokemon_catalog_browse / catalog_item_details / search_catalog_fast,
--    which read it) hides archived and duplicate master items, so each card shows once.
-- 2. The pokemontcg.io refresh skips items that now have a TCGplayer id and set: TCGCSV prices them
--    daily, and pokemontcg.io's older prices (and dates) must not overwrite those.

begin;

do $do$
declare
  d text := pg_get_viewdef('public.catalog_search_lightweight'::regclass, true);
begin
  if d !~ 'mci\.archived_at IS NULL' then
    d := regexp_replace(d, ';\s*$', '') || E'\n  WHERE mci.archived_at IS NULL AND mci.duplicate_of IS NULL';
    execute 'create or replace view public.catalog_search_lightweight with (security_invoker = true) as ' || d;
  end if;
end
$do$;

-- Applies one page of https://api.pokemontcg.io/v2/cards ("data" array).
-- Returns how many catalog items got a market price. Items with a TCGplayer id and set are left to TCGCSV.
create or replace function public.catalog_price_apply_pokemontcg_page(p_data jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_items integer;
begin
  create temp table if not exists _cprp_prices (
    card_id text, sub text, low numeric, mid numeric, high numeric, market numeric,
    price_date timestamptz, source_url text, raw jsonb
  ) on commit drop;
  create temp table if not exists _cprp_pick (
    pc_id uuid, mci_id uuid, card_id text, sub text, low numeric, mid numeric, high numeric, market numeric,
    price_date timestamptz
  ) on commit drop;
  truncate _cprp_prices;
  truncate _cprp_pick;

  insert into _cprp_prices
  select c->>'id', p.key,
    case when (p.value->>'low')::numeric > 0 then (p.value->>'low')::numeric end,
    case when (p.value->>'mid')::numeric > 0 then (p.value->>'mid')::numeric end,
    case when (p.value->>'high')::numeric > 0 then (p.value->>'high')::numeric end,
    case when (p.value->>'market')::numeric > 0 then (p.value->>'market')::numeric end,
    case when c->'tcgplayer'->>'updatedAt' ~ '^\d{4}/\d{2}/\d{2}$'
      then to_date(c->'tcgplayer'->>'updatedAt', 'YYYY/MM/DD')::timestamptz end,
    c->'tcgplayer'->>'url',
    jsonb_build_object('id', c->>'id', 'tcgplayer', c->'tcgplayer')
  from jsonb_array_elements(coalesce(p_data, '[]'::jsonb)) c
  cross join lateral jsonb_each(coalesce(c->'tcgplayer'->'prices', '{}'::jsonb)) p
  where coalesce(c->>'id', '') <> '' and jsonb_typeof(p.value) = 'object';

  insert into _cprp_pick
  select distinct on (pc.id) pc.id, mci.id, r.card_id, r.sub, r.low, r.mid, r.high, r.market, r.price_date
  from public.product_catalog pc
  join _cprp_prices r on r.card_id = pc.external_product_id
  left join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
  where pc.market_source = 'PokemonTCGAPI'
    and (coalesce(pc.tcgplayer_product_id, '') = '' or pc.source_group_id is null)
    and (r.sub = pc.price_subtype
      or (r.market is not null
          and not exists (select 1 from _cprp_prices o where o.card_id = r.card_id and o.sub = pc.price_subtype)))
  order by pc.id,
    (r.sub = pc.price_subtype) desc nulls last,
    array_position(array['normal', 'holofoil', 'reverseHolofoil', 'unlimited', 'unlimitedHolofoil',
      '1stEdition', '1stEditionHolofoil'], r.sub) nulls last,
    r.sub;

  update public.product_catalog pc set
    market_price = coalesce(p.market, pc.market_price),
    low_price = coalesce(p.low, pc.low_price),
    mid_price = coalesce(p.mid, pc.mid_price),
    high_price = coalesce(p.high, pc.high_price),
    price_subtype = p.sub,
    last_price_checked = case when p.market is not null then coalesce(p.price_date, pc.last_price_checked)
      else pc.last_price_checked end,
    updated_at = now()
  from _cprp_pick p
  where pc.id = p.pc_id;

  update public.master_market_price_sources s set
    market_price = coalesce(r.market, s.market_price),
    low_price = coalesce(r.low, s.low_price),
    mid_price = coalesce(r.mid, s.mid_price),
    high_price = coalesce(r.high, s.high_price),
    source_url = coalesce(r.source_url, s.source_url),
    last_updated_at = case when r.market is not null then coalesce(r.price_date, s.last_updated_at)
      else s.last_updated_at end,
    confidence_score = case when p.sub = r.sub then 0.9 else 0.8 end,
    status = 'cached',
    raw_payload = r.raw
  from _cprp_prices r
  join _cprp_pick p on p.card_id = r.card_id
  where s.source = 'PokemonTCGAPI'
    and s.source_item_id = r.card_id
    and s.price_type = r.sub
    and s.catalog_item_id = p.mci_id;

  insert into public.master_market_price_sources
    (catalog_item_id, source, source_item_id, price_type, market_price, low_price, mid_price,
     high_price, currency, source_url, last_updated_at, confidence_score, status, raw_payload)
  select p.mci_id, 'PokemonTCGAPI', r.card_id, r.sub, r.market, r.low, r.mid,
    r.high, 'USD', r.source_url, case when r.market is not null then r.price_date end,
    case when p.sub = r.sub then 0.9 else 0.8 end, 'cached', r.raw
  from _cprp_pick p
  join _cprp_prices r on r.card_id = p.card_id
  where p.mci_id is not null
    and coalesce(r.market, r.mid, r.low, r.high) is not null
    and not exists (
      select 1 from public.master_market_price_sources s
      where s.source = 'PokemonTCGAPI' and s.source_item_id = r.card_id and s.price_type = r.sub
        and s.catalog_item_id = p.mci_id
    );

  insert into public.master_market_summaries as ms
    (catalog_item_id, recommended_market_value, msrp, price_confidence, source_count, sample_size,
     last_updated_at, computed_at)
  select p.mci_id, coalesce(pc.market_price, pc.mid_price, pc.low_price), mci.msrp, 'medium',
    (select count(distinct s.source)::integer from public.master_market_price_sources s where s.catalog_item_id = p.mci_id),
    0,
    case when p.market is not null then p.price_date end,
    now()
  from _cprp_pick p
  join public.product_catalog pc on pc.id = p.pc_id
  join public.master_catalog_items mci on mci.id = p.mci_id
  on conflict (catalog_item_id) do update set
    recommended_market_value = coalesce(excluded.recommended_market_value, ms.recommended_market_value),
    source_count = excluded.source_count,
    last_updated_at = coalesce(excluded.last_updated_at, ms.last_updated_at),
    computed_at = now();

  select count(*)::integer into v_items from _cprp_pick where market is not null;
  return v_items;
end;
$$;

commit;
