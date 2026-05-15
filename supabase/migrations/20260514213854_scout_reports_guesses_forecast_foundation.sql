-- Scout reports, guesses, and forecast foundation.
-- Separates confirmed/user-submitted sightings from personal guesses and
-- app-generated forecast windows while preserving existing store_reports data.

begin;

alter table public.store_reports
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists store_name text,
  add column if not exists product_name text,
  add column if not exists product_type text,
  add column if not exists set_name text,
  add column if not exists quantity_estimate text,
  add column if not exists report_time timestamptz,
  add column if not exists visibility text not null default 'public',
  add column if not exists status text not null default 'unverified',
  add column if not exists confidence_score numeric,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.store_reports
set
  visibility = case
    when lower(coalesce(visibility, '')) in ('public', 'public_cleaned', 'community', 'community_report') then 'public'
    when lower(coalesce(visibility, '')) in ('private_from_map', 'private_from_public_map', 'private', 'shared', 'shared_with_team', 'team') then 'private_from_map'
    when lower(coalesce(visibility, '')) in ('admin_only', 'admin review only', 'admin-review-only') then 'admin_only'
    else 'public'
  end,
  status = case
    when lower(coalesce(status, verification_status, '')) in ('pending', 'needs_review', 'needs review') then 'pending'
    when lower(coalesce(status, verification_status, '')) in ('confirmed', 'verified') then 'confirmed'
    when lower(coalesce(status, verification_status, '')) in ('rejected', 'hidden') then 'rejected'
    when lower(coalesce(status, verification_status, '')) in ('stale', 'expired') then 'stale'
    else 'unverified'
  end,
  report_time = coalesce(report_time, reported_at, created_at, now()),
  quantity_estimate = coalesce(nullif(quantity_estimate, ''), quantity_seen::text),
  created_at = coalesce(created_at, reported_at, now()),
  updated_at = coalesce(updated_at, reported_at, now())
where visibility is null
   or visibility not in ('public', 'private_from_map', 'admin_only')
   or status is null
   or status not in ('pending', 'confirmed', 'unverified', 'rejected', 'stale')
   or report_time is null
   or quantity_estimate is null
   or created_at is null
   or updated_at is null;

update public.store_reports report
set store_name = coalesce(nullif(report.store_name, ''), store.nickname, store.name)
from public.stores store
where report.store_id = store.id
  and (report.store_name is null or report.store_name = '');

update public.store_reports report
set
  product_name = coalesce(nullif(report.product_name, ''), product.product_name),
  product_type = coalesce(nullif(report.product_type, ''), product.product_type),
  set_name = coalesce(nullif(report.set_name, ''), product.set_name)
from public.pokemon_products product
where report.product_id = product.id
  and (
    report.product_name is null
    or report.product_type is null
    or report.set_name is null
  );

alter table public.store_reports
  drop constraint if exists store_reports_visibility_check;

alter table public.store_reports
  add constraint store_reports_visibility_check
  check (visibility in ('public', 'private_from_map', 'admin_only'));

alter table public.store_reports
  drop constraint if exists store_reports_status_check;

alter table public.store_reports
  add constraint store_reports_status_check
  check (status in ('pending', 'confirmed', 'unverified', 'rejected', 'stale'));

create index if not exists store_reports_store_time_idx
  on public.store_reports(store_id, report_time desc nulls last);

create index if not exists store_reports_visibility_status_idx
  on public.store_reports(visibility, status, report_time desc nulls last);

create index if not exists store_reports_workspace_status_idx
  on public.store_reports(workspace_id, status, report_time desc nulls last)
  where workspace_id is not null;

create index if not exists store_reports_user_time_idx
  on public.store_reports(user_id, report_time desc nulls last)
  where user_id is not null;

create table if not exists public.store_guesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  store_name text not null,
  guessed_day text not null,
  guessed_time_window text,
  restock_pattern_notes text,
  product_type text,
  confidence_self_rating numeric,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_guesses_visibility_check
    check (visibility in ('private', 'shared', 'public')),
  constraint store_guesses_confidence_self_rating_check
    check (confidence_self_rating is null or (confidence_self_rating >= 0 and confidence_self_rating <= 100))
);

create index if not exists store_guesses_store_day_idx
  on public.store_guesses(store_id, guessed_day, updated_at desc);

create index if not exists store_guesses_user_idx
  on public.store_guesses(user_id, updated_at desc)
  where user_id is not null;

create index if not exists store_guesses_workspace_idx
  on public.store_guesses(workspace_id, updated_at desc)
  where workspace_id is not null;

create index if not exists store_guesses_visibility_idx
  on public.store_guesses(visibility, updated_at desc);

