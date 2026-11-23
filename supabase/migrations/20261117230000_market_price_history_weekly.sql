-- Weekly market price history back to 2024-02-08 (owner, Nov 17 2026:
-- "the over 2 year market pull"). Built by .github/workflows/market-history.yml
-- from TCGCSV's daily TCGplayer price archives into one JSON file per set on
-- the public `market-history` branch; the database fetches those files with
-- pg_net and loads them here. One row per TCGplayer product and printing.

begin;

create table if not exists public.market_price_history_weekly (
  tcgplayer_product_id text not null,
  price_subtype text not null,
  group_id integer not null,
  catalog_product_id uuid references public.product_catalog(id) on delete set null,
  dates date[] not null,
  market_cents integer[] not null,
  first_date date generated always as (dates[1]) stored,
  last_date date generated always as (dates[array_length(dates, 1)]) stored,
  updated_at timestamptz not null default now(),
  primary key (tcgplayer_product_id, price_subtype)
);

create index if not exists market_price_history_weekly_catalog_idx on public.market_price_history_weekly (catalog_product_id);
create index if not exists market_price_history_weekly_group_idx on public.market_price_history_weekly (group_id);
create index if not exists product_market_price_current_source_product_idx on public.product_market_price_current (source_product_id);

alter table public.market_price_history_weekly enable row level security;
drop policy if exists "Market history is public" on public.market_price_history_weekly;
create policy "Market history is public" on public.market_price_history_weekly for select to anon, authenticated using (true);
grant select on public.market_price_history_weekly to anon, authenticated;

-- Loader bookkeeping: which pg_net request fetched which file.
create table if not exists public.market_history_import_requests (
  request_id bigint primary key,
  path text not null,
  requested_at timestamptz not null default now(),
  applied_at timestamptz,
  rows_loaded integer,
  error text
);
alter table public.market_history_import_requests enable row level security;

create or replace function public.market_history_request(p_path text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_id bigint;
begin
  if p_path !~ '^[0-9]+\.json$' and p_path <> 'index.json' then
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

-- Applies every fetched file that has not been applied yet. index.json queues
-- one request per set. Call until it reports no pending files.
create or replace function public.market_history_apply()
returns table (applied integer, rows_loaded integer, pending integer, failed integer)
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  r record;
  v_doc jsonb;
  v_group integer;
  v_dates date[];
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
    if r.path = 'index.json' then
      perform public.market_history_request(g->>'groupId' || '.json')
      from jsonb_array_elements(v_doc->'groups') g;
      v_rows := 0;
    else
      v_group := (v_doc->>'groupId')::integer;
      v_dates := array(select d::date from jsonb_array_elements_text(v_doc->'dates') d);
      insert into public.market_price_history_weekly as w
        (tcgplayer_product_id, price_subtype, group_id, catalog_product_id, dates, market_cents, updated_at)
      select
        split_part(e.key, '|', 1),
        split_part(e.key, '|', 2),
        v_group,
        (select c.catalog_product_id from public.product_market_price_current c
          where c.source_product_id = split_part(e.key, '|', 1) and c.catalog_product_id is not null limit 1),
        v_dates,
        array(select v::integer from jsonb_array_elements_text(e.value) v),
        now()
      from jsonb_each(v_doc->'series') e
      on conflict (tcgplayer_product_id, price_subtype) do update
        set group_id = excluded.group_id,
            catalog_product_id = coalesce(excluded.catalog_product_id, w.catalog_product_id),
            dates = excluded.dates,
            market_cents = excluded.market_cents,
            updated_at = now();
      get diagnostics v_rows = row_count;
    end if;
    update public.market_history_import_requests
      set applied_at = now(), rows_loaded = v_rows
      where request_id = r.request_id;
    v_applied := v_applied + 1;
    v_total := v_total + v_rows;
  end loop;
  return query select v_applied, v_total,
    (select count(*)::integer from public.market_history_import_requests where applied_at is null),
    (select count(*)::integer from public.market_history_import_requests where error is not null);
end;
$$;

revoke all on function public.market_history_request(text) from public, anon, authenticated;
revoke all on function public.market_history_apply() from public, anon, authenticated;

commit;
