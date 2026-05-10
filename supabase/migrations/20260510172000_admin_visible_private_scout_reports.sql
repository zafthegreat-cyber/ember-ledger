-- Make private Scout/store-intelligence submissions transparent: private means
-- hidden from other users, while newly disclosed rows can still be reviewed by admins.

create or replace function public.is_admin()
returns boolean
language sql
security definer
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
security definer
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
immutable
as $$
  select
    coalesce(admin_review_visible, false)
    or admin_visibility_disclosed_at is not null
    or coalesce(nullif(visibility, ''), submitted_data ->> 'visibility', '') not in ('private', 'shared_with_team');
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin_or_moderator() to authenticated;
grant execute on function public.suggestion_is_admin_reviewable(boolean, timestamptz, text, jsonb) to authenticated;

do $$
declare
  suggestion_table text;
begin
  foreach suggestion_table in array array[
    'user_suggestions',
    'store_suggestions',
    'catalog_suggestions',
    'sku_suggestions',
    'retailer_product_suggestions',
    'scout_report_reviews',
    'store_intelligence_suggestions'
  ]
  loop
    execute format('alter table public.%I add column if not exists visibility text', suggestion_table);
    execute format('alter table public.%I add column if not exists admin_review_visible boolean not null default false', suggestion_table);
    execute format('alter table public.%I add column if not exists admin_visibility_disclosed_at timestamptz', suggestion_table);

    execute format(
      'update public.%I
       set visibility = nullif(submitted_data ->> ''visibility'', '''')
       where visibility is null and submitted_data ? ''visibility''',
      suggestion_table
    );

    execute format(
      'update public.%I
       set admin_review_visible = true,
           admin_visibility_disclosed_at = coalesce(admin_visibility_disclosed_at, updated_at, created_at, now())
       where coalesce(nullif(visibility, ''''), submitted_data ->> ''visibility'', '''') not in (''private'', ''shared_with_team'')
         and admin_review_visible = false',
      suggestion_table
    );

    execute format('drop policy if exists %I on public.%I', 'admins_manage_' || suggestion_table, suggestion_table);
    execute format('drop policy if exists %I on public.%I', 'users_read_own_' || suggestion_table, suggestion_table);
    execute format('drop policy if exists %I on public.%I', 'users_insert_own_' || suggestion_table, suggestion_table);
    execute format('drop policy if exists %I on public.%I', 'users_read_own_suggestions', suggestion_table);
    execute format('drop policy if exists %I on public.%I', 'users_insert_own_suggestions', suggestion_table);
    execute format('drop policy if exists %I on public.%I', 'admins_read_reviewable_' || suggestion_table, suggestion_table);
    execute format('drop policy if exists %I on public.%I', 'admins_insert_' || suggestion_table, suggestion_table);
    execute format('drop policy if exists %I on public.%I', 'admins_update_reviewable_' || suggestion_table, suggestion_table);
    execute format('drop policy if exists %I on public.%I', 'admins_delete_reviewable_' || suggestion_table, suggestion_table);

    execute format(
      'create policy %I on public.%I
       for insert
       with check (((select auth.uid()) = user_id) and status = any (array[''Draft'', ''Submitted'']))',
      'users_insert_own_' || suggestion_table,
      suggestion_table
    );

    execute format(
      'create policy %I on public.%I
       for select
       using ((select auth.uid()) = user_id)',
      'users_read_own_' || suggestion_table,
      suggestion_table
    );

    execute format(
      'create policy %I on public.%I
       for select
       using (
         public.is_admin()
         and public.suggestion_is_admin_reviewable(admin_review_visible, admin_visibility_disclosed_at, visibility, submitted_data)
       )',
      'admins_read_reviewable_' || suggestion_table,
      suggestion_table
    );

    execute format(
      'create policy %I on public.%I
       for insert
       with check (public.is_admin())',
      'admins_insert_' || suggestion_table,
      suggestion_table
    );

    execute format(
      'create policy %I on public.%I
       for update
       using (
         public.is_admin()
         and public.suggestion_is_admin_reviewable(admin_review_visible, admin_visibility_disclosed_at, visibility, submitted_data)
       )
       with check (public.is_admin())',
      'admins_update_reviewable_' || suggestion_table,
      suggestion_table
    );

    execute format(
      'create policy %I on public.%I
       for delete
       using (
         public.is_admin()
         and public.suggestion_is_admin_reviewable(admin_review_visible, admin_visibility_disclosed_at, visibility, submitted_data)
       )',
      'admins_delete_reviewable_' || suggestion_table,
      suggestion_table
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
