-- Shared workspace access model for Beta 1.
-- Adds personal/shared/business workspaces, member roles, invites, and workspace_id
-- columns for user-owned records. Existing records are backfilled into each user's
-- personal workspace so nothing becomes shared by default.

begin;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'personal',
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_type_check
    check (type in ('personal', 'shared_collection', 'business', 'family', 'team'))
);

create unique index if not exists workspaces_one_personal_per_owner_idx
  on public.workspaces(owner_user_id)
  where type = 'personal';

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  role text not null default 'viewer',
  status text not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint workspace_memberships_role_check
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  constraint workspace_memberships_status_check
    check (status in ('invited', 'active', 'removed')),
  constraint workspace_memberships_user_or_email_check
    check (user_id is not null or nullif(email, '') is not null)
);

create index if not exists workspace_memberships_workspace_idx
  on public.workspace_memberships(workspace_id);

create unique index if not exists workspace_memberships_active_user_idx
  on public.workspace_memberships(workspace_id, user_id)
  where user_id is not null and status <> 'removed';

create unique index if not exists workspace_memberships_pending_email_idx
  on public.workspace_memberships(workspace_id, lower(email))
  where email is not null and status = 'invited';

create index if not exists workspace_memberships_email_idx
  on public.workspace_memberships(lower(email));

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'viewer',
  status text not null default 'invited',
  note text,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint workspace_invites_role_check
    check (role in ('admin', 'editor', 'viewer')),
  constraint workspace_invites_status_check
    check (status in ('invited', 'active', 'removed'))
);

create unique index if not exists workspace_invites_pending_email_idx
  on public.workspace_invites(workspace_id, lower(email))
  where status = 'invited';

