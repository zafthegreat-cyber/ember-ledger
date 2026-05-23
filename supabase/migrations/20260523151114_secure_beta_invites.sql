-- Secure one-time beta invites.
-- Admins create personal invite links; users claim through an authenticated
-- RPC that stores only token hashes and grants normal beta app access.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  recipient_name text not null,
  recipient_email text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_email text,
  claimed_at timestamptz,
  revoked_at timestamptz,
  audience text default 'beta',
  grants_beta_access boolean not null default true,
  constraint beta_invites_recipient_name_present check (length(trim(recipient_name)) > 0),
  constraint beta_invites_recipient_email_format check (
    recipient_email is null
    or recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

create index if not exists beta_invites_created_at_idx on public.beta_invites (created_at desc);
create index if not exists beta_invites_claimed_by_idx on public.beta_invites (claimed_by) where claimed_by is not null;
create index if not exists beta_invites_recipient_email_idx on public.beta_invites (lower(recipient_email)) where recipient_email is not null;

alter table public.beta_invites enable row level security;

revoke all on table public.beta_invites from public, anon, authenticated;

create or replace function public.beta_invite_token_hash(raw_token text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select encode(extensions.digest(trim(coalesce(raw_token, '')), 'sha256'), 'hex')
$$;

revoke all on function public.beta_invite_token_hash(text) from public, anon, authenticated;

create or replace function public.beta_invite_status(
  claimed_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz
)
returns text
language sql
stable
as $$
  select case
    when revoked_at is not null then 'revoked'
    when claimed_at is not null then 'claimed'
    when expires_at is not null and expires_at <= now() then 'expired'
    else 'active'
  end
$$;

revoke all on function public.beta_invite_status(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.admin_create_beta_invite(
  recipient_name text,
  recipient_email text default null,
  note text default null,
  expires_at timestamptz default null
)
returns table (
  id uuid,
  invite_token text,
  invite_path text,
  recipient_name text,
  recipient_email text,
  note text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  status text,
  audience text,
  grants_beta_access boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_name text := nullif(trim(coalesce(admin_create_beta_invite.recipient_name, '')), '');
  normalized_email text := nullif(lower(trim(coalesce(admin_create_beta_invite.recipient_email, ''))), '');
  normalized_note text := nullif(trim(coalesce(admin_create_beta_invite.note, '')), '');
  raw_token text;
  raw_token_hash text;
  inserted_invite public.beta_invites%rowtype;
begin
  if not public.is_admin_or_moderator() then
    raise exception 'Admin access required';
  end if;

  if normalized_name is null then
    raise exception 'Recipient name is required';
  end if;

  if normalized_email is not null and normalized_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Recipient email is not valid';
  end if;

  if admin_create_beta_invite.expires_at is not null and admin_create_beta_invite.expires_at <= now() then
    raise exception 'Invite expiration must be in the future';
  end if;

  loop
    raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    raw_token_hash := public.beta_invite_token_hash(raw_token);

    begin
      insert into public.beta_invites (
        token_hash,
        recipient_name,
        recipient_email,
        note,
        created_by,
        expires_at,
        audience,
        grants_beta_access
      )
      values (
        raw_token_hash,
        normalized_name,
        normalized_email,
        normalized_note,
        (select auth.uid()),
        admin_create_beta_invite.expires_at,
        'beta',
        true
      )
      returning * into inserted_invite;
      exit;
    exception
      when unique_violation then
        raw_token := null;
        raw_token_hash := null;
    end;
  end loop;

  return query
  select
    inserted_invite.id,
    raw_token as invite_token,
    '/invite/' || raw_token as invite_path,
    inserted_invite.recipient_name,
    inserted_invite.recipient_email,
    inserted_invite.note,
    inserted_invite.created_by,
    inserted_invite.created_at,
    inserted_invite.expires_at,
    public.beta_invite_status(inserted_invite.claimed_at, inserted_invite.revoked_at, inserted_invite.expires_at) as status,
    inserted_invite.audience,
    inserted_invite.grants_beta_access;
end;
$$;

create or replace function public.admin_list_beta_invites(search_text text default null)
returns table (
  id uuid,
  recipient_name text,
  recipient_email text,
  note text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz,
  expires_at timestamptz,
  claimed_by uuid,
  claimed_email text,
  claimed_at timestamptz,
  revoked_at timestamptz,
  audience text,
  grants_beta_access boolean,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_search text := lower(trim(coalesce(search_text, '')));
begin
  if not public.is_admin_or_moderator() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    i.id,
    i.recipient_name,
    i.recipient_email,
    i.note,
    i.created_by,
    creator.email as created_by_email,
    i.created_at,
    i.expires_at,
    i.claimed_by,
    i.claimed_email,
    i.claimed_at,
    i.revoked_at,
    i.audience,
    i.grants_beta_access,
    public.beta_invite_status(i.claimed_at, i.revoked_at, i.expires_at) as status
  from public.beta_invites i
  left join public.profiles creator on creator.id = i.created_by
  where normalized_search = ''
    or lower(coalesce(i.recipient_name, '')) like '%' || normalized_search || '%'
    or lower(coalesce(i.recipient_email, '')) like '%' || normalized_search || '%'
    or lower(coalesce(i.note, '')) like '%' || normalized_search || '%'
  order by i.created_at desc
  limit 250;
end;
$$;

create or replace function public.admin_revoke_beta_invite(invite_id uuid)
returns table (
  id uuid,
  recipient_name text,
  recipient_email text,
  note text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz,
  expires_at timestamptz,
  claimed_by uuid,
  claimed_email text,
  claimed_at timestamptz,
  revoked_at timestamptz,
  audience text,
  grants_beta_access boolean,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_invite public.beta_invites%rowtype;
begin
  if not public.is_admin_or_moderator() then
    raise exception 'Admin access required';
  end if;

  if admin_revoke_beta_invite.invite_id is null then
    raise exception 'Invite id is required';
  end if;

  update public.beta_invites i
  set revoked_at = now()
  where i.id = admin_revoke_beta_invite.invite_id
    and i.claimed_at is null
    and i.revoked_at is null
  returning * into updated_invite;

  if not found then
    raise exception 'Invite cannot be revoked';
  end if;

  return query
  select
    i.id,
    i.recipient_name,
    i.recipient_email,
    i.note,
    i.created_by,
    creator.email as created_by_email,
    i.created_at,
    i.expires_at,
    i.claimed_by,
    i.claimed_email,
    i.claimed_at,
    i.revoked_at,
    i.audience,
    i.grants_beta_access,
    public.beta_invite_status(i.claimed_at, i.revoked_at, i.expires_at) as status
  from public.beta_invites i
  left join public.profiles creator on creator.id = i.created_by
  where i.id = updated_invite.id;
end;
$$;

create or replace function public.claim_beta_invite(invite_token text)
returns table (
  invite_id uuid,
  status text,
  recipient_name text,
  recipient_email text,
  claimed_by uuid,
  claimed_email text,
  claimed_at timestamptz,
  app_access boolean,
  beta_status text,
  beta_access_status text,
  user_role text,
  tier text,
  plan_tier text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_token text := trim(coalesce(claim_beta_invite.invite_token, ''));
  hashed_token text;
  invite_record public.beta_invites%rowtype;
  claimed_invite public.beta_invites%rowtype;
  current_email text;
  updated_profile public.profiles%rowtype;
begin
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

  select lower(nullif(trim(coalesce(p.email, '')), ''))
  into current_email
  from public.profiles p
  where p.id = current_user_id;

  current_email := coalesce(current_email, lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '')));

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

  insert into public.profiles (
    id,
    email,
    beta_status,
    beta_access_status,
    app_access,
    user_role,
    tier,
    plan_tier,
    beta_access_requested_at,
    beta_access_approved_at,
    beta_access_approved_by,
    updated_at
  )
  values (
    current_user_id,
    current_email,
    case when claimed_invite.grants_beta_access then 'approved' else 'not_requested' end,
    case when claimed_invite.grants_beta_access then 'approved' else 'not_requested' end,
    claimed_invite.grants_beta_access,
    'user',
    'free',
    'free',
    now(),
    case when claimed_invite.grants_beta_access then now() else null end,
    claimed_invite.created_by,
    now()
  )
  on conflict (id) do update
  set email = coalesce(public.profiles.email, excluded.email),
      beta_status = case when claimed_invite.grants_beta_access then 'approved' else public.profiles.beta_status end,
      beta_access_status = case when claimed_invite.grants_beta_access then 'approved' else public.profiles.beta_access_status end,
      app_access = case when claimed_invite.grants_beta_access then true else public.profiles.app_access end,
      beta_access_requested_at = coalesce(public.profiles.beta_access_requested_at, now()),
      beta_access_approved_at = case when claimed_invite.grants_beta_access then now() else public.profiles.beta_access_approved_at end,
      beta_access_approved_by = case when claimed_invite.grants_beta_access then claimed_invite.created_by else public.profiles.beta_access_approved_by end,
      updated_at = now()
  returning * into updated_profile;

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
$$;

revoke all on function public.admin_create_beta_invite(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_create_beta_invite(text, text, text, timestamptz) to authenticated;

revoke all on function public.admin_list_beta_invites(text) from public, anon, authenticated;
grant execute on function public.admin_list_beta_invites(text) to authenticated;

revoke all on function public.admin_revoke_beta_invite(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_beta_invite(uuid) to authenticated;

revoke all on function public.claim_beta_invite(text) from public, anon, authenticated;
grant execute on function public.claim_beta_invite(text) to authenticated;

comment on table public.beta_invites is 'One-time beta invite metadata. Raw invite tokens are never stored; only SHA-256 token_hash values are persisted.';
comment on function public.admin_create_beta_invite(text, text, text, timestamptz) is 'Admin-only personal beta invite creation. Returns plaintext invite token once while storing only token_hash.';
comment on function public.admin_list_beta_invites(text) is 'Admin-only invite metadata list. Does not return plaintext invite tokens or token hashes.';
comment on function public.admin_revoke_beta_invite(uuid) is 'Admin-only unused beta invite revocation.';
comment on function public.claim_beta_invite(text) is 'Authenticated one-time invite claim. Atomically marks invite claimed and grants normal beta app access only.';

commit;
