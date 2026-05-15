-- Beta Readiness Foundation Pack.
-- Additive schema only. Does not backfill, repair migration history, or connect providers.

begin;

create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_beta_readiness_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table if exists public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists full_name text,
  add column if not exists preferred_region text,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_preferences jsonb,
  add column if not exists first_login_seen boolean not null default false,
  add column if not exists plan_tier text not null default 'free',
  add column if not exists trial_tier text,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz,
  add column if not exists subscription_status text not null default 'none',
  add column if not exists subscription_provider text,
  add column if not exists subscription_provider_id text,
  add column if not exists plan_updated_at timestamptz,
  add column if not exists beta_access_status text not null default 'approved',
  add column if not exists beta_access_requested_at timestamptz,
  add column if not exists beta_access_approved_at timestamptz,
  add column if not exists beta_access_approved_by uuid references auth.users(id),
  add column if not exists beta_access_notes text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists beta_acknowledged_at timestamptz,
  add column if not exists consent_text jsonb;

alter table if exists public.profiles
  drop constraint if exists profiles_plan_tier_check,
  add constraint profiles_plan_tier_check check (plan_tier in ('guest', 'free', 'mid', 'premium'));

alter table if exists public.profiles
  drop constraint if exists profiles_trial_tier_check,
  add constraint profiles_trial_tier_check check (trial_tier is null or trial_tier in ('mid', 'premium'));

alter table if exists public.profiles
  drop constraint if exists profiles_subscription_status_foundation_check,
  add constraint profiles_subscription_status_foundation_check
    check (subscription_status in ('none', 'trialing', 'active', 'past_due', 'canceled', 'expired'));

alter table if exists public.profiles
  drop constraint if exists profiles_beta_access_status_check,
  add constraint profiles_beta_access_status_check
    check (beta_access_status in ('pending', 'approved', 'paused', 'denied'));

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    full_name,
    display_name,
    user_role,
    tier,
    plan_tier,
    beta_access_status,
    beta_access_requested_at,
    terms_accepted_at,
    privacy_accepted_at,
    beta_acknowledged_at,
    consent_text
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name'), ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    ),
    'user',
    'free',
    'free',
    'approved',
    now(),
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'privacy_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'beta_acknowledged_at', '')::timestamptz,
    coalesce(new.raw_user_meta_data -> 'consent_text', '{}'::jsonb)
  )
  on conflict (id) do update
  set email = excluded.email,
      first_name = coalesce(public.profiles.first_name, excluded.first_name),
      last_name = coalesce(public.profiles.last_name, excluded.last_name),
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at),
      privacy_accepted_at = coalesce(public.profiles.privacy_accepted_at, excluded.privacy_accepted_at),
      beta_acknowledged_at = coalesce(public.profiles.beta_acknowledged_at, excluded.beta_acknowledged_at),
      consent_text = coalesce(public.profiles.consent_text, excluded.consent_text),
      updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

create table if not exists public.kids_program_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  parent_name text,
  email text not null,
  child_first_name text,
  child_age_range text,
  zip_code text,
  favorite_pokemon text,
  collecting_interest text,
  reason text,
  requested_access text,
  agrees_no_resale boolean not null default false,
  consent_text text not null,
  status text not null default 'pending_review',
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kids_program_applications_status_check
    check (status in ('not_applied', 'pending_review', 'approved', 'waitlisted', 'denied', 'suspended', 'archived'))
);

create unique index if not exists kids_program_one_active_email_idx
  on public.kids_program_applications (lower(email))
  where status in ('pending_review', 'approved', 'waitlisted', 'suspended');

create index if not exists kids_program_user_status_idx on public.kids_program_applications(user_id, status, created_at desc);
create index if not exists kids_program_status_created_idx on public.kids_program_applications(status, created_at desc);
create index if not exists kids_program_zip_idx on public.kids_program_applications(zip_code) where zip_code is not null;

