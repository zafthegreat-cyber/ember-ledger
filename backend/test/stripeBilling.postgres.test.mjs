import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

// Reuse the repository's isolated PostgreSQL WASM runtime, never a connected database.
const moduleUrl = new URL("../../artifacts/qa/ebay-test-runtime/node_modules/@electric-sql/pglite/dist/index.js", import.meta.url);
const { PGlite } = await import(moduleUrl.href);
const require = createRequire(import.meta.url);
const { createBillingRepository } = require("../dist/billing/repository.js");
const migration = readFileSync(new URL("../migrations/20261025_stripe_billing.sql", import.meta.url), "utf8");

test("PostgreSQL billing migration, account isolation, rollback, expiry and browser RLS", async () => {
  const db = new PGlite();
  const pool = { async connect() { return { query: (sql, params) => db.query(sql, params), release() {} }; } };
  const repository = createBillingRepository(pool);
  const adult = { provider: "supabase", subject: "adult" };
  try {
    await db.exec(migration);
    const { rows: [account] } = await db.query("insert into code3_billing.accounts(provider,subject,customer_id,adult_approved,approved_at,approved_by) values('supabase','adult','cus_adult',true,now(),'test') returning id");
    await db.query("insert into code3_billing.accounts(provider,subject,customer_id) values('supabase','other','cus_other')");
    await repository.forPrincipal(adult, async tx => {
      await tx.replaceSubscriptions([{ source: "sub_one", entitlement: "collector", validUntil: Math.floor(Date.now()/1000) + 3600 }]);
      await tx.grantPurchase({ source: "pi_one", entitlement: "addon:export", validUntil: null });
      await tx.grantPurchase({ source: "pi_one", entitlement: "addon:export", validUntil: null });
      await tx.record("evt_one", "checkout.session.completed");
      assert.equal(await tx.seen("evt_one"), true);
      assert.equal((await tx.grants()).length, 2);
    });
    await assert.rejects(repository.forPrincipal(adult, async tx => {
      await tx.revokePurchase("pi_one");
      await tx.replaceSubscriptions([]);
      await tx.record("evt_one", "duplicate");
    }));
    assert.equal((await repository.forPrincipal(adult, tx => tx.grants())).length, 2, "failed event transaction rolls back grant changes");
    assert.equal((await repository.forPrincipal({ provider: "supabase", subject: "other" }, tx => tx.grants())).length, 0);
    await assert.rejects(repository.forPrincipal({ provider: "supabase", subject: "unknown" }, tx => tx.grants()), { code: "billing_enrollment_required" });
    assert.equal(await repository.forCustomer("cus_unknown", async () => true), null);
    await repository.forCustomer("cus_adult", async tx => {
      assert.equal(tx.account.id, account.id);
      await tx.replaceSubscriptions([{ source: "sub_expired", entitlement: "collector", validUntil: 1 }]);
      assert.deepEqual((await tx.grants()).map(g => g.entitlement), ["addon:export"]);
      await tx.revokePurchase("pi_one");
    });
    await db.exec("create role authenticated; grant usage on schema code3_billing to authenticated; grant select,insert,update,delete on all tables in schema code3_billing to authenticated; set role authenticated;");
    assert.equal((await db.query("select * from code3_billing.accounts")).rows.length, 0, "no browser read policy");
    await assert.rejects(db.query("insert into code3_billing.accounts(provider,subject,adult_approved,approved_at,approved_by) values('supabase','attacker',true,now(),'attacker')"));
    await db.exec("reset role;");
    assert.equal((await db.query("select count(*)::int as count from code3_billing.events")).rows[0].count, 1);
  } finally { await db.close(); }
});
