-- AI scanner (Nov 20 2026): per-member daily count of AI identify calls.
-- Only the scanner-ai-identify edge function (service role) reads or writes it.
create table if not exists public.ai_scan_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  used integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_scan_usage enable row level security;
revoke all on public.ai_scan_usage from anon, authenticated;

-- Takes one AI scan if the member is under today's limit. Returns how many are
-- left after this one, or -1 when the limit is already reached.
create or replace function public.code3_take_ai_scan(p_user uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into public.ai_scan_usage (user_id, day, used)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set used = public.ai_scan_usage.used + 1
    where public.ai_scan_usage.used < p_limit
  returning used into v_used;
  if v_used is null then
    return -1;
  end if;
  return p_limit - v_used;
end;
$$;
revoke all on function public.code3_take_ai_scan(uuid, integer) from public, anon, authenticated;
grant execute on function public.code3_take_ai_scan(uuid, integer) to service_role;

-- Gives a scan back when the AI call itself failed, so members are not charged for errors.
create or replace function public.code3_return_ai_scan(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_scan_usage set used = greatest(used - 1, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;
revoke all on function public.code3_return_ai_scan(uuid) from public, anon, authenticated;
grant execute on function public.code3_return_ai_scan(uuid) to service_role;
