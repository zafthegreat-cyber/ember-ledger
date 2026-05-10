-- Harden the admin-visibility helper functions after adding the disclosure-aware
-- suggestion policies. These helpers only need caller privileges.

create or replace function public.is_admin()
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select
    lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'tier', '')) = 'founder'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) in ('true', '1', 'yes')
    or exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and user_role = 'admin'
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
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'moderator'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_role', '')) = 'moderator'
    or exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and user_role = 'moderator'
    );
$$;

create or replace function public.suggestion_is_admin_reviewable(
  admin_review_visible boolean,
  admin_visibility_disclosed_at timestamptz,
  visibility text,
  submitted_data jsonb
)
returns boolean
language sql
security invoker
set search_path = public
immutable
as $$
  select
    coalesce(admin_review_visible, false)
    or admin_visibility_disclosed_at is not null
    or coalesce(nullif(visibility, ''), submitted_data ->> 'visibility', '') not in ('private', 'shared_with_team');
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_admin_or_moderator() from public, anon;
revoke execute on function public.suggestion_is_admin_reviewable(boolean, timestamptz, text, jsonb) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin_or_moderator() to authenticated;
grant execute on function public.suggestion_is_admin_reviewable(boolean, timestamptz, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
