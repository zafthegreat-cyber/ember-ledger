import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRIVACY_PROJECT_REF = "gxsfququorfczvhrkudl";
const quote = value => `"${value.replaceAll('"', '""')}"`;
const literal = value => `'${value.replaceAll("'", "''")}'`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts/qa/privacy-beta-20261024");

export function deletionScopeFromMigration(sql) {
  const source = /create function code3_private\.account_deletion_scope\(\)[\s\S]*?\$\$\s*values([\s\S]*?)\$\$;/.exec(sql)?.[1];
  assert.ok(source, "The reviewed deletion scope could not be found");
  const scope = [...source.matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)].map(([, table, column]) => [table, column]);
  assert.ok(scope.length >= 40);
  assert.ok(!scope.some(([table]) => ["product_catalog", "market_prices", "catalog_items"].includes(table)), "Shared catalogs and prices must remain outside account deletion scope");
  return scope;
}

export function schemaPreflightSql(scope) {
  return `-- READ ONLY: schema and permission metadata, never account rows or keys.
with scope(table_name,owner_column) as (values ${scope.map(([table, column]) => `(${literal(table)},${literal(column)})`).join(",")}),
owner_columns as (
 select n.nspname as schema_name,c.relname as table_name,a.attname as column_name,a.attnotnull as not_null
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
 where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
 and a.atttypid='uuid'::regtype and a.attname in ('user_id','owner_user_id','seller_user_id','subject_user_id','target_user_id','sender_user_id','recipient_user_id','reporter_user_id')
), account_relations as (
 select n.nspname as schema_name,c.relname as table_name,a.attname as column_name,a.attnotnull as not_null,k.confdeltype as delete_action,
 (n.nspname='public' and (
 exists(select 1 from scope s where s.table_name=c.relname and s.owner_column=a.attname)
 or (c.relname='workspaces' and a.attname='owner_user_id')
 or (c.relname='seller_reviews' and a.attname='seller_user_id')
 or (c.relname='role_audit_log' and a.attname in ('target_user_id','changed_by'))
 or (c.relname='beta_admin_notes' and a.attname='created_by')
 or (not a.attnotnull and a.attname in ('created_by','reviewed_by','archived_by','verified_by','invited_by','claimed_by','beta_access_approved_by','admin_user_id','owner_user_id'))
 )) as reviewed_by_deletion_migration
 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
 where k.contype='f' and k.confrelid='auth.users'::regclass and n.nspname not in ('auth','storage')
 and not(n.nspname='code3_private' and c.relname in ('account_sessions','account_confirmations','account_security_audit'))
 and not(n.nspname='code3_sync_private' and c.relname in ('workspaces','workspace_revisions'))
)
select jsonb_build_object(
 'projectRef',${literal(PRIVACY_PROJECT_REF)},'capturedAt',now(),
 'migrations',(select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations),
 'deletionTablePresent',to_regclass('code3_private.account_deletions') is not null,
 'requiredRelations',(select jsonb_agg(jsonb_build_object('name',name,'exists',to_regclass(name) is not null)) from unnest(array['public.profiles','public.workspaces','public.workspace_members','public.workspace_memberships','public.workspace_invites','code3_private.account_sessions','code3_sync_private.workspaces','code3_sync_private.workspace_revisions','auth.users','auth.sessions','storage.objects','storage.buckets']) name),
 'sessionDependencies',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definer',p.prosecdef,'definitionMd5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='code3_private' and p.proname='current_session_id') or (n.nspname='public' and p.proname='code3_current_session_valid')),
 'deletionFunctions',(select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.proname),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','code3_private') and p.proname in ('code3_account_deletion_status','code3_begin_account_deletion','code3_finish_account_data_deletion','code3_release_account_deletion','code3_complete_account_deletion','require_deletion_service','account_deletion_scope','account_deletion_status','account_deletion_files','begin_account_deletion','finish_account_data_deletion','release_account_deletion','guard_account_deletion_writes')),
 'scopeColumns',(select jsonb_agg(jsonb_build_object('table',s.table_name,'ownerColumn',s.owner_column,'tableExists',c.oid is not null,'columnExists',a.attname is not null,'ownerType',format_type(a.atttypid,a.atttypmod),'rls',c.relrowsecurity) order by s.table_name,s.owner_column) from scope s left join pg_namespace n on n.nspname='public' left join pg_class c on c.relnamespace=n.oid and c.relname=s.table_name and c.relkind in ('r','p') left join pg_attribute a on a.attrelid=c.oid and a.attname=s.owner_column and not a.attisdropped),
 'unknownOwnerColumns',(select coalesce(jsonb_agg(to_jsonb(o) order by o.table_name,o.column_name),'[]'::jsonb) from owner_columns o where not exists(select 1 from scope s where s.table_name=o.table_name and s.owner_column=o.column_name) and not(o.table_name='workspaces' and o.column_name='owner_user_id') and not(o.table_name='seller_reviews' and o.column_name='seller_user_id') and not(o.table_name='role_audit_log' and o.column_name='target_user_id')),
 'accountRelations',(select coalesce(jsonb_agg(to_jsonb(r) order by r.schema_name,r.table_name,r.column_name),'[]'::jsonb) from account_relations r),
 'nameCollisions',(select coalesce(jsonb_agg(jsonb_build_object('kind','policy','table',tablename,'name',policyname)),'[]'::jsonb) from pg_policies where policyname in ('code3_deletion_current_session','code3_private_attachment_anon_read','code3_private_attachment_authenticated_read')) || (select coalesce(jsonb_agg(jsonb_build_object('kind','trigger','table',c.relname,'name',t.tgname)),'[]'::jsonb) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='code3_deletion_write_guard'),
 'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public) order by id) from storage.buckets),
 'referenceColumns',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'column',a.attname) order by n.nspname,c.relname,a.attname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid where c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped and ((n.nspname='public' and (a.attname~*'(image|photo|logo|screenshot|attachment|proof|thumbnail|receipt.*url)' or a.atttypid in ('json'::regtype,'jsonb'::regtype) or (c.relname='store_reports' and a.attname='notes')) and a.atttypid in ('text'::regtype,'varchar'::regtype,'json'::regtype,'jsonb'::regtype)) or (n.nspname='code3_sync_private' and c.relname in ('workspaces','workspace_revisions') and a.attname='sources')))
) as privacy_preflight_metadata;
`;
}

