-- Local migration only. Applying this installs deletion machinery; it does not
-- request deletion or modify any existing account, collection, file, or price.
begin;
create table code3_private.account_deletions (
  user_id uuid primary key,
  started_at timestamptz not null default clock_timestamp(),
  lease uuid,
  lease_until timestamptz,
  records_removed boolean not null default false
);
alter table code3_private.account_deletions enable row level security;
revoke all on code3_private.account_deletions from public, anon, authenticated;

-- Trusted server only: this function does not trust a browser-supplied user ID.
-- The HTTP endpoint verifies the same account's password before calling begin.
create function code3_private.require_deletion_service()
returns void language plpgsql stable security invoker set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Account deletion service required.' using errcode='42501';
  end if;
end $$;

-- Explicit owned-row scope, ordered child before parent. Do not add a generic
-- "delete all foreign keys" operation: shared catalog/price data must survive.
create function code3_private.account_deletion_scope()
returns table(table_name text, owner_column text) language sql immutable security invoker set search_path='' as $$
values
 ('listing_messages','sender_user_id'),('listing_messages','recipient_user_id'),
 ('listing_reports','reporter_user_id'),('seller_reviews','reviewer_user_id'),
 ('marketplace_listings','seller_user_id'),('seller_profiles','user_id'),
 ('saved_listings','user_id'),('sales_records','user_id'),('business_expenses','user_id'),
 ('mileage_trips','user_id'),('receipt_records','user_id'),('deal_finder_sessions','user_id'),
 ('scanner_intake_sessions','user_id'),('marketplace_listing_channels','user_id'),
 ('kid_community_projects','user_id'),('inventory_items','user_id'),('user_inventory','user_id'),
 ('vehicles','user_id'),('app_user_preferences','user_id'),('notification_preferences','user_id'),
 ('notifications','user_id'),('ai_assist_events','user_id'),('store_user_watchlist','user_id'),
 ('store_reports','user_id'),('store_guesses','user_id'),('user_trust_profiles','user_id'),
 ('user_suggestions','user_id'),('store_suggestions','user_id'),('catalog_suggestions','user_id'),
 ('sku_suggestions','user_id'),('retailer_product_suggestions','user_id'),('scout_report_reviews','user_id'),
 ('store_intelligence_suggestions','user_id'),('universal_data_suggestions','user_id'),
 ('beta_access_requests','user_id'),('beta_invites','claimed_by'),('little_sparks_applications','user_id'),('kids_program_applications','user_id'),
 ('beta_feedback','user_id'),('data_requests','user_id'),('app_error_logs','user_id'),
 ('app_activity_events','user_id'),('campaign_visits','user_id'),('audit_logs','actor_user_id'),
 ('admin_user_notes','subject_user_id'),('beta_admin_notes','target_user_id'),
 ('workspace_members','user_id'),('workspace_memberships','user_id'),
 ('user_profiles','user_id'),('profiles','id')
$$;

