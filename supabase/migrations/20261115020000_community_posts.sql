-- Community posts shared through the server, with a moderation queue (audit 2026-11-14).
--
-- Until now Community posts lived only in the poster's localStorage. This adds:
--   * community_posts / community_comments, written by members, always created
--     as 'pending'; only admins/moderators can approve, reject or remove;
--   * minors cannot post or comment (kid safety, see 20261115010000);
--   * members read approved items through community_feed() /
--     community_post_comments(), which return the author's public username but
--     never their user id; authors can always read their own rows;
--   * moderate_community_item() for the admin review queue.

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  post_type text not null default 'question' check (post_type in ('question', 'event', 'trade_night', 'win', 'tip', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  area_label text check (area_label is null or char_length(area_label) <= 80),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  safety_flag text check (safety_flag is null or char_length(safety_flag) <= 200),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  safety_flag text check (safety_flag is null or char_length(safety_flag) <= 200),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_status_created_idx on public.community_posts (status, created_at desc);
create index if not exists community_posts_user_idx on public.community_posts (user_id);
create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);
create index if not exists community_comments_user_idx on public.community_comments (user_id);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
revoke all on public.community_posts, public.community_comments from anon;
grant select, insert, update, delete on public.community_posts, public.community_comments to authenticated;

-- Members: create their own pending items (adults with app access only).
create policy community_posts_insert_own on public.community_posts for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null and review_note is null
    and public.has_full_app_access() and not public.current_user_is_minor());
create policy community_comments_insert_own on public.community_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null
    and public.has_full_app_access() and not public.current_user_is_minor()
    and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'approved'));

-- Read: own rows, or everything for admins/moderators. Others' approved items come from the feed functions.
create policy community_posts_read_own_or_staff on public.community_posts for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_or_moderator());
create policy community_comments_read_own_or_staff on public.community_comments for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_or_moderator());

-- Edit: authors may edit their own items while pending (they go back to pending); staff may edit any.
create policy community_posts_update_own_pending on public.community_posts for update to authenticated
  using ((user_id = (select auth.uid()) and status = 'pending') or public.is_admin_or_moderator())
  with check ((user_id = (select auth.uid()) and status = 'pending') or public.is_admin_or_moderator());
create policy community_comments_update_own_pending on public.community_comments for update to authenticated
  using ((user_id = (select auth.uid()) and status = 'pending') or public.is_admin_or_moderator())
  with check ((user_id = (select auth.uid()) and status = 'pending') or public.is_admin_or_moderator());

-- Delete: authors their own; staff any.
create policy community_posts_delete_own on public.community_posts for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_or_moderator());
create policy community_comments_delete_own on public.community_comments for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_or_moderator());

-- Same session rule as the other member tables: a revoked or deleted session cannot write or read.
create policy community_posts_active_session on public.community_posts as restrictive for all to authenticated
  using ((select public.code3_current_session_valid())) with check ((select public.code3_current_session_valid()));
create policy community_comments_active_session on public.community_comments as restrictive for all to authenticated
  using ((select public.code3_current_session_valid())) with check ((select public.code3_current_session_valid()));

-- Guard: only staff change status/review fields; authors' edits keep the item pending.
create or replace function public.community_guard_moderation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if public.is_admin_or_moderator() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Posts cannot change author.' using errcode = '42501';
    end if;
    new.status := 'pending';
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    if tg_table_name = 'community_posts' then new.review_note := old.review_note; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.community_guard_moderation() from public, anon, authenticated;
create trigger community_posts_guard before insert or update on public.community_posts
  for each row execute function public.community_guard_moderation();
create trigger community_comments_guard before insert or update on public.community_comments
  for each row execute function public.community_guard_moderation();

-- Feed of approved posts, with the author's public username (never their real name or id).
create or replace function public.community_feed(p_limit integer default 50, p_before timestamptz default null)
returns table (id uuid, post_type text, title text, body text, area_label text, created_at timestamptz, author_name text, is_mine boolean, comment_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.post_type, p.title, p.body, p.area_label, p.created_at,
    coalesce(nullif(u.raw_user_meta_data->>'public_username', ''), 'Collector') as author_name,
    p.user_id = (select auth.uid()) as is_mine,
    (select count(*)::int from public.community_comments c where c.post_id = p.id and c.status = 'approved') as comment_count
  from public.community_posts p
  left join auth.users u on u.id = p.user_id
  where p.status = 'approved'
    and (p_before is null or p.created_at < p_before)
    and (public.has_full_app_access() or public.is_admin_or_moderator())
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function public.community_feed(integer, timestamptz) from public, anon;
grant execute on function public.community_feed(integer, timestamptz) to authenticated;

create or replace function public.community_post_comments(p_post_id uuid)
returns table (id uuid, body text, created_at timestamptz, author_name text, is_mine boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.body, c.created_at, coalesce(nullif(u.raw_user_meta_data->>'public_username', ''), 'Collector'), c.user_id = (select auth.uid())
  from public.community_comments c
  join public.community_posts p on p.id = c.post_id and p.status = 'approved'
  left join auth.users u on u.id = c.user_id
  where c.post_id = p_post_id and c.status = 'approved'
    and (public.has_full_app_access() or public.is_admin_or_moderator())
  order by c.created_at
  limit 200;
$$;
revoke all on function public.community_post_comments(uuid) from public, anon;
grant execute on function public.community_post_comments(uuid) to authenticated;

-- Moderation queue action for admins/moderators.
create or replace function public.moderate_community_item(p_kind text, p_id uuid, p_status text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_or_moderator() then
    raise exception 'Only moderators can review Community posts.' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'removed', 'pending') then
    raise exception 'Unsupported status: %', p_status using errcode = '22023';
  end if;
  if p_kind = 'post' then
    update public.community_posts set status = p_status, review_note = left(p_note, 500), reviewed_by = (select auth.uid()), reviewed_at = now() where id = p_id;
  elsif p_kind = 'comment' then
    update public.community_comments set status = p_status, reviewed_by = (select auth.uid()), reviewed_at = now() where id = p_id;
  else
    raise exception 'Unsupported kind: %', p_kind using errcode = '22023';
  end if;
  return found;
end;
$$;
revoke all on function public.moderate_community_item(text, uuid, text, text) from public, anon;
grant execute on function public.moderate_community_item(text, uuid, text, text) to authenticated;

-- Members cannot read others' rows in community_posts, so the comment rule asks a
-- definer helper whether the parent post is approved (applied as
-- community_comments_approved_post_check).
create or replace function public.community_post_is_approved(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.community_posts p where p.id = p_post_id and p.status = 'approved');
$$;
revoke all on function public.community_post_is_approved(uuid) from public, anon;
grant execute on function public.community_post_is_approved(uuid) to authenticated;

drop policy if exists community_comments_insert_own on public.community_comments;
create policy community_comments_insert_own on public.community_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null
    and public.has_full_app_access() and not public.current_user_is_minor()
    and public.community_post_is_approved(post_id));
