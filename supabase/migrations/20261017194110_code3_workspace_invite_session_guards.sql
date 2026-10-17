begin;

-- Preserve the existing workspace role predicates while rejecting revoked,
-- expired, anonymous and mismatched provider sessions on definer entry points.

CREATE OR REPLACE FUNCTION public.workspace_role_for(workspace_uuid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when auth.uid() is null then null::text
    when not public.code3_current_session_valid() then null::text
    else (
with member_roles as (
    select wm.role
    from public.workspace_members wm
    where wm.workspace_id = workspace_uuid
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'

    union all

    select case wms.role when 'editor' then 'contributor' else wms.role end as role
    from public.workspace_memberships wms
    where wms.workspace_id = workspace_uuid
      and wms.user_id = (select auth.uid())
      and wms.status = 'active'
  )
  select role
  from member_roles
  order by case role
    when 'owner' then 1
    when 'admin' then 2
    when 'contributor' then 3
    when 'viewer' then 4
    else 5
  end
  limit 1
    ) end
$function$;

CREATE OR REPLACE FUNCTION public.can_read_workspace(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when auth.uid() is null then false
    when not public.code3_current_session_valid() then false
    else (
select exists (
    select 1
    from public.workspaces w
    where w.id = workspace_uuid
      and (
        w.owner_user_id = (select auth.uid())
        or w.created_by = (select auth.uid())
      )
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin', 'contributor', 'viewer')
    ) end
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_workspace(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when auth.uid() is null then false
    when not public.code3_current_session_valid() then false
    else (
select exists (
    select 1
    from public.workspaces w
    where w.id = workspace_uuid
      and (
        w.owner_user_id = (select auth.uid())
        or w.created_by = (select auth.uid())
      )
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin', 'contributor')
    ) end
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(workspace_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when auth.uid() is null then false
    when not public.code3_current_session_valid() then false
    else (
select exists (
    select 1
    from public.workspaces w
    where w.id = workspace_uuid
      and (
        w.owner_user_id = (select auth.uid())
        or w.created_by = (select auth.uid())
      )
  )
  or public.workspace_role_for(workspace_uuid) in ('owner', 'admin')
    ) end
$function$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invite(target_invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requester uuid := (select auth.uid());
  requester_email text;
  target_invite public.workspace_invites%rowtype;
  existing_membership public.workspace_memberships%rowtype;
  saved_membership public.workspace_memberships%rowtype;
begin
  perform code3_private.require_current_session();
  select lower(coalesce(u.email, '')) into requester_email from auth.users u where u.id=requester;
  if requester is null then
    raise exception 'Log in to accept this workspace invite.';
  end if;

  if target_invite_id is null then
    raise exception 'Workspace invite is required.';
  end if;

  if requester_email = '' then
    raise exception 'Your account email is required to accept this invite.';
  end if;

  select *
  into target_invite
  from public.workspace_invites
  where id = target_invite_id
  limit 1
  for update;

  if target_invite.id is null then
    raise exception 'This workspace invite is not valid.';
  end if;

  if target_invite.status <> 'invited' then
    raise exception 'This workspace invite is no longer active.';
  end if;

  if target_invite.expires_at is not null and target_invite.expires_at <= now() then
    raise exception 'This workspace invite has expired.';
  end if;

  if lower(target_invite.email) <> requester_email then
    raise exception 'This workspace invite was made for a different email.';
  end if;

  select *
  into existing_membership
  from public.workspace_memberships
  where workspace_id = target_invite.workspace_id
    and user_id = requester
    and status <> 'removed'
  order by created_at desc
  limit 1;

  if existing_membership.id is null then
    select *
    into existing_membership
    from public.workspace_memberships
    where workspace_id = target_invite.workspace_id
      and lower(email) = requester_email
      and status = 'invited'
    order by created_at desc
    limit 1;
  end if;

  if existing_membership.id is not null then
    update public.workspace_memberships
    set email = requester_email,
        user_id = requester,
        role = target_invite.role,
        status = 'active',
        invited_by = target_invite.invited_by,
        accepted_at = now()
    where id = existing_membership.id
    returning * into saved_membership;
  else
    insert into public.workspace_memberships (
      workspace_id,
      user_id,
      email,
      role,
      status,
      invited_by,
      created_at,
      accepted_at
    )
    values (
      target_invite.workspace_id,
      requester,
      requester_email,
      target_invite.role,
      'active',
      target_invite.invited_by,
      coalesce(target_invite.created_at, now()),
      now()
    )
    returning * into saved_membership;
  end if;

  update public.workspace_invites
  set status = 'active',
      accepted_at = now()
  where id = target_invite.id;

  return jsonb_build_object(
    'invite_id', target_invite.id,
    'workspace_id', target_invite.workspace_id,
    'email', target_invite.email,
    'role', saved_membership.role,
    'status', 'active',
    'accepted_at', saved_membership.accepted_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_beta_invite(invite_token text)
 RETURNS TABLE(invite_id uuid, status text, recipient_name text, recipient_email text, claimed_by uuid, claimed_email text, claimed_at timestamp with time zone, app_access boolean, beta_status text, beta_access_status text, user_role text, tier text, plan_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  normalized_token text := trim(coalesce(claim_beta_invite.invite_token, ''));
  hashed_token text;
  invite_record public.beta_invites%rowtype;
  claimed_invite public.beta_invites%rowtype;
  current_email text;
  updated_profile public.profiles%rowtype;
  previous_shoreline_sync text := current_setting('app.shoreline_sync', true);
begin
  perform code3_private.require_current_session();
  if current_user_id is null then
    raise exception 'Sign in is required to claim this invite';
  end if;

  if length(normalized_token) < 32 then
    raise exception 'Invite link is not valid';
  end if;

  hashed_token := public.beta_invite_token_hash(normalized_token);

  select *
  into invite_record
  from public.beta_invites i
  where i.token_hash = hashed_token
  for update;

  if not found then
    raise exception 'Invite link is not valid';
  end if;

  if invite_record.revoked_at is not null then
    raise exception 'Invite link is no longer active';
  end if;

  if invite_record.claimed_at is not null then
    raise exception 'Invite has already been claimed';
  end if;

  if invite_record.expires_at is not null and invite_record.expires_at <= now() then
    raise exception 'Invite link has expired';
  end if;

  -- Profile display fields are user-editable. Bind an addressed invite to the
  -- provider's confirmed account email, checked by require_current_session.
  select lower(nullif(trim(coalesce(u.email, '')), ''))
  into current_email
  from auth.users u
  where u.id = current_user_id;

  if invite_record.recipient_email is not null
    and lower(invite_record.recipient_email) is distinct from current_email then
    raise exception 'Invite email does not match this account';
  end if;

  update public.beta_invites i
  set claimed_by = current_user_id,
      claimed_email = current_email,
      claimed_at = now()
  where i.id = invite_record.id
    and i.claimed_at is null
    and i.revoked_at is null
    and (i.expires_at is null or i.expires_at > now())
  returning * into claimed_invite;

  if not found then
    raise exception 'Invite has already been claimed';
  end if;

  perform set_config('app.shoreline_sync', 'true', true);

  -- BEFORE INSERT guards run before ON CONFLICT, including for an existing
  -- profile. Insert only default authority, then apply this verified invite's
  -- grant through the existing trusted approval-update path.
  insert into public.profiles (
    id, email, beta_status, beta_access_status, app_access, user_role, tier, plan_tier
  ) values (
    current_user_id, current_email, 'not_requested', 'not_requested', false, 'user', 'free', 'free'
  ) on conflict (id) do nothing;

  update public.profiles p
  set email = coalesce(p.email, current_email),
      beta_status = case when claimed_invite.grants_beta_access then 'approved' else p.beta_status end,
      beta_access_status = case when claimed_invite.grants_beta_access then 'approved' else p.beta_access_status end,
      app_access = case when claimed_invite.grants_beta_access then true else p.app_access end,
      beta_access_requested_at = coalesce(p.beta_access_requested_at, now()),
      beta_access_approved_at = case when claimed_invite.grants_beta_access then now() else p.beta_access_approved_at end,
      beta_access_approved_by = case when claimed_invite.grants_beta_access then claimed_invite.created_by else p.beta_access_approved_by end,
      updated_at = now()
  where p.id = current_user_id
  returning p.* into updated_profile;

  perform set_config('app.shoreline_sync', coalesce(previous_shoreline_sync, ''), true);

  return query
  select
    claimed_invite.id,
    public.beta_invite_status(claimed_invite.claimed_at, claimed_invite.revoked_at, claimed_invite.expires_at),
    claimed_invite.recipient_name,
    claimed_invite.recipient_email,
    claimed_invite.claimed_by,
    claimed_invite.claimed_email,
    claimed_invite.claimed_at,
    updated_profile.app_access,
    updated_profile.beta_status,
    updated_profile.beta_access_status,
    updated_profile.user_role,
    updated_profile.tier,
    updated_profile.plan_tier;
end;
$function$;

revoke all on function public.claim_beta_invite(text), public.accept_workspace_invite(uuid) from public, anon;
grant execute on function public.claim_beta_invite(text), public.accept_workspace_invite(uuid) to authenticated;

commit;
