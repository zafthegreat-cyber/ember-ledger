begin;

-- Align workspace-backed write policies with the frontend role model:
-- owner/admin/editor may edit workspace rows, viewer may not. Legacy rows with
-- no workspace_id remain editable by their owning user.
--
-- Universal suggestion queues are intentionally excluded from generic workspace
-- edit hardening. They get suggestion-specific policies below so regular
-- authenticated users can still submit suggestions while approval/moderation
-- fields remain admin-controlled.

do $$
declare
  legacy_policy record;
begin
  for legacy_policy in
    select * from (values
      ('user_inventory', 'Users can insert own inventory'),
      ('user_inventory', 'Users can update own inventory'),
      ('user_inventory', 'Users can delete own inventory'),
      ('user_inventory', 'workspace_members_can_read_user_inventory'),
      ('user_inventory', 'workspace_editors_can_insert_user_inventory'),
      ('user_inventory', 'workspace_editors_can_update_user_inventory'),
      ('user_inventory', 'workspace_editors_can_delete_user_inventory'),
      ('store_reports', 'Logged in users can read community store reports'),
      ('store_reports', 'Logged in users can create store reports'),
      ('app_user_preferences', 'Users manage own app preferences'),
      ('notification_preferences', 'Users manage own notification preferences'),
      ('deal_finder_sessions', 'Users manage own deal sessions'),
      ('scanner_intake_sessions', 'Users manage own scanner sessions'),
      ('marketplace_listing_channels', 'Users manage own marketplace channels'),
      ('receipt_records', 'Users manage own receipts'),
      ('kid_community_projects', 'Users manage own community projects'),
      ('marketplace_listings', 'marketplace_users_create_draft_or_pending'),
      ('marketplace_listings', 'marketplace_users_update_own_nonpublic')
    ) as legacy_policies(table_name, policy_name)
  loop
    if to_regclass(format('public.%I', legacy_policy.table_name)) is not null then
      execute format(
        'drop policy if exists %I on public.%I',
        legacy_policy.policy_name,
        legacy_policy.table_name
      );
    end if;
  end loop;
end $$;

do $$
declare
  v_suggestion_table text;
begin
  foreach v_suggestion_table in array array['catalog_suggestions', 'store_suggestions', 'sku_suggestions']
  loop
    if to_regclass(format('public.%I', v_suggestion_table)) is not null then
      execute format('alter table public.%I enable row level security', v_suggestion_table);

      execute format('drop policy if exists "workspace_read_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "workspace_insert_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "workspace_update_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "workspace_delete_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "workspace_read_strict_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "workspace_insert_strict_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "workspace_update_strict_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "workspace_delete_strict_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "suggestions_insert_own_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "suggestions_read_own_or_admin_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "suggestions_update_own_unreviewed_%s" on public.%I', v_suggestion_table, v_suggestion_table);
      execute format('drop policy if exists "suggestions_admin_manage_%s" on public.%I', v_suggestion_table, v_suggestion_table);

      execute format(
        'create policy "suggestions_insert_own_%1$s" on public.%1$I for insert to authenticated
         with check (
           user_id = (select auth.uid())
           and status in (''Draft'', ''Submitted'')
           and admin_note is null
           and reviewed_by is null
           and reviewed_at is null
         )',
        v_suggestion_table
      );

      execute format(
        'create policy "suggestions_read_own_or_admin_%1$s" on public.%1$I for select to authenticated
         using (user_id = (select auth.uid()) or public.is_admin_or_moderator())',
        v_suggestion_table
      );

      execute format(
        'create policy "suggestions_update_own_unreviewed_%1$s" on public.%1$I for update to authenticated
         using (
           user_id = (select auth.uid())
           and status in (''Draft'', ''Submitted'')
         )
         with check (
           user_id = (select auth.uid())
           and status in (''Draft'', ''Submitted'')
           and admin_note is null
           and reviewed_by is null
           and reviewed_at is null
         )',
        v_suggestion_table
      );

      execute format(
        'create policy "suggestions_admin_manage_%1$s" on public.%1$I for all to authenticated
         using (public.is_admin_or_moderator())
         with check (public.is_admin_or_moderator())',
        v_suggestion_table
      );
    end if;
  end loop;
