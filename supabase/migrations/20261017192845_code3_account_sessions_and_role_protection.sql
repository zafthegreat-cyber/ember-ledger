-- Additive account security. No existing user records or credentials are rewritten.
begin;
create schema if not exists code3_private;
revoke all on schema code3_private from public, anon;
grant usage on schema code3_private to authenticated;

create table code3_private.account_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_session_id uuid not null,
  label text not null check (length(label) between 1 and 80),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique(user_id, provider_session_id)
);
create table code3_private.account_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin_session_id uuid not null,
  purpose text not null check (purpose in ('SESSION_REVOKE','BACKUP_RECOVERY','CLOUD_RESTORE')),
  plan_digest text not null check (plan_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
  grant_hash text,
  verified_at timestamptz,
  used_at timestamptz
);
create table code3_private.account_security_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
alter table code3_private.account_sessions enable row level security;
alter table code3_private.account_confirmations enable row level security;
alter table code3_private.account_security_audit enable row level security;
revoke all on table code3_private.account_sessions, code3_private.account_confirmations, code3_private.account_security_audit from public, anon, authenticated;
create index account_confirmation_owner_idx on code3_private.account_confirmations(user_id, created_at);
create index account_security_audit_owner_idx on code3_private.account_security_audit(user_id, created_at);

create function code3_private.current_session_id()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  sid uuid;
begin
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    or coalesce(to_timestamp((auth.jwt()->>'exp')::double precision), '-infinity'::timestamptz) <= now() then return null; end if;
  begin sid := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then return null; end;
  if sid is null or not exists (
    select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=sid and s.user_id=actor and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
      and (s.not_after is null or s.not_after > now())
  ) or exists (
    select 1 from code3_private.account_sessions s where s.user_id=actor and s.provider_session_id=sid and s.revoked_at is not null
  ) then return null; end if;
  return sid;
end $$;
create function code3_private.require_current_session()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare sid uuid := code3_private.current_session_id();
begin
  if sid is null then raise exception 'A current confirmed sign-in is required.' using errcode='28000'; end if;
  return sid;
end $$;
create function public.code3_current_session_valid()
returns boolean language sql stable security invoker set search_path = '' as $$
  select code3_private.current_session_id() is not null
$$;

-- Legacy SECURITY DEFINER RPCs use these shared authorization helpers. Gate the
-- helpers too, because table RLS alone cannot revoke a definer RPC's authority.
create or replace function public.current_app_role()
returns text language sql stable security invoker set search_path = '' as $$
  select case when auth.uid() is null then 'user'
    when not public.code3_current_session_valid() then 'user'
    else coalesce(
      nullif(public.normalized_app_role(auth.jwt()->'app_metadata'->>'app_role'),'user'),
      nullif(public.normalized_app_role(auth.jwt()->'app_metadata'->>'role'),'user'),
      nullif(public.normalized_app_role(auth.jwt()->'app_metadata'->>'user_role'),'user'),
      (select case when p.app_role in ('owner','admin','moderator','beta_user','user') then p.app_role
        when p.user_role='admin' then 'admin' when p.user_role='moderator' then 'moderator'
        when p.app_access is true then 'beta_user' else 'user' end from public.profiles p where p.id=auth.uid()),'user') end
$$;
create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select case when auth.uid() is null then false when not public.code3_current_session_valid() then false else
    public.current_app_role() in ('owner','admin')
    or lower(coalesce(auth.jwt()->'app_metadata'->>'role',''))='admin'
    or lower(coalesce(auth.jwt()->'app_metadata'->>'user_role',''))='admin'
    or lower(coalesce(auth.jwt()->'app_metadata'->>'tier',''))='founder'
    or lower(coalesce(auth.jwt()->'app_metadata'->>'is_admin','')) in ('true','1','yes')
    or exists(select 1 from public.profiles where id=auth.uid() and (user_role='admin' or app_role in ('owner','admin'))) end
$$;
create or replace function public.is_admin_or_moderator()
returns boolean language sql stable security invoker set search_path = '' as $$
  select case when auth.uid() is null then false when not public.code3_current_session_valid() then false else
    public.is_admin() or public.current_app_role()='moderator'
    or lower(coalesce(auth.jwt()->'app_metadata'->>'role',''))='moderator'
    or lower(coalesce(auth.jwt()->'app_metadata'->>'user_role',''))='moderator'
    or exists(select 1 from public.profiles where id=auth.uid() and (user_role='moderator' or app_role='moderator')) end