create function code3_private.account_deletion_status(target_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope record; relation regclass; has_rows boolean; blockers jsonb := '[]'; known boolean; fk record;
begin
  perform code3_private.require_deletion_service();
  if target_user is null or not exists(select 1 from auth.users where id=target_user) then raise exception 'Account not found.'; end if;
  if exists(select 1 from public.profiles where id=target_user and app_role='owner') then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_protected_owner','message','Transfer the app owner responsibilities before deleting this account.'));
  end if;
  if exists(select 1 from public.workspaces w where w.owner_user_id=target_user and (
    exists(select 1 from public.workspace_members m where m.workspace_id=w.id and m.user_id<>target_user and m.status<>'removed')
    or exists(select 1 from public.workspace_memberships m where m.workspace_id=w.id and (m.user_id is distinct from target_user) and m.status<>'removed')
    or exists(select 1 from public.workspace_invites i where i.workspace_id=w.id and i.status='invited'))) then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_shared_workspace','message','Transfer or close shared workspaces and their pending invitations before deleting your account.'));
  end if;
  for scope in select * from code3_private.account_deletion_scope() loop
    -- Membership is a relationship, not shared workspace content. Leaving a
    -- different owner's workspace is safe; historical removed members must not
    -- block the owner after the active-member/invitation checks above pass.
    if scope.table_name in ('workspace_members','workspace_memberships') then continue; end if;
    relation := to_regclass(format('public.%I',scope.table_name));
    if relation is null or not exists(select 1 from pg_attribute where attrelid=relation and attname=scope.owner_column and not attisdropped) then continue; end if;
    if exists(select 1 from pg_attribute where attrelid=relation and attname='workspace_id' and not attisdropped) then
      execute format('select exists(select 1 from public.%I t join public.workspaces w on w.id=t.workspace_id where (t.%I=$1 and w.owner_user_id<>$1) or (w.owner_user_id=$1 and t.%I is distinct from $1))',scope.table_name,scope.owner_column,scope.owner_column) into has_rows using target_user;
      if has_rows then
        blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_shared_workspace','message','Some records are shared with another account. Transfer them before deletion so other members keep their data.')); exit;
      end if;
    end if;
  end loop;
  -- The optional canonical backend is not installed in every deployment.
  if to_regclass('public.code3_file_assets') is not null then
    execute 'select exists(select 1 from public.code3_file_assets where owner_subject=$1)' into has_rows using 'supabase:'||target_user::text;
    if has_rows then blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_storage_review_required','message','Some files use separate protected storage. Contact support to include them in account deletion.')); end if;
  end if;
  if exists(select 1 from storage.objects where (owner_id=target_user::text or owner=target_user) and bucket_id not in ('receipts','receipt-images','product-submissions','feedback-screenshots')) then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_storage_review_required','message','Some attachments need a storage review before deletion can finish.'));
  end if;
  if exists(select 1 from storage.objects where (owner_id=target_user::text or owner=target_user) and owner_id is not null and owner is not null and owner_id<>owner::text) then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_storage_review_required','message','Attachment ownership is inconsistent. A storage review is needed before deletion.'));
  end if;
  -- Multipart uploads and bucket ownership need the appropriate Storage API;
  -- never delete provider metadata directly or leave these objects orphaned.
  for fk in select c.relname as table_name,a.attname as column_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
    where n.nspname='storage' and c.relkind in ('r','p') and c.relname<>'objects'
      and a.attname in ('owner','owner_id') and not a.attisdropped loop
    execute format('select exists(select 1 from storage.%I where %I::text=$1::text)',fk.table_name,fk.column_name) into has_rows using target_user;
    if has_rows then blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_storage_review_required','message','A bucket or unfinished upload needs a storage review before deletion.')); exit; end if;
  end loop;
  -- Some old data tables have owner columns without foreign keys. They require
  -- the same reviewed scope; their absence from pg_constraint is not proof that
  -- an account has no personal records there.
  for fk in select c.relname as table_name,a.attname as column_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relkind in ('r','p') and not a.attisdropped
      and a.attname in ('user_id','owner_user_id','seller_user_id','subject_user_id','target_user_id','sender_user_id','recipient_user_id','reporter_user_id') and a.atttypid='uuid'::regtype loop
    if exists(select 1 from code3_private.account_deletion_scope() s where s.table_name=fk.table_name and s.owner_column=fk.column_name)
      or (fk.table_name='workspaces' and fk.column_name='owner_user_id')
      or (fk.table_name='seller_reviews' and fk.column_name='seller_user_id')
      or (fk.table_name='role_audit_log' and fk.column_name='target_user_id') then continue; end if;
    if fk.table_name='inventory_items' and fk.column_name='owner_user_id' then
      execute 'select exists(select 1 from public.inventory_items where owner_user_id=$1 and user_id is distinct from $1)' into has_rows using target_user;
    else execute format('select exists(select 1 from public.%I where %I=$1)',fk.table_name,fk.column_name) into has_rows using target_user; end if;
    if has_rows then blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_data_review_required','message','Some account records need a privacy review before deletion can finish.')); exit; end if;
  end loop;
  -- Fail closed on new/unknown account relations instead of leaving user data or
  -- triggering an unexpected cascading deletion. Auth's own tables are managed
  -- by the Auth admin API; the reviewed private sync/session tables are below.
  for fk in select n.nspname as schema_name,c.relname as table_name,a.attname as column_name,a.attnotnull
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
    where k.contype='f' and k.confrelid='auth.users'::regclass and n.nspname not in ('auth','storage')
      and not (n.nspname='code3_private' and c.relname in ('account_sessions','account_confirmations','account_security_audit'))
      and not (n.nspname='code3_sync_private' and c.relname in ('workspaces','workspace_revisions')) loop
    known := fk.schema_name='public' and (
      exists(select 1 from code3_private.account_deletion_scope() s where s.table_name=fk.table_name and s.owner_column=fk.column_name)
      or (fk.table_name='workspaces' and fk.column_name='owner_user_id')
      or (fk.table_name='seller_reviews' and fk.column_name='seller_user_id')
      or (fk.table_name='role_audit_log' and fk.column_name in ('target_user_id','changed_by'))
      or (fk.table_name='beta_admin_notes' and fk.column_name='created_by')
      or (not fk.attnotnull and fk.column_name in ('created_by','reviewed_by','archived_by','verified_by','invited_by','claimed_by','beta_access_approved_by','admin_user_id','owner_user_id')));
    if not known then
      execute format('select exists(select 1 from %I.%I where %I=$1)',fk.schema_name,fk.table_name,fk.column_name) into has_rows using target_user;
      if has_rows then blockers := blockers || jsonb_build_array(jsonb_build_object('code','account_data_review_required','message','Some account records need a privacy review before deletion can finish.')); exit; end if;
    end if;
  end loop;
  return jsonb_build_object('state',case when exists(select 1 from code3_private.account_deletions where user_id=target_user) then 'pending' else 'ready' end,'blockers',blockers);
end $$;

create function code3_private.account_deletion_files(target_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name) order by o.bucket_id,o.name),'[]'::jsonb)
 from storage.objects o where o.bucket_id in ('receipts','receipt-images','product-submissions','feedback-screenshots') and (
   o.owner_id=target_user::text or o.owner=target_user or (o.owner_id is null and o.owner is null and (
     o.name like 'users/'||target_user::text||'/%' or exists(select 1 from public.workspaces w where w.owner_user_id=target_user and o.name like 'workspaces/'||w.id::text||'/%'))))
