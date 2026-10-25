-- eBay notices are never mapped to Code 3 account IDs. Only eBay provider data
-- is redacted; business IDs, quantities, costs and other providers are retained.
begin;
create schema code3_ebay_private;
revoke all on schema code3_ebay_private from public, anon, authenticated;

create table code3_ebay_private.erased_subjects (
  kind text not null check (kind in ('username','userId','eiasToken')),
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  erased_at timestamptz not null default now(),
  primary key(kind,digest)
);
create table code3_ebay_private.receipts (
  notification_digest text primary key check (notification_digest ~ '^[a-f0-9]{64}$'),
  event_at timestamptz not null,
  processed_at timestamptz not null default now()
);
alter table code3_ebay_private.erased_subjects enable row level security;
alter table code3_ebay_private.receipts enable row level security;
revoke all on all tables in schema code3_ebay_private from public, anon, authenticated;

create function code3_ebay_private.is_erased(kind text, value text)
returns boolean language sql volatile security definer set search_path = '' as $$
  select value is not null and exists (
    select 1 from code3_ebay_private.erased_subjects s
    where s.kind = is_erased.kind and s.digest = encode(sha256(convert_to(
      is_erased.kind || ':' || case when is_erased.kind='username' then lower(btrim(value)) else value end,'UTF8')),'hex')
  );
$$;