$$;
create or replace function public.is_owner_or_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.current_app_role() in ('owner','admin') or public.is_admin()
$$;
create function code3_private.has_full_app_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then false when not public.code3_current_session_valid() then false else exists(
    select 1 from public.profiles p where p.id=auth.uid() and (p.app_access is true or p.beta_status='approved'
      or p.beta_access_status='approved' or p.user_role in ('admin','moderator') or public.is_admin_or_moderator())) end
$$;
create or replace function public.has_full_app_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select case when auth.uid() is null then false else code3_private.has_full_app_access() end
$$;

create function code3_private.register_account_session(device_label text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid := code3_private.require_current_session(); row_data code3_private.account_sessions;
begin
  if device_label is null or length(trim(device_label)) not between 1 and 80 or device_label ~ '[[:cntrl:]]' then raise exception 'Use a device name of 1–80 readable characters.'; end if;
  insert into code3_private.account_sessions(user_id,provider_session_id,label,expires_at)
  values(auth.uid(),sid,trim(device_label),to_timestamp((auth.jwt()->>'exp')::double precision))
  on conflict(user_id,provider_session_id) do update set last_seen_at=now(),expires_at=excluded.expires_at
  returning * into row_data;
  return jsonb_build_object('id',row_data.id,'label',row_data.label,'current',true);
end $$;
create function public.code3_register_account_session(device_label text)
returns jsonb language sql security invoker set search_path = '' as $$ select code3_private.register_account_session(device_label) $$;

create function code3_private.list_account_sessions()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid := code3_private.require_current_session(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.label,'current',s.provider_session_id=sid,
    'firstSeenAt',s.first_seen_at,'lastSeenAt',s.last_seen_at,'expiresAt',s.expires_at,'revokedAt',s.revoked_at,
    'signedOut',not exists(select 1 from auth.sessions a where a.id=s.provider_session_id and a.user_id=auth.uid())) order by s.last_seen_at desc),'[]'::jsonb)
  into result from code3_private.account_sessions s where s.user_id=auth.uid();
  return result;
end $$;
create function public.code3_list_account_sessions()
returns jsonb language sql security invoker set search_path = '' as $$ select code3_private.list_account_sessions() $$;

