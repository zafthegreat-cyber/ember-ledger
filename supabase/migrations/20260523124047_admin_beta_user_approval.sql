-- Admin beta user approval.
-- Adds admin-only RPCs for reviewing existing signed-up profile rows and
-- updating the same beta access fields used by the Shoreline access gate.

begin;

create or replace function public.admin_list_beta_access_profiles(search_text text default null)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  full_name text,
  display_name text,
  user_role text,
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
  last_login_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_search text := lower(trim(coalesce(search_text, '')));
begin
  if not public.is_admin_or_moderator() then
    raise exception 'Admin access required';
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
    p.last_login_at
  from public.profiles p
  where normalized_search = ''
    or lower(coalesce(p.email, '')) like '%' || normalized_search || '%'
    or lower(coalesce(p.display_name, '')) like '%' || normalized_search || '%'
    or lower(coalesce(p.full_name, '')) like '%' || normalized_search || '%'
    or lower(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) like '%' || normalized_search || '%'
  order by
    case
      when coalesce(p.app_access, false) is false
        and coalesce(p.beta_access_status, p.beta_status, 'not_requested') in ('not_requested', 'pending', 'waitlist', 'paused')
        then 0
      else 1
    end,
    p.created_at desc nulls last
  limit 250;
end;
$$;

create or replace function public.admin_update_profile_beta_access(
  target_user_id uuid,
  next_status text,
  admin_notes text default null
)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  full_name text,
  display_name text,
  user_role text,
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
  last_login_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_status text := lower(trim(coalesce(next_status, '')));
  profile_email text;
  profile_exists boolean := false;
  normalized_notes text := nullif(trim(coalesce(admin_notes, '')), '');
begin
  if not public.is_admin_or_moderator() then
    raise exception 'Admin access required';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if normalized_status = 'paused' then
    normalized_status := 'waitlist';
  end if;

  if normalized_status not in ('not_requested', 'pending', 'approved', 'waitlist', 'denied') then
    raise exception 'Invalid beta access status';
  end if;

  select true, p.email into profile_exists, profile_email
  from public.profiles p
  where p.id = target_user_id;

  if not coalesce(profile_exists, false) then
    raise exception 'Profile not found';
  end if;

  update public.profiles p
  set beta_status = normalized_status,
      beta_access_status = normalized_status,
      beta_access_requested_at = coalesce(p.beta_access_requested_at, now()),
      beta_access_approved_at = case when normalized_status = 'approved' then coalesce(p.beta_access_approved_at, now()) else null end,
      beta_access_approved_by = case when normalized_status = 'approved' then coalesce(p.beta_access_approved_by, (select auth.uid())) else null end,
      beta_access_notes = normalized_notes,
      app_access = case when normalized_status = 'approved' then true else false end,
      updated_at = now()
  where p.id = target_user_id
    and coalesce(p.user_role, 'user') not in ('admin', 'moderator');

  if not found then
    raise exception 'Admin and moderator access must be managed outside beta approval';
  end if;

  if normalized_notes is not null and to_regclass('public.admin_user_notes') is not null then
    insert into public.admin_user_notes (subject_user_id, subject_email, note, created_by)
    values (target_user_id, profile_email, normalized_notes, (select auth.uid()));
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
    p.last_login_at
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

revoke all on function public.admin_list_beta_access_profiles(text) from public, anon, authenticated;
grant execute on function public.admin_list_beta_access_profiles(text) to authenticated;

revoke all on function public.admin_update_profile_beta_access(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_profile_beta_access(uuid, text, text) to authenticated;

comment on function public.admin_list_beta_access_profiles(text) is 'Admin-only beta access profile review list. Returns limited profile fields for approval workflow.';
comment on function public.admin_update_profile_beta_access(uuid, text, text) is 'Admin-only beta access update. Updates profile beta_status, beta_access_status, app_access, approval metadata, and optional notes.';

commit;
