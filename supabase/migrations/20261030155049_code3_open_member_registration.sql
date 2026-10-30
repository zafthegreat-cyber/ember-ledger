-- Owner-directed open registration. This changes enrollment eligibility only;
-- existing session, row ownership, workspace membership and staff policies remain.
create or replace function code3_private.has_full_app_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null or not public.code3_current_session_valid() then false
    else exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and (public.is_admin_or_moderator() or (
          lower(coalesce(p.beta_status, 'not_requested')) not in ('denied','suspended','disabled','blocked')
          and lower(coalesce(p.beta_access_status, 'not_requested')) not in ('denied','suspended','disabled','blocked')
        ))
    )
  end
$$;
comment on function code3_private.has_full_app_access() is
  'Open registration for confirmed current accounts with an existing profile. Explicit account restrictions, private row ownership, workspace memberships and staff authority remain enforced.';