end $$;

do $$
declare
  v_table_name text;
  v_owner_column text;
begin
  for v_table_name, v_owner_column in
    select * from (values
      ('user_inventory', 'user_id'),
      ('inventory_items', 'user_id'),
      ('business_expenses', 'user_id'),
      ('sales_records', 'user_id'),
      ('mileage_trips', 'user_id'),
      ('app_user_preferences', 'user_id'),
      ('notification_preferences', 'user_id'),
      ('deal_finder_sessions', 'user_id'),
      ('scanner_intake_sessions', 'user_id'),
      ('marketplace_listing_channels', 'user_id'),
      ('receipt_records', 'user_id'),
      ('kid_community_projects', 'user_id')
    ) as policy_tables(table_name, owner_column)
  loop
    if to_regclass(format('public.%I', v_table_name)) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table_name
           and column_name = 'workspace_id'
       )
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = v_table_name
           and column_name = v_owner_column
       )
    then
      execute format('alter table public.%I enable row level security', v_table_name);

      execute format('drop policy if exists "workspace_read_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_insert_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_update_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_delete_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_read_strict_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_insert_strict_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_update_strict_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_delete_strict_%s" on public.%I', v_table_name, v_table_name);

      execute format(
        'create policy "workspace_read_strict_%1$s" on public.%1$I for select to authenticated
         using (%2$I = (select auth.uid()) or public.can_read_workspace(workspace_id) or public.is_admin_or_moderator())',
        v_table_name,
        v_owner_column
      );

      execute format(
        'create policy "workspace_insert_strict_%1$s" on public.%1$I for insert to authenticated
         with check (
           ((workspace_id is null and %2$I = (select auth.uid())) or public.can_edit_workspace(workspace_id) or public.is_admin_or_moderator())
         )',
        v_table_name,
        v_owner_column
      );

      execute format(
        'create policy "workspace_update_strict_%1$s" on public.%1$I for update to authenticated
         using (
           (
             (workspace_id is null and %2$I = (select auth.uid()))
             or (
               workspace_id is not null
               and %2$I = (select auth.uid())
               and not exists (select 1 from public.workspaces workspace where workspace.id = workspace_id)
             )
             or public.can_edit_workspace(workspace_id)
             or public.is_admin_or_moderator()
           )
         )
         with check (
           (
             (workspace_id is null and %2$I = (select auth.uid()))
             or (
               workspace_id is not null
               and %2$I = (select auth.uid())
               and not exists (select 1 from public.workspaces workspace where workspace.id = workspace_id)
             )
             or public.can_edit_workspace(workspace_id)
             or public.is_admin_or_moderator()
           )
         )',
        v_table_name,
        v_owner_column
      );

      execute format(
        'create policy "workspace_delete_strict_%1$s" on public.%1$I for delete to authenticated
         using (
           (
             (workspace_id is null and %2$I = (select auth.uid()))
             or (
               workspace_id is not null
               and %2$I = (select auth.uid())
               and not exists (select 1 from public.workspaces workspace where workspace.id = workspace_id)
             )
             or public.can_edit_workspace(workspace_id)
             or public.is_admin_or_moderator()
           )
         )',
        v_table_name,
        v_owner_column
      );
    end if;
  end loop;
end $$;

create or replace function public.store_reports_guard_moderation_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_column text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_user_status_rpc boolean := coalesce(current_setting('app.store_report_user_status_rpc', true), '') = 'on';
  v_protected_status_columns text[] := array['verification_status', 'moderation_status'];
  v_protected_boolean_columns text[] := array['verified', 'hidden', 'disputed', 'admin_removed', 'is_hidden', 'is_disputed'];
  v_protected_note_columns text[] := array['admin_note', 'admin_notes', 'moderation_note', 'moderation_notes', 'hidden_reason', 'dispute_reason'];
  v_protected_actor_columns text[] := array['reviewed_by', 'verified_by', 'hidden_by', 'admin_removed_by', 'moderated_by'];
  v_protected_time_columns text[] := array['reviewed_at', 'verified_at', 'hidden_at', 'admin_removed_at', 'moderated_at'];
