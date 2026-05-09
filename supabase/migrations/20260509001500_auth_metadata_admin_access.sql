-- Allow trusted Supabase auth app_metadata to drive admin/moderator RLS checks.
-- raw_app_meta_data is exposed to clients as app_metadata in the authenticated JWT.
-- Users cannot edit app_metadata from the public frontend.

create or replace function public.is_admin_or_moderator()
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) in ('admin', 'moderator')
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_role', '')) in ('admin', 'moderator')
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'tier', '')) = 'founder'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) in ('true', '1', 'yes')
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and user_role in ('admin', 'moderator')
    );
$$;
