-- E&T TCG dashboard layout preferences.
-- Safe to run more than once. These settings only control Home visibility/order/style.

alter table public.user_profiles
  add column if not exists dashboard_preset text default 'simple',
  add column if not exists dashboard_layout jsonb default '{}'::jsonb,
  add column if not exists dashboard_card_style text default 'comfortable';
