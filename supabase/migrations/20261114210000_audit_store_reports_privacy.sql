-- Audit 2026-11-14: restock report privacy.
--
-- Before: any member could read every row with visibility = 'public' straight
-- from the table, including user_id, free-text notes and the photo path, even
-- before moderation; members could also insert their own report as
-- status = 'confirmed'. That exposed who reported what (raw restock history).
--
-- After:
--   * Members read their own and their workspace's reports from the table.
--   * Everyone else's reports come from public.public_store_reports(), which
--     returns only moderated reports (verification_status = 'verified',
--     visibility = 'public', not archived) and leaves out user_id, workspace_id,
--     the photo path and the free-text part of notes (only the structured
--     "report context" footer — stock status, city/state — is kept).
--   * Non-admins cannot set or change `status` (moderation already protected
--     verification_status and the other moderation columns).
--   * New rows default to visibility 'private_from_map'; the app still sends the
--     member's explicit choice.

alter table public.store_reports alter column visibility set default 'private_from_map';

-- 1. Read rule: drop the "visibility = public" clause from the table policy.
drop policy if exists store_reports_read_workspace_strict on public.store_reports;
create policy store_reports_read_workspace_strict on public.store_reports
  for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or public.can_read_workspace(workspace_id)
    or public.is_admin_or_moderator()
  );

-- 2. Moderated public feed without submitter identity.
create or replace function public.public_store_reports(p_limit integer default 200)
returns table (
  id uuid,
  store_id uuid,
  product_id uuid,
  report_type text,
  quantity_seen integer,
  price_seen numeric,
  notes text,
  observed_at timestamptz,
  reported_at timestamptz,
  verification_status text,
  store_name text,
  product_name text,
  product_type text,
  set_name text,
  quantity_estimate text,
  report_time timestamptz,
  visibility text,
  status text,
  confidence_score numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.id, r.store_id, r.product_id, r.report_type, r.quantity_seen, r.price_seen,
    -- keep only the structured footer the app writes; never the member's own words
    -- (Postgres regex repeat counts cap at 255, so the 600-char app limit is checked with length())
    coalesce((select f from (select substring(r.notes from E'(\\n\\n\\[Code 3 report context v1:\\{[^\\n]*\\])$') as f) footer where length(f) <= 640), '') as notes,
    r.observed_at, r.reported_at, r.verification_status, r.store_name, r.product_name,
    r.product_type, r.set_name, r.quantity_estimate, r.report_time, r.visibility, r.status,
    r.confidence_score, r.created_at, r.updated_at
  from public.store_reports r
  where r.visibility = 'public'
    and r.verification_status = 'verified'
    and r.archived_at is null
    and (public.has_full_app_access() or public.is_admin_or_moderator())
  order by coalesce(r.observed_at, r.reported_at, r.created_at) desc nulls last
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

revoke all on function public.public_store_reports(integer) from public, anon;
grant execute on function public.public_store_reports(integer) to authenticated;

-- 3. Guard: members cannot set or change `status` themselves.
create or replace function public.store_reports_guard_status_field()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_admin_or_moderator() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.status, 'unverified') not in ('unverified', 'pending') then
      raise exception 'Only admins can set store report status' using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status then
    raise exception 'Only admins can change store report status' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.store_reports_guard_status_field() from public, anon, authenticated;

drop trigger if exists store_reports_guard_status_field on public.store_reports;
create trigger store_reports_guard_status_field
  before insert or update on public.store_reports
  for each row execute function public.store_reports_guard_status_field();
