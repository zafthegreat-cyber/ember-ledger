-- Current market prices for every catalog item with a TCGplayer product id,
-- refreshed daily inside the database from TCGCSV's public price files
-- (https://tcgcsv.com/tcgplayer/3/<groupId>/prices), the same source the
-- bundled JSON cache and market history use. Same pattern as the market
-- history loader: pg_cron starts a run, pg_net fetches one file per set, and
-- a minute job applies whatever has arrived. No keys or secrets are needed.
--
-- What a run writes, per product in each set file:
--   product_market_price_current  every printing (Normal, Holofoil, ...)
--   master_market_price_sources   TCGCSV rows per printing (missing ones added)
--   product_catalog               the item's own printing: market/low/mid/high, last_price_checked
--   master_market_summaries       recommended_market_value = the item's own printing
-- catalog_search_lightweight reads the last two, so the app's market_price,
-- low/mid/high and last_price_checked follow.
--
-- Rules: a known price is never replaced by a blank (every price column is
-- coalesce(new, old)); last_price_checked only moves when TCGCSV gave a market
-- price. An item's "own printing" is product_catalog.price_subtype; when that
-- printing is not in TCGCSV at all (or the item had none), the first priced
-- printing in the order Normal, Holofoil, Reverse Holofoil, Unlimited, ... is
-- used and recorded as its price_subtype.
--
-- Start a run by hand: select public.catalog_price_refresh();      -- all sets
--                      select public.catalog_price_refresh(2);     -- 2 sets, a quick test
-- Progress:            select * from public.catalog_price_refresh_runs order by id desc limit 3;

begin;

create table if not exists public.catalog_price_refresh_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  groups_total integer not null default 0,
  groups_loaded integer not null default 0,
  groups_failed integer not null default 0,
  prices_seen integer not null default 0,
  items_priced integer not null default 0
);

create table if not exists public.catalog_price_refresh_queue (
  run_id bigint not null references public.catalog_price_refresh_runs(id) on delete cascade,
  group_id integer not null,
  attempts integer not null default 0,
  request_id bigint,
  requested_at timestamptz,
  done_at timestamptz,
  prices_seen integer,
  items_priced integer,
  error text,
  primary key (run_id, group_id)
);
create index if not exists catalog_price_refresh_queue_open_idx
  on public.catalog_price_refresh_queue (request_id) where done_at is null;

alter table public.catalog_price_refresh_runs enable row level security;
alter table public.catalog_price_refresh_queue enable row level security;

-- Applies one TCGCSV prices file (the "results" array) for one set.
-- Returns how many catalog items got a fresh market price.
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

  select count(*)::integer into v_items from _cpr_pick where market is not null;
  return v_items;
end;
$$;

-- Starts a run: queues every TCGCSV set that has catalog items. p_group_limit
-- queues only that many sets (a quick test). Returns the run id; a run still in
-- progress is returned instead of starting another.
create or replace function public.catalog_price_refresh(p_group_limit integer default null)
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
  insert into public.catalog_price_refresh_queue (run_id, group_id)
  select v_run, g.source_group_id
  from (
    select distinct pc.source_group_id
    from public.product_catalog pc
    where pc.tcgplayer_product_id is not null and pc.source_group_id is not null
    order by pc.source_group_id desc
    limit p_group_limit
  ) g;
  update public.catalog_price_refresh_runs
    set groups_total = (select count(*) from public.catalog_price_refresh_queue q where q.run_id = v_run)
    where id = v_run;

  delete from public.catalog_price_refresh_runs where started_at < now() - interval '60 days';
  return v_run;
end;
$$;

