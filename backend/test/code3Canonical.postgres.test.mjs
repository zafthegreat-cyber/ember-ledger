import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import pg from "pg";

// Opt-in only: never fall back to DATABASE_URL or the application's connection pool.
// Run against a newly created, explicitly marked code3_test_* database. Rows are
// intentionally retained; a later run must use another fresh disposable database.
const MARKER = "Code3 disposable canonical test database";
const TABLES = ["code3_records", "code3_record_links", "code3_file_assets", "code3_audit_events"];
const migration = readFileSync(new URL("../../supabase/migrations/20260820120000_code3_canonical_owner_records.sql", import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const { PostgresCanonicalRepository } = require("../dist/code3/postgresRepository.js");
const { CanonicalService } = require("../dist/code3/service.js");
const { CanonicalNotFoundError, CanonicalVersionConflictError } = require("../dist/code3/repository.js");
const { exportCanonicalOwnerRecords } = require("../dist/code3/serverExport.js");
const { CANONICAL_DOMAINS, ownerContextFromPrincipal } = require("../dist/code3/types.js");

function disposableDatabase(raw) {
  if (!raw) throw new Error("CODE3_TEST_DATABASE_URL must explicitly select a fresh disposable database.");
  let url;
  try { url = new URL(raw); } catch { throw new Error("CODE3_TEST_DATABASE_URL is not a valid PostgreSQL URL."); }
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol), "Only PostgreSQL test URLs are accepted.");
  assert.ok(["127.0.0.1", "[::1]"].includes(url.hostname), "The disposable database must use a literal loopback address.");
  assert.ok(url.port && url.username, "The test database must have an explicit port and username.");
  assert.equal(url.search, "", "Connection query overrides are forbidden in the disposable test URL.");
  assert.equal(url.hash, "", "Fragments are forbidden in the disposable test URL.");
  assert.match(url.pathname, /^\/code3_test_[a-z0-9_]+$/, "The database name must begin with code3_test_.");
  return { connectionString: url.href, database: url.pathname.slice(1) };
}

async function assertFreshMarkedDatabase(pool, database) {
  const { rows: [identity] } = await pool.query("select current_database() as name, host(inet_server_addr()) as host, shobj_description(oid, 'pg_database') as marker from pg_database where datname = current_database()");
  assert.equal(identity.name, database, "The connected database must match the explicit test URL.");
  assert.ok(["127.0.0.1", "::1"].includes(identity.host), "The connected database server must be loopback.");
  assert.equal(identity.marker, MARKER, "Refusing an unmarked database; no bootstrap or migration has run.");
  for (const table of TABLES) {
    const { rows: [result] } = await pool.query("select to_regclass($1)::text as relation", [`public.${table}`]);
    assert.equal(result.relation, null, `Refusing existing canonical table ${table}, including any existing rows.`);
  }
  const { rows: [auth] } = await pool.query("select to_regprocedure('auth.uid()')::text as existing");
  assert.equal(auth.existing, null, "Refusing to replace an existing auth.uid() implementation.");
  const { rows: roles } = await pool.query("select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('anon', 'authenticated')");
  assert.ok(roles.every((role) => !role.rolsuper && !role.rolbypassrls), "Existing browser roles must not bypass RLS.");
}

async function bootstrap(pool) {
  // The migration's idempotent DROP POLICY/TRIGGER statements are executed
  // unchanged. No table/database deletion or truncation is permitted.
  assert.doesNotMatch(migration, /\b(?:drop\s+(?:table|database)|truncate)\b/i);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin nosuperuser nobypassrls; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin nosuperuser nobypassrls; end if;
      end $$;
      create schema if not exists auth;
      create function auth.uid() returns uuid language sql stable security invoker set search_path = '' as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    await client.query(migration);
    await client.query(migration); // Actual migration idempotency, before any records exist.
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const owner = (subject) => ownerContextFromPrincipal(Object.freeze({ provider: "supabase", subject, issuedAt: 1, expiresAt: 9999999999 }));
const ownerA = owner("10000000-0000-4000-8000-000000000001");
const ownerB = owner("10000000-0000-4000-8000-000000000002");
const canonicalJson = (value) => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonicalJson).join(",")}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;

