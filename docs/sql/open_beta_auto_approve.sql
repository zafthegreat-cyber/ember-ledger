-- Open beta (decided 2026-11-06, applied to production the same day).
-- Everyone who signs up gets in: no approval queue, no waitlist, no cap.
-- Accounts an admin has revoked/suspended/rejected stay out.
-- To close the beta again:  drop trigger zz_open_beta_auto_approve on public.profiles;
create or replace function code3_private.open_beta_auto_approve()
returns trigger language plpgsql security definer set search_path to '' as $$
declare blocked constant text[] := array['revoked','suspended','rejected','denied','banned','removed'];
begin
  if tg_op = 'UPDATE' and (coalesce(old.beta_status,'') = any(blocked) or coalesce(old.beta_access_status,'') = any(blocked)) then return new; end if;
  if coalesce(new.beta_status,'') = any(blocked) or coalesce(new.beta_access_status,'') = any(blocked) then return new; end if;
  if coalesce(new.app_access,false) = false or coalesce(new.beta_status,'') <> 'approved' or coalesce(new.beta_access_status,'') <> 'approved' then
    new.app_access := true; new.beta_status := 'approved'; new.beta_access_status := 'approved';
    new.beta_access_requested_at := coalesce(new.beta_access_requested_at, now());
    new.beta_access_approved_at := coalesce(new.beta_access_approved_at, now());
    new.beta_access_notes := coalesce(nullif(new.beta_access_notes,''), 'Auto-approved: open beta (no approval queue since 2026-11-06).');
  end if;
  return new;
end $$;
drop trigger if exists zz_open_beta_auto_approve on public.profiles;
create trigger zz_open_beta_auto_approve before insert or update on public.profiles
for each row execute function code3_private.open_beta_auto_approve();
