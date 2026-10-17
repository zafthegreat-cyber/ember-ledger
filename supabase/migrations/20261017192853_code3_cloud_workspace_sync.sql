-- Additive workspace snapshot sync. Existing collection/sales/expense tables
-- are intentionally untouched. Authenticated ownership is always server-derived.
begin;

create schema if not exists code3_sync_private;
revoke all on schema code3_sync_private from public, anon, authenticated;
grant usage on schema code3_sync_private to authenticated;

create table code3_sync_private.workspaces (
  owner_id uuid primary key references auth.users(id),
  revision bigint not null default 0 check (revision >= 0),
  sources jsonb not null default '{}'::jsonb check (jsonb_typeof(sources) = 'object'),
  updated_at timestamptz not null default now()
);

create table code3_sync_private.workspace_revisions (
  owner_id uuid not null references auth.users(id),
  revision bigint not null check (revision > 0),
  expected_revision bigint not null check (expected_revision >= 0),
  mutation_id uuid not null,
  sources jsonb not null check (jsonb_typeof(sources) = 'object'),
  created_at timestamptz not null default now(),
  primary key (owner_id, revision),
  unique (owner_id, mutation_id)
);

alter table code3_sync_private.workspaces enable row level security;
alter table code3_sync_private.workspace_revisions enable row level security;
create policy own_workspace_read on code3_sync_private.workspaces for select to authenticated using ((select auth.uid()) = owner_id);
create policy own_workspace_history_read on code3_sync_private.workspace_revisions for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on code3_sync_private.workspaces, code3_sync_private.workspace_revisions from public, anon, authenticated;

-- These private functions are privileged only to make the revision + history
-- transaction atomic without granting clients direct update/delete privileges.
-- Every entry point validates the live provider session and approved profile.
create function code3_sync_private.require_workspace_account()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare account_id uuid;
begin
  perform code3_private.require_current_session();
  account_id := auth.uid();
  if account_id is null or public.has_full_app_access() is not true then
    raise exception using errcode = '42501', message = 'workspace_access_required';
  end if;
  return account_id;
end;
$$;
revoke all on function code3_sync_private.require_workspace_account() from public, anon, authenticated;

