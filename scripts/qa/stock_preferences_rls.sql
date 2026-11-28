-- Run after applying the actual stock_alert_preferences migration, in an
-- isolated CI PostgreSQL service. No production credentials are involved.
\set ON_ERROR_STOP on

-- Verify private-by-default, per-user RLS and basic constraints.
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='stock_alert_preferences'
    and c.relrowsecurity
  ) then raise exception 'stock alert preferences RLS is not enabled'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='stock_alert_preferences'
      and grantee='anon'
  ) then raise exception 'anonymous role should not have table grants'; end if;
end $$;

insert into public.stock_alert_preferences
 (user_id, enabled, retailers, signal_types, time_zone)
values
 ('22222222-2222-4222-8222-222222222222', false,
  array['Costco']::text[], array['available_now']::text[], 'America/New_York');

set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
select set_config('app.session_active','true',false);

insert into public.stock_alert_preferences
 (user_id, retailers, signal_types, time_zone)
values
 ('11111111-1111-4111-8111-111111111111',
  array['Target']::text[], array['available_now']::text[], 'America/New_York');

do $$
begin
  if (select count(*) from public.stock_alert_preferences) <> 1
    then raise exception 'owner RLS read includes other users'; end if;
  if (select enabled from public.stock_alert_preferences) <> false
    then raise exception 'stock alerts must default opted out'; end if;
end $$;

update public.stock_alert_preferences set enabled=true
 where user_id='11111111-1111-4111-8111-111111111111';

do $$
declare count_changed int;
declare blocked boolean;
begin
  if (select enabled from public.stock_alert_preferences) <> true
    then raise exception 'owner update blocked'; end if;

  update public.stock_alert_preferences set enabled=true
   where user_id='22222222-2222-4222-8222-222222222222';
  get diagnostics count_changed = row_count;
  if count_changed<>0 then raise exception 'cross-user update allowed'; end if;

  delete from public.stock_alert_preferences
   where user_id='22222222-2222-4222-8222-222222222222';
  get diagnostics count_changed = row_count;
  if count_changed<>0 then raise exception 'cross-user delete allowed'; end if;

  blocked:=false;
  begin
    insert into public.stock_alert_preferences(user_id)
      values('22222222-2222-4222-8222-222222222222');
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'cross-user insert allowed'; end if;

  blocked:=false;
  begin
    update public.stock_alert_preferences
      set retailers=array['OtherStore']::text[]
      where user_id='11111111-1111-4111-8111-111111111111';
  exception when check_violation then blocked:=true;
  end;
  if not blocked then raise exception 'unapproved retailer not rejected'; end if;
end $$;

-- Revoked sessions must be unable to read or update their own choices.
select set_config('app.session_active','false',false);
do $$
declare count_changed int;
declare blocked boolean:=false;
begin
  if (select count(*) from public.stock_alert_preferences)<>0
    then raise exception 'revoked session can still read own preferences'; end if;
  update public.stock_alert_preferences set enabled=false
    where user_id='11111111-1111-4111-8111-111111111111';
  get diagnostics count_changed = row_count;
  if count_changed<>0 then raise exception 'revoked session can update'; end if;
  begin
    insert into public.stock_alert_preferences(user_id)
      values('11111111-1111-4111-8111-111111111111')
      on conflict(user_id) do update set enabled=excluded.enabled;
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'revoked session can upsert'; end if;
end $$;

-- Anon has no grant and no row visibility.
reset role;
set role anon;
do $$
declare blocked boolean:=false;
begin
  begin
    perform count(*) from public.stock_alert_preferences;
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'anonymous account preferences readable'; end if;
end $$;
reset role;

-- Confirm no test mutated another user's record.
do $$
begin
  if (select enabled from public.stock_alert_preferences
       where user_id='22222222-2222-4222-8222-222222222222') <> false
  then raise exception 'cross-user record changed'; end if;
end $$;
select 'STOCK_ALERT_RLS_STAGING_PASS' as result;