drop trigger if exists set_kids_program_applications_updated_at on public.kids_program_applications;
create trigger set_kids_program_applications_updated_at
before update on public.kids_program_applications
for each row execute function public.set_beta_readiness_updated_at();

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  guest_email text,
  feedback_type text not null,
  page text,
  title text not null,
  description text not null,
  expected_result text,
  severity text not null default 'normal',
  status text not null default 'new',
  screenshot_url text,
  device_info jsonb,
  browser_info text,
  app_version text,
  related_entity_type text,
  related_entity_id uuid,
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_feedback_type_check check (feedback_type in (
    'Bug',
    'UI issue',
    'Missing product',
    'Wrong catalog info',
    'Scanner problem',
    'Receipt problem',
    'Store report issue',
    'Forecast/prediction issue',
    'Kids Program question',
    'Feature request',
    'Other'
  )),
  constraint beta_feedback_severity_check check (severity in ('low', 'normal', 'high', 'blocking')),
  constraint beta_feedback_status_check check (status in ('new', 'reviewing', 'planned', 'fixed', 'rejected', 'duplicate', 'archived'))
);

create index if not exists beta_feedback_status_created_idx on public.beta_feedback(status, created_at desc);
create index if not exists beta_feedback_user_created_idx on public.beta_feedback(user_id, created_at desc) where user_id is not null;
create index if not exists beta_feedback_type_status_idx on public.beta_feedback(feedback_type, status);

drop trigger if exists set_beta_feedback_updated_at on public.beta_feedback;
create trigger set_beta_feedback_updated_at
before update on public.beta_feedback
for each row execute function public.set_beta_readiness_updated_at();

create table if not exists public.sponsor_interest (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  email text not null,
  phone text,
  website_url text,
  city text,
  partnership_types jsonb not null default '[]'::jsonb,
  message text,
  consent_text text not null,
  status text not null default 'new',
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_interest_status_check check (status in ('new', 'reviewing', 'contacted', 'partnered', 'rejected', 'archived'))
);

create index if not exists sponsor_interest_status_created_idx on public.sponsor_interest(status, created_at desc);
create index if not exists sponsor_interest_email_created_idx on public.sponsor_interest(lower(email), created_at desc);

drop trigger if exists set_sponsor_interest_updated_at on public.sponsor_interest;
create trigger set_sponsor_interest_updated_at
before update on public.sponsor_interest
for each row execute function public.set_beta_readiness_updated_at();

alter table if exists public.notification_preferences
  add column if not exists stock_alerts boolean not null default true,
  add column if not exists restock_predictions boolean not null default true,
  add column if not exists wishlist_matches boolean not null default true,
  add column if not exists kids_program_updates boolean not null default true,
  add column if not exists giveaways boolean not null default true,
  add column if not exists receipt_review_reminders boolean not null default true,
  add column if not exists inventory_value_changes boolean not null default false,
  add column if not exists catalog_updates boolean not null default false,
  add column if not exists workspace_invites boolean not null default true,
  add column if not exists admin_review_alerts boolean not null default false,
  add column if not exists email_enabled boolean not null default true,
  add column if not exists sms_enabled boolean not null default false,
  add column if not exists phone text,
  add column if not exists sms_consent_text text,
  add column if not exists sms_verified_at timestamptz,
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start text,
  add column if not exists quiet_hours_end text;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  type text not null,
  channel text not null default 'in_app',
  title text not null,
  message text not null,
  action_url text,
  related_entity_type text,
  related_entity_id uuid,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in (
    'stock_alert',
    'restock_prediction',
    'wishlist_match',
    'kids_program_update',
    'giveaway',
    'receipt_review',
    'inventory_value_change',
    'catalog_update',
    'workspace_invite',
    'admin_review_needed',
    'account_notice'
  )),
  constraint notifications_channel_check check (channel in ('in_app', 'email', 'sms'))
);

create index if not exists notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null and dismissed_at is null;
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table if not exists public.market_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid,
  inventory_item_id uuid,
  item_type text,
  product_name text,
  variant text,
  condition text,
  graded boolean not null default false,
  grade_company text,
  grade text,
  source text not null,
  price_type text,
  price numeric,
  currency text not null default 'USD',
  low_price numeric,
  high_price numeric,
  market_price numeric,
  last_sold_price numeric,
  average_price numeric,
  captured_at timestamptz not null default now(),
  source_url text,
  confidence_score numeric,
  created_at timestamptz not null default now(),
  constraint market_price_snapshots_confidence_check
    check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100))
);