async function browserPrivileges(pool) {
  const { rows } = await pool.query(`
    select role_name, table_name,
      has_table_privilege(role_name, 'public.' || table_name, 'SELECT') as can_select,
      has_table_privilege(role_name, 'public.' || table_name, 'INSERT') as can_insert,
      has_table_privilege(role_name, 'public.' || table_name, 'UPDATE') as can_update,
      has_table_privilege(role_name, 'public.' || table_name, 'DELETE') as can_delete
    from unnest($1::text[]) role_name cross join unnest($2::text[]) table_name
  `, [["anon", "authenticated"], TABLES]);
  assert.equal(rows.length, 8);
  assert.ok(rows.every((row) => !row.can_select && !row.can_insert && !row.can_update && !row.can_delete), "Browser roles must have no direct canonical table privileges.");
}

test("PostgreSQL integration refuses unsafe connection targets before connecting", () => {
  for (const target of [undefined, "not-a-url", "https://127.0.0.1:55439/code3_test_example", "postgres://test@remote.example:55439/code3_test_example", "postgres://test@127.0.0.1:55439/owner_data", "postgres://test@127.0.0.1:55439/code3_test_example?host=remote.example", "postgres://test@127.0.0.1/code3_test_example"]) {
    assert.throws(() => disposableDatabase(target));
  }
});

