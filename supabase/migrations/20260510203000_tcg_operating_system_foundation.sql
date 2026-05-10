-- Phase 2 TCG operating system foundation.
-- Additive schema for preferences, notifications, Deal Finder, scanner intake,
-- receipts, kid/community projects, trust profiles, and marketplace channels.

begin;

create table if not exists public.app_user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  dashboard_preset text not null default 'collector'
    check (dashboard_preset in ('collector', 'seller', 'budget_parent', 'restock_scout', 'full_business', 'simple')),
  enabled_home_cards jsonb not null default '{}'::jsonb,
  enabled_dashboard_sections jsonb not null default '{}'::jsonb,
  default_visibility text not null default 'private'
    check (default_visibility in ('private', 'shared_workspace', 'anonymous_signal', 'public')),
  quiet_hours jsonb not null default '{}'::jsonb,
  notification_channels jsonb not null default '{"push":false,"text":false,"email":false,"inApp":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  alert_type text not null
    check (alert_type in (
      'online_restock',
      'in_store_report',
      'store_prediction',
      'price_drop',
      'wishlist_target',
      'market_spike',
      'stale_listing',
      'budget_warning',
      'deal_found',
      'new_product_release',
      'local_tidepool_post'
    )),
  enabled boolean not null default true,
  channels jsonb not null default '{"inApp":true}'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  quiet_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, alert_type)
);

create table if not exists public.deal_finder_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'scan', 'photo', 'pasted_text', 'marketplace_screenshot', 'batch_list')),
  title text not null default '',
  asking_price numeric,
  market_total numeric,
  msrp_total numeric,
  fee_estimate numeric,
  shipping_estimate numeric,
  net_profit numeric,
  roi_percent numeric,
  risk_score numeric,
  deal_score numeric,
  recommendation text
    check (recommendation is null or recommendation in ('buy', 'maybe', 'skip', 'personal_collection_only', 'community_price')),
  notes text,
  raw_input text,
  visibility text not null default 'private'
    check (visibility in ('private', 'shared_workspace', 'anonymous_signal', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deal_finder_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.deal_finder_sessions(id) on delete cascade,
  catalog_item_id uuid references public.master_catalog_items(id) on delete set null,
  product_name text not null default '',
  product_type text,
  quantity numeric not null default 1,
  asking_price numeric,
  msrp numeric,
  market_value numeric,
  estimated_sale_price numeric,
  fees numeric,
  shipping numeric,
  net_profit numeric,
  roi_percent numeric,
  risk_note text,
  raw_product_text text,
  matched_confidence text
    check (matched_confidence is null or matched_confidence in ('confirmed', 'likely', 'possible', 'guess')),
  created_at timestamptz not null default now()
);

create table if not exists public.scanner_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  scan_type text not null
    check (scan_type in ('upc', 'sku', 'card_image', 'sealed_image', 'slab_label', 'receipt', 'shelf_photo', 'marketplace_screenshot', 'manual')),
  raw_value text,
  matched_catalog_item_id uuid references public.master_catalog_items(id) on delete set null,
  match_confidence numeric,
  destination text
    check (destination is null or destination in ('vault', 'forge', 'wishlist', 'deal_finder', 'store_report', 'marketplace_listing', 'search_only')),
  status text not null default 'review'
    check (status in ('review', 'confirmed', 'saved', 'discarded', 'needs_catalog_review')),
  extracted_clues jsonb not null default '{}'::jsonb,
  possible_matches jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_listing_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  source_inventory_id text,
  catalog_item_id uuid references public.master_catalog_items(id) on delete set null,
  platform text not null
    check (platform in ('facebook', 'ebay', 'whatnot', 'instagram', 'local', 'in_person', 'other')),
  listing_title text not null default '',
  listing_description text,
  listed_price numeric,
  platform_fees numeric,
  shipping_cost numeric,
  listing_status text not null default 'draft'
    check (listing_status in ('draft', 'listed', 'cross_listed', 'sold', 'delisted', 'stale')),
  external_url text,
  sku_label text,
  last_refreshed_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  merchant text,
  purchased_at timestamptz,
  total numeric,
  tax numeric,
  payment_method text,
  category text,
  image_url text,
  split_mode text
    check (split_mode is null or split_mode in ('expense_only', 'forge', 'vault', 'split_business_personal', 'attach_existing')),
  business_total numeric,
  personal_total numeric,
  notes text,
  raw_ocr_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_line_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipt_records(id) on delete cascade,
  catalog_item_id uuid references public.master_catalog_items(id) on delete set null,
  product_name text not null default '',
  quantity numeric not null default 1,
  unit_price numeric,
  line_total numeric,
  destination text
    check (destination is null or destination in ('expense_only', 'forge', 'vault', 'wishlist')),
  matched_confidence text
    check (matched_confidence is null or matched_confidence in ('confirmed', 'likely', 'possible', 'needs_review')),
  created_at timestamptz not null default now()
);

