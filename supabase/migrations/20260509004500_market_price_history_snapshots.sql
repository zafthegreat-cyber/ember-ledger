-- Extend Pokemon market price history for chartable product snapshots.
-- Current price rows remain the latest snapshot; this table stores append-only history.

begin;

create table if not exists public.product_market_price_history (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid references public.product_catalog(id) on delete cascade,
  external_product_id text,
  tcgplayer_product_id text,
  source text not null default 'TCGCSV',
  source_product_id text,
  source_group_id integer,
  price_subtype text not null default 'Default',
  condition text default 'Unopened',
  market_price numeric,
  most_recent_sale numeric,
  listed_median numeric,
  low_sale_price numeric,
  high_sale_price numeric,
  low_price numeric,
  mid_price numeric,
  high_price numeric,
  direct_low_price numeric,
  currency text default 'USD',
  snapshot_window text,
  raw_source jsonb,
  checked_at timestamptz not null default now(),
  price_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.product_market_price_history
  add column if not exists external_product_id text,
  add column if not exists tcgplayer_product_id text,
  add column if not exists condition text default 'Unopened',
  add column if not exists most_recent_sale numeric,
  add column if not exists listed_median numeric,
  add column if not exists low_sale_price numeric,
  add column if not exists high_sale_price numeric,
  add column if not exists snapshot_window text,
  add column if not exists price_checked_at timestamptz;

update public.product_market_price_history
set
  price_checked_at = coalesce(price_checked_at, checked_at, created_at, now()),
  external_product_id = coalesce(external_product_id, source_product_id),
  tcgplayer_product_id = coalesce(tcgplayer_product_id, source_product_id),
  condition = coalesce(nullif(condition, ''), nullif(price_subtype, ''), 'Unopened'),
  listed_median = coalesce(listed_median, mid_price),
  low_sale_price = coalesce(low_sale_price, low_price),
  high_sale_price = coalesce(high_sale_price, high_price)
where price_checked_at is null
  or external_product_id is null
  or tcgplayer_product_id is null
  or condition is null
  or listed_median is null
  or low_sale_price is null
  or high_sale_price is null;

alter table public.product_market_price_history
  alter column price_checked_at set default now(),
  alter column price_checked_at set not null;

create index if not exists product_market_price_history_catalog_product_id_idx
  on public.product_market_price_history(catalog_product_id);

create index if not exists product_market_price_history_checked_at_idx
  on public.product_market_price_history(price_checked_at desc);

create index if not exists product_market_price_history_external_product_id_idx
  on public.product_market_price_history(external_product_id);

create index if not exists product_market_price_history_tcgplayer_product_id_idx
  on public.product_market_price_history(tcgplayer_product_id);

create index if not exists product_market_price_history_source_product_day_idx
  on public.product_market_price_history(source, source_product_id, price_subtype, condition, price_checked_at desc);

alter table public.product_market_price_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_market_price_history'
      and policyname = 'Public read Pokemon market price history'
  ) then
    create policy "Public read Pokemon market price history"
      on public.product_market_price_history
      for select
      using (
        exists (
          select 1
          from public.product_catalog pc
          where pc.id = product_market_price_history.catalog_product_id
            and pc.category = 'Pokemon'
        )
        or source = 'TCGCSV'
        or source = 'PokemonTCGAPI'
      );
  end if;
end $$;

create or replace view public.pokemon_catalog_browse
with (security_invoker = true)
as
select
  pc.*,
  case
    when coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 'Sealed'
    when coalesce(pc.product_type, '') ~* '(card)'
      or nullif(trim(coalesce(pc.card_number, '')), '') is not null
      then 'Cards'
    else 'Other'
  end as catalog_group,
  case
    when coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 1
    when coalesce(pc.product_type, '') ~* '(card)'
      or nullif(trim(coalesce(pc.card_number, '')), '') is not null
      then 2
    else 3
  end as catalog_group_sort,
  coalesce(nullif(pc.set_name, ''), nullif(pc.expansion, ''), 'Unknown Set') as set_sort_name,
  coalesce(nullif(pc.card_number_prefix, ''), '') as card_prefix_sort,
  coalesce(pc.card_number_sort, 999999) as card_number_sort_safe,
  case
    when nullif(trim(coalesce(pc.card_number, '')), '') is null
      and pc.card_number_sort is null
      then 1
    else 0
  end as card_number_missing_sort,
  coalesce(history_summary.history_snapshot_count, 0) as history_snapshot_count,
  history_summary.latest_history_snapshot,
  history_summary.history_volatility
from public.product_catalog pc
left join lateral (
  select
    count(*) as history_snapshot_count,
    max(h.price_checked_at) as latest_history_snapshot,
    case
      when count(*) filter (where h.market_price > 0) < 3 then 'Unknown Volatility'
      when (max(h.market_price) filter (where h.market_price > 0) - min(h.market_price) filter (where h.market_price > 0))
        / nullif(avg(h.market_price) filter (where h.market_price > 0), 0) < 0.10 then 'Low Volatility'
      when (max(h.market_price) filter (where h.market_price > 0) - min(h.market_price) filter (where h.market_price > 0))
        / nullif(avg(h.market_price) filter (where h.market_price > 0), 0) <= 0.25 then 'Medium Volatility'
      else 'High Volatility'
    end as history_volatility
  from public.product_market_price_history h
  where h.catalog_product_id = pc.id
    or h.source_product_id = pc.external_product_id
    or h.source_product_id = pc.tcgplayer_product_id
) history_summary on true;

grant select on public.pokemon_catalog_browse to anon, authenticated;

create or replace view public.pokemon_market_history_import_status
with (security_invoker = true)
as
select
  (select count(*) from public.product_market_price_history) as total_price_history_rows,
  (
    select count(distinct coalesce(catalog_product_id::text, tcgplayer_product_id, external_product_id, source_product_id))
    from public.product_market_price_history
  ) as products_with_history,
  (select max(price_checked_at) from public.product_market_price_history) as latest_history_snapshot,
  (
    select count(*)
    from public.product_market_price_current c
    where c.market_price is not null
      and not exists (
        select 1
        from public.product_market_price_history h
        where (h.catalog_product_id is not null and h.catalog_product_id = c.catalog_product_id)
          or (h.source = c.source and h.source_product_id = c.source_product_id)
      )
  ) as products_with_current_price_no_history;

grant select on public.pokemon_market_history_import_status to anon, authenticated;

commit;