create index if not exists market_price_snapshots_catalog_captured_idx on public.market_price_snapshots(catalog_item_id, captured_at desc) where catalog_item_id is not null;
create index if not exists market_price_snapshots_inventory_captured_idx on public.market_price_snapshots(inventory_item_id, captured_at desc) where inventory_item_id is not null;

alter table if exists public.inventory_items
  add column if not exists purchase_price numeric,
  add column if not exists market_value numeric,
  add column if not exists market_value_source text,
  add column if not exists market_value_updated_at timestamptz,
  add column if not exists manual_value_override boolean not null default false,
  add column if not exists manual_value numeric,
  add column if not exists sale_price numeric,
  add column if not exists platform_fee numeric,
  add column if not exists shipping_cost numeric,
  add column if not exists estimated_profit numeric,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.user_inventory
  add column if not exists purchase_price numeric,
  add column if not exists market_value numeric,
  add column if not exists market_value_source text,
  add column if not exists market_value_updated_at timestamptz,
  add column if not exists manual_value_override boolean not null default false,
  add column if not exists manual_value numeric,
  add column if not exists sale_price numeric,
  add column if not exists platform_fee numeric,
  add column if not exists shipping_cost numeric,
  add column if not exists estimated_profit numeric,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.master_catalog_items
  add column if not exists msrp numeric,
  add column if not exists market_price numeric,
  add column if not exists market_price_source text,
  add column if not exists market_price_updated_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.pokemon_products
  add column if not exists msrp numeric,
  add column if not exists market_price numeric,
  add column if not exists market_price_source text,
  add column if not exists market_price_updated_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.receipt_records
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.receipt_line_items
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.store_reports
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists status text;

alter table if exists public.store_guesses
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.workspaces
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  source text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at desc) where actor_user_id is not null;
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc) where entity_id is not null;

create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  request_type text not null,
  message text,
  status text not null default 'new',
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_requests_type_check check (request_type in ('data_export', 'account_deletion', 'profile_correction', 'privacy_question', 'other')),
  constraint data_requests_status_check check (status in ('new', 'reviewing', 'completed', 'rejected', 'archived'))
);

create index if not exists data_requests_user_created_idx on public.data_requests(user_id, created_at desc) where user_id is not null;
create index if not exists data_requests_status_created_idx on public.data_requests(status, created_at desc);

drop trigger if exists set_data_requests_updated_at on public.data_requests;
create trigger set_data_requests_updated_at
before update on public.data_requests
for each row execute function public.set_beta_readiness_updated_at();

create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  page text,
  action text,
  error_message text not null,
  error_code text,
  severity text not null default 'normal',
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint app_error_logs_severity_check check (severity in ('low', 'normal', 'high', 'blocking'))
);

create index if not exists app_error_logs_created_idx on public.app_error_logs(created_at desc);
create index if not exists app_error_logs_severity_created_idx on public.app_error_logs(severity, created_at desc);

create table if not exists public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid references auth.users(id) on delete cascade,
  subject_email text,
  note text not null,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_user_notes_subject_idx on public.admin_user_notes(subject_user_id, created_at desc) where subject_user_id is not null;
create index if not exists admin_user_notes_email_idx on public.admin_user_notes(lower(subject_email), created_at desc) where subject_email is not null;

drop trigger if exists set_admin_user_notes_updated_at on public.admin_user_notes;
create trigger set_admin_user_notes_updated_at
before update on public.admin_user_notes
for each row execute function public.set_beta_readiness_updated_at();