test("canonical PostgreSQL contract on a fresh marked disposable database", async (t) => {
  const config = disposableDatabase(process.env.CODE3_TEST_DATABASE_URL);
  const options = { connectionString: config.connectionString, connectionTimeoutMillis: 3000, max: 4, application_name: "code3-canonical-disposable-test" };
  const pool = new pg.Pool(options);
  const secondPool = new pg.Pool(options);
  const repository = new PostgresCanonicalRepository(pool);
  const service = new CanonicalService(repository);
  const secondRepository = new PostgresCanonicalRepository(secondPool);
  const secondService = new CanonicalService(secondRepository);
  try {
    await assertFreshMarkedDatabase(pool, config.database);
    await bootstrap(pool);
    t.diagnostic(`Executed exact canonical migration twice; SHA-256 ${createHash("sha256").update(migration).digest("hex")}. Synthetic auth.uid() shim does not verify real Supabase JWTs.`);

    await t.test("create/read/update/stale version/archive remain owner scoped", async () => {
      const created = await service.create(ownerA, "DEAL", { id: id(1), amountMinor: 1234, currency: "USD", quantity: 1, metadata: { title: "Synthetic deal" } });
      assert.equal(created.recordVersion, 1);
      assert.equal(created.amountMinor, 1234);
      assert.equal(created.currency, "USD");
      assert.equal((await service.getById(ownerA, "DEAL", id(1))).metadata.title, "Synthetic deal");
      assert.equal(await repository.getById(ownerB, "DEAL", id(1)), null);
      await assert.rejects(() => service.getById(ownerB, "DEAL", id(1)), CanonicalNotFoundError);
      await assert.rejects(() => service.update(ownerB, "DEAL", id(1), { expectedVersion: 1, notes: "forbidden" }), CanonicalNotFoundError);
      await service.create(ownerB, "DEAL", { id: id(1), metadata: { title: "Other synthetic owner" } });
      const updated = await service.update(ownerA, "DEAL", id(1), { expectedVersion: 1, notes: "reviewed" });
      assert.equal(updated.recordVersion, 2);
      await assert.rejects(() => service.update(ownerA, "DEAL", id(1), { expectedVersion: 1, notes: "stale" }), (error) => error instanceof CanonicalVersionConflictError && error.conflict.currentVersion === 2);
      assert.equal((await service.getById(ownerA, "DEAL", id(1))).notes, "reviewed");
      await assert.rejects(() => service.archive(ownerA, "DEAL", id(1), { expectedVersion: 1 }), CanonicalVersionConflictError);
      const archived = await service.archive(ownerA, "DEAL", id(1), { expectedVersion: 2 });
      assert.equal(archived.recordVersion, 3);
      assert.equal(archived.status, "ARCHIVED");
      assert.ok(archived.archivedAt);
      assert.equal((await service.list(ownerA, "DEAL", {})).records.length, 0);
      assert.equal((await service.list(ownerA, "DEAL", { includeArchived: "true" })).records.length, 1);
      await assert.rejects(() => service.update(ownerA, "DEAL", id(1), { expectedVersion: 3, notes: "restore bypass" }), (error) => error.issues?.some((issue) => issue.code === "archived_record_immutable"));
      assert.equal((await service.getById(ownerB, "DEAL", id(1))).recordVersion, 1);
    });

    await t.test("committed records persist across independent pools", async () => {
      await service.create(ownerA, "SEARCH_RULE", { id: id(10), metadata: { query: "synthetic persistent query" } });
      const persisted = await secondService.getById(ownerA, "SEARCH_RULE", id(10));
      assert.equal(persisted.metadata.query, "synthetic persistent query");
      await secondService.update(ownerA, "SEARCH_RULE", id(10), { expectedVersion: 1, notes: "second connection" });
      assert.equal((await service.getById(ownerA, "SEARCH_RULE", id(10))).recordVersion, 2);
    });

    await t.test("active external identities are unique per owner and reusable after archive", async () => {
      const external = { externalProvider: "synthetic-provider", externalId: "listing-1" };
      await service.create(ownerA, "DEAL", { id: id(20), ...external });
      await assert.rejects(() => service.create(ownerA, "DEAL", { id: id(21), ...external }), (error) => error.duplicateType === "EXTERNAL_IDENTITY");
      assert.equal(await repository.getById(ownerA, "DEAL", id(21)), null);
      await service.create(ownerB, "DEAL", { id: id(22), ...external });
      await service.archive(ownerA, "DEAL", id(20), { expectedVersion: 1 });
      await service.create(ownerA, "DEAL", { id: id(23), ...external });
      assert.equal((await repository.findByExternalIdentity(ownerA, "DEAL", external.externalProvider, external.externalId)).id, id(23));
    });

    await t.test("real composite foreign keys roll back failed record and relationship writes", async () => {
      await service.create(ownerA, "PURCHASE", { id: id(30) });
      await service.create(ownerB, "PURCHASE", { id: id(31) });
      const lot = await service.create(ownerA, "PURCHASE_LOT", { id: id(32), relations: { purchaseId: id(30) } });
      await assert.rejects(() => service.create(ownerA, "PURCHASE_LOT", { id: id(33), relations: { purchaseId: id(31) } }), (error) => error.issues?.some((issue) => issue.code === "invalid_foreign_reference"));
      // Deliberately bypass service validation to exercise the database FK/transaction boundary.
      await assert.rejects(() => repository.create(ownerA, "PURCHASE_LOT", { id: id(34), status: "UNPROCESSED", relations: { purchaseId: id(31) } }), (error) => error.code === "23503");
      assert.equal(await repository.getById(ownerA, "PURCHASE_LOT", id(34)), null);
      await assert.rejects(() => repository.update(ownerA, "PURCHASE_LOT", id(32), { expectedVersion: 1, notes: "must roll back", relations: { purchaseId: id(31) } }), (error) => error.code === "23503");
      assert.deepEqual(await service.getById(ownerA, "PURCHASE_LOT", id(32)), lot, "Rollback must retain the original record version, notes and valid link.");
    });

    await t.test("file metadata persists atomically and duplicate paths roll back the envelope", async () => {
      await service.create(ownerA, "DEAL", { id: id(40) });
      const metadata = { storageProvider: "supabase-storage", storagePath: "synthetic/receipt.jpg", mimeType: "image/jpeg", size: 2048, sha256: "a".repeat(64), relatedRecordType: "DEAL", relatedRecordId: id(40), originalName: "receipt.jpg" };
      const asset = await service.create(ownerA, "FILE_ASSET", { id: id(41), fileAsset: metadata });
      assert.deepEqual(asset.fileAsset, metadata);
      assert.deepEqual((await secondService.getById(ownerA, "FILE_ASSET", id(41))).fileAsset, metadata);
      await assert.rejects(() => service.create(ownerA, "FILE_ASSET", { id: id(42), fileAsset: metadata }), (error) => error.duplicateType === "FILE_STORAGE_PATH");
      assert.equal(await repository.getById(ownerA, "FILE_ASSET", id(42)), null);
      const updated = await service.update(ownerA, "FILE_ASSET", id(41), { expectedVersion: 1, fileAsset: { ...metadata, originalName: "reviewed.jpg" } });
      assert.equal(updated.recordVersion, 2);
      assert.equal(updated.fileAsset.originalName, "reviewed.jpg");
      assert.equal(await repository.getById(ownerB, "FILE_ASSET", id(41)), null);
    });

    await t.test("server export retains one real snapshot during a concurrent commit", async () => {
      await service.create(ownerA, "SEARCH_RULE", { id: id(50), notes: "snapshot before commit" });
      let concurrentCommit = false;
      const interleaved = {
        withConsistentRead: (operation) => repository.withConsistentRead((snapshot) => operation({
          list: async (...args) => {
            const page = await snapshot.list(...args);
            if (!concurrentCommit) {
              concurrentCommit = true;
              await secondService.update(ownerA, "SEARCH_RULE", id(50), { expectedVersion: 1, notes: "committed during export" });
            }
            return page;
          },
        })),
      };
      const exported = await exportCanonicalOwnerRecords(interleaved, ownerA);
      assert.equal(concurrentCommit, true);
      assert.equal(exported.coverageStatus, "COMPLETE");
      assert.deepEqual(Object.keys(exported.domains).sort(), [...CANONICAL_DOMAINS].sort());
      assert.equal(exported.domains.SEARCH_RULE.find((record) => record.id === id(50)).notes, "snapshot before commit");
      assert.equal((await service.getById(ownerA, "SEARCH_RULE", id(50))).notes, "committed during export");
      assert.equal(exported.sourceHash, createHash("sha256").update(canonicalJson(exported.domains)).digest("hex"));
      assert.ok(Object.values(exported.domains).flat().every((record) => !Object.hasOwn(record, "ownerSubject")));
      assert.equal(exported.domains.DEAL.some((record) => record.id === id(22)), false, "Export must not include another owner's records.");
      await assert.rejects(() => repository.withConsistentRead((snapshot) => snapshot.archive(ownerA, "SEARCH_RULE", id(50), 2)), (error) => error.code === "25006", "The snapshot transaction must be read-only.");
    });

    await t.test("browser privileges are revoked and temporary grants retain RLS isolation", async () => {
      await browserPrivileges(pool);
      const { rows: flags } = await pool.query("select relname, relrowsecurity from pg_class where oid = any($1::regclass[])", [TABLES.map((table) => `public.${table}`)]);
      assert.equal(flags.length, 4);
      assert.ok(flags.every((row) => row.relrowsecurity));
      const client = await pool.connect();
      async function denied(sql, values, code) {
        await client.query("savepoint denied_write");
        await assert.rejects(() => client.query(sql, values), (error) => error.code === code);
        await client.query("rollback to savepoint denied_write");
        await client.query("release savepoint denied_write");
      }
      try {
        await client.query("begin");
        await client.query(`grant usage on schema public to anon, authenticated; grant select, insert, update on ${TABLES.map((table) => `public.${table}`).join(", ")} to authenticated; grant select on ${TABLES.map((table) => `public.${table}`).join(", ")} to anon`);
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerA.principal.subject]);
        await client.query("set local role authenticated");
        const { rows: visible } = await client.query("select owner_subject from public.code3_records");
        assert.ok(visible.length > 0 && visible.every((row) => row.owner_subject === ownerA.ownerSubject));
        for (const table of ["code3_record_links", "code3_file_assets"]) {
          const { rows } = await client.query(`select owner_subject from public.${table}`);
          assert.ok(rows.length > 0 && rows.every((row) => row.owner_subject === ownerA.ownerSubject));
        }
        assert.equal((await client.query("update public.code3_records set notes = 'forbidden' where owner_subject = $1 and id = $2", [ownerB.ownerSubject, id(1)])).rowCount, 0);
        await denied("insert into public.code3_records (id, owner_subject, record_type, status) values ($1, $2, 'DEAL', 'NEW')", [id(60), ownerB.ownerSubject], "42501");
        await denied("update public.code3_records set owner_subject = $1 where owner_subject = $2 and id = $3", [ownerB.ownerSubject, ownerA.ownerSubject, id(40)], "P0001");
        await client.query("reset role");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerB.principal.subject]);
        await client.query("set local role authenticated");
        const { rows: otherVisible } = await client.query("select owner_subject from public.code3_records");
        assert.ok(otherVisible.length > 0 && otherVisible.every((row) => row.owner_subject === ownerB.ownerSubject));
        await client.query("reset role");
        await client.query("set local role anon");
        assert.equal((await client.query("select id from public.code3_records")).rowCount, 0, "Anonymous role has no matching RLS policy even with a temporary SELECT grant.");
      } finally {
        await client.query("rollback");
        client.release();
      }
      await browserPrivileges(pool);
      assert.equal((await service.getById(ownerB, "DEAL", id(1))).notes, null);
      assert.equal(await repository.getById(ownerB, "DEAL", id(60)), null);
    });

    const { rows: [summary] } = await secondPool.query("select count(*)::int as records, count(distinct owner_subject)::int as owners from public.code3_records");
    t.diagnostic(`Retained ${summary.records} synthetic records for ${summary.owners} owners in the disposable database. No deployed schema, real auth session, file bytes, or app cutover was tested.`);
  } finally {
    await Promise.all([pool.end(), secondPool.end()]);
  }
});
