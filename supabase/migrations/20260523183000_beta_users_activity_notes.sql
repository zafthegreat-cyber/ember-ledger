create table if not exists public.app_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_context text,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_activity_events_user_created_idx
  on public.app_activity_events (user_id, created_at desc);

create index if not exists app_activity_events_type_created_idx
  on public.app_activity_events (event_type, created_at desc);

alter table public.app_activity_events enable row level security;
revoke all on table public.app_activity_events from anon;
grant select, insert, update, delete on table public.app_activity_events to authenticated;

drop policy if exists "Users insert own activity events" on public.app_activity_events;
create policy "Users insert own activity events"
  on public.app_activity_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users read own activity events" on public.app_activity_events;
create policy "Users read own activity events"
  on public.app_activity_events
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin_or_moderator());

drop policy if exists "Admins manage activity events" on public.app_activity_events;
create policy "Admins manage activity events"
  on public.app_activity_events
  for all
  to authenticated
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

create table if not exists public.beta_admin_notes (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  beta_request_id uuid,
  note text not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists beta_admin_notes_target_created_idx
  on public.beta_admin_notes (target_user_id, created_at desc);

alter table public.beta_admin_notes enable row level security;
revoke all on table public.beta_admin_notes from anon;
grant select, insert, update, delete on table public.beta_admin_notes to authenticated;

drop policy if exists "Admins read beta admin notes" on public.beta_admin_notes;
create policy "Admins read beta admin notes"
  on public.beta_admin_notes
  for select
  to authenticated
  using (public.is_admin_or_moderator());

drop policy if exists "Admins create beta admin notes" on public.beta_admin_notes;
create policy "Admins create beta admin notes"
  on public.beta_admin_notes
  for insert
  to authenticated
  with check (public.is_admin_or_moderator() and created_by = auth.uid());

drop policy if exists "Admins manage beta admin notes" on public.beta_admin_notes;
create policy "Admins manage beta admin notes"
  on public.beta_admin_notes
  for update
  to authenticated
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

drop policy if exists "Admins delete beta admin notes" on public.beta_admin_notes;
create policy "Admins delete beta admin notes"
  on public.beta_admin_notes
  for delete
  to authenticated
  using (public.is_admin_or_moderator());
