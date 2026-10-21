-- Publisher setup and server runtime configuration. Secrets remain encrypted in Vault.
begin;
create schema if not exists code3_ebay_private;
revoke all on schema code3_ebay_private from public, anon, authenticated;

create table if not exists code3_ebay_private.runtime_config (
  singleton boolean primary key default true check (singleton),
  setup_owner uuid not null references auth.users(id),
  endpoint text not null,
  verification_secret_id uuid not null,
  client_id_secret_id uuid,
  client_secret_id uuid,
  updated_at timestamptz not null default now()
);
alter table code3_ebay_private.runtime_config enable row level security;
revoke all on code3_ebay_private.runtime_config from public, anon, authenticated;

create or replace function public.code3_ebay_initialize_runtime(p_owner_id uuid, p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
declare verification_id uuid; current_config code3_ebay_private.runtime_config;
begin
  if p_owner_id is null or not exists(select 1 from auth.users where id=p_owner_id)
    or p_endpoint !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/ebay-account-deletion$' then
    raise exception using errcode='22023', message='ebay_setup_invalid';
  end if;
  perform pg_advisory_xact_lock(731036411);
  select * into current_config from code3_ebay_private.runtime_config where singleton;
  if found then
    if current_config.setup_owner<>p_owner_id or current_config.endpoint<>p_endpoint then
      raise exception using errcode='22023', message='ebay_setup_already_initialized';
    end if;
    return;
  end if;
  verification_id := vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
    'code3_ebay_notification_verification_v1', 'eBay endpoint verification; publisher/server only');
  insert into code3_ebay_private.runtime_config(singleton,setup_owner,endpoint,verification_secret_id)
    values(true,p_owner_id,p_endpoint,verification_id);
end;
$$;
revoke all on function public.code3_ebay_initialize_runtime(uuid,text) from public,anon,authenticated;
grant execute on function public.code3_ebay_initialize_runtime(uuid,text) to service_role;

create or replace function code3_ebay_private.require_setup_owner()
returns void language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid; session_id_text text;
begin
  select setup_owner into owner_id from code3_ebay_private.runtime_config where singleton;
  session_id_text := auth.jwt()->>'session_id';
  if owner_id is null or auth.uid() is distinct from owner_id
    or coalesce(auth.jwt()->>'role','')<>'authenticated'
    or coalesce(session_id_text,'') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception using errcode='42501', message='ebay_setup_owner_required';
  end if;
  if not exists(select 1 from auth.sessions where id=session_id_text::uuid and user_id=owner_id) then
    raise exception using errcode='42501', message='ebay_setup_session_required';
  end if;
end;
$$;
revoke all on function code3_ebay_private.require_setup_owner() from public,anon,authenticated;

create or replace function public.code3_ebay_setup_info()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare config code3_ebay_private.runtime_config; token_value text;
begin
  perform code3_ebay_private.require_setup_owner();
  select * into strict config from code3_ebay_private.runtime_config where singleton;
  select decrypted_secret into strict token_value from vault.decrypted_secrets where id=config.verification_secret_id;
  return jsonb_build_object('endpoint',config.endpoint,'verificationToken',token_value,
    'credentialsConfigured',config.client_id_secret_id is not null and config.client_secret_id is not null);
end;
$$;
revoke all on function public.code3_ebay_setup_info() from public,anon;
grant execute on function public.code3_ebay_setup_info() to authenticated;

create or replace function public.code3_ebay_configure_credentials(p_client_id text,p_client_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare config code3_ebay_private.runtime_config; id_secret uuid; secret_id uuid;
begin
  perform code3_ebay_private.require_setup_owner();
  if p_client_id is null or p_client_secret is null
    or length(p_client_id) not between 10 and 300 or length(p_client_secret) not between 8 and 500
    or p_client_id ~ '[[:space:][:cntrl:]]' or p_client_secret ~ '[[:space:][:cntrl:]]' then
    raise exception using errcode='22023',message='ebay_credentials_invalid';
  end if;
  select * into strict config from code3_ebay_private.runtime_config where singleton for update;
  id_secret := config.client_id_secret_id; secret_id := config.client_secret_id;
  if id_secret is null then
    id_secret := vault.create_secret(p_client_id,'code3_ebay_application_id_v1','eBay Production application ID');
  else perform vault.update_secret(id_secret,p_client_id); end if;
  if secret_id is null then
    secret_id := vault.create_secret(p_client_secret,'code3_ebay_client_secret_v1','eBay Production Cert ID; server only');
  else perform vault.update_secret(secret_id,p_client_secret); end if;
  update code3_ebay_private.runtime_config set client_id_secret_id=id_secret,client_secret_id=secret_id,updated_at=now() where singleton;
  return jsonb_build_object('saved',true,'credentialsConfigured',true);
end;
$$;
revoke all on function public.code3_ebay_configure_credentials(text,text) from public,anon;
grant execute on function public.code3_ebay_configure_credentials(text,text) to authenticated;

create or replace function public.code3_ebay_setup_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare summary jsonb;
begin
  perform code3_ebay_private.require_setup_owner();
  select jsonb_build_object('received',count(*),'pending',count(*) filter(where state='pending'),
    'processed',count(*) filter(where state='processed'),'needsReview',count(*) filter(where state='needs_review'),
    'failed',count(*) filter(where state='failed'),'lastReceived',max(received_at))
    into summary from code3_ebay_private.notification_inbox;
  return summary;
end;
$$;
revoke all on function public.code3_ebay_setup_status() from public,anon;
grant execute on function public.code3_ebay_setup_status() to authenticated;

create or replace function public.code3_ebay_runtime_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('endpoint',c.endpoint,'verificationToken',v.decrypted_secret,
    'clientId',coalesce(i.decrypted_secret,''),'clientSecret',coalesce(s.decrypted_secret,''),
    'environment','production','ownerId',c.setup_owner)
  from code3_ebay_private.runtime_config c
  join vault.decrypted_secrets v on v.id=c.verification_secret_id
  left join vault.decrypted_secrets i on i.id=c.client_id_secret_id
  left join vault.decrypted_secrets s on s.id=c.client_secret_id
  where c.singleton;
$$;
revoke all on function public.code3_ebay_runtime_config() from public,anon,authenticated;
grant execute on function public.code3_ebay_runtime_config() to service_role;
commit;
