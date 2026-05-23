-- Admin-only role management.
-- Adds a normalized profiles.app_role field, role audit log, and secure RPCs
-- for owner/admin role changes without exposing the user list to normal users.

begin;

alter table if exists public.profiles
  add column if not exists app_role text not null default 'user';

alter table if exists public.profiles
  drop constraint if exists profiles_app_role_check,
  add constraint profiles_app_role_check
    check (app_role in ('owner', 'admin', 'moderator', 'beta_user', 'user'));

update public.profiles
set app_role = case
  when app_role in ('owner', 'admin', 'moderator', 'beta_user', 'user') then app_role
  when coalesce(user_role, 'user') = 'admin' then 'admin'
  when coalesce(user_role, 'user') = 'moderator' then 'moderator'
  when coalesce(app_access, false) is true then 'beta_user'
  else 'user'
end;

update public.profiles
set app_role = case
  when coalesce(user_role, 'user') = 'admin' and app_role = 'user' then 'admin'
  when coalesce(user_role, 'user') = 'moderator' and app_role = 'user' then 'moderator'
  when coalesce(app_access, false) is true and app_role = 'user' then 'beta_user'
  else app_role
end;

create index if not exists profiles_app_role_idx on public.profiles(app_role, created_at desc);

create table if not exists public.role_audit_log (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_email text,
  changed_by uuid not null references auth.users(id) on delete cascade,
  changed_by_email text,
  old_role text not null,
  new_role text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint role_audit_log_old_role_check check (old_role in ('owner', 'admin', 'moderator', 'beta_user', 'user')),
  constraint role_audit_log_new_role_check check (new_role in ('owner', 'admin', 'moderator', 'beta_user', 'user'))
);

create index if not exists role_audit_log_target_created_idx
  on public.role_audit_log(target_user_id, created_at desc);

create index if not exists role_audit_log_changed_by_created_idx
  on public.role_audit_log(changed_by, created_at desc);

alter table public.role_audit_log enable row level security;
revoke all on table public.role_audit_log from public, anon;
grant select on table public.role_audit_log to authenticated;

create or replace function public.normalized_app_role(raw_role text)
returns text
language sql
stable
as $$
  select case lower(replace(trim(coalesce(raw_role, 'user')), '-', '_'))
    when 'owner' then 'owner'
    when 'super_admin' then 'owner'
    when 'founder' then 'owner'
    when 'admin' then 'admin'
    when 'moderator' then 'moderator'
    when 'beta' then 'beta_user'
    when 'beta_tester' then 'beta_user'
    when 'beta_user' then 'beta_user'
    else 'user'
  end
$$;

create or replace function public.current_app_role()
returns text
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(
    nullif(public.normalized_app_role(auth.jwt() -> 'app_metadata' ->> 'app_role'), 'user'),
    nullif(public.normalized_app_role(auth.jwt() -> 'app_metadata' ->> 'role'), 'user'),
    nullif(public.normalized_app_role(auth.jwt() -> 'app_metadata' ->> 'user_role'), 'user'),
    (
      select case
        when p.app_role in ('owner', 'admin', 'moderator', 'beta_user', 'user') then p.app_role
        when p.user_role = 'admin' then 'admin'
        when p.user_role = 'moderator' then 'moderator'
        when coalesce(p.app_access, false) is true then 'beta_user'
        else 'user'
      end
      from public.profiles p
      where p.id = (select auth.uid())
    ),
    'user'
  )
$$;

create or replace function public.is_owner()
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select public.current_app_role() = 'owner'
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select public.current_app_role() in ('owner', 'admin')
    or public.is_admin()
$$;

create or replace function public.is_admin()
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select
    public.current_app_role() in ('owner', 'admin')
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'tier', '')) = 'founder'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) in ('true', '1', 'yes')
    or exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and (user_role = 'admin' or app_role in ('owner', 'admin'))
    );
$$;

create or replace function public.is_admin_or_moderator()
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select
    public.is_admin()
    or public.current_app_role() = 'moderator'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'moderator'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_role', '')) = 'moderator'
    or exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and (user_role = 'moderator' or app_role = 'moderator')
    );
$$;

drop policy if exists "Admins read role audit log" on public.role_audit_log;
create policy "Admins read role audit log"
  on public.role_audit_log
  for select
  to authenticated
  using (public.is_owner_or_admin());

create or replace function public.admin_list_users_for_roles(search_text text default null)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  full_name text,
  display_name text,
  user_role text,
  app_role text,
  tier text,
  plan_tier text,
  beta_status text,
  beta_access_status text,
  app_access boolean,
  beta_access_requested_at timestamptz,
  beta_access_approved_at timestamptz,
  beta_access_approved_by uuid,
  beta_access_notes text,
  little_sparks_status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_login_at timestamptz,
  protected_official_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_search text := lower(trim(coalesce(search_text, '')));
