-- Adds the ~20,000 catalog cards that came from the Pokémon TCG API
-- (pokemontcg.io ids such as base1-1) to the daily price refresh. They have no
-- TCGplayer product id, so TCGCSV cannot price them; pokemontcg.io's public
-- card list carries the same TCGplayer prices, keyed by its own ids. Its
-- prices carry their own date (tcgplayer.updatedAt) and pokemontcg.io does not
-- update every day, so last_price_checked is set to that date, not today.
--
-- The refresh queue gains a `source` column: 'tcgcsv' rows are TCGCSV set ids,
-- 'pokemontcg' rows are page numbers (250 cards a page). Page 1 queues the rest.
-- Same rule as TCGCSV: a known price is never replaced by a blank.

begin;

alter table public.catalog_price_refresh_queue add column if not exists source text not null default 'tcgcsv';
alter table public.catalog_price_refresh_queue drop constraint if exists catalog_price_refresh_queue_pkey;
alter table public.catalog_price_refresh_queue add primary key (run_id, source, group_id);

-- Applies one page of https://api.pokemontcg.io/v2/cards ("data" array).
-- Returns how many catalog items got a market price.
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

drop function if exists public.catalog_price_refresh(integer);

-- Starts a run: every TCGCSV set with catalog items, plus pokemontcg.io page 1
-- (which queues the other pages). p_group_limit queues only that many TCGCSV
-- sets; p_pokemontcg = false leaves pokemontcg.io out (quick tests).
create or replace function public.catalog_price_refresh(p_group_limit integer default null, p_pokemontcg boolean default true)
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
  update public.catalog_price_refresh_runs
    set groups_total = (select count(*) from public.catalog_price_refresh_queue q where q.run_id = v_run)
    where id = v_run;

  delete from public.catalog_price_refresh_runs where started_at < now() - interval '60 days';
  return v_run;
end;
$$;

-- Runs every minute: applies fetched files, fetches the next few (at most 15
-- in flight, 4 of them pokemontcg.io pages), and closes a run when all are done.
-- A failed fetch is retried up to 5 times, waiting longer each time.
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
  v_pages integer;
  v_inflight integer;
  v_inflight_ptcg integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('public.catalog_price_apply')) then
    return;
  end if;

  for r in
    select q.run_id, q.source, q.group_id, q.attempts, h.status_code, h.content, h.error_msg, h.timed_out
    from public.catalog_price_refresh_queue q
    join net._http_response h on h.id = q.request_id
    where q.done_at is null
  loop
    begin
      if r.status_code is distinct from 200 then
        raise exception '%', coalesce(r.error_msg, case when r.timed_out then 'timed out' end,
          'HTTP ' || coalesce(r.status_code::text, '?'));
      end if;
      v_doc := r.content::jsonb;
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
          update public.catalog_price_refresh_runs run
            set groups_total = (select count(*) from public.catalog_price_refresh_queue q where q.run_id = r.run_id)
            where run.id = r.run_id;
        end if;
      else
        if (v_doc->>'success') is distinct from 'true' then
          raise exception 'TCGCSV did not return prices';
        end if;
        v_items := public.catalog_price_apply_group(r.group_id, v_doc->'results');
        v_count := jsonb_array_length(v_doc->'results');
      end if;
      update public.catalog_price_refresh_queue q
        set done_at = now(), error = null, prices_seen = v_count, items_priced = v_items
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

  select count(*)::integer, count(*) filter (where q.source = 'pokemontcg')::integer
    into v_inflight, v_inflight_ptcg
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
    where o.source <> 'pokemontcg' or o.rn <= greatest(4 - v_inflight_ptcg, 0)
    order by o.attempts, (o.source = 'pokemontcg') desc, o.rn
    limit greatest(p_batch - v_inflight, 0)
  loop
    update public.catalog_price_refresh_queue q
      set request_id = net.http_get(
            url := case when r.source = 'pokemontcg'
              then format('https://api.pokemontcg.io/v2/cards?page=%s&pageSize=250&orderBy=id&select=id,tcgplayer', r.group_id)
              else format('https://tcgcsv.com/tcgplayer/3/%s/prices', r.group_id) end,
            timeout_milliseconds := 90000),
          requested_at = now(),
          attempts = q.attempts + 1
      where q.run_id = r.run_id and q.source = r.source and q.group_id = r.group_id;
  end loop;

  update public.catalog_price_refresh_runs run set
    groups_loaded = s.loaded, groups_failed = s.failed, prices_seen = s.prices, items_priced = s.items,
    finished_at = case when s.open = 0 then now() end
  from (
    select q.run_id,
      count(*) filter (where q.done_at is not null and q.error is null)::integer loaded,
      count(*) filter (where q.done_at is not null and q.error is not null)::integer failed,
      count(*) filter (where q.done_at is null)::integer open,
      coalesce(sum(q.prices_seen), 0)::integer prices,
      coalesce(sum(q.items_priced), 0)::integer items
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

revoke all on function public.catalog_price_apply_pokemontcg_page(jsonb) from public, anon, authenticated;
revoke all on function public.catalog_price_refresh(integer, boolean) from public, anon, authenticated;
revoke all on function public.catalog_price_apply(integer) from public, anon, authenticated;

commit;
