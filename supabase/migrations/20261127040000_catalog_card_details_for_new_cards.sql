-- Single cards the daily job adds get their card facts row (tcg_card_details) in the same step.
--
-- Why: the card scanner tells printings of a card apart by what tcg_card_details.raw_source
-- holds: the set's release date (group.publishedOn) and the printed HP and attack names
-- (product.extendedData). See fetchCardsForClues in src/services/pokemonCatalogSearch.js.
-- That table was filled once, on 2026-05-10, by the "tcg-card-details" step of
-- scripts/backfill-normalized-catalog-batches.cjs, and nothing in the database wrote to it.
-- So every card the daily job added (20261126213000_catalog_new_sets.sql) arrived without its
-- facts, and the scanner could neither confirm those cards nor rule them out. The five newest
-- sets (30C, CRI, DLR, M26, PBL) were filled by hand on 2026-11-27.
--
-- Now catalog_products_apply_group, the step of the daily job that adds a set's missing
-- products, also writes that row for each single card it has just added.
--
-- Rules:
--   * Insert only, and only for the cards added by that same call. No row is updated or
--     deleted. Cards that were already in the catalog are not looked at, whether they have a
--     row or not.
--   * Same columns as the first import's step. raw_source is copied whole from
--     product_catalog; the other columns are read from its top level, which only
--     pokemontcg.io records fill, so for TCGCSV cards the facts live in raw_source.
--   * The function is edited in place, like 20261127030000 does, so the rest of it stays as
--     it is live.
--   * No table, row security, policy or grant is changed.
--
-- Cards the job added that have no facts row (expect 0 for cards added after this migration):
--   select count(*) from public.product_catalog pc
--   where pc.market_source = 'TCGCSV' and pc.product_kind = 'single_card' and pc.raw_source is not null
--     and pc.created_at >= '2026-11-27 02:00+00'
--     and not exists (select 1 from public.tcg_card_details d where d.catalog_product_id = pc.id);

begin;

do $do$
declare
  d text;
  -- The line the new step goes in front of: the job's closing count of what it saw.
  anchor constant text := $a$select count(*)::integer into v_seen from _cpa_products;$a$;
  step constant text := $s$-- Card facts for the single cards just added. The card scanner reads raw_source: the
  -- set's release date (group.publishedOn), HP and attack names (product.extendedData).
  -- Insert only; cards that were already in the catalog are not touched.
  insert into public.tcg_card_details (
    catalog_product_id, card_name, supertype, subtypes, stage, evolves_from, hp, types,
    abilities, attacks, weaknesses, resistances, retreat_cost, converted_retreat_cost,
    rarity, artist, flavor_text, regulation_mark, legalities, raw_source)
  select
    pc.id,
    pc.name,
    pc.raw_source ->> 'supertype',
    case when jsonb_typeof(pc.raw_source -> 'subtypes') = 'array'
      then array(select jsonb_array_elements_text(pc.raw_source -> 'subtypes')) end,
    case when jsonb_typeof(pc.raw_source -> 'subtypes') = 'array' then (
      select value
      from jsonb_array_elements_text(pc.raw_source -> 'subtypes') as subtype(value)
      where value in ('Basic', 'Stage 1', 'Stage 2', 'VSTAR', 'VMAX', 'Mega', 'Restored')
      limit 1) end,
    pc.raw_source ->> 'evolvesFrom',
    case when (pc.raw_source ->> 'hp') ~ '^\d+$' then (pc.raw_source ->> 'hp')::integer end,
    case when jsonb_typeof(pc.raw_source -> 'types') = 'array'
      then array(select jsonb_array_elements_text(pc.raw_source -> 'types')) end,
    coalesce(pc.raw_source -> 'abilities', '[]'::jsonb),
    coalesce(pc.raw_source -> 'attacks', '[]'::jsonb),
    coalesce(pc.raw_source -> 'weaknesses', '[]'::jsonb),
    coalesce(pc.raw_source -> 'resistances', '[]'::jsonb),
    case when jsonb_typeof(pc.raw_source -> 'retreatCost') = 'array'
      then array(select jsonb_array_elements_text(pc.raw_source -> 'retreatCost')) end,
    case when (pc.raw_source ->> 'convertedRetreatCost') ~ '^\d+$'
      then (pc.raw_source ->> 'convertedRetreatCost')::integer end,
    pc.raw_source ->> 'rarity',
    pc.raw_source ->> 'artist',
    pc.raw_source ->> 'flavorText',
    pc.raw_source ->> 'regulationMark',
    coalesce(pc.raw_source -> 'legalities', '{}'::jsonb),
    pc.raw_source
  from _cpa_new n
  join public.product_catalog pc on pc.id = n.pc_id
  where pc.product_kind = 'single_card'
    and pc.raw_source is not null
  on conflict (catalog_product_id) do nothing;

  $s$;
begin
  if to_regclass('public.tcg_card_details') is null then
    raise exception 'public.tcg_card_details is missing: apply 20260509170000_normalized_pokemon_catalog_model.sql first';
  end if;
  if to_regprocedure('public.catalog_products_apply_group(integer, jsonb)') is null then
    raise exception 'public.catalog_products_apply_group is missing: apply 20261126213000_catalog_new_sets.sql first';
  end if;

  d := pg_get_functiondef('public.catalog_products_apply_group(integer, jsonb)'::regprocedure);
  if position('insert into public.tcg_card_details' in d) > 0 then
    raise notice 'catalog_products_apply_group already writes card facts: nothing to do';
    return;
  end if;
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'catalog_products_apply_group: closing count line not found exactly once';
  end if;
  execute replace(d, anchor, step || anchor);
end
$do$;

commit;
