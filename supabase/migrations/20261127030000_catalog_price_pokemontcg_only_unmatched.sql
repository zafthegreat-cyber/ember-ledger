-- pokemontcg.io is now only needed for the catalog cards that have no TCGplayer
-- product id and were not merged into a TCGCSV card (124 on 2026-11-27; the
-- other ~20,000 are duplicates priced through their TCGCSV twin). The nightly
-- run used to download all 84 pages of pokemontcg.io's full card list, and
-- several pages fail with 500/502 every night. It now asks only for those
-- cards, 40 ids per request.
--
-- 'pokemontcg' queue rows keep their shape: group_id is now a batch number
-- (1, 2, 3...) of 40 card ids instead of a 250-card page. A batch comes back
-- with totalCount <= 40, so the old "page 1 queues the other pages" step adds
-- nothing.

begin;

-- The cards still priced from pokemontcg.io, in a fixed order.
create or replace function public.catalog_price_pokemontcg_ids()
returns table (card_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct pc.external_product_id
  from public.product_catalog pc
  join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
  where pc.market_source = 'PokemonTCGAPI'
    and mci.duplicate_of is null
    and pc.tcgplayer_product_id is null
    and pc.external_product_id ~ '^[A-Za-z0-9._-]+$'
  order by 1;
$$;

-- URL for batch p_batch (1-based) of 40 ids. An empty batch (the list shrank
-- during a run) asks for an id that does not exist and gets no cards back.
create or replace function public.catalog_price_pokemontcg_url(p_batch integer)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'https://api.pokemontcg.io/v2/cards?pageSize=250&select=id,tcgplayer&q='
    || replace('(' || coalesce(string_agg('id:' || b.card_id, ' OR ' order by b.card_id), 'id:none') || ')', ' ', '%20')
  from (
    select i.card_id from public.catalog_price_pokemontcg_ids() i
    order by i.card_id
    offset greatest(p_batch - 1, 0) * 40 limit 40
  ) b;
$$;

revoke all on function public.catalog_price_pokemontcg_ids() from public, anon, authenticated;
revoke all on function public.catalog_price_pokemontcg_url(integer) from public, anon, authenticated;

-- Edit the live definitions from 20261126213000_catalog_new_sets.sql in place.
do $do$
declare
  d text;
  n text;
begin
  d := pg_get_functiondef('public.catalog_price_refresh(integer, boolean, boolean)'::regprocedure);
  n := replace(d,
    $a$insert into public.catalog_price_refresh_queue (run_id, source, group_id) values (v_run, 'pokemontcg', 1);$a$,
    $b$insert into public.catalog_price_refresh_queue (run_id, source, group_id)
    select v_run, 'pokemontcg', g
    from generate_series(1, ceil((select count(*) from public.catalog_price_pokemontcg_ids()) / 40.0)::integer) g;$b$);
  if n = d then
    raise exception 'catalog_price_refresh: pokemontcg queue line not found';
  end if;
  execute n;

  d := pg_get_functiondef('public.catalog_price_apply(integer)'::regprocedure);
  n := replace(d,
    $a$when 'pokemontcg' then format(
                'https://api.pokemontcg.io/v2/cards?page=%s&pageSize=250&orderBy=id&select=id,tcgplayer', r.group_id)$a$,
    $b$when 'pokemontcg' then public.catalog_price_pokemontcg_url(r.group_id)$b$);
  if n = d then
    raise exception 'catalog_price_apply: pokemontcg URL not found';
  end if;
  execute n;
end
$do$;

commit;
