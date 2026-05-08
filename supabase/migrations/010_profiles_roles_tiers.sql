create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  user_role text not null default 'user',
  tier text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint profiles_user_role_check check (user_role in ('admin', 'user')),
  constraint profiles_tier_check check (tier in ('free', 'plus', 'pro', 'founder'))
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own_default" on public.profiles;
create policy "profiles_insert_own_default"
on public.profiles
for insert
to authenticated
with check (
  auth.uid() = id
  and coalesce(user_role, 'user') = 'user'
  and coalesce(tier, 'free') = 'free'
);

drop policy if exists "profiles_update_own_safe_fields" on public.profiles;
create policy "profiles_update_own_safe_fields"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.prevent_profile_role_tier_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if jwt_role <> 'service_role' then
    if new.user_role is distinct from old.user_role then
      raise exception 'user_role can only be changed by trusted admin/backend logic';
    end if;

    if new.tier is distinct from old.tier then
      raise exception 'tier can only be changed by trusted admin/backend logic';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prevent_profile_role_tier_self_update on public.profiles;
create trigger prevent_profile_role_tier_self_update
before update on public.profiles
for each row
execute function public.prevent_profile_role_tier_self_update();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, user_role, tier)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'user',
    'free'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

comment on table public.profiles is 'User role and tier profile. Frontend may read own profile; role/tier changes require trusted admin/backend logic.';
