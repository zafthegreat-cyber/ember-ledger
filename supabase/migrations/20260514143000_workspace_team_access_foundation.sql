-- Shared workspace/team access foundation.
-- Adds the requested workspace_members compatibility table and contributor role
-- while preserving the existing workspace_memberships table used by beta clients.

begin;

alter table if exists public.workspaces
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.workspaces
set created_by = coalesce(created_by, owner_user_id)
where created_by is null;

create or replace function public.set_workspace_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_by = coalesce(new.created_by, new.owner_user_id, (select auth.uid()));
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_workspace_created_by on public.workspaces;
create trigger set_workspace_created_by
before insert or update on public.workspaces
for each row execute function public.set_workspace_created_by();

alter table if exists public.workspaces
  drop constraint if exists workspaces_type_check;

alter table if exists public.workspaces
  add constraint workspaces_type_check
  check (type in (
    'personal',
    'personal_shared',
    'shared_collection',
    'business',
    'family',
    'team',
    'card_shop_partner'
  ));

alter table if exists public.workspace_memberships
  drop constraint if exists workspace_memberships_role_check;

alter table if exists public.workspace_memberships
  add constraint workspace_memberships_role_check
  check (role in ('owner', 'admin', 'contributor', 'editor', 'viewer'));

alter table if exists public.workspace_invites
  drop constraint if exists workspace_invites_role_check;

alter table if exists public.workspace_invites
  add constraint workspace_invites_role_check
  check (role in ('admin', 'contributor', 'editor', 'viewer'));

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_role_check
    check (role in ('owner', 'admin', 'contributor', 'viewer')),
  constraint workspace_members_status_check
    check (status in ('active', 'invited', 'removed')),
  constraint workspace_members_workspace_user_key
    unique (workspace_id, user_id)
);

create index if not exists workspace_members_workspace_idx
  on public.workspace_members(workspace_id);

create index if not exists workspace_members_user_idx
  on public.workspace_members(user_id);

create index if not exists workspace_members_workspace_role_idx
  on public.workspace_members(workspace_id, role)
  where status = 'active';

insert into public.workspace_members (
  workspace_id,
  user_id,
  role,
  status,
  created_at,
  updated_at
)
select
  wm.workspace_id,
  wm.user_id,
  case wm.role
    when 'editor' then 'contributor'
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    else 'viewer'
  end as role,
  case wm.status
    when 'removed' then 'removed'
    when 'invited' then 'invited'
    else 'active'
  end as status,
  coalesce(wm.created_at, now()) as created_at,
  now() as updated_at
from public.workspace_memberships wm
where wm.user_id is not null
on conflict (workspace_id, user_id) do update
set role = excluded.role,
    status = excluded.status,
    updated_at = now();

