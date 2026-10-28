-- Server-only monitor state. No app account, member list, private report, or
-- retailer response body is stored or exposed to the client.
create schema if not exists code3_alerts;
revoke all on schema code3_alerts from public, anon, authenticated;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table code3_alerts.monitor (
  id boolean primary key default true check (id),
  lease uuid, lease_until timestamptz,
  last_finished_at timestamptz, checked integer not null default 0,
  sent integer not null default 0, errors integer not null default 0
);
insert into code3_alerts.monitor (id) values (true);
create table code3_alerts.products (
  game text not null check (game in ('pokemon','onepiece','magic','lorcana')),
  sku text not null check (sku ~ '^[0-9]{4,12}$'),
  available boolean not null, version integer not null default 0,
  last_seen_at timestamptz not null default now(), primary key (game, sku)
);
create table code3_alerts.deliveries (
  event_key text primary key, game text, sku text,
  observed_at timestamptz not null default now(),
  status text not null check (status in ('queued','sending','delivered','uncertain','expired')),
  message_id text, purged_at timestamptz
);
create index code3_alerts_deliveries_pending on code3_alerts.deliveries (observed_at) where status='queued';
create index code3_alerts_deliveries_cleanup on code3_alerts.deliveries (observed_at) where message_id is not null and purged_at is null;
alter table code3_alerts.monitor enable row level security;
alter table code3_alerts.products enable row level security;
alter table code3_alerts.deliveries enable row level security;
revoke all on all tables in schema code3_alerts from public, anon, authenticated;

-- The scheduler's shared secret stays encrypted in Vault. It is neither a
-- public/anon key nor a key embedded in the cron command or function source.
do $$ begin
  if not exists (select 1 from vault.secrets where name='code3_discord_cron_secret') then
    perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'code3_discord_cron_secret');
  end if;
end $$;

create function public.code3_discord_authorize(p_secret text) returns boolean
language sql security definer set search_path='' as $$
  select length(p_secret) between 32 and 200 and exists (
    select 1 from vault.decrypted_secrets where name='code3_discord_cron_secret' and decrypted_secret=p_secret
  );
$$;
create function public.code3_discord_acquire() returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
  update code3_alerts.monitor set lease=gen_random_uuid(), lease_until=now()+interval '3 minutes'
  where id and (lease_until is null or lease_until < now()) returning lease into token;
  if token is not null then
    -- A crashed request may have posted successfully: never automatically replay it.
    update code3_alerts.deliveries set status='uncertain' where status='sending';
    update code3_alerts.deliveries set status='expired' where status='queued' and observed_at < now()-interval '10 minutes';
    delete from code3_alerts.products where last_seen_at < now()-interval '30 days';
    delete from code3_alerts.deliveries where observed_at < now()-interval '30 days' and (message_id is null or purged_at is not null);
  end if;
  return token;
end $$;
create function code3_alerts.require_lease(p_lease uuid) returns void
language plpgsql set search_path='' as $$ begin
  if not exists (select 1 from code3_alerts.monitor where id and lease=p_lease and lease_until>now()) then
    raise exception 'Monitor lease is not active';
  end if;
end $$;
create function public.code3_discord_observe(p_lease uuid,p_game text,p_products jsonb)
returns table(event_key text,sku text)
language plpgsql security definer set search_path='' as $$
declare item jsonb; previous code3_alerts.products; n integer;
begin
  perform code3_alerts.require_lease(p_lease);
  if p_game not in ('pokemon','onepiece','magic','lorcana') or jsonb_typeof(p_products)<>'array' or jsonb_array_length(p_products)>500 then raise exception 'Invalid snapshot'; end if;
  for item in select value from jsonb_array_elements(p_products) loop
    if (item->>'sku') !~ '^[0-9]{4,12}$' or jsonb_typeof(item->'available')<>'boolean' then raise exception 'Invalid product'; end if;
    select p.* into previous from code3_alerts.products p where p.game=p_game and p.sku=item->>'sku' for update;
    if not found then
      -- Each newly discovered SKU establishes a quiet baseline, even if available.
      insert into code3_alerts.products (game,sku,available) values(p_game,item->>'sku',(item->>'available')::boolean);
    else
      n:=previous.version + case when not previous.available and (item->>'available')::boolean then 1 else 0 end;
      update code3_alerts.products p set available=(item->>'available')::boolean,version=n,last_seen_at=now() where p.game=p_game and p.sku=item->>'sku';
      if n>previous.version then
        insert into code3_alerts.deliveries (event_key,game,sku,status)
        values('bestbuy-'||p_game||'-'||(item->>'sku')||'-'||n::text,p_game,item->>'sku','queued') on conflict do nothing;
      end if;
    end if;
  end loop;
  -- A more recent out-of-stock observation cancels a queued alert.
  update code3_alerts.deliveries d set status='expired' from code3_alerts.products p
    where d.game=p.game and d.sku=p.sku and d.status='queued' and not p.available;
  return query select d.event_key,d.sku from code3_alerts.deliveries d
    where d.game=p_game and d.status='queued' and d.observed_at>=now()-interval '10 minutes' order by d.observed_at limit 10;
