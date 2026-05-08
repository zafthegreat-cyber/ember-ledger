-- E&T TCG subscription and plan access fields.
-- Users may read these fields through owner-only profile RLS.
-- Do not expose normal frontend update paths for these protected fields.

alter table public.user_profiles
  add column if not exists subscription_plan text default 'free',
  add column if not exists subscription_status text default 'active',
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists lifetime_access boolean default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_subscription_plan_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_subscription_plan_check
      check (subscription_plan in ('free', 'paid', 'admin'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_subscription_status_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_subscription_status_check
      check (subscription_status in ('active', 'inactive', 'trialing', 'canceled', 'past_due'));
  end if;
end $$;
