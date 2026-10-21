/* Local PostgreSQL engine only. No network, credentials or production connection. */
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const moduleName = process.env.CODE3_PGLITE_MODULE || '@electric-sql/pglite';
  const { PGlite } = require(moduleName);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create schema code3_private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('code3.test_uid',true),'')::uuid; $$;
      create function code3_private.require_current_session() returns void language plpgsql as $$ begin
        if auth.uid() is null then raise exception using errcode='42501',message='current_session_required'; end if;
      end; $$;
    `);
    const schemaPath = path.join(__dirname, 'schema.sql');
    const templatePath = path.join(__dirname, 'schema.test.sql');
    const originalSchema = fs.readFileSync(schemaPath, 'utf8');
    const template = fs.readFileSync(templatePath, 'utf8');
    const marker = '-- __ISOLATED_SCHEMA_SQL__';
    if (template.split(marker).length !== 2) throw new Error('Expected exactly one schema insertion marker.');
    const isolatedSchema = originalSchema
      .replace(/^begin;\s*$/m, '')
      .replace(/^commit;\s*$/m, '')
      .replaceAll('code3_ebay_private', 'code3_ebay_test_20261020')
      .replaceAll('code3_sync_private', 'code3_ebay_sync_test_20261020')
      .replaceAll('public.', 'code3_ebay_public_test_20261020.');
    if (isolatedSchema.includes('code3_sync_private.') || isolatedSchema.includes('public.code3_records')) {
      throw new Error('Synthetic namespace isolation failed.');
    }
    // A function replacement preserves SQL $$ delimiters and regex $' bytes;
    // passing SQL as a JS replacement string silently expands those tokens.
    const script = template.replace(marker, () => isolatedSchema);
    const results = await db.exec(script);
    const summary = results.flatMap((result) => result.rows || []).findLast((row) => row.result?.suite === 'ebay-deletion-sql-isolated')?.result;
    if (!summary || summary.passed < 40 || summary.failed !== 0) throw new Error('Missing expected SQL assertions.');
    const residue = await db.query(`select nspname from pg_namespace where nspname like 'code3_ebay%test_20261020'`);
    if (residue.rows.length) throw new Error('Rollback did not remove isolated test schemas.');
    process.stdout.write(JSON.stringify({
      ...summary, engine: 'local PGlite PostgreSQL', schemaBytes: Buffer.byteLength(originalSchema),
      testTemplateBytes: Buffer.byteLength(template), assembledBytes: Buffer.byteLength(script),
      rolledBackSchemas: true, networkUsed: false,
    }, null, 2) + '\n');
  } catch (error) {
    // No secrets are loaded. Keep this diagnostic focused on SQL errors only.
    process.stderr.write(JSON.stringify({ ok: false, code: error.code, message: error.message,
      position: error.position, internalPosition: error.internalPosition, where: error.where,
    }, null, 2) + '\n');
    process.exitCode = 1;
  } finally { await db.close(); }
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