end $$;
create function public.code3_discord_claim(p_lease uuid,p_event text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform code3_alerts.require_lease(p_lease);
  update code3_alerts.deliveries set status='sending' where event_key=p_event and status='queued' and observed_at>=now()-interval '10 minutes';
  return found;
end $$;
create function public.code3_discord_complete(p_lease uuid,p_event text,p_message text) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform code3_alerts.require_lease(p_lease);
  if p_message !~ '^[0-9]{17,20}$' then raise exception 'Invalid receipt'; end if;
  update code3_alerts.deliveries set status='delivered',message_id=p_message where event_key=p_event and status='sending';
  if not found then raise exception 'Delivery claim missing'; end if;
end $$;
create function public.code3_discord_uncertain(p_lease uuid,p_event text) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform code3_alerts.require_lease(p_lease);
  update code3_alerts.deliveries set status='uncertain' where event_key=p_event and status='sending';
end $$;
create function public.code3_discord_release(p_lease uuid,p_checked integer,p_sent integer,p_errors integer) returns void
language sql security definer set search_path='' as $$
  update code3_alerts.monitor set lease_until=null,lease=null,last_finished_at=now(),checked=p_checked,sent=p_sent,errors=p_errors where id and lease=p_lease;
$$;
create function public.code3_discord_cleanup_list(p_lease uuid) returns table(event_key text,message_id text)
language plpgsql security definer set search_path='' as $$ begin
  perform code3_alerts.require_lease(p_lease);
  return query select d.event_key,d.message_id from code3_alerts.deliveries d where d.message_id is not null and d.purged_at is null and d.observed_at<now()-interval '24 hours' order by d.observed_at limit 10;
end $$;
create function public.code3_discord_cleaned(p_lease uuid,p_event text) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform code3_alerts.require_lease(p_lease);
  update code3_alerts.deliveries set purged_at=now() where event_key=p_event;
end $$;
create function public.code3_discord_claim_test(p_event text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
  if p_event <> 'hosted-test-20261024' then raise exception 'Unapproved test'; end if;
  insert into code3_alerts.deliveries (event_key,status) values(p_event,'sending') on conflict do nothing;
  return found;
end $$;
create function public.code3_discord_complete_test(p_event text,p_message text) returns void
language plpgsql security definer set search_path='' as $$ begin
  if p_event <> 'hosted-test-20261024' or p_message !~ '^[0-9]{17,20}$' then raise exception 'Unapproved test receipt'; end if;
  update code3_alerts.deliveries set status='delivered',message_id=p_message where event_key=p_event and status='sending';
end $$;

-- Every public RPC is callable only by the server-side service role.
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'code3_discord_%' loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
revoke all on all functions in schema code3_alerts from public, anon, authenticated;

create function code3_alerts.invoke_monitor(p_mode text default 'poll') returns bigint
language plpgsql set search_path='' as $$ declare request_id bigint; begin
  if p_mode not in ('poll','test') then raise exception 'Invalid invocation'; end if;
  select net.http_post(
    url:='https://gxsfququorfczvhrkudl.supabase.co/functions/v1/code3-retailer-alerts',
    headers:=jsonb_build_object('Content-Type','application/json','x-code3-monitor-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='code3_discord_cron_secret')),
    body:=jsonb_build_object('mode',p_mode),timeout_milliseconds:=120000
  ) into request_id;
  return request_id;
end $$;
revoke all on function code3_alerts.invoke_monitor(text) from public, anon, authenticated;

-- Install paused. Enable only after credentials, role permissions and a complete
-- live retailer poll have passed. The command never contains a credential.
select cron.schedule('code3-bestbuy-discord','*/5 * * * *','select code3_alerts.invoke_monitor();');
select cron.alter_job((select jobid from cron.job where jobname='code3-bestbuy-discord'),active:=false);