create function code3_sync_private.validate_workspace_sources(sources jsonb)
returns void language plpgsql immutable security invoker set search_path = '' as $$
declare entry record; field_name text; version_value integer;
begin
  if sources is null or jsonb_typeof(sources) <> 'object' or octet_length(sources::text) > 8388608
    or (select count(*) from jsonb_object_keys(sources)) > 25 then
    raise exception using errcode = '22023', message = 'workspace_snapshot_invalid';
  end if;
  for entry in select key, value from jsonb_each(sources) loop
    if entry.key <> all(array['deal-finder','owner-center','account-ops','inbox-order-intelligence','bot-operations','purchase-receiving',
      'legacy-core-business','legacy-restock-scout','legacy-community','legacy-feedback','legacy-suggestions','legacy-admin-review-history',
      'product-sightings','manual-market-price-cache','phase2-local-fallback','beta-readiness-records','grade-assist-checklists',
      'assistant-thread','daily-progress','safe-ui-preferences','business-compliance'])
      or jsonb_typeof(entry.value) <> 'object' or not (entry.value ? 'schemaVersion' and entry.value ? 'data')
      or jsonb_typeof(entry.value->'schemaVersion') <> 'number'
      or jsonb_typeof(entry.value->'data') not in ('object','array')
      or exists(select 1 from jsonb_object_keys(entry.value) k where k <> all(array['schemaVersion','data']))
      or coalesce(entry.value->>'schemaVersion','') !~ '^[0-9]$' then
      raise exception using errcode = '22023', message = 'workspace_source_invalid';
    end if;
    version_value := (entry.value->>'schemaVersion')::integer;
    if (entry.key = 'deal-finder' and version_value not between 1 and 8)
      or (entry.key = any(array['owner-center','account-ops','inbox-order-intelligence','bot-operations','purchase-receiving','safe-ui-preferences','business-compliance']) and version_value <> 1)
      or (entry.key <> all(array['deal-finder','owner-center','account-ops','inbox-order-intelligence','bot-operations','purchase-receiving','safe-ui-preferences','business-compliance']) and version_value <> 0) then
      raise exception using errcode = '22023', message = 'workspace_schema_unsupported';
    end if;
    if entry.key = 'legacy-core-business' then
      if jsonb_typeof(entry.value->'data') <> 'object' then raise exception using errcode = '22023', message = 'workspace_source_invalid'; end if;
      for field_name in select jsonb_object_keys(entry.value->'data') loop
        if field_name <> all(array['items','purchasers','catalogProducts','tideTradrWatchlist','marketplaceListings','marketplaceReports','marketplaceSavedIds','tideTradrLookupId',
          'marketPriceCache','marketPriceMemories','itemComparisons','vaultCollectionSets','vaultDisplayCase','userSearchAliases','expenses','sales','tradeRecords','trades',
          'sparkGifts','sparkKidPacks','sparkEventPlans','collectorEventPlans','vehicles','mileageTrips','workspaces','activeWorkspaceId','forgeModeSettings',
          'dealForm','homeStatsEnabled','dashboardPreset','dashboardLayout','dashboardCardStyle','appThemeChoice','appSetupPersonalization','cloudSyncPreference','locationSettings']) then
          raise exception using errcode = '22023', message = 'workspace_private_field';
        end if;
      end loop;
    elsif entry.key = 'phase2-local-fallback' then
      if jsonb_typeof(entry.value->'data') <> 'object' then raise exception using errcode = '22023', message = 'workspace_source_invalid'; end if;
      for field_name in select jsonb_object_keys(entry.value->'data') loop
        if field_name <> all(array['appPreferences','notificationPreferences','dealFinderSessions','dealFinderItems','scannerIntakeSessions','marketplaceListingChannels',
          'receiptRecords','receiptLineItems','kidCommunityProjects','kidCommunityProjectItems','aiAssistEvents','updatedAt']) then
          raise exception using errcode = '22023', message = 'workspace_private_field';
        end if;
      end loop;
    elsif entry.key = 'safe-ui-preferences' then
      if jsonb_typeof(entry.value->'data') <> 'object' then raise exception using errcode = '22023', message = 'workspace_source_invalid'; end if;
      for field_name in select jsonb_object_keys(entry.value->'data') loop
        if field_name <> all(array['et-tcg-app-theme','et-tcg-beta-catalog-view','et-tcg-beta-catalog-page-size','et-tcg-beta-vault-showcase-view',
          'et-tcg-forge-mode-settings','autoOpenDropWebsite','code3.workspace-preference.v1']) then
          raise exception using errcode = '22023', message = 'workspace_private_field';
        end if;
      end loop;
    end if;
  end loop;
  if exists (
    with recursive values_to_check(value, key) as (
      select sources, ''::text
      union all
      select child.value, child.key from values_to_check parent cross join lateral (
        select e.value, e.key from jsonb_each(case when jsonb_typeof(parent.value)='object' then parent.value else '{}'::jsonb end) e
        union all
        select a.value, ''::text from jsonb_array_elements(case when jsonb_typeof(parent.value)='array' then parent.value else '[]'::jsonb end) a
      ) child
    ) select 1 from values_to_check where key in ('__proto__','constructor','prototype')
      or regexp_replace(lower(key), '[^a-z0-9]', '', 'g') = any(array['accesstoken','refreshtoken','idtoken','password','passwordhash','clientsecret','apikey',
        'authorization','authorizationheader','bearertoken','cookie','sessiontoken','privatekey','cvv','cvc','paymentcardnumber','creditcardnumber','rawemail','rawemailbody','rawproviderpayload'])
  ) then raise exception using errcode = '22023', message = 'workspace_private_field'; end if;
end;
$$;
revoke all on function code3_sync_private.validate_workspace_sources(jsonb) from public, anon, authenticated;

