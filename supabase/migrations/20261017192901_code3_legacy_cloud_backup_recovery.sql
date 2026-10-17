begin;

-- A fixed private-record scope. Identity, permissions, invitations, billing,
-- moderation, shared catalogues and public publishing are intentionally absent.
create or replace function code3_private.legacy_backup_scope()
returns table(table_name text, owner_column text, parent_table text, parent_column text)
language sql immutable security invoker set search_path='' as $$
  values
    ('workspaces','owner_user_id',null,null),
    ('vehicles','user_id',null,null),
    ('inventory_items','user_id',null,null),
    ('user_inventory','user_id',null,null),
    ('sales_records','user_id',null,null),
    ('business_expenses','user_id',null,null),
    ('mileage_trips','user_id',null,null),
    ('app_user_preferences','user_id',null,null),
    ('notification_preferences','user_id',null,null),
    ('deal_finder_sessions','user_id',null,null),
    ('deal_finder_items',null,'deal_finder_sessions','session_id'),
    ('scanner_intake_sessions','user_id',null,null),
    ('marketplace_listing_channels','user_id',null,null),
    ('receipt_records','user_id',null,null),
    ('receipt_line_items',null,'receipt_records','receipt_id'),
    ('kid_community_projects','user_id',null,null),
    ('kid_community_project_items',null,'kid_community_projects','project_id'),
    ('ai_assist_events','user_id',null,null),
    ('store_user_watchlist','user_id',null,null),
    ('saved_listings','user_id',null,null)
$$;

create or replace function public.code3_export_legacy_cloud_backup()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  actor uuid := auth.uid(); scope record; rows_json jsonb; sections jsonb := '{}'::jsonb;
  missing jsonb := '[]'::jsonb; files jsonb; row_count bigint := 0;
begin
  perform code3_private.require_current_session();
  if actor is null or public.has_full_app_access() is distinct from true then raise exception 'Approved account access is required.' using errcode='42501'; end if;
  for scope in select * from code3_private.legacy_backup_scope() loop
    if pg_catalog.to_regclass('public.' || scope.table_name) is null then
      missing := missing || pg_catalog.jsonb_build_array(scope.table_name); continue;
    end if;
    if scope.owner_column is not null then
      execute pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(t) order by t.id),''[]''::jsonb) from public.%I t where t.%I=$1',scope.table_name,scope.owner_column) into rows_json using actor;
    else
      execute pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(t) order by t.id),''[]''::jsonb) from public.%I t where exists(select 1 from public.%I p where p.id=t.%I and p.user_id=$1)',scope.table_name,scope.parent_table,scope.parent_column) into rows_json using actor;
    end if;
    if scope.table_name='notification_preferences' then
      select coalesce(jsonb_agg(value - 'sms_verified_at'),'[]'::jsonb) into rows_json from jsonb_array_elements(rows_json);
    end if;
    row_count := row_count + pg_catalog.jsonb_array_length(rows_json);
    if row_count > 100000 then raise exception 'Backup exceeds the supported record limit; no partial backup was produced.'; end if;
    sections := sections || pg_catalog.jsonb_build_object(scope.table_name,rows_json);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name,'size',o.metadata->'size','mimeType',o.metadata->>'mimetype') order by o.bucket_id,o.name),'[]'::jsonb)
    into files from storage.objects o
    where o.bucket_id in ('receipts','receipt-images','product-submissions','feedback-screenshots')
      and (o.owner_id=actor::text or o.owner=actor or o.name like 'users/' || actor::text || '/%'
        or exists(select 1 from public.workspaces w where w.owner_user_id=actor and o.name like 'workspaces/' || w.id::text || '/%'));
  return jsonb_build_object('format','code3-legacy-cloud-records','version',1,'ownerId',actor,'createdAt',statement_timestamp(),
    'sections',sections,'recordCount',row_count,'fileManifest',files,'missingTables',missing,
    'exclusions',jsonb_build_array('Authentication, roles, membership permissions, invitation tokens, phone verification and billing state',
      'Public marketplace posts, shared catalogue/community/moderation records and records owned by other accounts',
      'Files outside supported owner-scoped storage buckets and external image URLs'));
end $$;