create table if not exists public.store_aliases (
  id uuid primary key default gen_random_uuid(),
  store_location_id uuid references public.stores(id) on delete cascade,
  alias text not null,
  alias_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists store_aliases_unique_idx on public.store_aliases(store_location_id, lower(alias));
create index if not exists store_aliases_alias_trgm_idx on public.store_aliases using gin (alias gin_trgm_ops);

create table if not exists public.catalog_aliases (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid references public.master_catalog_items(id) on delete cascade,
  alias text not null,
  alias_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists catalog_aliases_unique_idx on public.catalog_aliases(catalog_item_id, lower(alias));
create index if not exists catalog_aliases_alias_trgm_idx on public.catalog_aliases using gin (alias gin_trgm_ops);

create table if not exists public.beta_readiness_blockers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text not null default 'medium',
  owner text,
  notes text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint beta_readiness_blockers_severity_check check (severity in ('blocking', 'high', 'medium', 'low')),
  constraint beta_readiness_blockers_status_check check (status in ('open', 'in_progress', 'resolved', 'archived'))
);

create table if not exists public.beta_launch_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  material_type text not null,
  audience text,
  body text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_visits (
  id uuid primary key default gen_random_uuid(),
  ref_code text,
  landing_path text,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists campaign_visits_ref_created_idx on public.campaign_visits(ref_code, created_at desc);

create table if not exists public.marketing_planner_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content_type text,
  platform text,
  status text not null default 'idea',
  scheduled_date date,
  caption text,
  image_needed boolean not null default false,
  link_url text,
  campaign_ref_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_planner_status_check check (status in ('idea', 'drafted', 'needs_image', 'ready', 'posted', 'archived'))
);

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  title text not null,
  notes text,
  status text not null default 'idea',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmap_items_section_check check (section in ('Now', 'Next', 'Later', 'Do Not Build Yet')),
  constraint roadmap_items_status_check check (status in ('idea', 'planned', 'in_progress', 'blocked', 'done', 'deferred'))
);

alter table public.kids_program_applications enable row level security;
alter table public.beta_feedback enable row level security;
alter table public.sponsor_interest enable row level security;
alter table public.notifications enable row level security;
alter table public.market_price_snapshots enable row level security;
alter table public.audit_logs enable row level security;
alter table public.data_requests enable row level security;
alter table public.app_error_logs enable row level security;
alter table public.admin_user_notes enable row level security;
alter table public.store_aliases enable row level security;
alter table public.catalog_aliases enable row level security;
alter table public.beta_readiness_blockers enable row level security;
alter table public.beta_launch_materials enable row level security;
alter table public.campaign_visits enable row level security;
alter table public.marketing_planner_items enable row level security;
alter table public.roadmap_items enable row level security;

drop policy if exists "kids_program_user_read_own" on public.kids_program_applications;
create policy "kids_program_user_read_own" on public.kids_program_applications
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin_or_moderator());

drop policy if exists "kids_program_user_insert_own" on public.kids_program_applications;
create policy "kids_program_user_insert_own" on public.kids_program_applications
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "kids_program_admin_update" on public.kids_program_applications;
create policy "kids_program_admin_update" on public.kids_program_applications
for update to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "beta_feedback_read_own_or_admin" on public.beta_feedback;
create policy "beta_feedback_read_own_or_admin" on public.beta_feedback
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin_or_moderator());

drop policy if exists "beta_feedback_insert_auth" on public.beta_feedback;
create policy "beta_feedback_insert_auth" on public.beta_feedback
for insert to authenticated
with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "beta_feedback_insert_anon" on public.beta_feedback;
create policy "beta_feedback_insert_anon" on public.beta_feedback
for insert to anon
with check (user_id is null);

drop policy if exists "beta_feedback_admin_update" on public.beta_feedback;
create policy "beta_feedback_admin_update" on public.beta_feedback
for update to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "sponsor_interest_insert_public" on public.sponsor_interest;
create policy "sponsor_interest_insert_public" on public.sponsor_interest
for insert to anon, authenticated
with check (true);

drop policy if exists "sponsor_interest_admin_read" on public.sponsor_interest;
create policy "sponsor_interest_admin_read" on public.sponsor_interest
for select to authenticated
using (public.is_admin_or_moderator());

drop policy if exists "sponsor_interest_admin_update" on public.sponsor_interest;
create policy "sponsor_interest_admin_update" on public.sponsor_interest
for update to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "notifications_manage_own" on public.notifications;
create policy "notifications_manage_own" on public.notifications
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "market_price_snapshots_read_auth" on public.market_price_snapshots;
create policy "market_price_snapshots_read_auth" on public.market_price_snapshots
for select to authenticated
using (true);

