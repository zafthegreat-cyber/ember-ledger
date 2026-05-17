-- Shoreline Access Gate.
-- Creates real beta/Little Sparks request records and changes default profile access
-- from open beta to explicit approval. Additive/hardening migration only.

begin;

alter table if exists public.profiles
  add column if not exists beta_status text not null default 'not_requested',
  add column if not exists little_sparks_status text not null default 'not_applied',
  add column if not exists app_access boolean not null default false;

alter table if exists public.profiles
  drop constraint if exists profiles_beta_access_status_check,
  add constraint profiles_beta_access_status_check
    check (beta_access_status in ('not_requested', 'pending', 'approved', 'waitlist', 'denied', 'paused'));

alter table if exists public.profiles
  drop constraint if exists profiles_beta_status_check,
  add constraint profiles_beta_status_check
    check (beta_status in ('not_requested', 'pending', 'approved', 'waitlist', 'denied'));

alter table if exists public.profiles
  drop constraint if exists profiles_little_sparks_status_check,
  add constraint profiles_little_sparks_status_check
    check (little_sparks_status in ('not_applied', 'pending', 'approved', 'waitlist', 'denied'));

update public.profiles
set beta_status = case
    when beta_access_status = 'approved' then 'approved'
    when beta_access_status = 'pending' then 'pending'
    when beta_access_status in ('paused', 'waitlist') then 'waitlist'
    when beta_access_status = 'denied' then 'denied'
    else 'not_requested'
  end,
  app_access = case
    when beta_access_status = 'approved' or user_role in ('admin', 'moderator') then true
    else app_access
  end
where beta_status = 'not_requested'
  and beta_access_status is not null;

create or replace function public.has_full_app_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.app_access is true
        or p.beta_status = 'approved'
        or p.beta_access_status = 'approved'
        or p.user_role in ('admin', 'moderator')
        or public.is_admin_or_moderator()
      )
  );
$$;

revoke execute on function public.has_full_app_access() from public, anon;
grant execute on function public.has_full_app_access() to authenticated;

do $$
declare
  protected_table text;
  protected_tables text[] := array[
    -- Vault / Forge / collection / workspace-owned data.
    'user_profiles',
    'user_inventory',
    'inventory_items',
    'business_expenses',
    'sales_records',
    'mileage_trips',
    'app_user_preferences',
    'notification_preferences',
    'deal_finder_sessions',
    'deal_finder_items',
    'scanner_intake_sessions',
    'receipt_records',
    'receipt_line_items',
    'kid_community_projects',
    'kid_community_project_items',
    'user_trust_profiles',
    'workspaces',
    'workspace_members',
    'workspace_invites',
    'workspace_memberships',

    -- Scout / store signals / watchlist data.
    'stores',
    'store_regions',
    'pokemon_retail_stores',
    'store_reports',
    'store_guesses',
    'store_user_watchlist',
    'forecast_windows',

    -- Market / TideTradr / marketplace data.
    'marketplace_listings',
    'listing_photos',
    'saved_listings',
    'listing_reports',
    'listing_messages',
    'seller_profiles',
    'seller_reviews',
    'marketplace_listing_channels',
    'market_price_snapshots',
    'product_market_price_current',
    'product_market_price_history',

    -- Catalog and retail signal data used inside the app.
    'pokemon_products',
    'product_catalog',
    'tcg_expansions',
    'product_identifiers',
    'catalog_product_variants',
    'tcg_card_details',
    'master_catalog_items',
    'master_catalog_variants',
    'master_catalog_identifiers',
    'master_market_summaries',
    'master_market_price_sources',
    'retailer_products',
    'retailer_observations',
    'retailer_monitor_targets',
    'retailer_alert_log',
    'product_msrp_rules',

    -- Community/admin review/beta operations data.
    'user_suggestions',
    'store_suggestions',
    'catalog_suggestions',
    'sku_suggestions',
    'retailer_product_suggestions',
    'scout_report_reviews',
    'store_intelligence_suggestions',
    'universal_data_suggestions',
    'admin_review_log',
    'beta_feedback',
    'notifications',
    'audit_logs',
    'data_requests',
    'app_error_logs',
    'admin_user_notes',
    'kids_program_applications',
    'sponsor_interest',
    'campaign_visits',
    'store_aliases',
    'catalog_aliases',
    'beta_readiness_blockers',
    'beta_launch_materials',
    'marketing_planner_items',
    'roadmap_items',
    'ai_assist_events',
    'catalog_admin_corrections'
  ];