$$;

create function public.code3_account_deletion_status(target_user uuid)
returns jsonb language sql security invoker set search_path='' as $$ select code3_private.account_deletion_status(target_user) $$;
create function code3_private.begin_account_deletion(target_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare status jsonb; files jsonb; token uuid := gen_random_uuid(); current_job code3_private.account_deletions;
begin
  perform code3_private.require_deletion_service();
  perform pg_advisory_xact_lock(hashtextextended('code3-account-delete:'||target_user::text,0));
  perform 1 from auth.users where id=target_user for update;
  status := code3_private.account_deletion_status(target_user);
  if jsonb_array_length(status->'blockers')>0 then raise exception 'Resolve account deletion blockers first.'; end if;
  files := code3_private.account_deletion_files(target_user);
  if jsonb_array_length(files)>10000 then raise exception 'Attachment deletion limit requires review.'; end if;
  select * into current_job from code3_private.account_deletions where user_id=target_user for update;
  if found and current_job.lease_until>clock_timestamp() then return jsonb_build_object('busy',true); end if;
  insert into code3_private.account_deletions(user_id,lease,lease_until) values(target_user,token,clock_timestamp()+interval '5 minutes')
    on conflict(user_id) do update set lease=excluded.lease,lease_until=excluded.lease_until;
  return jsonb_build_object('lease',token,'files',files);
end $$;
create function public.code3_begin_account_deletion(target_user uuid)
returns jsonb language sql security invoker set search_path='' as $$ select code3_private.begin_account_deletion(target_user) $$;

create function code3_private.finish_account_data_deletion(target_user uuid,lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope record; relation regclass; fk record; actor_email text; child record;
begin
  perform code3_private.require_deletion_service();
  perform 1 from code3_private.account_deletions where user_id=target_user and lease=lease_token and lease_until>clock_timestamp() for update;
  if not found then raise exception 'Current deletion lease required.'; end if;
  if jsonb_array_length(code3_private.account_deletion_files(target_user))>0 then raise exception 'Remove account files through Storage API first.'; end if;
  if jsonb_array_length(code3_private.account_deletion_status(target_user)->'blockers')>0 then raise exception 'New deletion blocker found.'; end if;
  select email into actor_email from auth.users where id=target_user;
  perform set_config('code3.account_deletion_cleanup',target_user::text,true);
  -- Remove children with parent ownership even where historic FKs lacked CASCADE.
  for child in select * from (values ('receipt_line_items','receipt_records','receipt_id'),('deal_finder_items','deal_finder_sessions','session_id'),('kid_community_project_items','kid_community_projects','project_id')) c(child_table,parent_table,parent_column) loop
    if to_regclass('public.'||child.child_table) is not null and to_regclass('public.'||child.parent_table) is not null then
      execute format('delete from public.%I c using public.%I p where p.id=c.%I and p.user_id=$1',child.child_table,child.parent_table,child.parent_column) using target_user;
    end if;
  end loop;
  -- Membership and legacy privacy requests can be keyed by a verified email.
  for scope in select * from (values ('workspace_invites','email',null),('workspace_memberships','email','user_id'),('beta_invites','recipient_email','claimed_by'),('beta_invites','claimed_email','claimed_by'),('data_requests','email','user_id'),('admin_user_notes','subject_email','subject_user_id'),('sponsor_interest','email',null)) s(table_name,email_column,owner_column) loop
    relation := to_regclass('public.'||scope.table_name);
    if relation is not null and exists(select 1 from pg_attribute where attrelid=relation and attname=scope.email_column and not attisdropped) then
      if scope.owner_column is null then
        execute format('delete from public.%I where lower(%I)=lower($1)',scope.table_name,scope.email_column) using actor_email;
      else
        execute format('delete from public.%I where lower(%I)=lower($1) and (%I is null or %I=$2)',scope.table_name,scope.email_column,scope.owner_column,scope.owner_column) using actor_email,target_user;
      end if;
    end if;
  end loop;
  -- A guest may submit feedback before creating the verified account. Keep a
  -- different signed-in author's feedback even if its freeform email matches.
  if to_regclass('public.beta_feedback') is not null then
    execute 'delete from public.beta_feedback where lower(guest_email)=lower($1) and (user_id is null or user_id=$2)' using actor_email,target_user;
  end if;
  for scope in select * from code3_private.account_deletion_scope() loop
    relation := to_regclass(format('public.%I',scope.table_name));
    if relation is not null and exists(select 1 from pg_attribute where attrelid=relation and attname=scope.owner_column and not attisdropped) then
      if exists(select 1 from pg_attribute where attrelid=relation and attname='id' and not attisdropped) then
        if to_regclass('public.admin_review_log') is not null and scope.table_name in ('user_suggestions','store_suggestions','catalog_suggestions','sku_suggestions','retailer_product_suggestions','scout_report_reviews','store_intelligence_suggestions') then
          execute format('delete from public.admin_review_log l using public.%I t where t.%I=$1 and l.suggestion_table=$2 and l.suggestion_id=t.id',scope.table_name,scope.owner_column) using target_user,scope.table_name;
        end if;
        if to_regclass('public.audit_logs') is not null then
          execute format('delete from public.audit_logs l using public.%I t where t.%I=$1 and l.entity_type=$2 and l.entity_id=t.id',scope.table_name,scope.owner_column) using target_user,scope.table_name;
        end if;
      end if;
      execute format('delete from public.%I where %I=$1',scope.table_name,scope.owner_column) using target_user;
    end if;
  end loop;
  delete from code3_sync_private.workspace_revisions where owner_id=target_user;
  delete from code3_sync_private.workspaces where owner_id=target_user;
  for scope in select unnest(array['code3_audit_events','code3_record_links','code3_records']) as table_name loop
    if to_regclass(format('public.%I',scope.table_name)) is not null then
      execute format('delete from public.%I where owner_subject=$1',scope.table_name) using 'supabase:'||target_user::text;
    end if;
  end loop;
  -- Known administrative actor fields can outlive the actor. Nullable references
  -- are detached; administrative notes/audit rows with mandatory actors removed.
  if to_regclass('public.beta_admin_notes') is not null then delete from public.beta_admin_notes where created_by=target_user; end if;
  if to_regclass('public.role_audit_log') is not null then delete from public.role_audit_log where changed_by=target_user or target_user_id=target_user; end if;
  for fk in select n.nspname as schema_name,c.relname as table_name,a.attname as column_name
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
    where k.contype='f' and k.confrelid='auth.users'::regclass and n.nspname='public' and not a.attnotnull
      and a.attname in ('created_by','reviewed_by','archived_by','verified_by','invited_by','claimed_by','beta_access_approved_by','admin_user_id','owner_user_id') loop
    execute format('update %I.%I set %I=null where %I=$1',fk.schema_name,fk.table_name,fk.column_name,fk.column_name) using target_user;
  end loop;
  delete from public.workspaces where owner_user_id=target_user;
  update code3_private.account_deletions set records_removed=true where user_id=target_user and lease=lease_token;
  return jsonb_build_object('readyForAuthDeletion',true);
end $$;
create function public.code3_finish_account_data_deletion(target_user uuid,lease_token uuid)
returns jsonb language sql security invoker set search_path='' as $$ select code3_private.finish_account_data_deletion(target_user,lease_token) $$;
create function code3_private.release_account_deletion(target_user uuid,lease_token uuid,completed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform code3_private.require_deletion_service();
  if completed then
    if exists(select 1 from auth.users where id=target_user) then raise exception 'Auth account still exists.'; end if;
    delete from code3_private.account_deletions where user_id=target_user and lease=lease_token;
  else update code3_private.account_deletions set lease_until=clock_timestamp() where user_id=target_user and lease=lease_token; end if;
  return true;
end $$;
create function public.code3_release_account_deletion(target_user uuid,lease_token uuid)
returns boolean language sql security invoker set search_path='' as $$ select code3_private.release_account_deletion(target_user,lease_token,false) $$;
create function public.code3_complete_account_deletion(target_user uuid,lease_token uuid)
returns boolean language sql security invoker set search_path='' as $$ select code3_private.release_account_deletion(target_user,lease_token,true) $$;

-- Existing RPCs, table policies and storage policies all use this central
-- session check. A deletion request disables writes before external file removal.
create or replace function code3_private.current_session_id()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid(); sid uuid;
begin
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or coalesce(to_timestamp((auth.jwt()->>'exp')::double precision),'-infinity'::timestamptz)<=now()
    or exists(select 1 from code3_private.account_deletions where user_id=actor) then return null; end if;
  begin sid := (auth.jwt()->>'session_id')::uuid; exception when invalid_text_representation then return null; end;
  if sid is null or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=sid and s.user_id=actor and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now()))
    or exists(select 1 from code3_private.account_sessions s where s.user_id=actor and s.provider_session_id=sid and s.revoked_at is not null) then return null; end if;
  return sid;
end $$;

-- Definer RPCs bypass RLS. Keep the deletion freeze at the table boundary too,
-- including server-side canonical writes already in flight when deletion starts.
create function code3_private.guard_account_deletion_writes()
returns trigger language plpgsql security definer set search_path='' as $$
declare body jsonb := to_jsonb(new); candidate text; pending_user uuid; workspace_owner uuid;
begin
  if exists(select 1 from code3_private.account_deletions where user_id=auth.uid()) then raise exception 'Account deletion is pending.' using errcode='42501'; end if;
  for candidate in select body->>key from unnest(array['user_id','owner_user_id','seller_user_id','subject_user_id','target_user_id','sender_user_id','recipient_user_id','reporter_user_id','claimed_by']) key where body ? key
    union all select substring(body->>'owner_subject' from 10) where body->>'owner_subject' like 'supabase:%'
    union all select body->>'id' where tg_table_name='profiles' loop
    if candidate is null then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended('code3-account-delete:'||candidate,0));
    select user_id into pending_user from code3_private.account_deletions where user_id::text=candidate;
    if pending_user is not null and not (coalesce(auth.jwt()->>'role','')='service_role' and coalesce(current_setting('code3.account_deletion_cleanup',true),'')=pending_user::text) then
      raise exception 'Account deletion is pending.' using errcode='42501';
    end if;
  end loop;
  if body->>'workspace_id' is not null then
    select w.owner_user_id into workspace_owner from public.workspaces w join code3_private.account_deletions d on d.user_id=w.owner_user_id where w.id::text=body->>'workspace_id';
    if workspace_owner is not null and not (coalesce(auth.jwt()->>'role','')='service_role' and coalesce(current_setting('code3.account_deletion_cleanup',true),'')=workspace_owner::text) then
      raise exception 'Workspace owner deletion is pending.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function code3_private.guard_account_deletion_writes() from public,anon,authenticated;