drop policy if exists "market_price_snapshots_admin_write" on public.market_price_snapshots;
create policy "market_price_snapshots_admin_write" on public.market_price_snapshots
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "audit_logs_admin_only" on public.audit_logs;
create policy "audit_logs_admin_only" on public.audit_logs
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "data_requests_read_own_or_admin" on public.data_requests;
create policy "data_requests_read_own_or_admin" on public.data_requests
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin_or_moderator());

drop policy if exists "data_requests_insert_auth" on public.data_requests;
create policy "data_requests_insert_auth" on public.data_requests
for insert to authenticated
with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "data_requests_insert_anon" on public.data_requests;
create policy "data_requests_insert_anon" on public.data_requests
for insert to anon
with check (user_id is null);

drop policy if exists "data_requests_admin_update" on public.data_requests;
create policy "data_requests_admin_update" on public.data_requests
for update to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "app_error_logs_admin_only" on public.app_error_logs;
create policy "app_error_logs_admin_only" on public.app_error_logs
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "admin_user_notes_admin_only" on public.admin_user_notes;
create policy "admin_user_notes_admin_only" on public.admin_user_notes
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "store_aliases_read_auth" on public.store_aliases;
create policy "store_aliases_read_auth" on public.store_aliases
for select to authenticated
using (true);

drop policy if exists "store_aliases_admin_write" on public.store_aliases;
create policy "store_aliases_admin_write" on public.store_aliases
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "catalog_aliases_read_auth" on public.catalog_aliases;
create policy "catalog_aliases_read_auth" on public.catalog_aliases
for select to authenticated
using (true);

drop policy if exists "catalog_aliases_admin_write" on public.catalog_aliases;
create policy "catalog_aliases_admin_write" on public.catalog_aliases
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "admin_readiness_admin_only" on public.beta_readiness_blockers;
create policy "admin_readiness_admin_only" on public.beta_readiness_blockers
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "admin_launch_materials_admin_only" on public.beta_launch_materials;
create policy "admin_launch_materials_admin_only" on public.beta_launch_materials
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "campaign_visits_insert_public" on public.campaign_visits;
create policy "campaign_visits_insert_public" on public.campaign_visits
for insert to anon, authenticated
with check (true);

drop policy if exists "campaign_visits_admin_read" on public.campaign_visits;
create policy "campaign_visits_admin_read" on public.campaign_visits
for select to authenticated
using (public.is_admin_or_moderator());

drop policy if exists "marketing_planner_admin_only" on public.marketing_planner_items;
create policy "marketing_planner_admin_only" on public.marketing_planner_items
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "roadmap_items_admin_only" on public.roadmap_items;
create policy "roadmap_items_admin_only" on public.roadmap_items
for all to authenticated
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

grant select, insert, update on public.kids_program_applications to authenticated;
grant select, insert, update on public.beta_feedback to anon, authenticated;
grant select, insert, update on public.sponsor_interest to anon, authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select on public.market_price_snapshots to authenticated;
grant select, insert, update on public.data_requests to anon, authenticated;
grant select, insert on public.app_error_logs to authenticated;
grant select, insert, update on public.admin_user_notes to authenticated;
grant select on public.store_aliases to authenticated;
grant select on public.catalog_aliases to authenticated;
grant insert on public.campaign_visits to anon, authenticated;
grant select, insert, update on public.beta_readiness_blockers to authenticated;
grant select, insert, update on public.beta_launch_materials to authenticated;
grant select, insert, update on public.marketing_planner_items to authenticated;
grant select, insert, update on public.roadmap_items to authenticated;

insert into storage.buckets (id, name, public)
values
  ('receipt-images', 'receipt-images', false),
  ('product-submissions', 'product-submissions', false),
  ('feedback-screenshots', 'feedback-screenshots', false),
  ('catalog-images', 'catalog-images', true),
  ('brand-assets', 'brand-assets', true)
on conflict (id) do update
set public = excluded.public;