create table if not exists public.forecast_windows (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  store_name text not null,
  forecast_day text not null,
  forecast_time_window text,
  confidence_score numeric not null default 0,
  confidence_label text not null default 'low',
  basis_summary text,
  last_confirmed_report_at timestamptz,
  supporting_report_count integer not null default 0,
  supporting_guess_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forecast_windows_confidence_score_check
    check (confidence_score >= 0 and confidence_score <= 100),
  constraint forecast_windows_confidence_label_check
    check (confidence_label in ('low', 'medium', 'high'))
);

create index if not exists forecast_windows_store_day_idx
  on public.forecast_windows(store_id, forecast_day, updated_at desc);

create index if not exists forecast_windows_confidence_idx
  on public.forecast_windows(confidence_label, confidence_score desc, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_store_reports_updated_at on public.store_reports;
create trigger set_store_reports_updated_at
before update on public.store_reports
for each row execute function public.set_updated_at();

drop trigger if exists set_store_guesses_updated_at on public.store_guesses;
create trigger set_store_guesses_updated_at
before update on public.store_guesses
for each row execute function public.set_updated_at();

drop trigger if exists set_forecast_windows_updated_at on public.forecast_windows;
create trigger set_forecast_windows_updated_at
before update on public.forecast_windows
for each row execute function public.set_updated_at();

alter table public.store_guesses enable row level security;
alter table public.forecast_windows enable row level security;

drop policy if exists "store_guesses_read_visible" on public.store_guesses;
create policy "store_guesses_read_visible"
  on public.store_guesses for select
  to authenticated
  using (
    visibility = 'public'
    or user_id = (select auth.uid())
    or public.is_admin_or_moderator()
    or (
      visibility = 'shared'
      and workspace_id is not null
      and public.can_read_workspace(workspace_id)
    )
  );

drop policy if exists "store_guesses_insert_own_or_workspace" on public.store_guesses;
create policy "store_guesses_insert_own_or_workspace"
  on public.store_guesses for insert
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
  );

drop policy if exists "store_guesses_update_own_or_workspace" on public.store_guesses;
create policy "store_guesses_update_own_or_workspace"
  on public.store_guesses for update
  to authenticated
  using (
    public.is_admin_or_moderator()
    or user_id = (select auth.uid())
    or (
      workspace_id is not null
      and public.can_edit_workspace(workspace_id)
    )
  )
  with check (
    public.is_admin_or_moderator()
    or user_id = (select auth.uid())
    or (
      workspace_id is not null
      and public.can_edit_workspace(workspace_id)
    )
  );

drop policy if exists "store_guesses_delete_own_or_admin" on public.store_guesses;
create policy "store_guesses_delete_own_or_admin"
  on public.store_guesses for delete
  to authenticated
  using (public.is_admin_or_moderator() or user_id = (select auth.uid()));

drop policy if exists "forecast_windows_read_public" on public.forecast_windows;
create policy "forecast_windows_read_public"
  on public.forecast_windows for select
  to anon, authenticated
  using (true);

drop policy if exists "forecast_windows_admin_manage" on public.forecast_windows;
create policy "forecast_windows_admin_manage"
  on public.forecast_windows for all
  to authenticated
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

do $$
begin
  if to_regclass('public.store_reports') is not null
     and to_regprocedure('public.can_read_workspace(uuid)') is not null
     and to_regprocedure('public.can_edit_workspace(uuid)') is not null
     and to_regprocedure('public.is_admin_or_moderator()') is not null
  then
    execute 'drop policy if exists "store_reports_read_workspace_strict" on public.store_reports';
    execute $policy$
      create policy "store_reports_read_workspace_strict"
      on public.store_reports for select
      to authenticated
      using (
        visibility = 'public'
        or user_id = (select auth.uid())
        or public.can_read_workspace(workspace_id)
        or public.is_admin_or_moderator()
      )
    $policy$;
  end if;
end $$;

grant select, insert, update, delete on public.store_guesses to authenticated;
grant select on public.forecast_windows to anon, authenticated;
grant insert, update, delete on public.forecast_windows to authenticated;
grant select, insert, update on public.store_reports to authenticated;

comment on table public.store_guesses is 'User pattern guesses and personal restock notes. These are not confirmed stock reports.';
comment on table public.forecast_windows is 'App-generated store forecast windows built from reports, guesses, and historical patterns.';
comment on column public.store_reports.visibility is 'public, private_from_map, or admin_only. Private-from-map reports are not public map reports but may be visible to admins for moderation and scoring.';
comment on column public.store_reports.status is 'pending, confirmed, unverified, rejected, or stale moderation/report status.';

notify pgrst, 'reload schema';

commit;