create function code3_sync_private.read_workspace(p_revision bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account_id uuid; snapshot jsonb;
begin
  account_id := code3_sync_private.require_workspace_account();
  if p_revision is null then
    select jsonb_build_object('format','code3-workspace-v1','revision',w.revision,'updatedAt',w.updated_at,'sources',w.sources)
      into snapshot from code3_sync_private.workspaces w where w.owner_id = account_id;
    return coalesce(snapshot, jsonb_build_object('format','code3-workspace-v1','revision',0,'updatedAt',null,'sources','{}'::jsonb));
  end if;
  select jsonb_build_object('format','code3-workspace-v1','revision',r.revision,'updatedAt',r.created_at,'sources',r.sources)
    into snapshot from code3_sync_private.workspace_revisions r where r.owner_id = account_id and r.revision = p_revision;
  if snapshot is null then raise exception using errcode = '22023', message = 'workspace_revision_unavailable'; end if;
  return snapshot;
end;
$$;

create function code3_sync_private.write_workspace(p_expected_revision bigint, p_sources jsonb, p_mutation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare account_id uuid; current_row code3_sync_private.workspaces; previous_row code3_sync_private.workspace_revisions; saved_at timestamptz;
begin
  account_id := code3_sync_private.require_workspace_account();
  if p_expected_revision is null or p_expected_revision < 0 or p_mutation_id is null then raise exception using errcode = '22023', message = 'workspace_mutation_invalid'; end if;
  perform code3_sync_private.validate_workspace_sources(p_sources);
  perform pg_advisory_xact_lock(hashtextextended(account_id::text, 3017));
  select * into previous_row from code3_sync_private.workspace_revisions r where r.owner_id = account_id and r.mutation_id = p_mutation_id;
  if found then
    if previous_row.expected_revision <> p_expected_revision or previous_row.sources <> p_sources then raise exception using errcode = '22023', message = 'workspace_mutation_reused'; end if;
    return jsonb_build_object('format','code3-workspace-v1','revision',previous_row.revision,'updatedAt',previous_row.created_at,'sources',previous_row.sources);
  end if;
  insert into code3_sync_private.workspaces(owner_id) values(account_id) on conflict(owner_id) do nothing;
  select * into current_row from code3_sync_private.workspaces w where w.owner_id = account_id for update;
  if current_row.revision <> p_expected_revision then raise exception using errcode = '40001', message = 'workspace_revision_conflict'; end if;
  saved_at := clock_timestamp();
  insert into code3_sync_private.workspace_revisions(owner_id, revision, expected_revision, mutation_id, sources, created_at)
    values(account_id, current_row.revision + 1, p_expected_revision, p_mutation_id, p_sources, saved_at);
  update code3_sync_private.workspaces set revision = current_row.revision + 1, sources = p_sources, updated_at = saved_at where owner_id = account_id;
  return jsonb_build_object('format','code3-workspace-v1','revision',current_row.revision + 1,'updatedAt',saved_at,'sources',p_sources);
end;
$$;

create function code3_sync_private.workspace_history()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account_id uuid; result jsonb;
begin
  account_id := code3_sync_private.require_workspace_account();
  select coalesce(jsonb_agg(jsonb_build_object('revision',r.revision,'updatedAt',r.created_at,'sourceCount',(select count(*) from jsonb_object_keys(r.sources)),
      'bytes',octet_length(r.sources::text)) order by r.revision desc),'[]'::jsonb) into result
    from (select * from code3_sync_private.workspace_revisions where owner_id = account_id order by revision desc limit 100) r;
  return result;
end;
$$;

revoke all on function code3_sync_private.read_workspace(bigint), code3_sync_private.write_workspace(bigint,jsonb,uuid), code3_sync_private.workspace_history() from public, anon;
grant execute on function code3_sync_private.read_workspace(bigint), code3_sync_private.write_workspace(bigint,jsonb,uuid), code3_sync_private.workspace_history() to authenticated;

create function public.code3_workspace_read(p_revision bigint default null)
returns jsonb language sql stable security invoker set search_path = '' as $$ select code3_sync_private.read_workspace(p_revision); $$;
create function public.code3_workspace_write(p_expected_revision bigint, p_sources jsonb, p_mutation_id uuid)
returns jsonb language sql volatile security invoker set search_path = '' as $$ select code3_sync_private.write_workspace(p_expected_revision, p_sources, p_mutation_id); $$;
create function public.code3_workspace_history()
returns jsonb language sql stable security invoker set search_path = '' as $$ select code3_sync_private.workspace_history(); $$;
revoke all on function public.code3_workspace_read(bigint), public.code3_workspace_write(bigint,jsonb,uuid), public.code3_workspace_history() from public, anon;
grant execute on function public.code3_workspace_read(bigint), public.code3_workspace_write(bigint,jsonb,uuid), public.code3_workspace_history() to authenticated;

comment on table code3_sync_private.workspace_revisions is 'Immutable account-scoped cloud snapshot history. No browser role has direct insert, update, or delete grants. Existing legacy cloud data is not migrated by this release.';
commit;