create or replace function public.storage_workspace_id_from_object_name(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, storage
as $$
declare
  path_parts text[];
begin
  path_parts := storage.foldername(object_name);
  if array_length(path_parts, 1) < 2 or path_parts[1] <> 'workspaces' then
    return null;
  end if;
  return path_parts[2]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.storage_workspace_id_from_object_name(text) from public, anon;
grant execute on function public.storage_workspace_id_from_object_name(text) to authenticated;

drop policy if exists "beta_private_uploads_read" on storage.objects;
create policy "beta_private_uploads_read" on storage.objects
for select to authenticated
using (
  bucket_id in ('receipt-images', 'product-submissions', 'feedback-screenshots')
  and (
    public.is_admin_or_moderator()
    or ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'workspaces' and public.can_read_workspace(public.storage_workspace_id_from_object_name(name)))
  )
);

drop policy if exists "beta_private_uploads_insert" on storage.objects;
create policy "beta_private_uploads_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id in ('receipt-images', 'product-submissions', 'feedback-screenshots')
  and (
    public.is_admin_or_moderator()
    or ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'workspaces' and public.can_edit_workspace(public.storage_workspace_id_from_object_name(name)))
  )
);

drop policy if exists "beta_private_uploads_update" on storage.objects;
create policy "beta_private_uploads_update" on storage.objects
for update to authenticated
using (
  bucket_id in ('receipt-images', 'product-submissions', 'feedback-screenshots')
  and (
    public.is_admin_or_moderator()
    or ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'workspaces' and public.can_edit_workspace(public.storage_workspace_id_from_object_name(name)))
  )
)
with check (
  bucket_id in ('receipt-images', 'product-submissions', 'feedback-screenshots')
  and (
    public.is_admin_or_moderator()
    or ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'workspaces' and public.can_edit_workspace(public.storage_workspace_id_from_object_name(name)))
  )
);

drop policy if exists "beta_private_uploads_delete" on storage.objects;
create policy "beta_private_uploads_delete" on storage.objects
for delete to authenticated
using (
  bucket_id in ('receipt-images', 'product-submissions', 'feedback-screenshots')
  and (
    public.is_admin_or_moderator()
    or ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'workspaces' and public.can_edit_workspace(public.storage_workspace_id_from_object_name(name)))
  )
);

drop policy if exists "beta_public_assets_read" on storage.objects;
create policy "beta_public_assets_read" on storage.objects
for select to anon, authenticated
using (bucket_id in ('catalog-images', 'brand-assets'));

drop policy if exists "beta_public_assets_admin_manage" on storage.objects;
create policy "beta_public_assets_admin_manage" on storage.objects
for all to authenticated
using (
  bucket_id in ('catalog-images', 'brand-assets')
  and public.is_admin_or_moderator()
)
with check (
  bucket_id in ('catalog-images', 'brand-assets')
  and public.is_admin_or_moderator()
);

insert into public.store_aliases (store_location_id, alias, alias_type)
select s.id, alias.alias, 'local_nickname'
from public.stores s
join (values
  ('Walmart', 'Suffolk', 'College Drive Walmart'),
  ('Walmart', 'Franklin', 'Franklin Walmart'),
  ('Walmart', 'Suffolk', 'Suffolk Walmart'),
  ('Walmart', 'Virginia Beach', 'Town Center Walmart'),
  ('Target', 'Chesapeake', 'Greenbrier Target')
) as alias(chain, city, alias)
  on lower(s.chain) = lower(alias.chain)
 and lower(s.city) = lower(alias.city)
on conflict do nothing;

insert into public.catalog_aliases (catalog_item_id, alias, alias_type)
select m.id, alias.alias, 'search_alias'
from public.master_catalog_items m
join (values
  ('ETB'),
  ('Elite Trainer Box'),
  ('UPC'),
  ('Ultra-Premium Collection'),
  ('PC ETB'),
  ('Pokemon Center ETB'),
  ('booster bundle'),
  ('Prismatic'),
  ('Prismatic Evolutions'),
  ('PE'),
  ('SV151'),
  ('Surging Sparks'),
  ('SSP')
) as alias(alias)
  on lower(coalesce(m.name, '')) like '%' || lower(alias.alias) || '%'
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
