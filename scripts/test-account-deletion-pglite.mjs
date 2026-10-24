import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

// Reuse the actual PostgreSQL fixtures without a server, credential, app data,
// network connection, or on-disk database. Never load normal database env vars.
assert.equal(typeof vm.SourceTextModule, "function", "Run with --experimental-vm-modules");
const modulePath = process.env.CODE3_TEST_PGLITE_MODULE;
assert.ok(modulePath, "Set CODE3_TEST_PGLITE_MODULE to the installed @electric-sql/pglite/dist/index.js");
const resolvedModule = path.resolve(modulePath);
const packageInfo = JSON.parse(await fs.readFile(path.resolve(resolvedModule, "../../package.json"), "utf8"));
assert.equal(packageInfo.name, "@electric-sql/pglite");
assert.equal(packageInfo.version, "0.5.10", "Use the reviewed pinned PGlite version");
const { PGlite } = await import(pathToFileURL(resolvedModule).href);
const { pgcrypto } = await import(new URL("./contrib/pgcrypto.js", pathToFileURL(resolvedModule)).href);
const databases = new Map();
const queued = [];
let queries = 0;

class MemoryClient {
  constructor(options) {
    assert.equal(options.host, "127.0.0.1");
    assert.equal(options.port, 55439);
    assert.equal(options.user, "code3qa");
    assert.ok(options.database === "postgres" || /^code3_test_(?:delete|private_read)_[0-9a-f]{32}$/.test(options.database));
    this.database = options.database;
  }
  async connect() {
    if (this.database !== "postgres") assert.ok(databases.has(this.database), "Only this run's synthetic database may be used");
  }
  async query(sql, parameters) {
    queries++;
    if (this.database === "postgres") {
      const match = /^create database (code3_test_(?:delete|private_read)_[0-9a-f]{32})$/.exec(sql.trim());
      assert.ok(match, "The synthetic admin accepts only a new random in-memory database");
      assert.equal(databases.has(match[1]), false);
      databases.set(match[1], new PGlite({ extensions: { pgcrypto } }));
      return { rows: [], rowCount: 0 };
    }
    const db = databases.get(this.database);
    assert.ok(db, "Synthetic database was closed");
    const result = parameters ? await db.query(sql, parameters) : (await db.exec(sql)).at(-1);
    return { ...result, rows: result?.rows || [], rowCount: result?.rows?.length || result?.affectedRows || 0 };
  }
  async end() {
    const db = databases.get(this.database);
    if (db) { await db.close(); databases.delete(this.database); }
  }
}

const fixtures = ["accountDeletion.postgres.test.mjs", "privateAttachmentReads.postgres.test.mjs"];
try {
  for (const fixture of fixtures) {
    const url = new URL(`../backend/test/${fixture}`, import.meta.url);
    const module = new vm.SourceTextModule(await fs.readFile(url, "utf8"), {
      identifier: url.href,
      initializeImportMeta(meta) { meta.url = url.href; },
    });
    await module.link(async (specifier) => {
      let exports;
      if (specifier === "pg") exports = { default: { Client: MemoryClient } };
      else if (specifier === "node:test") exports = { test: (name, run) => queued.push({ name, run }) };
      else {
        assert.ok(["node:assert/strict", "node:crypto", "node:fs/promises"].includes(specifier), "Unexpected fixture dependency");
        exports = await import(specifier);
      }
      const linked = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      });
      return linked;
    });
    await module.evaluate();
  }
  const passed = [];
  for (const { name, run } of queued) { await run(); passed.push(name); console.log(`PASS ${name}`); }
  assert.equal(databases.size, 0);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const output = path.join(root, "artifacts/qa/privacy-beta-20261024");
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "pglite-results.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), engine: `@electric-sql/pglite ${packageInfo.version}`,
    fixtures, passed, queries, inMemoryOnly: true, networkRequests: 0, productionWrites: 0,
    credentialsRead: false, remainingSyntheticDatabases: 0,
    limitation: "Auth and Storage are synthetic fixture tables. This does not replace hosted provider, deployment or physical-device acceptance.",
  }, null, 2));
  console.log(`Privacy PostgreSQL fixture groups: ${passed.length} passed in memory; zero network requests or production writes.`);
} catch (error) {
  console.error(`Privacy fixture failed: ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
} finally { await Promise.all([...databases.values()].map(db => db.close())); }
