-- Shared data approval system for Ember & Tide beta.
-- Users submit suggestions; admins approve/merge before universal records change.

alter table public.profiles
  drop constraint if exists profiles_user_role_check;

alter table public.profiles
  add constraint profiles_user_role_check
  check (user_role in ('user', 'trusted_scout', 'moderator', 'admin'));

create or replace function public.is_admin_or_moderator()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and user_role in ('admin', 'moderator')
  );
$$;

create table if not exists public.user_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  suggestion_type text not null,
  target_table text not null,
  target_record_id text,
  submitted_data jsonb not null default '{}'::jsonb,
  current_data_snapshot jsonb,
  notes text,
  proof_url text,
  source text default 'user',
  status text not null default 'Submitted',
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_suggestions_status_check check (status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Needs More Info', 'Merged'))
);

create table if not exists public.store_suggestions (like public.user_suggestions including all);
create table if not exists public.catalog_suggestions (like public.user_suggestions including all);
create table if not exists public.sku_suggestions (like public.user_suggestions including all);
create table if not exists public.retailer_product_suggestions (like public.user_suggestions including all);
create table if not exists public.scout_report_reviews (like public.user_suggestions including all);
create table if not exists public.store_intelligence_suggestions (like public.user_suggestions including all);

create table if not exists public.admin_review_log (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid,
  suggestion_table text not null,
  action text not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_note text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_suggestions enable row level security;
alter table public.store_suggestions enable row level security;
alter table public.catalog_suggestions enable row level security;
alter table public.sku_suggestions enable row level security;
alter table public.retailer_product_suggestions enable row level security;
alter table public.scout_report_reviews enable row level security;
alter table public.store_intelligence_suggestions enable row level security;
alter table public.admin_review_log enable row level security;

drop policy if exists "users_insert_own_suggestions" on public.user_suggestions;
create policy "users_insert_own_suggestions"
on public.user_suggestions for insert
with check (auth.uid() = user_id and status in ('Draft', 'Submitted'));

drop policy if exists "users_read_own_suggestions" on public.user_suggestions;
create policy "users_read_own_suggestions"
on public.user_suggestions for select
using (auth.uid() = user_id or public.is_admin_or_moderator());

drop policy if exists "admins_manage_user_suggestions" on public.user_suggestions;
create policy "admins_manage_user_suggestions"
on public.user_suggestions for all
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "admins_read_review_log" on public.admin_review_log;
create policy "admins_read_review_log"
on public.admin_review_log for select
using (public.is_admin_or_moderator());

drop policy if exists "admins_insert_review_log" on public.admin_review_log;
create policy "admins_insert_review_log"
on public.admin_review_log for insert
with check (public.is_admin_or_moderator());

comment on table public.user_suggestions is 'Generic review queue for user-submitted universal/shared data suggestions.';
comment on table public.admin_review_log is 'Audit log for admin approval, rejection, merge, and duplicate decisions.';
