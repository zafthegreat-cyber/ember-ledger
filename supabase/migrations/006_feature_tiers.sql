-- E&T TCG feature tier structure.
-- Payment processing is intentionally not included here.

alter table public.user_profiles
  add column if not exists feature_tier text default 'free';

alter table public.user_profiles
  drop constraint if exists user_profiles_subscription_plan_check;

alter table public.user_profiles
  add constraint user_profiles_subscription_plan_check
  check (subscription_plan in ('free', 'plus', 'pro', 'founder', 'paid', 'admin'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_feature_tier_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_feature_tier_check
      check (feature_tier in ('free', 'plus', 'pro', 'founder', 'admin'));
  end if;
end $$;