export function receiptAggregateSql(metadata) {
  assert.equal(metadata?.projectRef, PRIVACY_PROJECT_REF, "Metadata belongs to a different project");
  assert.ok(Array.isArray(metadata.referenceColumns));
  const groups = new Map();
  for (const entry of metadata.referenceColumns) {
    assert.ok(["public", "code3_sync_private"].includes(entry.schema));
    assert.ok([entry.table, entry.column].every(value => typeof value === "string" && /^[a-z_][a-z0-9_]*$/.test(value)), "Unexpected SQL identifier");
    const key = `${entry.schema}.${entry.table}`;
    if (!groups.has(key)) groups.set(key, { ...entry, columns: [] });
    groups.get(key).columns.push(entry.column);
  }
  const pattern = `${PRIVACY_PROJECT_REF}\\.supabase\\.co/storage/v1/object/(public|sign|authenticated)/receipts/`;
  const references = [...groups].map(([name, group]) => `select ${literal(name)} as source,count(*) filter(where refs~*${literal(pattern)}) as rows_with_legacy_receipt_links from (select concat_ws(E'\\n',${group.columns.map(column => `${quote(column)}::text`).join(",")}) as refs from ${quote(group.schema)}.${quote(group.table)}) checked`).join("\nunion all\n");
  assert.ok(references, "No reviewed reference columns were supplied");
  return `-- READ ONLY: aggregate receipt ownership/link compatibility; no names, IDs, URLs or bytes returned.
with reference_counts as (${references})
select jsonb_build_object('projectRef',${literal(PRIVACY_PROJECT_REF)},'capturedAt',now(),
 'receiptOwnership',(select jsonb_build_object('objects',count(*),'ownerless',count(*) filter(where coalesce(owner_id,owner::text) is null),'inconsistentOwners',count(*) filter(where owner_id is not null and owner is not null and owner_id<>owner::text),'knownAuthOwner',count(*) filter(where exists(select 1 from auth.users u where u.id::text=coalesce(owner_id,owner::text)))) from storage.objects where bucket_id='receipts'),
 'receiptIdentityMetadataDigest',(select md5(coalesce(string_agg(md5(jsonb_build_array(id,bucket_id,name,owner_id,owner,metadata)::text),E'\\n' order by id),'')) from storage.objects where bucket_id='receipts'),
 'referenceRows',(select jsonb_agg(to_jsonb(r) order by source) from reference_counts r),
 'limitations','Counts cover standard same-project URL forms in metadata-selected image/photo/proof columns, public JSON columns, report notes and cloud snapshots. No URL intent, file contents, local-device-only references, unusual encodings or external-provider data is inferred.'
) as receipt_compatibility_aggregates;
`;
}

async function main(args) {
  assert.ok(args.length === 0 || args.length === 2 && args[0] === "--metadata", "Usage: node scripts/prepare-account-deletion-preflight.mjs [--metadata <redacted-metadata.json>]");
  const files = ["20261018172530_code3_account_deletion.sql", "20261018174916_code3_private_attachment_reads.sql"];
  const migrations = await Promise.all(files.map(async file => {
    const sql = await fs.readFile(path.join(root, "supabase/migrations", file), "utf8");
    return { file, sql, sha256: createHash("sha256").update(sql).digest("hex") };
  }));
  const scope = deletionScopeFromMigration(migrations[0].sql);
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "schema-preflight.sql"), schemaPreflightSql(scope));
  const manifest = { generatedAt: new Date().toISOString(), projectRef: PRIVACY_PROJECT_REF, generatorOnly: true,
    networkRequests: 0, productionWrites: 0, migrationChanges: 0,
    migrations: migrations.map(({ file, sha256 }) => ({ file, sha256 })), reviewedScopePairs: scope.length,
    nextAction: "Review/run the metadata SELECT only. No migration, flag, account deletion or bucket change is authorized by this script.",
  };
  if (args.length) {
    const metadata = JSON.parse(await fs.readFile(path.resolve(args[1]), "utf8"));
    await fs.writeFile(path.join(output, "receipt-reference-audit.sql"), receiptAggregateSql(metadata));
    manifest.referenceAuditGenerated = true;
    manifest.requiredRelationsPresent = metadata.requiredRelations.every(entry => entry.exists);
    manifest.deletionObjectCollisions = metadata.deletionFunctions.length + metadata.nameCollisions.length + Number(metadata.deletionTablePresent);
    manifest.unknownOwnerColumns = metadata.unknownOwnerColumns;
    manifest.unknownAuthRelations = metadata.accountRelations.filter(entry => !entry.reviewed_by_deletion_migration);
  }
  await fs.writeFile(path.join(output, "preflight-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Prepared read-only privacy preflight in ${path.relative(root, output)}; zero network requests or production writes.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
