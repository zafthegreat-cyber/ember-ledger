-- Restock push alerts (Nov 15, 2026).
--
-- When the Code 3 team confirms a public store report, everyone who watches or
-- favorited that store (except the reporter) gets an in-app notification, and a
-- phone push is queued in push_outbox. The push-dispatch edge function drains
-- the queue every minute (pg_cron) through send-push.
--
-- Not sent when the member turned off in-store report alerts or stock alerts,
-- when they already heard about this store in the last 6 hours, or past 5
-- restock alerts in 24 hours. During quiet hours the in-app notification is
-- still created but no push is queued. Quiet hours are read in the member's
-- quiet_hours->>'timezone', defaulting to America/New_York (no profile time zone yet).

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_ids uuid[] not null check (cardinality(user_ids) between 1 and 500),
  title text not null check (length(title) between 1 and 120),
  body text not null default '' check (length(body) <= 400),
  url text check (url is null or url ~ '^/[A-Za-z0-9/_\-?=&.%]*$'),
  kind text not null default 'restock',
  source_id uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_result text
);
create index if not exists push_outbox_pending_idx on public.push_outbox (created_at) where sent_at is null;
-- Server-only: RLS on with no policies, and no grants to app roles.
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

create or replace function public.code3_in_quiet_hours(p_user_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(bool_or(
    p.quiet_hours_enabled
    and p.quiet_hours_start ~ '^\d{1,2}:\d{2}$' and p.quiet_hours_end ~ '^\d{1,2}:\d{2}$'
    and (
      case when p.quiet_hours_start::time <= p.quiet_hours_end::time
        then (p_at at time zone coalesce(nullif(p.quiet_hours->>'timezone', ''), 'America/New_York'))::time
             between p.quiet_hours_start::time and p.quiet_hours_end::time
        else (p_at at time zone coalesce(nullif(p.quiet_hours->>'timezone', ''), 'America/New_York'))::time >= p.quiet_hours_start::time
          or (p_at at time zone coalesce(nullif(p.quiet_hours->>'timezone', ''), 'America/New_York'))::time <= p.quiet_hours_end::time
      end
    )
  ), false)
  from public.notification_preferences p
  where p.user_id = p_user_id;
$$;

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
     or new.store_id is null then
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
  where w.store_id = new.store_id
    and (w.watched or w.favorite)
    and w.user_id is distinct from new.user_id
    -- Turned off in-store report alerts or stock alerts.
    and not exists (select 1 from public.notification_preferences p
      where p.user_id = w.user_id
        and ((p.alert_type = 'in_store_report' and p.enabled = false) or p.stock_alerts = false))
    -- Already told about this store in the last 6 hours.
    and not exists (select 1 from public.notifications n
      where n.user_id = w.user_id and n.type = 'stock_alert'
        and n.related_entity_type = 'store' and n.related_entity_id = new.store_id
        and n.created_at > now() - interval '6 hours')
    -- Daily cap.
    and (select count(*) from public.notifications n
      where n.user_id = w.user_id and n.type = 'stock_alert'
        and n.created_at > now() - interval '24 hours') < 5;

  if v_recipients is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, channel, title, message, action_url, related_entity_type, related_entity_id)
  select r, 'stock_alert', 'in_app', v_title, v_body, v_url, 'store', new.store_id
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

drop trigger if exists store_reports_queue_restock_alerts on public.store_reports;
create trigger store_reports_queue_restock_alerts
  after insert or update of status on public.store_reports
  for each row execute function public.code3_queue_restock_alerts();

-- Used by push-dispatch (service role) to take up to p_limit queued pushes.
create or replace function public.claim_push_outbox(p_limit integer default 20)
returns setof public.push_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_outbox o
     set claimed_at = now(), attempts = o.attempts + 1
   where o.id in (
     select id from public.push_outbox
      where sent_at is null and attempts < 3
        and (claimed_at is null or claimed_at < now() - interval '5 minutes')
      order by created_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked)
  returning o.*;
$$;

create or replace function public.finish_push_outbox(p_id uuid, p_sent boolean, p_result text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_outbox
     set sent_at = case when p_sent then now() else sent_at end,
         claimed_at = case when p_sent then claimed_at else null end,
         last_result = left(p_result, 200)
   where id = p_id;
$$;

revoke all on function public.code3_queue_restock_alerts() from public, anon, authenticated;
revoke all on function public.code3_in_quiet_hours(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_push_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_push_outbox(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_push_outbox(integer) to service_role;
grant execute on function public.finish_push_outbox(uuid, boolean, text) to service_role;
