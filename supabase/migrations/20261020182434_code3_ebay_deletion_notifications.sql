-- eBay-only privacy release; no existing records are modified at installation.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Reviewed source, not an applied migration. Root generates the migration via CLI.
-- Requires the existing Code 3 cloud-workspace/account-session schema.
-- No eBay payload, username, userId, eiasToken, keys or verification tokens are stored.

create schema if not exists code3_ebay_private;
revoke all on schema code3_ebay_private from public, anon, authenticated;
grant usage on schema code3_ebay_private to service_role;

create table if not exists code3_ebay_private.notification_inbox (
  event_id text primary key check (length(event_id) between 1 and 200),
  identity_hashes jsonb not null check (jsonb_typeof(identity_hashes) = 'array'),
  first_payload_sha256 text not null check (first_payload_sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check (state in ('pending','processed','needs_review','failed')),
  received_at timestamptz not null default clock_timestamp(),
  last_received_at timestamptz not null default clock_timestamp(),
  receive_count integer not null default 1 check (receive_count > 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processed_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code in ('processing_failed','identity_unmapped')),
  workspace_rows integer not null default 0,
  history_rows integer not null default 0,
  canonical_rows integer not null default 0,
  matched_records integer not null default 0
);

create table if not exists code3_ebay_private.identity_tombstones (
  sequence bigint generated always as identity primary key,
  kind text not null check (kind in ('username','userId','eiasToken','listingId')),
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  first_event_id text not null references code3_ebay_private.notification_inbox(event_id),
  created_at timestamptz not null default clock_timestamp(),
  unique (kind, identity_hash)
);
-- Only this schema's definer processor can create a same-transaction allowance.
-- A caller-set custom GUC is deliberately not used as a security boundary.
create table if not exists code3_ebay_private.processing_transactions (
  transaction_id bigint primary key
);
create index if not exists code3_ebay_notification_pending_idx on code3_ebay_private.notification_inbox(state, received_at);
alter table code3_ebay_private.notification_inbox enable row level security;
alter table code3_ebay_private.identity_tombstones enable row level security;
alter table code3_ebay_private.processing_transactions enable row level security;
revoke all on all tables in schema code3_ebay_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema code3_ebay_private from public, anon, authenticated, service_role;

-- A single privacy lock serializes tombstone install, scrub, and guarded writes.
-- It prevents a stale upload from committing between the scrub and tombstone.
create or replace function code3_ebay_private.privacy_lock()
returns void language sql volatile security invoker set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(722960102001::bigint);
$$;

create or replace function code3_ebay_private.identity_hash(p_kind text, p_value text)
returns text language sql immutable strict security invoker set search_path = '' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_kind || pg_catalog.chr(31) || p_value, 'UTF8')), 'hex');
$$;