begin
  foreach protected_table in array protected_tables loop
    if to_regclass(format('public.%I', protected_table)) is not null then
      execute format('alter table public.%I enable row level security', protected_table);
      execute format('drop policy if exists "shoreline_full_access_guard" on public.%I', protected_table);
      execute format(
        'create policy "shoreline_full_access_guard" on public.%I as restrictive for all to authenticated using (public.has_full_app_access() or public.is_admin_or_moderator()) with check (public.has_full_app_access() or public.is_admin_or_moderator())',
        protected_table
      );
    end if;
  end loop;
end;
$$;

drop policy if exists "shoreline_private_uploads_full_access_guard" on storage.objects;
create policy "shoreline_private_uploads_full_access_guard" on storage.objects
as restrictive
for all
to authenticated
using (
  bucket_id in ('catalog-images', 'brand-assets')
  or public.has_full_app_access()
  or public.is_admin_or_moderator()
)
with check (
  bucket_id in ('catalog-images', 'brand-assets')
  or public.has_full_app_access()
  or public.is_admin_or_moderator()
);

create or replace function public.prevent_self_access_escalation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.shoreline_sync', true) = 'true' then
    return new;
  end if;
  if old.id = (select auth.uid()) and not public.is_admin_or_moderator() then
    new.beta_status = old.beta_status;
    new.beta_access_status = old.beta_access_status;
    new.beta_access_approved_at = old.beta_access_approved_at;
    new.beta_access_approved_by = old.beta_access_approved_by;
    new.beta_access_notes = old.beta_access_notes;
    new.little_sparks_status = old.little_sparks_status;
    new.app_access = old.app_access;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_access_escalation on public.profiles;
create trigger prevent_self_access_escalation
before update on public.profiles
for each row
execute function public.prevent_self_access_escalation();

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
    beta_status,
    beta_access_status,
    little_sparks_status,
    app_access,
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
    'not_requested',
    'not_requested',
    'not_applied',
    false,
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

create table if not exists public.beta_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  city_area text,
  collector_type text not null default 'other',
  reason text not null,
  local_area_answer text,
  social_handle text,
  rules_agreed boolean not null default false,
  status text not null default 'pending',
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_access_requests_status_check check (status in ('pending', 'approved', 'waitlist', 'denied')),
  constraint beta_access_requests_collector_type_check check (collector_type in ('parent_family', 'kid_collector', 'casual_collector', 'seller', 'local_shop', 'other')),
  constraint beta_access_requests_user_unique unique (user_id)
);

create table if not exists public.little_sparks_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guardian_name text not null,
  email text not null,
  child_nickname text not null,
  child_age integer check (child_age is null or (child_age >= 0 and child_age <= 17)),
  city_area text,
  hoped_products text,
  application_note text,
  guardian_confirmed boolean not null default false,
  inventory_limited_ack boolean not null default false,
  quantity_limit_ack boolean not null default false,
  anti_resale_ack boolean not null default false,
  status text not null default 'pending',
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint little_sparks_applications_status_check check (status in ('pending', 'approved', 'waitlist', 'denied')),
  constraint little_sparks_applications_user_unique unique (user_id)
);

create index if not exists beta_access_requests_status_idx on public.beta_access_requests(status, created_at desc);
create index if not exists little_sparks_applications_status_idx on public.little_sparks_applications(status, created_at desc);

alter table public.beta_access_requests enable row level security;
alter table public.little_sparks_applications enable row level security;

drop policy if exists "beta_access_user_read_own" on public.beta_access_requests;
create policy "beta_access_user_read_own" on public.beta_access_requests
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin_or_moderator());

drop policy if exists "beta_access_user_insert_own" on public.beta_access_requests;
create policy "beta_access_user_insert_own" on public.beta_access_requests
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "beta_access_user_update_own" on public.beta_access_requests;
create policy "beta_access_user_update_own" on public.beta_access_requests
for update to authenticated
using (user_id = (select auth.uid()) or public.is_admin_or_moderator())
with check (user_id = (select auth.uid()) or public.is_admin_or_moderator());