begin
  if public.is_admin_or_moderator() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_new ? 'verification_status'
       and coalesce(v_new ->> 'verification_status', 'unverified') not in ('', 'unverified', 'submitted', 'Submitted')
    then
      raise exception 'Only admins can set store report verification status'
        using errcode = '42501';
    end if;

    if v_new ? 'moderation_status'
       and coalesce(v_new ->> 'moderation_status', 'pending') not in ('', 'pending', 'submitted', 'Submitted', 'unreviewed')
    then
      raise exception 'Only admins can set store report moderation status'
        using errcode = '42501';
    end if;

    foreach v_column in array v_protected_boolean_columns
    loop
      if v_new ? v_column and coalesce((v_new ->> v_column)::boolean, false) then
        raise exception 'Only admins can set store report moderation fields'
          using errcode = '42501';
      end if;
    end loop;

    foreach v_column in array (v_protected_note_columns || v_protected_actor_columns || v_protected_time_columns)
    loop
      if v_new ? v_column
         and v_new -> v_column is not null
         and v_new -> v_column <> 'null'::jsonb
         and coalesce(v_new ->> v_column, '') <> ''
      then
        raise exception 'Only admins can set store report moderation fields'
          using errcode = '42501';
      end if;
    end loop;

    return new;
  end if;

  v_old := to_jsonb(old);

  foreach v_column in array (v_protected_status_columns || v_protected_boolean_columns || v_protected_note_columns || v_protected_actor_columns || v_protected_time_columns)
  loop
    if (v_new -> v_column) is distinct from (v_old -> v_column) then
      if v_user_status_rpc
         and v_column = 'verification_status'
         and coalesce(v_new ->> v_column, '') in ('retracted', 'mistaken')
      then
        continue;
      end if;

      raise exception 'Only admins can change store report moderation fields'
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.admin_set_store_report_moderation(
  p_report_id uuid,
  p_status text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin_or_moderator() then
    raise exception 'Only admins can moderate store reports'
      using errcode = '42501';
  end if;

  if p_status not in ('verified', 'hidden', 'unverified', 'admin_removed', 'disputed') then
    raise exception 'Unsupported store report moderation status: %', p_status
      using errcode = '22023';
  end if;

  if to_regclass('public.store_reports') is null then
    raise exception 'store_reports table is not available'
      using errcode = '42P01';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_reports'
      and column_name = 'verification_status'
  ) then
    execute 'update public.store_reports set verification_status = $1 where id = $2 returning to_jsonb(store_reports.*)'
      into v_result
      using p_status, p_report_id;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_reports'
      and column_name = 'moderation_status'
  ) then
    execute 'update public.store_reports set moderation_status = $1 where id = $2 returning to_jsonb(store_reports.*)'
      into v_result
      using p_status, p_report_id;
  else
    raise exception 'No store report moderation status column is available'
      using errcode = '42703';
  end if;

  if v_result is null then
    raise exception 'Store report not found or not visible'
      using errcode = 'P0002';
  end if;

  if p_admin_note is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'store_reports'
        and column_name = 'admin_notes'
    ) then
      execute 'update public.store_reports set admin_notes = $1 where id = $2 returning to_jsonb(store_reports.*)'
        into v_result
        using p_admin_note, p_report_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'store_reports'
        and column_name = 'admin_note'
    ) then
      execute 'update public.store_reports set admin_note = $1 where id = $2 returning to_jsonb(store_reports.*)'
        into v_result
        using p_admin_note, p_report_id;
    end if;
  end if;

  return v_result;
end;
$$;

create or replace function public.admin_verify_store_report(p_report_id uuid, p_admin_note text default null)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.admin_set_store_report_moderation(p_report_id, 'verified', p_admin_note);
$$;

