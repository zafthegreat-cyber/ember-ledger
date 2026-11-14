-- Push notification device tokens (Firebase Cloud Messaging), Nov 15 2026.
--
-- The Android/iOS app registers its FCM token here after the person allows
-- notifications. Only the owner can see or remove their tokens; the
-- send-push edge function reads them with the service role.

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios', 'web')),
  app_version text check (app_version is null or char_length(app_version) <= 100),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index if not exists device_push_tokens_user_idx on public.device_push_tokens (user_id) where disabled_at is null;

alter table public.device_push_tokens enable row level security;
revoke all on public.device_push_tokens from anon;
grant select, insert, update, delete on public.device_push_tokens to authenticated;

create policy device_push_tokens_own on public.device_push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy device_push_tokens_active_session on public.device_push_tokens as restrictive for all to authenticated
  using ((select public.code3_current_session_valid())) with check ((select public.code3_current_session_valid()));

-- Register or refresh this device's token for the signed-in account. A token
-- that moves to another account (shared device) is reassigned to the new owner.
create or replace function public.register_push_token(p_token text, p_platform text, p_app_version text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_platform not in ('android', 'ios', 'web') then raise exception 'Unsupported platform.' using errcode = '22023'; end if;
  insert into public.device_push_tokens (user_id, token, platform, app_version)
  values ((select auth.uid()), p_token, p_platform, left(p_app_version, 100))
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform,
    app_version = excluded.app_version, last_seen_at = now(), disabled_at = null;
  return true;
end;
$$;
revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