drop policy if exists "little_sparks_user_read_own" on public.little_sparks_applications;
create policy "little_sparks_user_read_own" on public.little_sparks_applications
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin_or_moderator());

drop policy if exists "little_sparks_user_insert_own" on public.little_sparks_applications;
create policy "little_sparks_user_insert_own" on public.little_sparks_applications
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "little_sparks_user_update_own" on public.little_sparks_applications;
create policy "little_sparks_user_update_own" on public.little_sparks_applications
for update to authenticated
using (user_id = (select auth.uid()) or public.is_admin_or_moderator())
with check (user_id = (select auth.uid()) or public.is_admin_or_moderator());

create or replace function public.normalize_shoreline_request_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and not public.is_admin_or_moderator() then
    new.status = 'pending';
    new.admin_notes = null;
    new.reviewed_by = null;
    new.reviewed_at = null;
  elsif not public.is_admin_or_moderator() then
    new.status = 'pending';
    new.admin_notes = old.admin_notes;
    new.reviewed_by = old.reviewed_by;
    new.reviewed_at = old.reviewed_at;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.reviewed_by = (select auth.uid());
    new.reviewed_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_little_sparks_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and not public.is_admin_or_moderator() then
    new.status = 'pending';
    new.admin_notes = null;
    new.reviewed_by = null;
    new.reviewed_at = null;
  elsif not public.is_admin_or_moderator() then
    new.status = 'pending';
    new.admin_notes = old.admin_notes;
    new.reviewed_by = old.reviewed_by;
    new.reviewed_at = old.reviewed_at;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.reviewed_by = (select auth.uid());
    new.reviewed_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists normalize_shoreline_request_review on public.beta_access_requests;
create trigger normalize_shoreline_request_review
before insert or update on public.beta_access_requests
for each row execute function public.normalize_shoreline_request_review();

drop trigger if exists normalize_little_sparks_review on public.little_sparks_applications;
create trigger normalize_little_sparks_review
before insert or update on public.little_sparks_applications
for each row execute function public.normalize_little_sparks_review();

drop trigger if exists set_beta_access_requests_updated_at on public.beta_access_requests;
create trigger set_beta_access_requests_updated_at
before insert on public.beta_access_requests
for each row execute function public.set_beta_readiness_updated_at();

drop trigger if exists set_little_sparks_applications_updated_at on public.little_sparks_applications;
create trigger set_little_sparks_applications_updated_at
before insert on public.little_sparks_applications
for each row execute function public.set_beta_readiness_updated_at();

create or replace function public.sync_beta_access_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform set_config('app.shoreline_sync', 'true', true);
  update public.profiles
  set beta_status = new.status,
      beta_access_status = new.status,
      beta_access_requested_at = coalesce(beta_access_requested_at, new.created_at),
      beta_access_approved_at = case when new.status = 'approved' then coalesce(new.reviewed_at, now()) else null end,
      beta_access_approved_by = case when new.status = 'approved' then new.reviewed_by else null end,
      app_access = case when new.status = 'approved' then true else false end,
      updated_at = now()
  where id = new.user_id
    and user_role not in ('admin', 'moderator');
  return new;
end;
$$;

create or replace function public.sync_little_sparks_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform set_config('app.shoreline_sync', 'true', true);
  update public.profiles
  set little_sparks_status = new.status,
      updated_at = now()
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists sync_beta_access_profile on public.beta_access_requests;
create trigger sync_beta_access_profile
after insert or update on public.beta_access_requests
for each row execute function public.sync_beta_access_profile();

drop trigger if exists sync_little_sparks_profile on public.little_sparks_applications;
create trigger sync_little_sparks_profile
after insert or update on public.little_sparks_applications
for each row execute function public.sync_little_sparks_profile();

revoke all on public.beta_access_requests from public, anon;
revoke all on public.little_sparks_applications from public, anon;
grant select, insert, update on public.beta_access_requests to authenticated;
grant select, insert, update on public.little_sparks_applications to authenticated;

commit;
