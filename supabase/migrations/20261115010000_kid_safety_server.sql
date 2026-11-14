-- Kid safety on the server (audit 2026-11-14).
--
-- Until now "kid" lived only in the app (a profile that declares itself a kid's
-- gets a trimmed view), so a kid account could still post through the API.
-- profiles.is_minor is the server's record:
--   * an account may mark itself as a minor (mark_my_account_minor), and the app
--     does so when the account declares it belongs to a kid;
--   * only admins/moderators can clear it, so it cannot be switched off to post;
--   * restrictive policies block minors from creating restock reports, store
--     guesses, marketplace listings, listing photos and listing messages, and
--     from publishing listings, whatever the client does.

alter table public.profiles add column if not exists is_minor boolean not null default false;
alter table public.profiles add column if not exists is_minor_set_at timestamptz;

-- Guard: members may set is_minor true for themselves, never back to false.
create or replace function public.profiles_guard_is_minor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_admin_or_moderator() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.is_minor then new.is_minor_set_at := coalesce(new.is_minor_set_at, now()); end if;
    return new;
  end if;
  if old.is_minor and not new.is_minor then
    raise exception 'Only the Code 3 team can change a kid account back to an adult account.' using errcode = '42501';
  end if;
  if new.is_minor and not old.is_minor then new.is_minor_set_at := now(); end if;
  if new.is_minor_set_at is distinct from old.is_minor_set_at and not (new.is_minor and not old.is_minor) then
    new.is_minor_set_at := old.is_minor_set_at;
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_guard_is_minor() from public, anon, authenticated;
drop trigger if exists profiles_guard_is_minor on public.profiles;
create trigger profiles_guard_is_minor before insert or update on public.profiles
  for each row execute function public.profiles_guard_is_minor();

-- Is the signed-in account a minor? (definer: reads only the caller's own row)
create or replace function public.current_user_is_minor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.is_minor from public.profiles p where p.id = (select auth.uid())), false);
$$;
revoke all on function public.current_user_is_minor() from public, anon;
grant execute on function public.current_user_is_minor() to authenticated;

-- The app calls this when the account declares it belongs to a kid.
create or replace function public.mark_my_account_minor()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.profiles set is_minor = true where id = (select auth.uid()) and not is_minor;
  return true;
end;
$$;
revoke all on function public.mark_my_account_minor() from public, anon;
grant execute on function public.mark_my_account_minor() to authenticated;

-- Restrictive policies: these AND with every existing policy.
drop policy if exists kid_safety_no_minor_store_reports on public.store_reports;
create policy kid_safety_no_minor_store_reports on public.store_reports as restrictive
  for insert to authenticated
  with check (not public.current_user_is_minor() or public.is_admin_or_moderator());

drop policy if exists kid_safety_no_minor_store_guesses on public.store_guesses;
create policy kid_safety_no_minor_store_guesses on public.store_guesses as restrictive
  for insert to authenticated
  with check (not public.current_user_is_minor() or public.is_admin_or_moderator());

drop policy if exists kid_safety_no_minor_listings on public.marketplace_listings;
create policy kid_safety_no_minor_listings on public.marketplace_listings as restrictive
  for insert to authenticated
  with check (not public.current_user_is_minor() or public.is_admin_or_moderator());

drop policy if exists kid_safety_no_minor_listing_updates on public.marketplace_listings;
create policy kid_safety_no_minor_listing_updates on public.marketplace_listings as restrictive
  for update to authenticated
  using (true)
  with check (not public.current_user_is_minor() or public.is_admin_or_moderator());

drop policy if exists kid_safety_no_minor_listing_photos on public.listing_photos;
create policy kid_safety_no_minor_listing_photos on public.listing_photos as restrictive
  for insert to authenticated
  with check (not public.current_user_is_minor() or public.is_admin_or_moderator());

drop policy if exists kid_safety_no_minor_listing_messages on public.listing_messages;
create policy kid_safety_no_minor_listing_messages on public.listing_messages as restrictive
  for insert to authenticated
  with check (not public.current_user_is_minor() or public.is_admin_or_moderator());