create table if not exists public.kid_community_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  project_type text not null default 'kid_pack_builder'
    check (project_type in ('kid_pack_builder', 'donation_tracker', 'giveaway', 'event_prep', 'community_price')),
  name text not null,
  budget numeric,
  target_pack_count integer,
  cost_per_pack numeric,
  donation_total numeric,
  event_date date,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'completed', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kid_community_project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.kid_community_projects(id) on delete cascade,
  catalog_item_id uuid references public.master_catalog_items(id) on delete set null,
  item_name text not null,
  quantity numeric not null default 1,
  unit_cost numeric,
  msrp numeric,
  market_value numeric,
  community_price numeric,
  donation_amount numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_trust_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  city_region text,
  trusted_reporter_badge boolean not null default false,
  seller_badge boolean not null default false,
  verified_reports integer not null default 0,
  helpful_reports integer not null default 0,
  false_reports integer not null default 0,
  community_thanks integer not null default 0,
  scout_score numeric not null default 72,
  profile_visibility text not null default 'private'
    check (profile_visibility in ('private', 'shared_workspace', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_user_preferences enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.deal_finder_sessions enable row level security;
alter table public.deal_finder_items enable row level security;
alter table public.scanner_intake_sessions enable row level security;
alter table public.marketplace_listing_channels enable row level security;
alter table public.receipt_records enable row level security;
alter table public.receipt_line_items enable row level security;
alter table public.kid_community_projects enable row level security;
alter table public.kid_community_project_items enable row level security;
alter table public.user_trust_profiles enable row level security;

create index if not exists app_user_preferences_user_idx on public.app_user_preferences(user_id);
create index if not exists notification_preferences_user_type_idx on public.notification_preferences(user_id, alert_type);
create index if not exists deal_finder_sessions_user_created_idx on public.deal_finder_sessions(user_id, created_at desc);
create index if not exists deal_finder_items_session_idx on public.deal_finder_items(session_id);
create index if not exists scanner_intake_sessions_user_created_idx on public.scanner_intake_sessions(user_id, created_at desc);
create index if not exists marketplace_listing_channels_workspace_status_idx on public.marketplace_listing_channels(workspace_id, listing_status);
create index if not exists receipt_records_user_created_idx on public.receipt_records(user_id, created_at desc);
create index if not exists kid_community_projects_workspace_status_idx on public.kid_community_projects(workspace_id, status);

drop policy if exists "Users manage own app preferences" on public.app_user_preferences;
create policy "Users manage own app preferences" on public.app_user_preferences
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences" on public.notification_preferences
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own deal sessions" on public.deal_finder_sessions;
create policy "Users manage own deal sessions" on public.deal_finder_sessions
for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_or_moderator())
with check ((select auth.uid()) = user_id or public.is_admin_or_moderator());

drop policy if exists "Users read own deal items" on public.deal_finder_items;
create policy "Users read own deal items" on public.deal_finder_items
for select to authenticated
using (
  exists (
    select 1 from public.deal_finder_sessions session
    where session.id = deal_finder_items.session_id
      and (session.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
);

drop policy if exists "Users write own deal items" on public.deal_finder_items;
create policy "Users write own deal items" on public.deal_finder_items
for all to authenticated
using (
  exists (
    select 1 from public.deal_finder_sessions session
    where session.id = deal_finder_items.session_id
      and (session.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
)
with check (
  exists (
    select 1 from public.deal_finder_sessions session
    where session.id = deal_finder_items.session_id
      and (session.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
);

drop policy if exists "Users manage own scanner sessions" on public.scanner_intake_sessions;
create policy "Users manage own scanner sessions" on public.scanner_intake_sessions
for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_or_moderator())
with check ((select auth.uid()) = user_id or public.is_admin_or_moderator());

drop policy if exists "Users manage own marketplace channels" on public.marketplace_listing_channels;
create policy "Users manage own marketplace channels" on public.marketplace_listing_channels
for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_or_moderator())
with check ((select auth.uid()) = user_id or public.is_admin_or_moderator());

drop policy if exists "Users manage own receipts" on public.receipt_records;
create policy "Users manage own receipts" on public.receipt_records
for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_or_moderator())
with check ((select auth.uid()) = user_id or public.is_admin_or_moderator());

drop policy if exists "Users read receipt lines for own receipts" on public.receipt_line_items;
create policy "Users read receipt lines for own receipts" on public.receipt_line_items
for select to authenticated
using (
  exists (
    select 1 from public.receipt_records receipt
    where receipt.id = receipt_line_items.receipt_id
      and (receipt.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
);

drop policy if exists "Users write receipt lines for own receipts" on public.receipt_line_items;
create policy "Users write receipt lines for own receipts" on public.receipt_line_items
for all to authenticated
using (
  exists (
    select 1 from public.receipt_records receipt
    where receipt.id = receipt_line_items.receipt_id
      and (receipt.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
)
with check (
  exists (
    select 1 from public.receipt_records receipt
    where receipt.id = receipt_line_items.receipt_id
      and (receipt.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
);

drop policy if exists "Users manage own community projects" on public.kid_community_projects;
create policy "Users manage own community projects" on public.kid_community_projects
for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_or_moderator())
with check ((select auth.uid()) = user_id or public.is_admin_or_moderator());

drop policy if exists "Users read own community project items" on public.kid_community_project_items;
create policy "Users read own community project items" on public.kid_community_project_items
for select to authenticated
using (
  exists (
    select 1 from public.kid_community_projects project
    where project.id = kid_community_project_items.project_id
      and (project.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
);

drop policy if exists "Users write own community project items" on public.kid_community_project_items;
create policy "Users write own community project items" on public.kid_community_project_items
for all to authenticated
using (
  exists (
    select 1 from public.kid_community_projects project
    where project.id = kid_community_project_items.project_id
      and (project.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
)
with check (
  exists (
    select 1 from public.kid_community_projects project
    where project.id = kid_community_project_items.project_id
      and (project.user_id = (select auth.uid()) or public.is_admin_or_moderator())
  )
);

drop policy if exists "Users manage own trust profile" on public.user_trust_profiles;
create policy "Users manage own trust profile" on public.user_trust_profiles
for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_or_moderator())
with check ((select auth.uid()) = user_id or public.is_admin_or_moderator());

grant select, insert, update, delete on
  public.app_user_preferences,
  public.notification_preferences,
  public.deal_finder_sessions,
  public.deal_finder_items,
  public.scanner_intake_sessions,
  public.marketplace_listing_channels,
  public.receipt_records,
  public.receipt_line_items,
  public.kid_community_projects,
  public.kid_community_project_items,
  public.user_trust_profiles
to authenticated;

comment on table public.app_user_preferences is 'Per-user app mode, dashboard preset, visibility, and notification channel preferences.';
comment on table public.deal_finder_sessions is 'Deal Finder buy/maybe/skip sessions from scans, photos, pasted lots, or marketplace screenshots.';
comment on table public.scanner_intake_sessions is 'Universal scanner intake review records before routing to Vault, Forge, Wishlist, Deal Finder, Store Report, or Marketplace.';
comment on table public.marketplace_listing_channels is 'Cross-listing prep and platform status records for Forge/Marketplace.';
comment on table public.receipt_records is 'Receipt/expense records that can split business/personal and attach to inventory.';
comment on table public.kid_community_projects is 'Kid pack, donation, giveaway, event prep, and community pricing projects.';
comment on table public.user_trust_profiles is 'Scout/community trust profile and public/seller badge foundation.';

notify pgrst, 'reload schema';

commit;