create or replace function public.workspace_role_for(workspace_uuid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with member_roles as (
    select wm.role
    from public.workspace_members wm
    where wm.workspace_id = workspace_uuid
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'

    union all

    select case wms.role when 'editor' then 'contributor' else wms.role end as role
    from public.workspace_memberships wms
    where wms.workspace_id = workspace_uuid
      and wms.user_id = (select auth.uid())
      and wms.status = 'active'
  )
  select role
  from member_roles
  order by case role
    when 'owner' then 1
    when 'admin' then 2
    when 'contributor' then 3
    when 'viewer' then 4
    else 5
  end
  limit 1
$$;

create or replace function public.can_read_workspace(workspace_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = workspace_uuid
      and (
        w.owner_user_id = (select auth.uid())
        or w.created_by = (select auth.uid())
      )
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin', 'contributor', 'viewer')
$$;

create or replace function public.can_edit_workspace(workspace_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = workspace_uuid
      and (
        w.owner_user_id = (select auth.uid())
        or w.created_by = (select auth.uid())
      )
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin', 'contributor')
$$;

create or replace function public.can_manage_workspace(workspace_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = workspace_uuid
      and (
        w.owner_user_id = (select auth.uid())
        or w.created_by = (select auth.uid())
      )
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin')
$$;

revoke all on function public.workspace_role_for(uuid) from public;
revoke all on function public.can_read_workspace(uuid) from public;
revoke all on function public.can_edit_workspace(uuid) from public;
revoke all on function public.can_manage_workspace(uuid) from public;
grant execute on function public.workspace_role_for(uuid) to authenticated;
grant execute on function public.can_read_workspace(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;

alter table public.workspace_members enable row level security;

drop policy if exists "workspace_members_read_members" on public.workspace_members;
create policy "workspace_members_read_members"
  on public.workspace_members for select
  to authenticated
  using (user_id = (select auth.uid()) or public.can_read_workspace(workspace_id));

drop policy if exists "workspace_managers_insert_members" on public.workspace_members;
create policy "workspace_managers_insert_members"
  on public.workspace_members for insert
  to authenticated
  with check (public.can_manage_workspace(workspace_id));

drop policy if exists "workspace_managers_update_members" on public.workspace_members;
create policy "workspace_managers_update_members"
  on public.workspace_members for update
  to authenticated
  using (public.can_manage_workspace(workspace_id))
  with check (public.can_manage_workspace(workspace_id));

drop policy if exists "workspace_managers_delete_members" on public.workspace_members;
create policy "workspace_managers_delete_members"
  on public.workspace_members for delete
  to authenticated
  using (public.can_manage_workspace(workspace_id));

grant select, insert, update, delete on public.workspace_members to authenticated;

create or replace function public.touch_workspace_members_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_workspace_members_updated_at on public.workspace_members;
create trigger touch_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.touch_workspace_members_updated_at();

create or replace function public.sync_workspace_member_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    created_at,
    updated_at
  )
  values (
    new.workspace_id,
    new.user_id,
    case new.role
      when 'editor' then 'contributor'
      when 'owner' then 'owner'
      when 'admin' then 'admin'
      when 'contributor' then 'contributor'
      else 'viewer'
    end,
    case new.status
      when 'removed' then 'removed'
      when 'invited' then 'invited'
      else 'active'
    end,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (workspace_id, user_id) do update
  set role = excluded.role,
      status = excluded.status,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_workspace_member_from_membership on public.workspace_memberships;
create trigger sync_workspace_member_from_membership
after insert or update on public.workspace_memberships
for each row execute function public.sync_workspace_member_from_membership();

alter table if exists public.inventory_items
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private';

alter table if exists public.inventory_items
  drop constraint if exists inventory_items_visibility_check;

alter table if exists public.inventory_items
  add constraint inventory_items_visibility_check
  check (visibility in ('private', 'shared_workspace', 'public_showcase', 'public'));

update public.inventory_items
set owner_user_id = coalesce(owner_user_id, user_id)
where owner_user_id is null;

create index if not exists inventory_items_workspace_status_idx
  on public.inventory_items(workspace_id, status);

create index if not exists inventory_items_owner_visibility_idx
  on public.inventory_items(owner_user_id, visibility);

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

      execute format('drop policy if exists "workspace_read_strict_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_insert_strict_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_update_strict_%s" on public.%I', v_table_name, v_table_name);
      execute format('drop policy if exists "workspace_delete_strict_%s" on public.%I', v_table_name, v_table_name);

      execute format(
        'create policy "workspace_read_strict_%1$s" on public.%1$I for select to authenticated
         using (%2$I = (select auth.uid()) or public.can_read_workspace(workspace_id))',
        v_table_name,
        v_owner_column
      );

      execute format(
        'create policy "workspace_insert_strict_%1$s" on public.%1$I for insert to authenticated
         with check (
           ((workspace_id is null and %2$I = (select auth.uid())) or public.can_edit_workspace(workspace_id))
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
             or public.can_manage_workspace(workspace_id)
           )
         )',
        v_table_name,
        v_owner_column
      );
    end if;
  end loop;
end $$;

comment on table public.workspace_members is
  'Workspace team members for business/shared access. Workspace role is separate from platform admin role.';
comment on column public.workspaces.created_by is
  'User that created the workspace. Platform admins are not automatically workspace members.';
comment on column public.inventory_items.workspace_id is
  'Workspace that owns a shared business inventory row when workspace mode is active.';
comment on column public.inventory_items.owner_user_id is
  'Original user owner for personal rows and audit context.';
comment on column public.inventory_items.visibility is
  'private, shared_workspace, public_showcase, or public visibility. Private is not shared publicly.';
comment on function public.can_read_workspace(uuid) is
  'Workspace membership read helper. Does not grant access based on platform Admin Mode.';
comment on function public.can_edit_workspace(uuid) is
  'Workspace membership edit helper. owner/admin/contributor can edit; viewer can read only.';
comment on function public.can_manage_workspace(uuid) is
  'Workspace management helper. owner/admin can manage members.';

notify pgrst, 'reload schema';

commit;
