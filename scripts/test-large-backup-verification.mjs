// MUST-6 (2026-11-13): a heavy seller's backup (well past the old 10 MB cap)
// must still self-verify. Guards the 2026-10-30 fix in canonicalJson.js.
//   node --no-warnings --test scripts/test-large-backup-verification.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createVerifiedBackup, verifyBackupJson, BACKUP_COVERAGE } from "../src/features/backup/index.js";
import { BACKUP_PARSE_LIMITS } from "../src/features/backup/canonicalJson.js";

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])); }
  get length() { return this.values.size; }
  key(i) { return [...this.values.keys()][i] ?? null; }
  getItem(k) { return this.values.has(k) ? this.values.get(k) : null; }
  setItem(k, v) { this.values.set(k, String(v)); }
  removeItem(k) { this.values.delete(k); }
}

function bigSellerState() {
  const inventory = Array.from({ length: 16000 }, (_, i) => ({
    id: `inv-${i}`, name: `Synthetic sealed product ${i} with a long descriptive title for size`, quantity: 3, allocatedItemCost: 12.5 + (i % 40),
    projectedResaleMid: 20 + (i % 50), purchaseDate: "2026-0" + (1 + (i % 9)) + "-12", storageLocation: `Bin ${i % 120}`, notes: "x".repeat(220), status: "In stock", ownedItemPurpose: "FOR_RESALE",
  }));
  const sales = Array.from({ length: 4000 }, (_, i) => ({ id: `sale-${i}`, inventoryItemId: `inv-${i % 16000}`, quantitySold: 1, grossSalePrice: 30 + (i % 25), saleDate: "2026-09-01", status: "completed", salesChannel: "eBay", notes: "y".repeat(120) }));
  return { schemaVersion: 2, deals: [], appraisals: [], auctions: [], searchRules: [], purchases: [], lots: [], inventory, sales, expenses: [], mileage: [], activity: [], providerListings: [] };
}

test("a 10+ MB seller backup verifies and reports its size against the limit", async () => {
  const localStorage = new MemoryStorage({ "ember-and-tide.flip-scout.v1": bigSellerState() });
  const result = await createVerifiedBackup({ localStorage, sessionStorage: new MemoryStorage(), createdAt: "2026-11-13T12:00:00.000Z", applicationVersion: "must-6-test", sourceCommit: "test" });
  const bytes = Buffer.byteLength(result.json, "utf8");
  assert.ok(bytes > 10 * 1024 * 1024, `backup should exceed 10 MB for this test, got ${(bytes / 1048576).toFixed(1)} MB`);
  assert.ok(bytes < BACKUP_PARSE_LIMITS.maxBytes);
  assert.equal(result.verified, true, result.verificationSummary);
  assert.equal(result.integrityVerified, true);
  assert.notEqual(result.coverageStatus, BACKUP_COVERAGE.FAILED);
  const reread = await verifyBackupJson(result.json);
  assert.equal(reread.valid, true, (reread.errors || []).join(" "));
});

test("a backup over the hard limit fails with the size and the limit in the message", async () => {
  const huge = "x".repeat(BACKUP_PARSE_LIMITS.maxBytes + 10);
  const verification = await verifyBackupJson(`{"pad":"${huge}"}`);
  assert.equal(verification.valid, false);
  assert.equal(verification.errorCode, "MAX_FILE_SIZE");
  assert.match(verification.errors[0], /over the 64 MB limit/);
});