create or replace function public.workspace_role_for(workspace_uuid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_memberships wm
  where wm.workspace_id = workspace_uuid
    and wm.user_id = (select auth.uid())
    and wm.status = 'active'
  order by case wm.role
    when 'owner' then 1
    when 'admin' then 2
    when 'editor' then 3
    when 'viewer' then 4
    else 5
  end
  limit 1
$$;

revoke all on function public.workspace_role_for(uuid) from public;
grant execute on function public.workspace_role_for(uuid) to authenticated;

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
      and w.owner_user_id = (select auth.uid())
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin', 'editor', 'viewer')
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
      and w.owner_user_id = (select auth.uid())
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin', 'editor')
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
      and w.owner_user_id = (select auth.uid())
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin')
$$;

revoke all on function public.can_read_workspace(uuid) from public;
revoke all on function public.can_edit_workspace(uuid) from public;
revoke all on function public.can_manage_workspace(uuid) from public;
grant execute on function public.can_read_workspace(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_invites enable row level security;

drop policy if exists "workspace_members_can_read_workspaces" on public.workspaces;
create policy "workspace_members_can_read_workspaces"
  on public.workspaces for select
  to authenticated
  using (owner_user_id = (select auth.uid()) or public.can_read_workspace(id));

drop policy if exists "users_can_create_owned_workspaces" on public.workspaces;
create policy "users_can_create_owned_workspaces"
  on public.workspaces for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "owners_admins_can_update_workspaces" on public.workspaces;
create policy "owners_admins_can_update_workspaces"
  on public.workspaces for update
  to authenticated
  using (owner_user_id = (select auth.uid()) or public.can_manage_workspace(id))
  with check (owner_user_id = (select auth.uid()) or public.can_manage_workspace(id));

drop policy if exists "owners_can_delete_workspaces" on public.workspaces;
create policy "owners_can_delete_workspaces"
  on public.workspaces for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists "members_can_read_relevant_memberships" on public.workspace_memberships;
create policy "members_can_read_relevant_memberships"
  on public.workspace_memberships for select
  to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_workspace(workspace_id));

drop policy if exists "managers_can_invite_members" on public.workspace_memberships;
create policy "managers_can_invite_members"
  on public.workspace_memberships for insert
  to authenticated
  with check (public.can_manage_workspace(workspace_id));

drop policy if exists "managers_can_update_members" on public.workspace_memberships;
create policy "managers_can_update_members"
  on public.workspace_memberships for update
  to authenticated
  using (public.can_manage_workspace(workspace_id) or user_id = (select auth.uid()))
  with check (public.can_manage_workspace(workspace_id) or user_id = (select auth.uid()));

drop policy if exists "managers_can_remove_members" on public.workspace_memberships;
create policy "managers_can_remove_members"
  on public.workspace_memberships for delete
  to authenticated
  using (public.can_manage_workspace(workspace_id));

drop policy if exists "managers_and_invitees_can_read_invites" on public.workspace_invites;
create policy "managers_and_invitees_can_read_invites"
  on public.workspace_invites for select
  to authenticated
  using (
    public.can_manage_workspace(workspace_id)
    or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

drop policy if exists "managers_can_create_invites" on public.workspace_invites;
create policy "managers_can_create_invites"
  on public.workspace_invites for insert
  to authenticated
  with check (public.can_manage_workspace(workspace_id) and invited_by = (select auth.uid()));

drop policy if exists "managers_or_invitees_can_update_invites" on public.workspace_invites;
create policy "managers_or_invitees_can_update_invites"
  on public.workspace_invites for update
  to authenticated
  using (
    public.can_manage_workspace(workspace_id)
    or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
  with check (
    public.can_manage_workspace(workspace_id)
    or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

-- User-owned tables get workspace_id. Missing workspace_id means legacy personal data
-- until the backfill below assigns a personal workspace.
alter table if exists public.user_inventory
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.inventory_items
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.business_expenses
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.sales_records
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.mileage_trips
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.marketplace_listings
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.store_reports
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.catalog_suggestions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.store_suggestions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table if exists public.sku_suggestions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

do $$
begin
  if to_regclass('public.user_inventory') is not null then
    create index if not exists user_inventory_workspace_idx on public.user_inventory(workspace_id);
  end if;
  if to_regclass('public.inventory_items') is not null then
    create index if not exists inventory_items_workspace_idx on public.inventory_items(workspace_id);
  end if;
  if to_regclass('public.business_expenses') is not null then
    create index if not exists business_expenses_workspace_idx on public.business_expenses(workspace_id);
  end if;
  if to_regclass('public.sales_records') is not null then
    create index if not exists sales_records_workspace_idx on public.sales_records(workspace_id);
  end if;
  if to_regclass('public.mileage_trips') is not null then
    create index if not exists mileage_trips_workspace_idx on public.mileage_trips(workspace_id);
  end if;
  if to_regclass('public.marketplace_listings') is not null then
    create index if not exists marketplace_listings_workspace_idx on public.marketplace_listings(workspace_id);
  end if;
  if to_regclass('public.store_reports') is not null then
    create index if not exists store_reports_workspace_idx on public.store_reports(workspace_id);
  end if;
end $$;

do $$
declare
  table_name text;
  user_column text;
begin
  for table_name, user_column in
    select * from (values
      ('user_inventory', 'user_id'),
      ('inventory_items', 'user_id'),
      ('business_expenses', 'user_id'),
      ('sales_records', 'user_id'),
      ('mileage_trips', 'user_id'),
      ('marketplace_listings', 'seller_user_id'),
      ('store_reports', 'user_id')
    ) as workspace_backfill(table_name, user_column)
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'insert into public.workspaces (name, type, owner_user_id)
         select ''My Personal Space'', ''personal'', %1$I
         from public.%2$I
         where %1$I is not null
         group by %1$I
         on conflict do nothing',
        user_column,
        table_name
      );

      execute format(
        'insert into public.workspace_memberships (workspace_id, user_id, role, status, accepted_at)
         select w.id, w.owner_user_id, ''owner'', ''active'', now()
         from public.workspaces w
         where w.type = ''personal''
           and not exists (
             select 1 from public.workspace_memberships wm
             where wm.workspace_id = w.id and wm.user_id = w.owner_user_id
           )'
      );

      execute format(
        'update public.%1$I t
         set workspace_id = w.id
         from public.workspaces w
         where t.workspace_id is null
           and w.type = ''personal''
           and w.owner_user_id = t.%2$I',
        table_name,
        user_column
      );
    end if;
  end loop;
end $$;

-- Workspace-aware RLS for user-owned tables. These policies are additive/replacements
-- for the older owner-only policies and preserve owner access for legacy rows.
drop policy if exists "Users can read own inventory" on public.user_inventory;
drop policy if exists "Users can insert own inventory" on public.user_inventory;
drop policy if exists "Users can update own inventory" on public.user_inventory;
drop policy if exists "Users can delete own inventory" on public.user_inventory;
drop policy if exists "Logged in users can read community store reports" on public.store_reports;
drop policy if exists "Logged in users can create store reports" on public.store_reports;

create policy "workspace_members_can_read_user_inventory"
  on public.user_inventory for select
  to authenticated
  using (user_id = (select auth.uid()) or public.can_read_workspace(workspace_id));

create policy "workspace_editors_can_insert_user_inventory"
  on public.user_inventory for insert
  to authenticated
  with check (user_id = (select auth.uid()) or public.can_edit_workspace(workspace_id));

create policy "workspace_editors_can_update_user_inventory"
  on public.user_inventory for update
  to authenticated
  using (user_id = (select auth.uid()) or public.can_edit_workspace(workspace_id))
  with check (user_id = (select auth.uid()) or public.can_edit_workspace(workspace_id));

create policy "workspace_editors_can_delete_user_inventory"
  on public.user_inventory for delete
  to authenticated
  using (user_id = (select auth.uid()) or public.can_edit_workspace(workspace_id));

do $$
declare
  table_name text;
  owner_column text;
begin
  for table_name, owner_column in
    select * from (values
      ('inventory_items', 'user_id'),
      ('business_expenses', 'user_id'),
      ('sales_records', 'user_id'),
      ('mileage_trips', 'user_id'),
      ('marketplace_listings', 'seller_user_id'),
      ('store_reports', 'user_id')
    ) as workspace_policy_tables(table_name, owner_column)
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists "workspace_read_%s" on public.%I', table_name, table_name);
      execute format('drop policy if exists "workspace_insert_%s" on public.%I', table_name, table_name);
      execute format('drop policy if exists "workspace_update_%s" on public.%I', table_name, table_name);
      execute format('drop policy if exists "workspace_delete_%s" on public.%I', table_name, table_name);

      execute format(
        'create policy "workspace_read_%1$s" on public.%1$I for select to authenticated
         using (%2$I = (select auth.uid()) or workspace_id is null or public.can_read_workspace(workspace_id))',
        table_name,
        owner_column
      );

      execute format(
        'create policy "workspace_insert_%1$s" on public.%1$I for insert to authenticated
         with check (%2$I = (select auth.uid()) or public.can_edit_workspace(workspace_id))',
        table_name,
        owner_column
      );

      execute format(
        'create policy "workspace_update_%1$s" on public.%1$I for update to authenticated
         using (%2$I = (select auth.uid()) or public.can_edit_workspace(workspace_id))
         with check (%2$I = (select auth.uid()) or public.can_edit_workspace(workspace_id))',
        table_name,
        owner_column
      );

      execute format(
        'create policy "workspace_delete_%1$s" on public.%1$I for delete to authenticated
         using (%2$I = (select auth.uid()) or public.can_edit_workspace(workspace_id))',
        table_name,
        owner_column
      );
    end if;
  end loop;
end $$;

comment on table public.workspaces is 'Shared collection/business/family/team spaces. Personal workspace is default and never shared automatically.';
comment on table public.workspace_memberships is 'Accepted or pending workspace members with owner/admin/editor/viewer roles.';
comment on table public.workspace_invites is 'Email invites. Data is not visible until accepted and membership becomes active.';

commit;