create or replace function public.admin_hide_store_report(p_report_id uuid, p_admin_note text default null)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.admin_set_store_report_moderation(p_report_id, 'hidden', p_admin_note);
$$;

create or replace function public.admin_restore_store_report(p_report_id uuid, p_admin_note text default null)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.admin_set_store_report_moderation(p_report_id, 'unverified', p_admin_note);
$$;

create or replace function public.admin_soft_delete_store_report(p_report_id uuid, p_admin_note text default null)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.admin_set_store_report_moderation(p_report_id, 'admin_removed', p_admin_note);
$$;

create or replace function public.admin_mark_report_disputed(p_report_id uuid, p_admin_note text default null)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.admin_set_store_report_moderation(p_report_id, 'disputed', p_admin_note);
$$;

create or replace function public.user_set_own_store_report_status(p_report_id uuid, p_status text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_status not in ('retracted', 'mistaken') then
    raise exception 'Unsupported user store report status: %', p_status
      using errcode = '22023';
  end if;

  perform set_config('app.store_report_user_status_rpc', 'on', true);

  execute 'update public.store_reports set verification_status = $1 where id = $2 and user_id = (select auth.uid()) returning to_jsonb(store_reports.*)'
    into v_result
    using p_status, p_report_id;

  if v_result is null then
    raise exception 'Store report not found or not editable by this user'
      using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

create or replace function public.user_retract_own_report(p_report_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.user_set_own_store_report_status(p_report_id, 'retracted');
$$;

create or replace function public.user_mark_own_report_mistaken(p_report_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.user_set_own_store_report_status(p_report_id, 'mistaken');
$$;

revoke all on function public.admin_set_store_report_moderation(uuid, text, text) from public;
revoke all on function public.admin_verify_store_report(uuid, text) from public;
revoke all on function public.admin_hide_store_report(uuid, text) from public;
revoke all on function public.admin_restore_store_report(uuid, text) from public;
revoke all on function public.admin_soft_delete_store_report(uuid, text) from public;
revoke all on function public.admin_mark_report_disputed(uuid, text) from public;
revoke all on function public.user_set_own_store_report_status(uuid, text) from public;
revoke all on function public.user_retract_own_report(uuid) from public;
revoke all on function public.user_mark_own_report_mistaken(uuid) from public;

grant execute on function public.admin_verify_store_report(uuid, text) to authenticated;
grant execute on function public.admin_hide_store_report(uuid, text) to authenticated;
grant execute on function public.admin_restore_store_report(uuid, text) to authenticated;
grant execute on function public.admin_soft_delete_store_report(uuid, text) to authenticated;
grant execute on function public.admin_mark_report_disputed(uuid, text) to authenticated;
grant execute on function public.admin_set_store_report_moderation(uuid, text, text) to authenticated;
grant execute on function public.user_set_own_store_report_status(uuid, text) to authenticated;
grant execute on function public.user_retract_own_report(uuid) to authenticated;
grant execute on function public.user_mark_own_report_mistaken(uuid) to authenticated;

do $$
begin
  if to_regclass('public.store_reports') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'store_reports'
         and column_name = 'workspace_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'store_reports'
         and column_name = 'user_id'
     )
  then
    execute 'alter table public.store_reports enable row level security';
    execute 'drop policy if exists "workspace_read_store_reports" on public.store_reports';
    execute 'drop policy if exists "workspace_insert_store_reports" on public.store_reports';
    execute 'drop policy if exists "workspace_update_store_reports" on public.store_reports';
    execute 'drop policy if exists "workspace_delete_store_reports" on public.store_reports';
    execute 'drop policy if exists "workspace_read_strict_store_reports" on public.store_reports';
    execute 'drop policy if exists "workspace_insert_strict_store_reports" on public.store_reports';
    execute 'drop policy if exists "workspace_update_strict_store_reports" on public.store_reports';
    execute 'drop policy if exists "workspace_delete_strict_store_reports" on public.store_reports';
    execute 'drop policy if exists "store_reports_read_workspace_strict" on public.store_reports';
    execute 'drop policy if exists "store_reports_insert_own_or_workspace_editor" on public.store_reports';
    execute 'drop policy if exists "store_reports_update_details_workspace_strict" on public.store_reports';
    execute 'drop policy if exists "store_reports_user_status_rpc_update" on public.store_reports';
    execute 'drop policy if exists "store_reports_admin_delete" on public.store_reports';

    execute $policy$
      create policy "store_reports_read_workspace_strict"
      on public.store_reports for select
      to authenticated
      using (
        user_id = (select auth.uid())
        or public.can_read_workspace(workspace_id)
        or public.is_admin_or_moderator()
      )
    $policy$;

    execute $policy$
      create policy "store_reports_insert_own_or_workspace_editor"
      on public.store_reports for insert
      to authenticated
      with check (
        public.is_admin_or_moderator()
        or (
          user_id = (select auth.uid())
          and (
            workspace_id is null
            or public.can_edit_workspace(workspace_id)
          )
        )
      )
    $policy$;

    execute $policy$
      create policy "store_reports_update_details_workspace_strict"
      on public.store_reports for update
      to authenticated
      using (
        public.is_admin_or_moderator()
        or (workspace_id is null and user_id = (select auth.uid()))
        or (
          workspace_id is not null
          and user_id = (select auth.uid())
          and not exists (select 1 from public.workspaces workspace where workspace.id = workspace_id)
        )
        or public.can_edit_workspace(workspace_id)
      )
      with check (
        public.is_admin_or_moderator()
        or (workspace_id is null and user_id = (select auth.uid()))
        or (
          workspace_id is not null
          and user_id = (select auth.uid())
          and not exists (select 1 from public.workspaces workspace where workspace.id = workspace_id)
        )
        or public.can_edit_workspace(workspace_id)
      )
    $policy$;

    execute $policy$
      create policy "store_reports_user_status_rpc_update"
      on public.store_reports for update
      to authenticated
      using (
        current_setting('app.store_report_user_status_rpc', true) = 'on'
        and user_id = (select auth.uid())
      )
      with check (
        current_setting('app.store_report_user_status_rpc', true) = 'on'
        and user_id = (select auth.uid())
        and verification_status in ('retracted', 'mistaken')
      )
    $policy$;

    execute $policy$
      create policy "store_reports_admin_delete"
      on public.store_reports for delete
      to authenticated
      using (public.is_admin_or_moderator())
    $policy$;

    execute 'drop trigger if exists store_reports_guard_moderation_fields on public.store_reports';
    execute 'create trigger store_reports_guard_moderation_fields before insert or update on public.store_reports for each row execute function public.store_reports_guard_moderation_fields()';
  end if;
end $$;

-- Marketplace listings are workspace-readable and draft/pending editable, but
-- user-facing clients cannot self-activate public listings. Public Active
-- listings remain readable through the existing marketplace_read_active policy;
-- activation/hide/archive stays admin-controlled until product policy changes.
do $$
begin
  if to_regclass('public.marketplace_listings') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'marketplace_listings'
         and column_name = 'workspace_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'marketplace_listings'
         and column_name = 'seller_user_id'
     )
  then
    execute 'alter table public.marketplace_listings enable row level security';
    execute 'drop policy if exists "workspace_read_marketplace_listings" on public.marketplace_listings';
    execute 'drop policy if exists "workspace_insert_marketplace_listings" on public.marketplace_listings';
    execute 'drop policy if exists "workspace_update_marketplace_listings" on public.marketplace_listings';
    execute 'drop policy if exists "workspace_delete_marketplace_listings" on public.marketplace_listings';
    execute 'drop policy if exists "workspace_read_strict_marketplace_listings" on public.marketplace_listings';
    execute 'drop policy if exists "workspace_insert_strict_marketplace_listings" on public.marketplace_listings';
    execute 'drop policy if exists "workspace_update_strict_marketplace_listings" on public.marketplace_listings';
    execute 'drop policy if exists "workspace_delete_strict_marketplace_listings" on public.marketplace_listings';
    execute 'drop policy if exists "marketplace_workspace_read_nonpublic" on public.marketplace_listings';
    execute 'drop policy if exists "marketplace_users_create_draft_or_pending_workspace" on public.marketplace_listings';
    execute 'drop policy if exists "marketplace_users_update_own_nonpublic_workspace" on public.marketplace_listings';
    execute 'drop policy if exists "marketplace_users_delete_own_draft_workspace" on public.marketplace_listings';

    execute $policy$
      create policy "marketplace_workspace_read_nonpublic"
      on public.marketplace_listings for select
      to authenticated
      using (
        seller_user_id = (select auth.uid())
        or public.can_read_workspace(workspace_id)
        or public.is_admin_or_moderator()
      )
    $policy$;

    execute $policy$
      create policy "marketplace_users_create_draft_or_pending_workspace"
      on public.marketplace_listings for insert
      to authenticated
      with check (
        public.is_admin_or_moderator()
        or (
          seller_user_id = (select auth.uid())
          and status in ('Draft', 'Pending Review')
          and (
            workspace_id is null
            or public.can_edit_workspace(workspace_id)
          )
        )
      )
    $policy$;

    execute $policy$
      create policy "marketplace_users_update_own_nonpublic_workspace"
      on public.marketplace_listings for update
      to authenticated
      using (
        public.is_admin_or_moderator()
        or (
          (seller_user_id = (select auth.uid()) or public.can_edit_workspace(workspace_id))
          and status in ('Draft', 'Pending Review', 'Sold', 'Traded', 'Archived')
        )
      )
      with check (
        public.is_admin_or_moderator()
        or (
          (seller_user_id = (select auth.uid()) or public.can_edit_workspace(workspace_id))
          and status in ('Draft', 'Pending Review', 'Sold', 'Traded', 'Archived')
        )
      )
    $policy$;

    execute $policy$
      create policy "marketplace_users_delete_own_draft_workspace"
      on public.marketplace_listings for delete
      to authenticated
      using (
        public.is_admin_or_moderator()
        or (
          (seller_user_id = (select auth.uid()) or public.can_edit_workspace(workspace_id))
          and status in ('Draft', 'Pending Review')
        )
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.receipt_line_items') is not null
     and to_regclass('public.receipt_records') is not null
  then
    execute 'alter table public.receipt_line_items enable row level security';
    execute 'drop policy if exists "Users read receipt lines for own receipts" on public.receipt_line_items';
    execute 'drop policy if exists "Users write receipt lines for own receipts" on public.receipt_line_items';
    execute 'drop policy if exists "receipt_lines_read_workspace_strict" on public.receipt_line_items';
    execute $policy$
      create policy "receipt_lines_read_workspace_strict"
      on public.receipt_line_items for select
      to authenticated
      using (
        exists (
          select 1
          from public.receipt_records receipt
          where receipt.id = receipt_line_items.receipt_id
            and (
              receipt.user_id = (select auth.uid())
              or public.can_read_workspace(receipt.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
    $policy$;

    execute 'drop policy if exists "receipt_lines_write_workspace_strict" on public.receipt_line_items';
    execute $policy$
      create policy "receipt_lines_write_workspace_strict"
      on public.receipt_line_items for all
      to authenticated
      using (
        exists (
          select 1
          from public.receipt_records receipt
          where receipt.id = receipt_line_items.receipt_id
            and (
              (receipt.workspace_id is null and receipt.user_id = (select auth.uid()))
              or (
                receipt.workspace_id is not null
                and receipt.user_id = (select auth.uid())
                and not exists (select 1 from public.workspaces workspace where workspace.id = receipt.workspace_id)
              )
              or public.can_edit_workspace(receipt.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
      with check (
        exists (
          select 1
          from public.receipt_records receipt
          where receipt.id = receipt_line_items.receipt_id
            and (
              (receipt.workspace_id is null and receipt.user_id = (select auth.uid()))
              or (
                receipt.workspace_id is not null
                and receipt.user_id = (select auth.uid())
                and not exists (select 1 from public.workspaces workspace where workspace.id = receipt.workspace_id)
              )
              or public.can_edit_workspace(receipt.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.deal_finder_items') is not null
     and to_regclass('public.deal_finder_sessions') is not null
  then
    execute 'alter table public.deal_finder_items enable row level security';
    execute 'drop policy if exists "Users read own deal items" on public.deal_finder_items';
    execute 'drop policy if exists "Users write own deal items" on public.deal_finder_items';
    execute 'drop policy if exists "deal_items_read_workspace_strict" on public.deal_finder_items';
    execute $policy$
      create policy "deal_items_read_workspace_strict"
      on public.deal_finder_items for select
      to authenticated
      using (
        exists (
          select 1
          from public.deal_finder_sessions session
          where session.id = deal_finder_items.session_id
            and (
              session.user_id = (select auth.uid())
              or public.can_read_workspace(session.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
    $policy$;

    execute 'drop policy if exists "deal_items_write_workspace_strict" on public.deal_finder_items';
    execute $policy$
      create policy "deal_items_write_workspace_strict"
      on public.deal_finder_items for all
      to authenticated
      using (
        exists (
          select 1
          from public.deal_finder_sessions session
          where session.id = deal_finder_items.session_id
            and (
              (session.workspace_id is null and session.user_id = (select auth.uid()))
              or (
                session.workspace_id is not null
                and session.user_id = (select auth.uid())
                and not exists (select 1 from public.workspaces workspace where workspace.id = session.workspace_id)
              )
              or public.can_edit_workspace(session.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
      with check (
        exists (
          select 1
          from public.deal_finder_sessions session
          where session.id = deal_finder_items.session_id
            and (
              (session.workspace_id is null and session.user_id = (select auth.uid()))
              or (
                session.workspace_id is not null
                and session.user_id = (select auth.uid())
                and not exists (select 1 from public.workspaces workspace where workspace.id = session.workspace_id)
              )
              or public.can_edit_workspace(session.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
    $policy$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.kid_community_project_items') is not null
     and to_regclass('public.kid_community_projects') is not null
  then
    execute 'alter table public.kid_community_project_items enable row level security';
    execute 'drop policy if exists "Users read own community project items" on public.kid_community_project_items';
    execute 'drop policy if exists "Users write own community project items" on public.kid_community_project_items';
    execute 'drop policy if exists "kid_project_items_read_workspace_strict" on public.kid_community_project_items';
    execute $policy$
      create policy "kid_project_items_read_workspace_strict"
      on public.kid_community_project_items for select
      to authenticated
      using (
        exists (
          select 1
          from public.kid_community_projects project
          where project.id = kid_community_project_items.project_id
            and (
              project.user_id = (select auth.uid())
              or public.can_read_workspace(project.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
    $policy$;

    execute 'drop policy if exists "kid_project_items_write_workspace_strict" on public.kid_community_project_items';
    execute $policy$
      create policy "kid_project_items_write_workspace_strict"
      on public.kid_community_project_items for all
      to authenticated
      using (
        exists (
          select 1
          from public.kid_community_projects project
          where project.id = kid_community_project_items.project_id
            and (
              (project.workspace_id is null and project.user_id = (select auth.uid()))
              or (
                project.workspace_id is not null
                and project.user_id = (select auth.uid())
                and not exists (select 1 from public.workspaces workspace where workspace.id = project.workspace_id)
              )
              or public.can_edit_workspace(project.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
      with check (
        exists (
          select 1
          from public.kid_community_projects project
          where project.id = kid_community_project_items.project_id
            and (
              (project.workspace_id is null and project.user_id = (select auth.uid()))
              or (
                project.workspace_id is not null
                and project.user_id = (select auth.uid())
                and not exists (select 1 from public.workspaces workspace where workspace.id = project.workspace_id)
              )
              or public.can_edit_workspace(project.workspace_id)
              or public.is_admin_or_moderator()
            )
        )
      )
    $policy$;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
