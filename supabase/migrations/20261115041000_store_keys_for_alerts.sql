-- Store keys for restock alerts (Nov 15, 2026).
--
-- The app's nationwide store directory is static and uses its own text ids, not
-- rows in public.stores, so watched stores could not be saved to the server and
-- reports carried no store. Watches and reports now also carry store_key (the
-- app's store id), and restock alerts match on store_id or store_key.

alter table public.store_user_watchlist add column if not exists store_key text;
alter table public.store_user_watchlist alter column store_id drop not null;
alter table public.store_user_watchlist drop constraint if exists store_user_watchlist_store_ref_check;
alter table public.store_user_watchlist add constraint store_user_watchlist_store_ref_check
  check ((store_id is not null or store_key is not null)
    and (store_key is null or (length(store_key) between 1 and 160 and store_key !~ '[[:cntrl:]]')));
alter table public.store_user_watchlist drop constraint if exists store_user_watchlist_user_id_store_key_key;
alter table public.store_user_watchlist add constraint store_user_watchlist_user_id_store_key_key unique (user_id, store_key);
create index if not exists store_user_watchlist_store_key_idx on public.store_user_watchlist (store_key) where store_key is not null;

alter table public.store_reports add column if not exists store_key text;
alter table public.store_reports drop constraint if exists store_reports_store_key_check;
alter table public.store_reports add constraint store_reports_store_key_check
  check (store_key is null or (length(store_key) between 1 and 160 and store_key !~ '[[:cntrl:]]'));
create index if not exists store_reports_store_key_idx on public.store_reports (store_key) where store_key is not null;

create or replace function public.code3_queue_restock_alerts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_store_name text;
  v_title text;
  v_body text;
  v_url text := '/find/restocks';
  v_recipients uuid[];
  v_push uuid[];
begin
  if new.status is distinct from 'confirmed'
     or (tg_op = 'UPDATE' and old.status = 'confirmed')
     or coalesce(new.visibility, 'public') <> 'public'
     or new.archived_at is not null
     or (new.store_id is null and new.store_key is null) then
    return new;
  end if;

  select coalesce(nullif(new.store_name, ''), s.name, 'a store you watch')
    into v_store_name
    from (select 1) one left join public.stores s on s.id = new.store_id;
  v_title := left('Restock confirmed: ' || v_store_name, 120);
  v_body := left(coalesce(nullif(new.product_name, ''), 'Pokemon TCG product')
    || ' was confirmed at ' || v_store_name || '. Availability can change quickly.', 400);

  select array_agg(distinct w.user_id) into v_recipients
  from public.store_user_watchlist w
  where ((new.store_id is not null and w.store_id = new.store_id)
      or (new.store_key is not null and w.store_key = new.store_key))
    and (w.watched or w.favorite)
    and w.user_id is distinct from new.user_id
    -- Turned off in-store report alerts or stock alerts.
    and not exists (select 1 from public.notification_preferences p
      where p.user_id = w.user_id
        and ((p.alert_type = 'in_store_report' and p.enabled = false) or p.stock_alerts = false))
    -- Already told about this store in the last 6 hours.
    and not exists (select 1 from public.notifications n
      join public.store_reports r on r.id = n.related_entity_id
      where n.user_id = w.user_id and n.type = 'stock_alert' and n.related_entity_type = 'store_report'
        and ((new.store_id is not null and r.store_id = new.store_id) or (new.store_key is not null and r.store_key = new.store_key))
        and n.created_at > now() - interval '6 hours')
    -- Daily cap.
    and (select count(*) from public.notifications n
      where n.user_id = w.user_id and n.type = 'stock_alert'
        and n.created_at > now() - interval '24 hours') < 5;

  if v_recipients is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, channel, title, message, action_url, related_entity_type, related_entity_id)
  select r, 'stock_alert', 'in_app', v_title, v_body, v_url, 'store_report', new.id
  from unnest(v_recipients) r;

  select array_agg(r) into v_push
  from unnest(v_recipients) r
  where not public.code3_in_quiet_hours(r)
    and exists (select 1 from public.device_push_tokens t where t.user_id = r and t.disabled_at is null);

  if v_push is not null then
    insert into public.push_outbox (user_ids, title, body, url, kind, source_id)
    values (v_push[1:500], v_title, v_body, v_url, 'restock', new.id);
  end if;
  return new;
exception when others then
  -- Alerts must never block confirming a report.
  raise warning 'restock alerts not queued for report %: %', new.id, sqlerrm;
  return new;
end;
$$;
revoke all on function public.code3_queue_restock_alerts() from public, anon, authenticated;
