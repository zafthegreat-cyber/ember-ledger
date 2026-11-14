-- Audit 2026-11-14: feedback relay hardening.
--
-- Before: anyone with the public app key could call feedback-discord with any
-- text (up to 1,800 chars, links included) and it went straight to the team's
-- Discord; beta_feedback had no length limits and guests could insert without
-- any throttle.
--
-- After:
--   * feedback-discord posts only a row that is stored here, at most once
--     (discord_posted_at), and only within 10 minutes of it being saved.
--   * Text columns have length limits.
--   * Guest (anon) feedback is throttled to 40 rows per 10 minutes overall.

alter table public.beta_feedback add column if not exists discord_posted_at timestamptz;

alter table public.beta_feedback
  add constraint beta_feedback_title_length check (title is null or char_length(title) <= 300),
  add constraint beta_feedback_description_length check (description is null or char_length(description) <= 4000),
  add constraint beta_feedback_expected_length check (expected_result is null or char_length(expected_result) <= 4000),
  add constraint beta_feedback_page_length check (page is null or char_length(page) <= 200),
  add constraint beta_feedback_guest_email_length check (guest_email is null or char_length(guest_email) <= 320),
  add constraint beta_feedback_app_version_length check (app_version is null or char_length(app_version) <= 100),
  add constraint beta_feedback_browser_info_length check (browser_info is null or char_length(browser_info) <= 500);

create or replace function public.beta_feedback_guest_throttle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    if (select count(*) from public.beta_feedback
        where user_id is null and created_at > now() - interval '10 minutes') >= 40 then
      raise exception 'Too much feedback right now. Please try again in a few minutes.' using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.beta_feedback_guest_throttle() from public, anon, authenticated;

drop trigger if exists beta_feedback_guest_throttle on public.beta_feedback;
create trigger beta_feedback_guest_throttle
  before insert on public.beta_feedback
  for each row execute function public.beta_feedback_guest_throttle();
