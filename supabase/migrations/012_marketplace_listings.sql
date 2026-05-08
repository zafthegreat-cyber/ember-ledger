-- Controlled TideTradr Marketplace foundation.
-- Listings are user-owned and moderation-first. Payments, shipping, escrow, and buyer protection are not handled here.

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid references auth.users(id) on delete set null,
  seller_display_name text,
  listing_type text not null default 'For Sale',
  title text not null,
  description text,
  category text,
  product_type text,
  set_name text,
  condition text,
  quantity integer not null default 1 check (quantity >= 0),
  asking_price numeric(12, 2),
  trade_value numeric(12, 2),
  location_city text,
  location_state text,
  pickup_only boolean not null default true,
  shipping_available boolean not null default false,
  photos jsonb not null default '[]'::jsonb,
  catalog_item_id text,
  upc text,
  sku text,
  intended_for_kids boolean not null default false,
  contact_preference text,
  seller_notes text,
  source_type text not null default 'manual',
  source_item_id text,
  status text not null default 'Draft',
  featured boolean not null default false,
  report_count integer not null default 0,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_listings_type_check check (listing_type in ('For Sale', 'For Trade', 'Looking For', 'Free / Donation', 'Kid-friendly deal')),
  constraint marketplace_listings_status_check check (status in ('Draft', 'Pending Review', 'Active', 'Sold', 'Traded', 'Removed', 'Flagged', 'Archived'))
);

create table if not exists public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  photo_url text not null,
  source text default 'user',
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  notes text,
  status text not null default 'Open',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint listing_reports_reason_check check (reason in ('Wrong item', 'Fake/scam', 'Price gouging', 'Inappropriate', 'Duplicate', 'Sold already', 'Other')),
  constraint listing_reports_status_check check (status in ('Open', 'Under Review', 'Resolved', 'Dismissed'))
);

create table if not exists public.listing_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  body text not null,
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  constraint listing_messages_status_check check (status in ('Draft', 'Sent', 'Hidden', 'Removed'))
);

create table if not exists public.seller_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  contact_preference text,
  location_city text,
  location_state text,
  seller_badge text,
  rating numeric(3, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid references auth.users(id) on delete cascade,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  listing_id uuid references public.marketplace_listings(id) on delete set null,
  rating integer check (rating between 1 and 5),
  body text,
  status text not null default 'Pending Review',
  created_at timestamptz not null default now(),
  constraint seller_reviews_status_check check (status in ('Pending Review', 'Active', 'Hidden', 'Removed'))
);

alter table public.marketplace_listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.saved_listings enable row level security;
alter table public.listing_reports enable row level security;
alter table public.listing_messages enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.seller_reviews enable row level security;

drop policy if exists "marketplace_read_active_own_or_admin" on public.marketplace_listings;
create policy "marketplace_read_active_own_or_admin"
on public.marketplace_listings for select
using (status = 'Active' or seller_user_id = auth.uid() or public.is_admin_or_moderator());

drop policy if exists "marketplace_users_create_draft_or_pending" on public.marketplace_listings;
create policy "marketplace_users_create_draft_or_pending"
on public.marketplace_listings for insert
with check (seller_user_id = auth.uid() and status in ('Draft', 'Pending Review'));

drop policy if exists "marketplace_users_update_own_nonpublic" on public.marketplace_listings;
create policy "marketplace_users_update_own_nonpublic"
on public.marketplace_listings for update
using (seller_user_id = auth.uid())
with check (seller_user_id = auth.uid() and status in ('Draft', 'Pending Review', 'Sold', 'Traded', 'Archived'));

drop policy if exists "marketplace_admins_manage_all" on public.marketplace_listings;
create policy "marketplace_admins_manage_all"
on public.marketplace_listings for all
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "listing_photos_read_visible_listing" on public.listing_photos;
create policy "listing_photos_read_visible_listing"
on public.listing_photos for select
using (
  exists (
    select 1 from public.marketplace_listings ml
    where ml.id = listing_id
      and (ml.status = 'Active' or ml.seller_user_id = auth.uid() or public.is_admin_or_moderator())
  )
);

drop policy if exists "listing_photos_owner_or_admin_manage" on public.listing_photos;
create policy "listing_photos_owner_or_admin_manage"
on public.listing_photos for all
using (
  public.is_admin_or_moderator()
  or exists (select 1 from public.marketplace_listings ml where ml.id = listing_id and ml.seller_user_id = auth.uid())
)
with check (
  public.is_admin_or_moderator()
  or exists (select 1 from public.marketplace_listings ml where ml.id = listing_id and ml.seller_user_id = auth.uid())
);

drop policy if exists "saved_listings_users_manage_own" on public.saved_listings;
create policy "saved_listings_users_manage_own"
on public.saved_listings for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "listing_reports_users_create" on public.listing_reports;
create policy "listing_reports_users_create"
on public.listing_reports for insert
with check (reporter_user_id = auth.uid());

drop policy if exists "listing_reports_users_read_own_or_admin" on public.listing_reports;
create policy "listing_reports_users_read_own_or_admin"
on public.listing_reports for select
using (reporter_user_id = auth.uid() or public.is_admin_or_moderator());

drop policy if exists "listing_reports_admins_manage" on public.listing_reports;
create policy "listing_reports_admins_manage"
on public.listing_reports for all
using (public.is_admin_or_moderator())
with check (public.is_admin_or_moderator());

drop policy if exists "listing_messages_participants_or_admin" on public.listing_messages;
create policy "listing_messages_participants_or_admin"
on public.listing_messages for select
using (sender_user_id = auth.uid() or recipient_user_id = auth.uid() or public.is_admin_or_moderator());

drop policy if exists "seller_profiles_read" on public.seller_profiles;
create policy "seller_profiles_read"
on public.seller_profiles for select
using (true);

drop policy if exists "seller_profiles_manage_own_or_admin" on public.seller_profiles;
create policy "seller_profiles_manage_own_or_admin"
on public.seller_profiles for all
using (user_id = auth.uid() or public.is_admin_or_moderator())
with check (user_id = auth.uid() or public.is_admin_or_moderator());

comment on table public.marketplace_listings is 'User-owned TideTradr Marketplace listings. Public visibility requires moderation approval.';
comment on table public.listing_messages is 'Placeholder table for future seller contact. Messaging is not active in beta.';