create function code3_ebay_private.ebay_scope(value jsonb, inherited boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when value ? 'providerId' then lower(value->>'providerId')='ebay'
    when value ? 'externalProvider' then lower(value->>'externalProvider')='ebay'
    when value ? 'external_provider' then lower(value->>'external_provider')='ebay'
    when value ? 'marketplace' then lower(value->>'marketplace')='ebay'
    else inherited or coalesce(value->>'sourceId','') like 'ebay:%' end;
$$;

create function code3_ebay_private.contains_erased(value jsonb, inherited boolean default false)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare scoped boolean; entry record; kind text;
begin
  if not inherited and value::text not ilike '%ebay%' then return false; end if;
  if jsonb_typeof(value)='array' then
    for entry in select a.value from jsonb_array_elements(value) a loop
      if code3_ebay_private.contains_erased(entry.value,inherited) then return true; end if;
    end loop;
  elsif jsonb_typeof(value)='object' then
    scoped := code3_ebay_private.ebay_scope(value,inherited);
    if scoped and value->>'type'='SELLER_NAME' and code3_ebay_private.is_erased('username',value->>'value') then return true; end if;
    for entry in select * from jsonb_each(value) loop
      kind := case entry.key
        when 'sellerName' then 'username' when 'username' then 'username' when 'sellerUsername' then 'username'
        when 'sellerUserId' then 'userId' when 'ebayUserId' then 'userId' when 'userId' then 'userId'
        when 'eiasToken' then 'eiasToken' when 'sellerEiasToken' then 'eiasToken' else null end;
      if scoped and kind is not null and jsonb_typeof(entry.value)='string'
        and code3_ebay_private.is_erased(kind,entry.value #>> '{}') then return true; end if;
      if code3_ebay_private.contains_erased(entry.value,scoped) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create function code3_ebay_private.sanitize(value jsonb, inherited boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare scoped boolean; matched boolean; entry record; result jsonb; clean jsonb;
begin
  if not exists(select 1 from code3_ebay_private.erased_subjects) then return value; end if;
  if not code3_ebay_private.contains_erased(value,inherited) then return value; end if;
  if jsonb_typeof(value)='array' then
    result := '[]'::jsonb;
    for entry in select a.value from jsonb_array_elements(value) a loop
      result := result || jsonb_build_array(code3_ebay_private.sanitize(entry.value,inherited));
    end loop;
    return result;
  elsif jsonb_typeof(value)='object' then
    scoped := code3_ebay_private.ebay_scope(value,inherited);
    matched := scoped and code3_ebay_private.contains_erased(value,scoped);
    clean := value;
    if matched then
      -- These are provider-supplied fields in Browse normalization, imported
      -- deals and the intelligence evidence adapter. Keep operational fields.
      clean := clean - array['seller','sellerName','sellerUsername','username','sellerUserId','ebayUserId','userId','eiasToken','sellerEiasToken',
        'sellerRating','sellerFeedbackScore','description','shortDescription','notes','sourceDataExplanation','dataSource',
        'listingUrl','originalListingUrl','sourceUrl','source_url','externalListingId','legacyListingId','externalId','externalIdentity','sourceId',
        'imageReferences','images','image','thumbnailImages','additionalImages','location','itemLocation','distance','distanceUnit',
        'observations','valuationEvidence','riskFlags','tags','raw','rawPayload','rawProviderPayload'];
      if clean ? 'title' then clean := jsonb_set(clean,'{title}','"eBay data deleted"'::jsonb); end if;
      clean := clean || '{"ebayDataDeleted":true}'::jsonb;
    end if;
    result := '{}'::jsonb;
    for entry in select * from jsonb_each(clean) loop
      result := result || jsonb_build_object(entry.key,code3_ebay_private.sanitize(entry.value,scoped));
    end loop;
    return result;
  end if;
  return value;
end;
$$;

create function code3_ebay_private.guard_provider_data()
returns trigger language plpgsql security definer set search_path = '' as $$
declare clean jsonb;
begin
  perform pg_advisory_xact_lock(361720261025::bigint);
  if tg_table_schema='code3_sync_private' then
    new.sources := code3_ebay_private.sanitize(new.sources);
  elsif tg_table_name='code3_records' then
    clean := code3_ebay_private.sanitize(new.metadata,lower(coalesce(new.external_provider,''))='ebay');
    if clean is distinct from new.metadata or jsonb_path_exists(clean,'$.**.ebayDataDeleted ? (@ == true)') then
      new.metadata := clean;
      new.notes := null;
      new.source_url := null;
      new.external_id := null;
    end if;
  end if;
  return new;
end;
$$;

create function code3_ebay_private.process_notice(notification_digest text, event_at timestamptz, subjects jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare entry record; changed record;
begin
  -- Serialize privacy changes with each other. Normal writes are protected by
  -- BEFORE triggers, including writes racing a notice or restoring an old backup.
  perform pg_advisory_xact_lock(361720261025::bigint);
  perform set_config('statement_timeout','10000',true);
  if jsonb_typeof(subjects)<>'array' or jsonb_array_length(subjects) not between 1 and 3 then raise exception 'ebay_subjects_invalid'; end if;
  if exists(select 1 from code3_ebay_private.receipts r where r.notification_digest=process_notice.notification_digest) then return; end if;
  for entry in select * from jsonb_to_recordset(subjects) as s(kind text,digest text) loop
    insert into code3_ebay_private.erased_subjects(kind,digest) values(entry.kind,entry.digest) on conflict do nothing;
  end loop;
  if to_regclass('public.code3_records') is not null then
    execute 'update public.code3_records set metadata=code3_ebay_private.sanitize(metadata,lower(coalesce(external_provider,''''))=''ebay''), notes=null, source_url=null, external_id=null
      where code3_ebay_private.contains_erased(metadata,lower(coalesce(external_provider,''''))=''ebay'')';
  end if;
  if to_regclass('code3_sync_private.workspaces') is not null then
    -- Existing revisions are sanitized too, so historical reads cannot restore PII.
    update code3_sync_private.workspace_revisions set sources=code3_ebay_private.sanitize(sources)
      where code3_ebay_private.contains_erased(sources);
    for changed in update code3_sync_private.workspaces set sources=code3_ebay_private.sanitize(sources), revision=revision+1, updated_at=now()
      where code3_ebay_private.contains_erased(sources) returning * loop
      insert into code3_sync_private.workspace_revisions(owner_id,revision,expected_revision,mutation_id,sources)
        values(changed.owner_id,changed.revision,changed.revision-1,gen_random_uuid(),changed.sources);
    end loop;
  end if;
  insert into code3_ebay_private.receipts(notification_digest,event_at) values(notification_digest,event_at);
end;
$$;

do $$ begin
  if to_regclass('public.code3_records') is not null then
    create trigger code3_ebay_privacy_guard before insert or update on public.code3_records
      for each row execute function code3_ebay_private.guard_provider_data();
  end if;
  if to_regclass('code3_sync_private.workspaces') is not null then
    create trigger code3_ebay_privacy_guard before insert or update on code3_sync_private.workspaces
      for each row execute function code3_ebay_private.guard_provider_data();
    create trigger code3_ebay_privacy_guard before insert or update on code3_sync_private.workspace_revisions
      for each row execute function code3_ebay_private.guard_provider_data();
  end if;
end $$;
revoke all on all functions in schema code3_ebay_private from public, anon, authenticated;
grant usage on schema code3_ebay_private to service_role;
grant execute on function code3_ebay_private.sanitize(jsonb,boolean), code3_ebay_private.process_notice(text,timestamptz,jsonb) to service_role;
commit;