-- Runs every minute: applies fetched files, fetches the next few sets, and
-- closes a run when every set is done. Failed fetches are retried 3 times.
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
  v_inflight integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('public.catalog_price_apply')) then
    return;
  end if;

  for r in
    select q.run_id, q.group_id, q.attempts, h.status_code, h.content, h.error_msg, h.timed_out
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
      if (v_doc->>'success') is distinct from 'true' then
        raise exception 'TCGCSV did not return prices';
      end if;
      v_items := public.catalog_price_apply_group(r.group_id, v_doc->'results');
      update public.catalog_price_refresh_queue q
        set done_at = now(), error = null,
            prices_seen = jsonb_array_length(v_doc->'results'), items_priced = v_items
        where q.run_id = r.run_id and q.group_id = r.group_id;
    exception when others then
      update public.catalog_price_refresh_queue q
        set error = left(sqlerrm, 300), request_id = null,
            done_at = case when r.attempts >= 3 then now() end
        where q.run_id = r.run_id and q.group_id = r.group_id;
    end;
  end loop;

  -- A request with no response after 15 minutes is asked again.
  update public.catalog_price_refresh_queue q
    set request_id = null,
        error = 'no response',
        done_at = case when q.attempts >= 3 then now() end
    where q.done_at is null and q.request_id is not null and q.requested_at < now() - interval '15 minutes'
      and not exists (select 1 from net._http_response h where h.id = q.request_id);

  select count(*)::integer into v_inflight
    from public.catalog_price_refresh_queue q where q.done_at is null and q.request_id is not null;

  for r in
    select q.run_id, q.group_id
    from public.catalog_price_refresh_queue q
    join public.catalog_price_refresh_runs run on run.id = q.run_id and run.finished_at is null
    where q.done_at is null and q.request_id is null
    order by q.attempts, q.group_id desc
    limit greatest(p_batch - v_inflight, 0)
  loop
    update public.catalog_price_refresh_queue q
      set request_id = net.http_get(
            url := format('https://tcgcsv.com/tcgplayer/3/%s/prices', r.group_id),
            timeout_milliseconds := 60000),
          requested_at = now(),
          attempts = q.attempts + 1
      where q.run_id = r.run_id and q.group_id = r.group_id;
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

revoke all on function public.catalog_price_apply_group(integer, jsonb) from public, anon, authenticated;
revoke all on function public.catalog_price_refresh(integer) from public, anon, authenticated;
revoke all on function public.catalog_price_apply(integer) from public, anon, authenticated;

-- Price-drop alerts compare against a recent price only. Without this, the
-- first refresh after a long gap would alert on six months of movement.
create or replace function public.code3_queue_price_drop_alerts()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_name text;
  v_old numeric := old.market_price;
  v_new numeric := new.market_price;
  v_pct numeric;
  v_recipients uuid[];
begin
  if v_old is null or v_new is null or v_old <= 0 or v_new >= v_old * 0.90 or (v_old - v_new) < 1 then
    return new;
  end if;
  if old.checked_at is null or old.checked_at < now() - interval '3 days' then
    return new;
  end if;
  select coalesce(nullif(c.product_name, ''), nullif(c.name, '')) || coalesce(' — ' || nullif(c.set_name, ''), '')
    into v_name
    from public.catalog_search_lightweight c
    where c.id = new.catalog_product_id or c.master_catalog_item_id = new.catalog_product_id
    limit 1;
  if v_name is null then
    return new;
  end if;
  v_pct := round((v_old - v_new) / v_old * 100);

  select array_agg(distinct m.user_id) into v_recipients
  from public.code3_saved_search_matches(v_name) m
  where not exists (select 1 from public.notification_preferences p
      where p.user_id = m.user_id and (p.wishlist_matches = false or p.inventory_value_changes = false))
    and not exists (select 1 from public.notifications n
      where n.user_id = m.user_id and n.type = 'price_drop'
        and n.related_entity_id = new.catalog_product_id
        and n.created_at > now() - interval '24 hours')
    and (select count(*) from public.notifications n
      where n.user_id = m.user_id and n.type = 'price_drop'
        and n.created_at > now() - interval '24 hours') < 8;

  if v_recipients is not null then
    insert into public.notifications (user_id, type, channel, title, message, action_url, related_entity_type, related_entity_id)
    select r, 'price_drop', 'in_app',
      left('Price drop: ' || v_name, 120),
      left(v_name || ' is down ' || v_pct || '% to $' || to_char(v_new, 'FM999999990.00') || ' (was $' || to_char(v_old, 'FM999999990.00') || ').', 400),
      '/market?q=' || replace(split_part(v_name, ' — ', 1), ' ', '+'),
      'catalog_product', new.catalog_product_id
    from unnest(v_recipients) r;
  end if;
  return new;
exception when others then
  raise warning 'price drop alerts not queued for product %: %', new.catalog_product_id, sqlerrm;
  return new;
end;
$function$;

commit;

-- Daily at 21:00 UTC, after TCGCSV publishes the day's prices (~20:00 UTC).
select cron.schedule('catalog-price-refresh', '0 21 * * *', 'select public.catalog_price_refresh()');
select cron.schedule('catalog-price-apply', '* * * * *', 'select public.catalog_price_apply()');
