-- Workspace invite delivery hardening.
-- Keeps workspace invites as real backend records and returns a copyable link
-- when no email sender is configured.

begin;

alter table if exists public.workspace_invites
  add column if not exists expires_at timestamptz;

grant select, insert, update on public.workspace_invites to authenticated;

create or replace function public.create_workspace_invite(
  target_workspace_id uuid,
  invite_email text,
  invite_role text default 'viewer',
  invite_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := (select auth.uid());
  normalized_email text := lower(trim(coalesce(invite_email, '')));
  normalized_role text := lower(trim(coalesce(invite_role, 'viewer')));
  normalized_note text := nullif(trim(coalesce(invite_note, '')), '');
  target_workspace public.workspaces%rowtype;
  existing_invite public.workspace_invites%rowtype;
  saved_invite public.workspace_invites%rowtype;
  duplicate_pending boolean := false;
begin
  if requester is null then
    raise exception 'You must be signed in to create a workspace invite.';
  end if;

  if target_workspace_id is null then
    raise exception 'Workspace is required.';
  end if;

  if normalized_email = '' or normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid invite email address.';
  end if;

  if normalized_role = 'owner' then
    normalized_role := 'viewer';
  end if;

  if normalized_role not in ('admin', 'contributor', 'editor', 'viewer') then
    normalized_role := 'viewer';
  end if;

  if not public.can_manage_workspace(target_workspace_id) then
    raise exception 'You do not have permission to invite members to this workspace.';
  end if;

  select *
  into target_workspace
  from public.workspaces
  where id = target_workspace_id;

  if target_workspace.id is null then
    raise exception 'Workspace was not found.';
  end if;

  select *
  into existing_invite
  from public.workspace_invites
  where workspace_id = target_workspace_id
    and lower(email) = normalized_email
    and status = 'invited'
  order by created_at desc
  limit 1;

  if existing_invite.id is not null then
    duplicate_pending := true;

    update public.workspace_invites
    set role = normalized_role,
        note = normalized_note,
        invited_by = requester,
        created_at = now(),
        expires_at = case
          when expires_at is null or expires_at <= now() then now() + interval '30 days'
          else expires_at
        end
    where id = existing_invite.id
    returning * into saved_invite;
  else
    insert into public.workspace_invites (
      workspace_id,
      email,
      role,
      status,
      note,
      invited_by,
      created_at,
      expires_at
    )
    values (
      target_workspace_id,
      normalized_email,
      normalized_role,
      'invited',
      normalized_note,
      requester,
      now(),
      now() + interval '30 days'
    )
    returning * into saved_invite;
  end if;

  return jsonb_build_object(
    'invite_id', saved_invite.id,
    'id', saved_invite.id,
    'invite_email', saved_invite.email,
    'email', saved_invite.email,
    'workspace_id', saved_invite.workspace_id,
    'role', saved_invite.role,
    'status', saved_invite.status,
    'note', saved_invite.note,
    'invited_by', saved_invite.invited_by,
    'created_at', saved_invite.created_at,
    'expires_at', saved_invite.expires_at,
    'email_sent', false,
    'delivery_method', 'copy_link',
    'invite_path', '/workspace-invite/' || saved_invite.id::text,
    'duplicate_pending', duplicate_pending
  );
end;
$$;

create or replace function public.accept_workspace_invite(target_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := (select auth.uid());
  requester_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  target_invite public.workspace_invites%rowtype;
  existing_membership public.workspace_memberships%rowtype;
  saved_membership public.workspace_memberships%rowtype;
begin
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
$$;

revoke all on function public.create_workspace_invite(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_workspace_invite(uuid, text, text, text) to authenticated;

revoke all on function public.accept_workspace_invite(uuid) from public, anon, authenticated;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;

comment on function public.create_workspace_invite(uuid, text, text, text) is
  'Creates or refreshes a pending workspace invite for workspace managers. Email is not sent here; the client receives a copyable invite path.';

comment on function public.accept_workspace_invite(uuid) is
  'Accepts a workspace invite for the authenticated account whose email matches the invite.';

notify pgrst, 'reload schema';

commit;
