begin;
-- Popular products daily, everything else weekly (owner, Nov 17 2026).
-- market_price_history_daily: popular products (newest sets, highest value,
-- biggest movers), one point a day for the last 120 days. The loader now reads
-- both folders of the `market-history` branch, skips weekly files when the
-- weekly history has not moved, and runs on its own with pg_cron.

create table if not exists public.market_price_history_daily (
  tcgplayer_product_id text not null,
  price_subtype text not null,
  group_id integer not null,
  catalog_product_id uuid references public.product_catalog(id) on delete set null,
  dates date[] not null,
  market_cents integer[] not null,
  last_date date generated always as (dates[array_length(dates, 1)]) stored,
  updated_at timestamptz not null default now(),
  primary key (tcgplayer_product_id, price_subtype)
);
create index if not exists market_price_history_daily_catalog_idx on public.market_price_history_daily (catalog_product_id);
create index if not exists market_price_history_daily_group_idx on public.market_price_history_daily (group_id);
alter table public.market_price_history_daily enable row level security;
drop policy if exists "Daily market history is public" on public.market_price_history_daily;
create policy "Daily market history is public" on public.market_price_history_daily for select to anon, authenticated using (true);
grant select on public.market_price_history_daily to anon, authenticated;

-- Newest date loaded for each kind, so unchanged weekly files are not reloaded.
create table if not exists public.market_history_import_state (
  kind text primary key,
  last_date date,
  updated_at timestamptz not null default now()
);
alter table public.market_history_import_state enable row level security;

create or replace function public.market_history_request(p_path text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_id bigint;
begin
  if p_path !~ '^(daily/)?([0-9]+|index)\.json$' then
    raise exception 'unexpected market history path';
  end if;
  v_id := net.http_get(
    url := 'https://raw.githubusercontent.com/zafthegreat-cyber/ember-ledger/market-history/' || p_path,
    timeout_milliseconds := 60000
  );
  insert into public.market_history_import_requests (request_id, path) values (v_id, p_path);
  return v_id;
end;
$$;

-- Starts a load: fetches both index files. The indexes queue the set files.
create or replace function public.market_history_refresh()
returns void
language plpgsql
security definer
set search_path = public, extensions, net
as $$
begin
  perform public.market_history_request('index.json');
  perform public.market_history_request('daily/index.json');
end;
$$;

create or replace function public.market_history_apply()
returns table (applied integer, rows_loaded integer, pending integer, failed integer)
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  r record;
  v_doc jsonb;
  v_daily boolean;
  v_kind text;
  v_group integer;
  v_dates date[];
  v_last date;
  v_rows integer;
  v_applied integer := 0;
  v_total integer := 0;
begin
  for r in
    select q.request_id, q.path, h.status_code, h.content, h.error_msg
    from public.market_history_import_requests q
    join net._http_response h on h.id = q.request_id
    where q.applied_at is null
  loop
    if r.status_code is distinct from 200 then
      update public.market_history_import_requests
        set applied_at = now(), error = coalesce(r.error_msg, 'HTTP ' || coalesce(r.status_code::text, '?'))
        where request_id = r.request_id;
      continue;
    end if;
    v_doc := r.content::jsonb;
    v_daily := r.path like 'daily/%';
    v_kind := case when v_daily then 'daily' else 'weekly' end;
    v_rows := 0;
    if r.path in ('index.json', 'daily/index.json') then
      v_last := (v_doc->'dates'->>(jsonb_array_length(v_doc->'dates') - 1))::date;
      if v_last is distinct from (select s.last_date from public.market_history_import_state s where s.kind = v_kind) then
        perform public.market_history_request(case when v_daily then 'daily/' else '' end || (g->>'groupId') || '.json')
        from jsonb_array_elements(v_doc->'groups') g;
        insert into public.market_history_import_state (kind, last_date, updated_at) values (v_kind, v_last, now())
        on conflict (kind) do update set last_date = excluded.last_date, updated_at = now();
      end if;
    else
      v_group := (v_doc->>'groupId')::integer;
      v_dates := array(select d::date from jsonb_array_elements_text(v_doc->'dates') d);
      if v_daily then
        insert into public.market_price_history_daily as w
          (tcgplayer_product_id, price_subtype, group_id, catalog_product_id, dates, market_cents, updated_at)
        select split_part(e.key, '|', 1), split_part(e.key, '|', 2), v_group,
          (select c.catalog_product_id from public.product_market_price_current c
            where c.source_product_id = split_part(e.key, '|', 1) and c.catalog_product_id is not null limit 1),
          v_dates, array(select v::integer from jsonb_array_elements_text(e.value) v), now()
        from jsonb_each(v_doc->'series') e
        on conflict (tcgplayer_product_id, price_subtype) do update
          set group_id = excluded.group_id,
              catalog_product_id = coalesce(excluded.catalog_product_id, w.catalog_product_id),
              dates = excluded.dates, market_cents = excluded.market_cents, updated_at = now();
        get diagnostics v_rows = row_count;
        -- Products that dropped out of the daily list.
        delete from public.market_price_history_daily d
        where d.group_id = v_group
          and not (v_doc->'series') ? (d.tcgplayer_product_id || '|' || d.price_subtype);
      else
        insert into public.market_price_history_weekly as w
          (tcgplayer_product_id, price_subtype, group_id, catalog_product_id, dates, market_cents, updated_at)
        select split_part(e.key, '|', 1), split_part(e.key, '|', 2), v_group,
          (select c.catalog_product_id from public.product_market_price_current c
            where c.source_product_id = split_part(e.key, '|', 1) and c.catalog_product_id is not null limit 1),
          v_dates, array(select v::integer from jsonb_array_elements_text(e.value) v), now()
        from jsonb_each(v_doc->'series') e
        on conflict (tcgplayer_product_id, price_subtype) do update
          set group_id = excluded.group_id,
              catalog_product_id = coalesce(excluded.catalog_product_id, w.catalog_product_id),
              dates = excluded.dates, market_cents = excluded.market_cents, updated_at = now();
        get diagnostics v_rows = row_count;
      end if;
    end if;
    update public.market_history_import_requests
      set applied_at = now(), rows_loaded = v_rows
      where request_id = r.request_id;
    v_applied := v_applied + 1;
    v_total := v_total + v_rows;
  end loop;
  -- Old bookkeeping rows are not needed after a week.
  delete from public.market_history_import_requests q where q.applied_at < now() - interval '7 days';
  return query select v_applied, v_total,
    (select count(*)::integer from public.market_history_import_requests where applied_at is null),
    (select count(*)::integer from public.market_history_import_requests where error is not null and requested_at > now() - interval '1 day');
end;
$$;

revoke all on function public.market_history_request(text) from public, anon, authenticated;
revoke all on function public.market_history_refresh() from public, anon, authenticated;
revoke all on function public.market_history_apply() from public, anon, authenticated;

-- Daily at 23:15 UTC (after the GitHub run at 21:30), apply every 5 minutes.
select cron.unschedule(jobid) from cron.job where jobname in ('market-history-refresh', 'market-history-apply');
select cron.schedule('market-history-refresh', '15 23 * * *', $$select public.market_history_refresh()$$);
select cron.schedule('market-history-apply', '*/5 * * * *', $$select public.market_history_apply()$$);
-- Keep fresh environments offline until an operator explicitly enables jobs.
select cron.alter_job((select jobid from cron.job where jobname='market-history-refresh'),active:=false);
select cron.alter_job((select jobid from cron.job where jobname='market-history-apply'),active:=false);
commit;