-- The earlier session migration covered private workspaces but some historic
-- community/suggestion tables used only auth.uid(). Cover every reviewed owner
-- table here, so a still-unexpired JWT cannot repopulate rows during deletion.
do $$ declare target_table text; begin
  for target_table in select distinct table_name from code3_private.account_deletion_scope() loop
    if to_regclass(format('public.%I',target_table)) is not null then
      execute format('alter table public.%I enable row level security',target_table);
      execute format('create policy code3_deletion_current_session on public.%I as restrictive for all to authenticated using ((select public.code3_current_session_valid())) with check ((select public.code3_current_session_valid()))',target_table);
      execute format('create trigger code3_deletion_write_guard before insert or update on public.%I for each row execute function code3_private.guard_account_deletion_writes()',target_table);
    end if;
  end loop;
  foreach target_table in array array['workspaces','workspace_invites','code3_records','code3_record_links','code3_file_assets','receipt_line_items','deal_finder_items','kid_community_project_items'] loop
    if to_regclass(format('public.%I',target_table)) is not null then
      execute format('create trigger code3_deletion_write_guard before insert or update on public.%I for each row execute function code3_private.guard_account_deletion_writes()',target_table);
    end if;
  end loop;
end $$;

revoke all on function code3_private.require_deletion_service(),code3_private.account_deletion_scope(),code3_private.account_deletion_status(uuid),code3_private.account_deletion_files(uuid),code3_private.begin_account_deletion(uuid),code3_private.finish_account_data_deletion(uuid,uuid),code3_private.release_account_deletion(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.code3_account_deletion_status(uuid),public.code3_begin_account_deletion(uuid),public.code3_finish_account_data_deletion(uuid,uuid),public.code3_release_account_deletion(uuid,uuid),public.code3_complete_account_deletion(uuid,uuid) from public,anon,authenticated;
grant usage on schema code3_private to service_role;
grant execute on function code3_private.require_deletion_service(),code3_private.account_deletion_status(uuid),code3_private.begin_account_deletion(uuid),code3_private.finish_account_data_deletion(uuid,uuid),code3_private.release_account_deletion(uuid,uuid,boolean) to service_role;
grant execute on function public.code3_account_deletion_status(uuid),public.code3_begin_account_deletion(uuid),public.code3_finish_account_data_deletion(uuid,uuid),public.code3_release_account_deletion(uuid,uuid),public.code3_complete_account_deletion(uuid,uuid) to service_role;
commit;