create or replace function public.code3_restore_legacy_cloud_backup(payload_text text, challenge_id uuid, confirmation_token text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  actor uuid := auth.uid(); backup jsonb; sections jsonb; scope record; row_json jsonb; row_id uuid;
  allowed boolean; current_owner uuid; row_workspace uuid; columns_sql text; values_sql text; key_name text;
  inserted bigint := 0; kept bigint := 0; n bigint; total bigint := 0; digest text; reference record;
begin
  perform code3_private.require_current_session();
  if actor is null or public.has_full_app_access() is distinct from true then raise exception 'Approved account access is required.' using errcode='42501'; end if;
  if octet_length(payload_text)>41943040 then raise exception 'Cloud backup is too large.'; end if;
  backup := payload_text::jsonb;
  if backup->>'format' is distinct from 'code3-cloud-backup' or backup->>'version' is distinct from '1' or backup#>>'{records,ownerId}' is distinct from actor::text then raise exception 'The backup belongs to a different account or format.' using errcode='42501'; end if;
  sections := backup#>'{records,sections}';
  if jsonb_typeof(sections) is distinct from 'object' then raise exception 'Cloud backup sections are missing.'; end if;
  if exists(select 1 from jsonb_object_keys(sections) t(name) where not exists(select 1 from code3_private.legacy_backup_scope() s where s.table_name=t.name)) then raise exception 'Cloud backup contains an unsupported table.'; end if;
  digest := encode(sha256(convert_to(payload_text,'UTF8')),'hex');
  perform code3_private.consume_account_confirmation(challenge_id,confirmation_token,'CLOUD_RESTORE',digest);
  -- The one-use proof and all record inserts share this database transaction.
  -- Any permission, reference or schema failure rolls back every insert.
  for scope in select * from code3_private.legacy_backup_scope() loop
    if not sections ? scope.table_name then continue; end if;
    if pg_catalog.to_regclass('public.' || scope.table_name) is null or jsonb_typeof(sections->scope.table_name)<>'array' then raise exception 'A backup table is unavailable or invalid.'; end if;
    total := total + jsonb_array_length(sections->scope.table_name);
    if total>100000 then raise exception 'Cloud backup contains too many records.'; end if;
    for row_json in select value from jsonb_array_elements(sections->scope.table_name) loop
      if jsonb_typeof(row_json)<>'object' or row_json->>'id' is null then raise exception 'Every cloud record needs a stable ID.'; end if;
      row_id := (row_json->>'id')::uuid;
      if scope.owner_column is not null then
        if row_json->>scope.owner_column is distinct from actor::text then raise exception 'A cloud record belongs to another account.' using errcode='42501'; end if;
      else
        execute format('select p.user_id from public.%I p where p.id=$1',scope.parent_table) into current_owner using (row_json->>scope.parent_column)::uuid;
        if current_owner is distinct from actor then raise exception 'A cloud record references another account or a missing parent.' using errcode='42501'; end if;
      end if;
      -- Keep existing versions exactly as they are. Unknown, invisible IDs are
      -- also protected by ON CONFLICT and cannot be overwritten through restore.
      execute format('select exists(select 1 from public.%I where id=$1)',scope.table_name) into allowed using row_id;
      if allowed then kept:=kept+1; continue; end if;
      row_workspace := nullif(row_json->>'workspace_id','')::uuid;
      if row_workspace is not null and public.can_edit_workspace(row_workspace) is distinct from true then raise exception 'The target workspace is not editable by this account.' using errcode='42501'; end if;
      if row_json ? 'owner_user_id' and nullif(row_json->>'owner_user_id','') is not null and row_json->>'owner_user_id'<>actor::text then raise exception 'Record ownership cannot be reassigned.' using errcode='42501'; end if;
      if scope.table_name='workspaces' and nullif(row_json->>'created_by','') is not null and row_json->>'created_by'<>actor::text then raise exception 'Workspace creator authority cannot be reassigned.' using errcode='42501'; end if;
      if scope.table_name='notification_preferences' and nullif(row_json->>'sms_verified_at','') is not null then raise exception 'Phone verification cannot be restored from a backup.' using errcode='42501'; end if;
      for reference in select * from (values
        ('sales_records','item_id','inventory_items'),('business_expenses','linked_item_id','inventory_items'),
        ('business_expenses','linked_sale_id','sales_records'),('mileage_trips','vehicle_id','vehicles'),
        ('receipt_line_items','created_inventory_item_id','inventory_items')) as refs(source_table,source_column,target_table)
        where source_table=scope.table_name loop
        if nullif(row_json->>reference.source_column,'') is not null then
          execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',reference.target_table) into allowed using (row_json->>reference.source_column)::uuid,actor;
          if not allowed then raise exception 'A recovered record has a missing or foreign private reference.' using errcode='42501'; end if;
        end if;
      end loop;
      columns_sql := ''; values_sql := '';
      for key_name in select jsonb_object_keys(row_json) loop
        if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass('public.' || scope.table_name) and a.attname=key_name and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity='') then raise exception 'A recovered record has an unsupported field.'; end if;
        columns_sql := columns_sql || case when columns_sql='' then '' else ',' end || format('%I',key_name);
        values_sql := values_sql || case when values_sql='' then '' else ',' end || format('r.%I',key_name);
      end loop;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r on conflict (id) do nothing',scope.table_name,columns_sql,values_sql,scope.table_name) using row_json;
      get diagnostics n = row_count;
      inserted := inserted + n; kept := kept + (1-n);
    end loop;
  end loop;
  return jsonb_build_object('status','APPLIED','insertedRecords',inserted,'keptExistingRecords',kept,'operationDigest',digest);
end $$;

revoke all on function code3_private.legacy_backup_scope(), public.code3_export_legacy_cloud_backup(), public.code3_restore_legacy_cloud_backup(text,uuid,text) from public,anon;
grant execute on function code3_private.legacy_backup_scope(), public.code3_export_legacy_cloud_backup(), public.code3_restore_legacy_cloud_backup(text,uuid,text) to authenticated;
commit;