begin
  if not public.is_owner_or_admin() then
    raise exception 'Owner or admin access required';
  end if;

  return query
  select
    p.id as user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.full_name,
    p.display_name,
    p.user_role,
    case
      when p.app_role in ('owner', 'admin', 'moderator', 'beta_user', 'user') then p.app_role
      when p.user_role = 'admin' then 'admin'
      when p.user_role = 'moderator' then 'moderator'
      when coalesce(p.app_access, false) is true then 'beta_user'
      else 'user'
    end as app_role,
    p.tier,
    p.plan_tier,
    p.beta_status,
    p.beta_access_status,
    p.app_access,
    p.beta_access_requested_at,
    p.beta_access_approved_at,
    p.beta_access_approved_by,
    p.beta_access_notes,
    p.little_sparks_status,
    p.created_at,
    p.updated_at,
    p.last_login_at,
    (
      p.user_role = 'admin'
      or p.app_role in ('owner', 'admin')
    ) as protected_official_admin
  from public.profiles p
  where normalized_search = ''
    or lower(coalesce(p.email, '')) like '%' || normalized_search || '%'
    or lower(coalesce(p.display_name, '')) like '%' || normalized_search || '%'
    or lower(coalesce(p.full_name, '')) like '%' || normalized_search || '%'
    or lower(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) like '%' || normalized_search || '%'
  order by
    case
      when p.app_role in ('owner', 'admin') or p.user_role = 'admin' then 0
      when p.app_role = 'moderator' or p.user_role = 'moderator' then 1
      when p.app_role = 'beta_user' then 2
      else 3
    end,
    p.created_at desc nulls last
  limit 250;
end;
$$;

create or replace function public.admin_update_user_role(
  target_user_id uuid,
  new_role text,
  reason text default null
)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  full_name text,
  display_name text,
  user_role text,
  app_role text,
  tier text,
  plan_tier text,
  beta_status text,
  beta_access_status text,
  app_access boolean,
  beta_access_requested_at timestamptz,
  beta_access_approved_at timestamptz,
  beta_access_approved_by uuid,
  beta_access_notes text,
  little_sparks_status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_login_at timestamptz,
  protected_official_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text := public.current_app_role();
  normalized_new_role text := public.normalized_app_role(new_role);
  old_profile public.profiles%rowtype;
  old_app_role text;
  next_user_role text;
  active_owner_admin_count integer;
  normalized_reason text := nullif(trim(coalesce(reason, '')), '');
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_owner_or_admin() then
    raise exception 'Owner or admin access required';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if target_user_id = actor_id then
    raise exception 'You cannot change your own role';
  end if;

  if normalized_new_role not in ('owner', 'admin', 'moderator', 'beta_user', 'user') then
    raise exception 'Invalid role';
  end if;

  select * into old_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  old_app_role := case
    when old_profile.app_role in ('owner', 'admin', 'moderator', 'beta_user', 'user') then old_profile.app_role
    when old_profile.user_role = 'admin' then 'admin'
    when old_profile.user_role = 'moderator' then 'moderator'
    when coalesce(old_profile.app_access, false) is true then 'beta_user'
    else 'user'
  end;

  if actor_role <> 'owner' and normalized_new_role in ('owner', 'admin') then
    raise exception 'Only owners can assign owner or admin roles';
  end if;

  if actor_role <> 'owner' and old_app_role in ('owner', 'admin') then
    raise exception 'Owner confirmation is required to change owner or admin users';
  end if;

  if old_app_role in ('owner', 'admin') and normalized_new_role not in ('owner', 'admin') then
    select count(*) into active_owner_admin_count
    from public.profiles
    where id <> target_user_id
      and (
        app_role in ('owner', 'admin')
        or user_role = 'admin'
      );

    if coalesce(active_owner_admin_count, 0) < 1 then
      raise exception 'Cannot downgrade the last owner/admin';
    end if;
  end if;

  next_user_role := case
    when normalized_new_role in ('owner', 'admin') then 'admin'
    when normalized_new_role = 'moderator' then 'moderator'
    else 'user'
  end;

  update public.profiles p
  set app_role = normalized_new_role,
      user_role = next_user_role,
      beta_status = case when normalized_new_role in ('owner', 'admin', 'moderator', 'beta_user') then 'approved' else 'not_requested' end,
      beta_access_status = case when normalized_new_role in ('owner', 'admin', 'moderator', 'beta_user') then 'approved' else 'not_requested' end,
      beta_access_approved_at = case when normalized_new_role in ('owner', 'admin', 'moderator', 'beta_user') then coalesce(p.beta_access_approved_at, now()) else null end,
      beta_access_approved_by = case when normalized_new_role in ('owner', 'admin', 'moderator', 'beta_user') then coalesce(p.beta_access_approved_by, actor_id) else null end,
      app_access = normalized_new_role in ('owner', 'admin', 'moderator', 'beta_user'),
      updated_at = now()
  where p.id = target_user_id;

  insert into public.role_audit_log (
    target_user_id,
    target_email,
    changed_by,
    changed_by_email,
    old_role,
    new_role,
    reason
  )
  values (
    target_user_id,
    old_profile.email,
    actor_id,
    (select email from public.profiles where id = actor_id),
    old_app_role,
    normalized_new_role,
    normalized_reason
  );

  return query
  select *
  from public.admin_list_users_for_roles(old_profile.email);
end;
$$;

revoke all on function public.normalized_app_role(text) from public, anon, authenticated;
grant execute on function public.normalized_app_role(text) to authenticated;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.is_owner_or_admin() from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_owner_or_admin() to authenticated;

revoke all on function public.admin_list_users_for_roles(text) from public, anon, authenticated;
grant execute on function public.admin_list_users_for_roles(text) to authenticated;

revoke all on function public.admin_update_user_role(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_user_role(uuid, text, text) to authenticated;

comment on column public.profiles.app_role is 'App-level role for Ember & Tide: owner, admin, moderator, beta_user, or user.';
comment on table public.role_audit_log is 'Admin-only audit trail for profile app role changes.';
comment on function public.admin_list_users_for_roles(text) is 'Owner/admin-only user list for Role Management. Returns limited profile fields and never private Vault/Forge data.';
comment on function public.admin_update_user_role(uuid, text, text) is 'Owner/admin-only role update with self-change, owner/admin, last-admin, and audit-log protections.';

notify pgrst, 'reload schema';

commit;
