-- Applied to gxsfququorfczvhrkudl on 2026-11-15 as "alerts_end_to_end_saved_searches"
-- (copied from the live migration history so the repo matches production).
-- SHOULD 17: alerts end to end (in-app). Saved searches move to the account and
-- become an alert subscription list alongside store_user_watchlist.

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (length(btrim(query)) between 1 and 120),
  query_key text not null,
  label text,
  created_at timestamptz not null default now(),
  last_run_at timestamptz not null default now(),
  unique (user_id, query_key)
);
create index if not exists saved_searches_query_key_idx on public.saved_searches (query_key);
alter table public.saved_searches enable row level security;
create policy saved_searches_own on public.saved_searches
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.saved_searches from anon;
grant select, insert, update, delete on public.saved_searches to authenticated;

create or replace function public.code3_saved_search_matches(p_text text)
returns table (user_id uuid, query text)
language sql stable security definer set search_path = ''
as $$
  select s.user_id, s.query
  from public.saved_searches s
  where length(s.query_key) >= 3
    and not exists (
      select 1 from regexp_split_to_table(s.query_key, '\s+') w
      where length(w) > 0 and position(w in lower(coalesce(p_text, ''))) = 0
    );
$$;
revoke all on function public.code3_saved_search_matches(text) from public, anon, authenticated;

create or replace function public.code3_queue_restock_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_store_name text;
  v_product text;
  v_confirmed boolean;
  v_title text;
  v_body text;
  v_url text := '/find/restocks';
  v_recipients uuid[];
  v_search_recipients uuid[];
  v_push uuid[];
begin
  if coalesce(new.visibility, 'public') <> 'public'
     or new.archived_at is not null
     or (tg_op = 'UPDATE' and (old.status = 'confirmed' or new.status is distinct from 'confirmed'))
     or (new.store_id is null and new.store_key is null) then
    return new;
  end if;
  v_confirmed := new.status = 'confirmed';

  select coalesce(nullif(new.store_name, ''), s.name, 'a store you watch')
    into v_store_name
    from (select 1) one left join public.stores s on s.id = new.store_id;
  v_product := coalesce(nullif(new.product_name, ''), 'Pokémon TCG product');
  v_title := left(case when v_confirmed then 'Restock confirmed: ' else 'Restock reported: ' end || v_store_name, 120);
  v_body := left(v_product || case when v_confirmed then ' was confirmed at ' else ' was reported at ' end || v_store_name
    || case when new.report_type in ('no_stock','out_of_stock','empty') then ' (shelf empty).' else '. Availability can change quickly.' end, 400);

  select array_agg(distinct w.user_id) into v_recipients
  from public.store_user_watchlist w
  where ((new.store_id is not null and w.store_id = new.store_id)
      or (new.store_key is not null and w.store_key = new.store_key))
    and (w.watched or w.favorite)
    and w.user_id is distinct from new.user_id
    and not exists (select 1 from public.notification_preferences p
      where p.user_id = w.user_id
        and ((p.alert_type = 'in_store_report' and p.enabled = false) or p.stock_alerts = false))
    and not exists (select 1 from public.notifications n
      join public.store_reports r on r.id = n.related_entity_id
      where n.user_id = w.user_id and n.type = 'stock_alert' and n.related_entity_type = 'store_report'
        and ((new.store_id is not null and r.store_id = new.store_id) or (new.store_key is not null and r.store_key = new.store_key))
        and n.created_at > now() - interval '6 hours'
        and (v_confirmed = false or r.status = 'confirmed'))
    and (select count(*) from public.notifications n
      where n.user_id = w.user_id and n.type = 'stock_alert'
        and n.created_at > now() - interval '24 hours') < 8;

  if v_recipients is not null then
    insert into public.notifications (user_id, type, channel, title, message, action_url, related_entity_type, related_entity_id)
    select r, 'stock_alert', 'in_app', v_title, v_body, v_url, 'store_report', new.id
    from unnest(v_recipients) r;
  end if;

  if nullif(new.product_name, '') is not null or nullif(new.set_name, '') is not null then
    select array_agg(distinct m.user_id) into v_search_recipients
    from public.code3_saved_search_matches(coalesce(new.product_name, '') || ' ' || coalesce(new.set_name, '')) m
    where m.user_id is distinct from new.user_id
      and not (m.user_id = any(coalesce(v_recipients, '{}')))
      and not exists (select 1 from public.notification_preferences p
        where p.user_id = m.user_id and (p.stock_alerts = false or p.wishlist_matches = false))
      and not exists (select 1 from public.notifications n
        where n.user_id = m.user_id and n.type = 'saved_search_match'
          and n.related_entity_type = 'store_report'
          and n.message = v_body
          and n.created_at > now() - interval '12 hours')
      and (select count(*) from public.notifications n
        where n.user_id = m.user_id and n.type = 'saved_search_match'
          and n.created_at > now() - interval '24 hours') < 8;
    if v_search_recipients is not null then
      insert into public.notifications (user_id, type, channel, title, message, action_url, related_entity_type, related_entity_id)
      select r, 'saved_search_match', 'in_app', left('Saved search: ' || v_product, 120), v_body, v_url, 'store_report', new.id
      from unnest(v_search_recipients) r;
    end if;
  end if;

  if v_confirmed then
    select array_agg(r) into v_push
    from unnest(coalesce(v_recipients, '{}') || coalesce(v_search_recipients, '{}')) r
    where not public.code3_in_quiet_hours(r)
      and exists (select 1 from public.device_push_tokens t where t.user_id = r and t.disabled_at is null);
    if v_push is not null then
      insert into public.push_outbox (user_ids, title, body, url, kind, source_id)
      values (v_push[1:500], v_title, v_body, v_url, 'restock', new.id);
    end if;
  end if;
  return new;
exception when others then
  raise warning 'restock alerts not queued for report %: %', new.id, sqlerrm;
  return new;
end;
$$;
revoke all on function public.code3_queue_restock_alerts() from public, anon, authenticated;

create or replace function public.code3_queue_price_drop_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
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
$$;
revoke all on function public.code3_queue_price_drop_alerts() from public, anon, authenticated;

create trigger product_market_price_current_queue_price_drop_alerts
  after update of market_price on public.product_market_price_current
  for each row execute function public.code3_queue_price_drop_alerts();