create function code3_private.prepare_account_confirmation(operation_purpose text, operation_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid := code3_private.require_current_session(); challenge code3_private.account_confirmations;
begin
  if operation_purpose not in ('SESSION_REVOKE','BACKUP_RECOVERY','CLOUD_RESTORE') or operation_digest !~ '^[a-f0-9]{64}$' then raise exception 'A supported operation and exact preview are required.'; end if;
  if (select count(*) from code3_private.account_confirmations where user_id=auth.uid() and created_at > now()-interval '5 minutes') >= 20 then raise exception 'Too many confirmation attempts. Please wait a few minutes.'; end if;
  insert into code3_private.account_confirmations(user_id,origin_session_id,purpose,plan_digest)
  values(auth.uid(),sid,operation_purpose,operation_digest) returning * into challenge;
  return jsonb_build_object('challengeId',challenge.id,'expiresAt',challenge.expires_at);
end $$;
create function public.code3_prepare_account_confirmation(operation_purpose text, operation_digest text)
returns jsonb language sql security invoker set search_path = '' as $$ select code3_private.prepare_account_confirmation(operation_purpose,operation_digest) $$;

create function code3_private.complete_account_confirmation(challenge_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid := code3_private.require_current_session(); challenge code3_private.account_confirmations; grant_token text;
begin
  select * into challenge from code3_private.account_confirmations where id=challenge_id and user_id=auth.uid() for update;
  if not found or challenge.used_at is not null or challenge.grant_hash is not null or challenge.expires_at <= clock_timestamp()
    or sid=challenge.origin_session_id then raise exception 'Complete a new password confirmation for this operation.' using errcode='28000'; end if;
  if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
    where a->>'method'='password' and (a->>'timestamp')::double precision >= floor(extract(epoch from challenge.created_at))
      and to_timestamp((a->>'timestamp')::double precision) between clock_timestamp()-interval '2 minutes' and clock_timestamp()+interval '5 seconds') then
    raise exception 'Fresh password confirmation is required; refreshing a session is insufficient.' using errcode='28000';
  end if;
  if not exists(select 1 from auth.sessions where id=challenge.origin_session_id and user_id=auth.uid() and (not_after is null or not_after>now()))
    or exists(select 1 from code3_private.account_sessions where user_id=auth.uid() and provider_session_id=challenge.origin_session_id and revoked_at is not null) then
    raise exception 'The original sign-in is no longer active.' using errcode='28000';
  end if;
  grant_token := gen_random_uuid()::text || gen_random_uuid()::text;
  update code3_private.account_confirmations set grant_hash=encode(sha256(convert_to(grant_token,'UTF8')),'hex'),verified_at=clock_timestamp() where id=challenge.id;
  insert into code3_private.account_security_audit(user_id,action,target_id) values(auth.uid(),'CONFIRMATION_VERIFIED',challenge.id);
  return jsonb_build_object('challengeId',challenge.id,'grant',grant_token,'purpose',challenge.purpose,'planDigest',challenge.plan_digest);
end $$;
create function public.code3_complete_account_confirmation(challenge_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select code3_private.complete_account_confirmation(challenge_id) $$;

create function code3_private.consume_account_confirmation(challenge_id uuid, confirmation_token text, operation_purpose text, operation_digest text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare sid uuid := code3_private.require_current_session(); challenge code3_private.account_confirmations;
begin
  select * into challenge from code3_private.account_confirmations where id=challenge_id and user_id=auth.uid() for update;
  if not found or confirmation_token is null or length(confirmation_token)<>72 or challenge.used_at is not null
    or challenge.verified_at is null or challenge.expires_at<=clock_timestamp() or challenge.origin_session_id<>sid
    or challenge.purpose is distinct from operation_purpose or challenge.plan_digest is distinct from operation_digest
    or challenge.grant_hash is distinct from encode(sha256(convert_to(confirmation_token,'UTF8')),'hex') then
    raise exception 'This confirmation is expired, used, or belongs to a different operation.' using errcode='28000';
  end if;
  update code3_private.account_confirmations set used_at=clock_timestamp() where id=challenge.id;
  insert into code3_private.account_security_audit(user_id,action,target_id) values(auth.uid(),'CONFIRMATION_USED',challenge.id);
  return true;
end $$;
create function public.code3_consume_account_confirmation(challenge_id uuid, confirmation_token text, operation_purpose text, operation_digest text)
returns boolean language sql security invoker set search_path = '' as $$ select code3_private.consume_account_confirmation(challenge_id,confirmation_token,operation_purpose,operation_digest) $$;

create function code3_private.revoke_account_session(target_id uuid, challenge_id uuid, confirmation_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare sid uuid := code3_private.require_current_session(); digest text;
begin
  if not exists(select 1 from code3_private.account_sessions where id=target_id and user_id=auth.uid()) then raise exception 'Device not found.'; end if;
  digest := encode(sha256(convert_to('{"action":"REVOKE_APP_SESSION","targetSessionId":"' || target_id::text || '"}','UTF8')),'hex');
  perform code3_private.consume_account_confirmation(challenge_id,confirmation_token,'SESSION_REVOKE',digest);
  update code3_private.account_sessions set revoked_at=clock_timestamp() where id=target_id and user_id=auth.uid();
  insert into code3_private.account_security_audit(user_id,action,target_id) values(auth.uid(),'SESSION_REVOKED',target_id);
  return true;
end $$;
create function public.code3_revoke_account_session(target_id uuid, challenge_id uuid, confirmation_token text)
returns boolean language sql security invoker set search_path = '' as $$ select code3_private.revoke_account_session(target_id,challenge_id,confirmation_token) $$;

-- Existing admin RPCs retain their role checks. User-entered profile fields
-- cannot mint privileged roles or a paid plan, including on first insertion.
create function code3_private.protect_profile_authority()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); trusted boolean := coalesce(auth.jwt()->>'role','')='service_role'; actor_role text;
begin
  if trusted then return new; end if;
  if tg_op='INSERT' then
    if coalesce(new.app_role,'user')<>'user' or coalesce(new.user_role,'user')<>'user'
      or coalesce(new.tier,'free')<>'free' or coalesce(new.plan_tier,'free')<>'free'
      or coalesce(new.app_access,false) or coalesce(new.beta_status,'not_requested') not in ('not_requested','pending','pending_review','requested','waitlisted')
      or coalesce(new.beta_access_status,'not_requested') not in ('not_requested','pending','pending_review','requested','waitlisted') then
      raise exception 'New profiles require the default role and access status.' using errcode='42501';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id then raise exception 'Profile ownership cannot be changed.' using errcode='42501'; end if;
  if new.tier is distinct from old.tier or new.plan_tier is distinct from old.plan_tier then
    raise exception 'Plan access can only be changed by the trusted billing service.' using errcode='42501';
  end if;
  if new.app_role is distinct from old.app_role or new.user_role is distinct from old.user_role then
    actor_role := coalesce(public.current_app_role(),'user');
    if actor is null or actor=old.id or actor_role not in ('owner','admin')
      or (actor_role<>'owner' and (new.app_role in ('owner','admin') or new.user_role in ('owner','admin') or old.app_role in ('owner','admin') or old.user_role in ('owner','admin'))) then
      raise exception 'Only an authorized administrator can change another account role.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
alter table public.profiles alter column beta_access_status set default 'not_requested';
create trigger code3_profile_authority before insert or update on public.profiles for each row execute function code3_private.protect_profile_authority();
-- The previous trigger rejected even approved admin RPC changes to user_role.
-- The new guard above handles role/plan authority for both INSERT and UPDATE.
create or replace function public.prevent_profile_role_tier_self_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at:=now(); return new; end $$;

-- Add session validity as an AND condition; retain every existing ownership and
-- workspace-membership policy. Catalogs, prices, and public store data are untouched.
do $$ declare target_table text; begin
  foreach target_table in array array[
    'profiles','user_profiles','app_user_preferences','user_inventory','inventory_items','store_user_watchlist','saved_listings',
    'business_expenses','sales_records','mileage_trips','vehicles','receipt_records','receipt_line_items',
    'deal_finder_sessions','deal_finder_items','scanner_intake_sessions','marketplace_listing_channels',
    'notification_preferences','notifications','kid_community_projects','kid_community_project_items',
    'ai_assist_events','app_error_logs','app_activity_events','audit_logs',
    'workspaces','workspace_members','workspace_memberships','workspace_invites',
    'beta_access_requests','little_sparks_applications','kids_program_applications','data_requests','beta_feedback',
    'admin_review_log','admin_user_notes','beta_admin_notes','role_audit_log',
    'code3_records','code3_record_links','code3_file_assets','code3_audit_events'
  ] loop
    if to_regclass(format('public.%I',target_table)) is not null then
      execute format('alter table public.%I enable row level security',target_table);
      execute format('create policy code3_active_account_session on public.%I as restrictive for all to authenticated using ((select public.code3_current_session_valid())) with check ((select public.code3_current_session_valid()))',target_table);
    end if;
  end loop;
end $$;

-- Legacy receipts keep their existing public URLs. Only their owner may mutate
-- them; new private uploads also require an active session under existing policies.
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute $policy$create policy code3_private_storage_session on storage.objects as restrictive for all to authenticated
      using (bucket_id not in ('receipts','receipt-images','product-submissions','feedback-screenshots') or (select public.code3_current_session_valid()))
      with check (bucket_id not in ('receipts','receipt-images','product-submissions','feedback-screenshots') or (select public.code3_current_session_valid()))$policy$;
    execute $policy$create policy code3_receipts_owner_insert on storage.objects as restrictive for insert to authenticated
      with check (bucket_id<>'receipts' or coalesce(owner_id,owner::text)=(select auth.uid())::text)$policy$;
    execute $policy$create policy code3_receipts_owner_update on storage.objects as restrictive for update to authenticated
      using (bucket_id<>'receipts' or coalesce(owner_id,owner::text)=(select auth.uid())::text)
      with check (bucket_id<>'receipts' or coalesce(owner_id,owner::text)=(select auth.uid())::text)$policy$;
    execute $policy$create policy code3_receipts_owner_delete on storage.objects as restrictive for delete to authenticated
      using (bucket_id<>'receipts' or coalesce(owner_id,owner::text)=(select auth.uid())::text)$policy$;
  end if;
end $$;

revoke all on function code3_private.current_session_id(), code3_private.require_current_session(),
  code3_private.register_account_session(text), code3_private.list_account_sessions(),
  code3_private.prepare_account_confirmation(text,text), code3_private.complete_account_confirmation(uuid),
  code3_private.consume_account_confirmation(uuid,text,text,text), code3_private.revoke_account_session(uuid,uuid,text),
  code3_private.protect_profile_authority(), code3_private.has_full_app_access() from public, anon, authenticated;
grant execute on function code3_private.current_session_id(), code3_private.require_current_session(),
  code3_private.register_account_session(text), code3_private.list_account_sessions(),
  code3_private.prepare_account_confirmation(text,text), code3_private.complete_account_confirmation(uuid),
  code3_private.consume_account_confirmation(uuid,text,text,text), code3_private.revoke_account_session(uuid,uuid,text), code3_private.has_full_app_access() to authenticated;
revoke all on function public.code3_current_session_valid(), public.code3_register_account_session(text), public.code3_list_account_sessions(),
  public.code3_prepare_account_confirmation(text,text), public.code3_complete_account_confirmation(uuid),
  public.code3_consume_account_confirmation(uuid,text,text,text), public.code3_revoke_account_session(uuid,uuid,text) from public, anon;
grant execute on function public.code3_current_session_valid(), public.code3_register_account_session(text), public.code3_list_account_sessions(),
  public.code3_prepare_account_confirmation(text,text), public.code3_complete_account_confirmation(uuid),
  public.code3_consume_account_confirmation(uuid,text,text,text), public.code3_revoke_account_session(uuid,uuid,text) to authenticated;
commit;