create or replace function code3_ebay_private.is_ebay(p_value jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(lower(p_value->>'providerId') = 'ebay'
    or lower(p_value->>'external_provider') = 'ebay'
    or lower(p_value->>'marketplace') = 'ebay'
    or lower(p_value#>>'{provenance,providerId}') = 'ebay'
    or left(p_value->>'sourceId',5) = 'ebay:'
    or left(p_value->>'dataSource',15) = 'eBay Browse API ', false);
$$;

-- Exact, named identity fields only. No text search, substring or fuzzy matching.
-- No bare userId on app records: it can denote the Code 3 owner, not the seller.
create or replace function code3_ebay_private.identities(p_value jsonb, p_context boolean default false, p_depth integer default 0, p_shallow boolean default false)
returns table(kind text, identity_hash text)
language plpgsql immutable security invoker set search_path = '' as $$
declare pair record; child jsonb; v_kind text; v_text text; context boolean;
begin
  if p_depth > 64 then raise exception using errcode='22023', message='ebay_privacy_document_too_deep'; end if;
  if jsonb_typeof(p_value) = 'array' then
    if p_shallow then return; end if;
    for child in select value from jsonb_array_elements(p_value) loop
      return query select * from code3_ebay_private.identities(child,p_context,p_depth+1);
    end loop;
  elsif jsonb_typeof(p_value) = 'object' then
    context := p_context or code3_ebay_private.is_ebay(p_value);
    if context then
      for pair in select * from (values
        ('username',p_value->>'sellerName'),('username',p_value->>'sellerUsername'),
        ('username',p_value#>>'{seller,username}'),
        ('userId',p_value->>'sellerUserId'),('userId',p_value->>'ebayUserId'),('userId',p_value#>>'{seller,userId}'),
        ('eiasToken',p_value->>'sellerEiasToken'),('eiasToken',p_value->>'ebayEiasToken'),('eiasToken',p_value#>>'{seller,eiasToken}'),
        ('listingId',p_value->>'externalListingId'),('listingId',p_value->>'legacyListingId'),
        ('listingId',p_value#>>'{externalIdentity,externalListingId}'),
        ('listingId',case when left(p_value->>'sourceId',5)='ebay:' and left(p_value->>'sourceId',18)<>'ebay:unidentified:' then substr(p_value->>'sourceId',6) end),
        ('listingId',case when left(p_value->>'underlyingSourceId',5)='ebay:' and left(p_value->>'underlyingSourceId',18)<>'ebay:unidentified:' then substr(p_value->>'underlyingSourceId',6) end),
        ('listingId',case when left(p_value#>>'{provenance,sourceId}',5)='ebay:' and left(p_value#>>'{provenance,sourceId}',18)<>'ebay:unidentified:' then substr(p_value#>>'{provenance,sourceId}',6) end),
        ('listingId',case when left(p_value#>>'{provenance,underlyingSourceId}',5)='ebay:' and left(p_value#>>'{provenance,underlyingSourceId}',18)<>'ebay:unidentified:' then substr(p_value#>>'{provenance,underlyingSourceId}',6) end)
      ) as named(kind,value) loop
        if pair.value is not null and length(pair.value) between 1 and 2048 then
          kind := pair.kind; identity_hash := code3_ebay_private.identity_hash(pair.kind,pair.value); return next;
        end if;
      end loop;
      v_kind := case p_value->>'observationType' when 'SELLER_NAME' then 'username' when 'SELLER_USER_ID' then 'userId' when 'SELLER_EIAS_TOKEN' then 'eiasToken' end;
      v_text := p_value->>'value';
      if v_kind is not null and jsonb_typeof(p_value->'value')='string' and length(v_text) between 1 and 2048 then
        kind := v_kind; identity_hash := code3_ebay_private.identity_hash(v_kind,v_text); return next;
      end if;
      for child in select value from jsonb_array_elements(case when jsonb_typeof(p_value->'observations')='array' then p_value->'observations' else '[]'::jsonb end) loop
        v_kind:=case child->>'observationType' when 'SELLER_NAME' then 'username' when 'SELLER_USER_ID' then 'userId' when 'SELLER_EIAS_TOKEN' then 'eiasToken' end;
        v_text:=child->>'value';
        if v_kind is not null and jsonb_typeof(child->'value')='string' and length(v_text) between 1 and 2048 then
          kind:=v_kind;identity_hash:=code3_ebay_private.identity_hash(v_kind,v_text);return next;
        end if;
      end loop;
    end if;
    if not p_shallow then
      for pair in select key,value from jsonb_each(p_value) loop
        return query select * from code3_ebay_private.identities(pair.value,context,p_depth+1);
      end loop;
    end if;
  end if;
end;
$$;

create or replace function code3_ebay_private.has_match(p_value jsonb, p_context boolean default false, p_event_id text default null)
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists(select 1 from code3_ebay_private.identities(p_value,p_context) i
    join code3_ebay_private.identity_tombstones t on t.kind=i.kind and t.identity_hash=i.identity_hash
    where p_event_id is null or t.first_event_id=p_event_id or exists (
      select 1 from code3_ebay_private.notification_inbox n, jsonb_array_elements(n.identity_hashes) event_identity
      where n.event_id=p_event_id and event_identity->>'kind'=i.kind and event_identity->>'hash'=i.identity_hash));
$$;

create or replace function code3_ebay_private.own_match(p_value jsonb,p_context boolean default false,p_event_id text default null)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from (
      select * from code3_ebay_private.identities(p_value,p_context,0,true)
      union all select * from code3_ebay_private.identities(p_value->'metadata',p_context,0,true)
        where lower(p_value->>'external_provider')='ebay'
    ) i
    join code3_ebay_private.identity_tombstones t on t.kind=i.kind and t.identity_hash=i.identity_hash
    where p_event_id is null or t.first_event_id=p_event_id or exists(
      select 1 from code3_ebay_private.notification_inbox n,jsonb_array_elements(n.identity_hashes) event_identity
      where n.event_id=p_event_id and event_identity->>'kind'=i.kind and event_identity->>'hash'=i.identity_hash));
$$;

-- Exact URL association only. A parent appraisal can contain several sellers;
-- its selected sourceReference is not automatically owned by every source.
create or replace function code3_ebay_private.affected_urls(p_value jsonb,p_context boolean default false,p_depth integer default 0,p_event_id text default null)
returns table(url text) language plpgsql volatile security definer set search_path='' as $$
declare context boolean; pair record; child jsonb;
begin
  if p_depth>64 then raise exception using errcode='22023',message='ebay_privacy_document_too_deep'; end if;
  if jsonb_typeof(p_value)='array' then
    for child in select value from jsonb_array_elements(p_value) loop
      return query select * from code3_ebay_private.affected_urls(child,p_context,p_depth+1,p_event_id);
    end loop;
  elsif jsonb_typeof(p_value)='object' then
    context:=p_context or code3_ebay_private.is_ebay(p_value);
    if context and code3_ebay_private.own_match(p_value,context,p_event_id) then
      for pair in select value from (values(p_value->>'listingUrl'),(p_value->>'originalListingUrl'),(p_value->>'itemWebUrl'),
        (p_value#>>'{externalIdentity,listingUrl}'),
        (case when p_value ? 'externalListingId' then p_value->>'sourceReference' end)) links(value) loop
        if pair.value is not null and length(pair.value) between 1 and 4096 then url:=pair.value;return next;end if;
      end loop;
    end if;
    for pair in select key,value from jsonb_each(p_value) loop
      return query select * from code3_ebay_private.affected_urls(pair.value,context,p_depth+1,p_event_id);
    end loop;
  end if;
end;
$$;

-- Install listing IDs only from individual eBay objects tied to an exact known
-- seller. Do not collect every listing in an owner/workspace containing a match.
create or replace function code3_ebay_private.linked_listings(p_value jsonb, p_context boolean default false, p_depth integer default 0, p_event_id text default null)
returns table(identity_hash text) language plpgsql volatile security definer set search_path = '' as $$
declare pair record; child jsonb; context boolean;
begin
  if p_depth > 64 then raise exception using errcode='22023', message='ebay_privacy_document_too_deep'; end if;
  if jsonb_typeof(p_value)='array' then
    for child in select value from jsonb_array_elements(p_value) loop
      return query select * from code3_ebay_private.linked_listings(child,p_context,p_depth+1,p_event_id);
    end loop;
  elsif jsonb_typeof(p_value)='object' then
    context := p_context or code3_ebay_private.is_ebay(p_value);
    if context and exists (
      select 1 from (
        select * from code3_ebay_private.identities(p_value,context,0,true)
        union all select * from code3_ebay_private.identities(p_value->'metadata',context,0,true)
      ) i join code3_ebay_private.identity_tombstones t on t.kind=i.kind and t.identity_hash=i.identity_hash
      where p_event_id is null or t.first_event_id=p_event_id or exists (
        select 1 from code3_ebay_private.notification_inbox n, jsonb_array_elements(n.identity_hashes) event_identity
        where n.event_id=p_event_id and event_identity->>'kind'=i.kind and event_identity->>'hash'=i.identity_hash)
    ) then
      return query select distinct i.identity_hash from code3_ebay_private.identities(p_value,context,0,true) i where i.kind='listingId';
    end if;
    for pair in select key,value from jsonb_each(p_value) loop
      return query select * from code3_ebay_private.linked_listings(pair.value,context,p_depth+1,p_event_id);
    end loop;
  end if;
end;
$$;

-- Retain record IDs, product title/identity, owner notes, amounts, quantities,
-- costs, asking/current prices and financial history. Remove seller identity and
-- links/descriptions/location/image evidence supplied by a matched eBay source.
-- Analysis sourceInput hashes remain historic; marker tells clients not to claim
-- an unchanged pre-erasure analysis input. No new fake hash or analysis is made.
create or replace function code3_ebay_private.redact(p_value jsonb, p_context boolean default false, p_matched boolean default false, p_depth integer default 0, p_event_id text default null, p_affected_urls text[] default array[]::text[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; child jsonb; rewritten jsonb; pair record; context boolean; matched boolean; record_root boolean;
begin
  if p_depth > 64 then raise exception using errcode='22023', message='ebay_privacy_document_too_deep'; end if;
  if jsonb_typeof(p_value)='array' then
    result := '[]'::jsonb;
    for child in select value from jsonb_array_elements(p_value) loop
      rewritten := code3_ebay_private.redact(child,p_context,p_matched,p_depth+1,p_event_id,p_affected_urls);
      if rewritten is not null then result := result || jsonb_build_array(rewritten); end if;
    end loop;
    return result;
  elsif jsonb_typeof(p_value)<>'object' then return p_value;
  end if;
  context := p_context or code3_ebay_private.is_ebay(p_value);
  record_root := jsonb_typeof(p_value->'id')='string';
  if record_root or (code3_ebay_private.is_ebay(p_value) and cardinality(p_affected_urls)=0) then
    select coalesce(array_agg(distinct u.url),array[]::text[]) into p_affected_urls
      from (select unnest(p_affected_urls) as url union
        select url from code3_ebay_private.affected_urls(p_value,context,0,p_event_id)) u;
  end if;
  -- A fresh provider object is an independent source: an affected appraisal
  -- must not erase a different seller's evidence in its second source entry.
  matched := case when code3_ebay_private.is_ebay(p_value)
    then code3_ebay_private.own_match(p_value,context,p_event_id)
    else p_matched or (record_root and code3_ebay_private.has_match(p_value,context,p_event_id)) end;
  if matched and context and (left(p_value->>'observationType',7)='SELLER_' or p_value->>'observationType'=any(array['LOCATION','LISTING_DESCRIPTION'])) then return null; end if;
  -- Provider-only image references are omitted; owner-entered images survive.
  if matched and code3_ebay_private.is_ebay(p_value) and (p_value ? 'reference' or p_value ? 'url') and not (p_value ? 'id') then return null; end if;
  result := '{}'::jsonb;
  for pair in select key,value from jsonb_each(p_value) loop
    if matched and context and pair.key=any(array[
      'seller','sellerName','sellerUsername','sellerRating','sellerFeedbackScore','sellerUserId','sellerEiasToken','ebayUserId','ebayEiasToken',
      'externalListingId','legacyListingId','listingId','listingUrl','originalListingUrl','itemWebUrl',
      'description','shortDescription','location','itemLocation','distance','distanceUnit','imageReferences','thumbnailImages','additionalImages',
      'url','reference'
    ]) then continue; end if;
    if matched and context and pair.key=any(array['sourceId','underlyingSourceId','evidenceId','independenceKey'])
      and jsonb_typeof(pair.value)='string' and left(pair.value#>>'{}',5)='ebay:' then
      result:=result || jsonb_build_object(pair.key,'ebay-privacy-redacted'); continue;
    end if;
    if pair.key='sourceReference' and jsonb_typeof(pair.value)='string' and (pair.value#>>'{}')=any(p_affected_urls) then continue; end if;
    rewritten := code3_ebay_private.redact(pair.value,context,matched,p_depth+1,p_event_id,p_affected_urls);
    if rewritten is not null then result := result || jsonb_build_object(pair.key,rewritten); end if;
  end loop;
  if matched and (context or record_root) then result := result || jsonb_build_object('ebayPrivacyRedacted',true); end if;
  if p_value ? 'sourceInput' and result->'sourceInput' is distinct from p_value->'sourceInput' then
    result:=result || jsonb_build_object('privacyRequiresReanalysis',true);
  end if;
  return result;
end;
$$;

create or replace function code3_ebay_private.accept_notification(p_event_id text,p_payload jsonb,p_payload_sha256 text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare data jsonb; identities jsonb; item record; existing code3_ebay_private.notification_inbox; added boolean := false;
begin
  if p_event_id is null or p_payload_sha256 is null or p_payload is null
    or length(p_event_id) not between 1 and 200 or p_event_id ~ '[[:cntrl:]]' or p_payload_sha256 !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536
    or p_payload#>>'{metadata,topic}' is distinct from 'MARKETPLACE_ACCOUNT_DELETION'
    or p_payload#>>'{metadata,schemaVersion}' is distinct from '1.0'
    or p_payload#>'{metadata,deprecated}' is distinct from 'false'::jsonb
    or p_payload#>>'{notification,notificationId}' is distinct from p_event_id then
    raise exception using errcode='22023',message='ebay_notification_invalid';
  end if;
  data := p_payload#>'{notification,data}';
  if data is null or jsonb_typeof(data)<>'object' or jsonb_typeof(data->'userId') is distinct from 'string' or length(data->>'userId') not between 1 and 2048 then
    raise exception using errcode='22023',message='ebay_notification_identity_invalid'; end if;
  for item in select key,value from jsonb_each(data) loop
    if item.key<>all(array['userId','username','eiasToken']) or jsonb_typeof(item.value)<>'string'
      or length(item.value#>>'{}') not between 1 and 2048 or btrim(item.value#>>'{}')=''
      or (item.value#>>'{}') ~ '[[:cntrl:]]' then
      raise exception using errcode='22023',message='ebay_notification_identity_invalid'; end if;
  end loop;
  select jsonb_agg(jsonb_build_object('kind',key,'hash',code3_ebay_private.identity_hash(key,value#>>'{}')) order by key)
    into identities from jsonb_each(data);
  perform code3_ebay_private.privacy_lock();
  select * into existing from code3_ebay_private.notification_inbox where event_id=p_event_id for update;
  if found then
    if existing.identity_hashes is distinct from identities then
      raise exception using errcode='22023',message='ebay_notification_id_reused'; end if;
    update code3_ebay_private.notification_inbox set last_received_at=clock_timestamp(),receive_count=receive_count+1 where event_id=p_event_id;
  else
    insert into code3_ebay_private.notification_inbox(event_id,identity_hashes,first_payload_sha256)
      values(p_event_id,identities,p_payload_sha256);
    added:=true;
  end if;
  for item in select value from jsonb_array_elements(identities) loop
    insert into code3_ebay_private.identity_tombstones(kind,identity_hash,first_event_id)
      values(item.value->>'kind',item.value->>'hash',p_event_id) on conflict(kind,identity_hash) do nothing;
  end loop;
  return jsonb_build_object('status',case when added then 'accepted' else 'duplicate' end,'event_id',p_event_id,
    'state',coalesce(existing.state,'pending'),'durableReceipt',true);
end;
$$;

-- All legacy snapshot writes and canonical writes are guarded. Reject instead
-- of silently changing acknowledged p_sources bytes in the existing sync RPC.
create or replace function code3_ebay_private.guard_workspace()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  perform code3_ebay_private.privacy_lock();
  if exists(select 1 from code3_ebay_private.processing_transactions where transaction_id=pg_catalog.txid_current()) then return new; end if;
  if exists(select 1 from code3_ebay_private.identity_tombstones)
    and code3_ebay_private.redact(new.sources) is distinct from new.sources then
    raise exception using errcode='22023',message='ebay_privacy_refresh_required';
  end if;
  return new;
end;
$$;

create or replace function code3_ebay_private.guard_canonical()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare content jsonb; context boolean;
begin
  perform code3_ebay_private.privacy_lock();
  if exists(select 1 from code3_ebay_private.processing_transactions where transaction_id=pg_catalog.txid_current()) then return new; end if;
  context := lower(new.external_provider)='ebay' or (new.external_provider is null and code3_ebay_private.is_ebay(new.metadata));
  content := jsonb_build_object('id',new.id,'metadata',new.metadata,'external_provider',case when context then 'ebay' else new.external_provider end,'externalListingId',new.external_id,'sourceReference',new.source_url);
  if exists(select 1 from code3_ebay_private.identity_tombstones)
    and code3_ebay_private.redact(content,coalesce(context,false)) is distinct from content then
    raise exception using errcode='22023',message='ebay_privacy_refresh_required';
  end if;
  return new;
end;
$$;

create or replace function code3_ebay_private.lock_statement()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin perform code3_ebay_private.privacy_lock(); return null; end;
$$;

do $$ begin
  if to_regclass('code3_sync_private.workspaces') is null or to_regclass('code3_sync_private.workspace_revisions') is null then
    raise exception 'Existing workspace sync schema required'; end if;
  execute 'drop trigger if exists code3_ebay_privacy_guard on code3_sync_private.workspaces';
  execute 'create trigger code3_ebay_privacy_guard before insert or update of sources on code3_sync_private.workspaces for each row execute function code3_ebay_private.guard_workspace()';
  execute 'drop trigger if exists code3_ebay_privacy_lock on code3_sync_private.workspaces';
  execute 'create trigger code3_ebay_privacy_lock before insert or update on code3_sync_private.workspaces for each statement execute function code3_ebay_private.lock_statement()';
  execute 'drop trigger if exists code3_ebay_privacy_guard on code3_sync_private.workspace_revisions';
  execute 'create trigger code3_ebay_privacy_guard before insert or update of sources on code3_sync_private.workspace_revisions for each row execute function code3_ebay_private.guard_workspace()';
  execute 'drop trigger if exists code3_ebay_privacy_lock on code3_sync_private.workspace_revisions';
  execute 'create trigger code3_ebay_privacy_lock before insert or update on code3_sync_private.workspace_revisions for each statement execute function code3_ebay_private.lock_statement()';
  if to_regclass('public.code3_records') is not null then
    execute 'drop trigger if exists code3_ebay_privacy_guard on public.code3_records';
    execute 'create trigger code3_ebay_privacy_guard before insert or update of metadata,external_provider,external_id,source_url on public.code3_records for each row execute function code3_ebay_private.guard_canonical()';
    execute 'drop trigger if exists code3_ebay_privacy_lock on public.code3_records';
    execute 'create trigger code3_ebay_privacy_lock before insert or update on public.code3_records for each statement execute function code3_ebay_private.lock_statement()';
  end if;
end $$;

-- Cloud writes already take an owner advisory/row lock before INSERT. Acquire
-- the privacy lock first to keep the worker/write lock order consistent. The
-- trusted existing definition is preserved byte-for-byte except this one call.
-- Fail safely if an unreviewed schema version changed the required anchor.
do $$ declare definition text; updated_definition text; target regprocedure; begin
  target:=to_regprocedure('code3_sync_private.write_workspace(bigint,jsonb,uuid)');
  if target is null then raise exception 'Existing workspace write RPC required'; end if;
  definition:=pg_get_functiondef(target);
  if position('perform code3_ebay_private.privacy_lock();' in definition)=0 then
    updated_definition:=replace(definition,'account_id := code3_sync_private.require_workspace_account();',
      'perform code3_ebay_private.privacy_lock(); account_id := code3_sync_private.require_workspace_account();');
    if updated_definition=definition then raise exception 'Workspace privacy lock anchor requires review'; end if;
    execute updated_definition;
  end if;
end $$;

create or replace function code3_ebay_private.process_notification(p_event_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare job code3_ebay_private.notification_inbox; row_data record; rewritten jsonb; content jsonb; candidate record;
  w_count integer:=0; h_count integer:=0; c_count integer:=0; matched integer:=0; new_state text; stamp timestamptz;
begin
  perform code3_ebay_private.privacy_lock();
  select * into job from code3_ebay_private.notification_inbox where event_id=p_event_id for update;
  if not found then raise exception using errcode='22023',message='ebay_notification_unknown'; end if;
  if job.state='processed' then
    return jsonb_build_object('status','already_processed','event_id',p_event_id,'workspace_rows',job.workspace_rows,'history_rows',job.history_rows,'canonical_rows',job.canonical_rows,'matched_records',job.matched_records);
  end if;
  update code3_ebay_private.notification_inbox set attempt_count=attempt_count+1,last_error_code=null where event_id=p_event_id;
  -- The exception block rolls back ALL erasure writes together while leaving a
  -- durable retryable job and tombstones from the earlier acceptance transaction.
  begin
    insert into code3_ebay_private.processing_transactions(transaction_id) values(pg_catalog.txid_current());
    -- Derive listing tombstones before stripping identity/link fields.
    for row_data in select sources from code3_sync_private.workspaces union all select sources from code3_sync_private.workspace_revisions loop
      for candidate in select distinct identity_hash from code3_ebay_private.linked_listings(row_data.sources,false,0,p_event_id) loop
        insert into code3_ebay_private.identity_tombstones(kind,identity_hash,first_event_id)
          values('listingId',candidate.identity_hash,p_event_id) on conflict(kind,identity_hash) do nothing;
      end loop;
    end loop;
    if to_regclass('public.code3_records') is not null then
      for row_data in execute 'select id,external_provider,external_id,source_url,metadata from public.code3_records' loop
        content:=jsonb_build_object('id',row_data.id,'metadata',row_data.metadata,'external_provider',coalesce(row_data.external_provider,case when code3_ebay_private.is_ebay(row_data.metadata) then 'ebay' end),'externalListingId',row_data.external_id,'sourceReference',row_data.source_url);
        for candidate in select distinct identity_hash from code3_ebay_private.linked_listings(content,false,0,p_event_id) loop
          insert into code3_ebay_private.identity_tombstones(kind,identity_hash,first_event_id)
            values('listingId',candidate.identity_hash,p_event_id) on conflict(kind,identity_hash) do nothing;
        end loop;
      end loop;
    end if;
    for row_data in select * from code3_sync_private.workspace_revisions order by owner_id,revision for update loop
      rewritten:=code3_ebay_private.redact(row_data.sources,false,false,0,p_event_id);
      if rewritten is distinct from row_data.sources then
        update code3_sync_private.workspace_revisions set sources=rewritten where owner_id=row_data.owner_id and revision=row_data.revision;
        h_count:=h_count+1;
      end if;
    end loop;
    for row_data in select * from code3_sync_private.workspaces order by owner_id for update loop
      rewritten:=code3_ebay_private.redact(row_data.sources,false,false,0,p_event_id);
      if rewritten is distinct from row_data.sources then
        stamp:=clock_timestamp();
        insert into code3_sync_private.workspace_revisions(owner_id,revision,expected_revision,mutation_id,sources,created_at)
          values(row_data.owner_id,row_data.revision+1,row_data.revision,pg_catalog.gen_random_uuid(),rewritten,stamp);
        update code3_sync_private.workspaces set sources=rewritten,revision=row_data.revision+1,updated_at=stamp where owner_id=row_data.owner_id;
        w_count:=w_count+1;
      end if;
    end loop;
    if to_regclass('public.code3_records') is not null then
      for row_data in execute 'select id,external_provider,external_id,source_url,metadata from public.code3_records order by id for update' loop
        content:=jsonb_build_object('id',row_data.id,'metadata',row_data.metadata,'external_provider',coalesce(row_data.external_provider,case when code3_ebay_private.is_ebay(row_data.metadata) then 'ebay' end),'externalListingId',row_data.external_id,'sourceReference',row_data.source_url);
        rewritten:=code3_ebay_private.redact(content,false,false,0,p_event_id);
        if rewritten is distinct from content then
          execute 'update public.code3_records set metadata=$1,external_id=$2,source_url=$3 where id=$4'
            using coalesce(rewritten->'metadata','{}'::jsonb),rewritten->>'externalListingId',rewritten->>'sourceReference',row_data.id;
          c_count:=c_count+1;
        end if;
      end loop;
    end if;
    matched:=w_count+h_count+c_count;
    new_state:=case when matched>0 then 'processed' else 'needs_review' end;
    update code3_ebay_private.notification_inbox set state=new_state,processed_at=case when new_state='processed' then clock_timestamp() end,
      workspace_rows=w_count,history_rows=h_count,canonical_rows=c_count,matched_records=matched,
      last_error_code=case when new_state='needs_review' then 'identity_unmapped' end where event_id=p_event_id;
    delete from code3_ebay_private.processing_transactions where transaction_id=pg_catalog.txid_current();
  exception when others then
    update code3_ebay_private.notification_inbox set state='failed',last_error_code='processing_failed' where event_id=p_event_id;
    return jsonb_build_object('status','failed','event_id',p_event_id);
  end;
  return jsonb_build_object('status',new_state,'event_id',p_event_id,'workspace_rows',w_count,'history_rows',h_count,'canonical_rows',c_count,'matched_records',matched);
end;
$$;

create or replace function code3_ebay_private.notification_status(p_event_id text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('events',coalesce(jsonb_agg(jsonb_build_object('event_id',event_id,'state',state,'receive_count',receive_count,
    'attempt_count',attempt_count,'received_at',received_at,'processed_at',processed_at,'last_error_code',last_error_code,
    'workspace_rows',workspace_rows,'history_rows',history_rows,'canonical_rows',canonical_rows,'matched_records',matched_records) order by received_at desc),'[]'::jsonb))
    from (select * from code3_ebay_private.notification_inbox where p_event_id is null or event_id=p_event_id order by received_at desc limit 100) bounded;
$$;

create or replace function code3_ebay_private.retry_notifications(p_limit integer default 25)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare job record; results jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='ebay_retry_limit_invalid'; end if;
  for job in select event_id from code3_ebay_private.notification_inbox where state in ('pending','failed') order by received_at limit p_limit loop
    results:=results || jsonb_build_array(code3_ebay_private.process_notification(job.event_id));
  end loop;
  return jsonb_build_object('results',results);
end;
$$;

-- Only opaque tombstone hashes are exposed to verified app sessions, so clients
-- can sanitize offline originals/archives before an upload or restore. No raw
-- identity, notification IDs, job states or account-wide records are returned.
create or replace function code3_ebay_private.privacy_tombstones(p_after bigint default 0,p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; next_after bigint; more boolean;
begin
  perform code3_private.require_current_session();
  if auth.uid() is null or public.has_full_app_access() is not true then
    raise exception using errcode='42501',message='workspace_access_required'; end if;
  if p_after is null or p_after<0 or p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='ebay_tombstone_page_invalid'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('sequence',sequence,'kind',kind,'hash',identity_hash) order by sequence),'[]'::jsonb),coalesce(max(sequence),p_after)
    into result,next_after from (select sequence,kind,identity_hash from code3_ebay_private.identity_tombstones where sequence>p_after order by sequence limit p_limit) page;
  select exists(select 1 from code3_ebay_private.identity_tombstones where sequence>next_after) into more;
  return jsonb_build_object('tombstones',result,'nextAfter',next_after,'hasMore',more);
end;
$$;

create or replace function public.code3_ebay_accept_notification(p_event_id text,p_payload jsonb,p_payload_sha256 text)
returns jsonb language sql volatile security invoker set search_path='' as $$ select code3_ebay_private.accept_notification(p_event_id,p_payload,p_payload_sha256); $$;
create or replace function public.code3_ebay_process_notification(p_event_id text)
returns jsonb language sql volatile security invoker set search_path='' as $$ select code3_ebay_private.process_notification(p_event_id); $$;
create or replace function public.code3_ebay_notification_status(p_event_id text default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select code3_ebay_private.notification_status(p_event_id); $$;
create or replace function public.code3_ebay_retry_notifications(p_limit integer default 25)
returns jsonb language sql volatile security invoker set search_path='' as $$ select code3_ebay_private.retry_notifications(p_limit); $$;
create or replace function public.code3_ebay_privacy_tombstones(p_after bigint default 0,p_limit integer default 500)
returns jsonb language sql stable security definer set search_path='' as $$ select code3_ebay_private.privacy_tombstones(p_after,p_limit); $$;

-- Do not revoke unrelated runtime-config functions owned by the release script.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='code3_ebay_private' and p.proname=any(array['privacy_lock','identity_hash','is_ebay','identities','has_match','own_match','affected_urls',
      'linked_listings','redact','accept_notification','guard_workspace','guard_canonical','lock_statement','process_notification',
      'notification_status','retry_notifications','privacy_tombstones']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function code3_ebay_private.accept_notification(text,jsonb,text),code3_ebay_private.process_notification(text),
  code3_ebay_private.notification_status(text),code3_ebay_private.retry_notifications(integer) to service_role;
revoke all on function public.code3_ebay_accept_notification(text,jsonb,text),public.code3_ebay_process_notification(text),
  public.code3_ebay_notification_status(text),public.code3_ebay_retry_notifications(integer),public.code3_ebay_privacy_tombstones(bigint,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.code3_ebay_accept_notification(text,jsonb,text),public.code3_ebay_process_notification(text),
  public.code3_ebay_notification_status(text),public.code3_ebay_retry_notifications(integer) to service_role;
grant execute on function public.code3_ebay_privacy_tombstones(bigint,integer) to authenticated;

comment on table code3_ebay_private.notification_inbox is 'Signature-verified eBay deletion jobs: hashed identities only, no raw payload; needs_review is not completed deletion.';
comment on table code3_ebay_private.identity_tombstones is 'Exact SHA256(kind + U+001F + original identity) tombstones; listing hashes derived only from an exact affected seller source. Prevent stale restore/upload resurrection.';

-- Publisher setup and server runtime configuration. Secrets remain encrypted in Vault.

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

COMMIT;
