import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BETA_LOCAL_STORAGE_KEYS as keys,
  cleanupBrowserBetaStorage,
} from "../src/utils/betaDataCleanup.js";

// Exercise the actual startup cleanup with disposable storage only.
const descriptors = [
  { name: "app", key: keys.app, field: "items", arrays: ["items", "catalogProducts", "tideTradrWatchlist", "marketplaceListings", "marketplaceReports", "marketPriceMemories", "itemComparisons", "vaultCollectionSets", "vaultDisplayCase", "tradeRecords", "trades", "sparkGifts", "sparkKidPacks", "sparkEventPlans", "collectorEventPlans", "expenses", "sales", "vehicles", "mileageTrips", "workspaces", "workspaceMembers", "workspaceInvites"] },
  { name: "scout", key: keys.scout, field: "stores", arrays: ["stores", "reports", "tidepoolReports", "tidepoolEvents", "bestBuyStockResults", "bestBuyStockHistory", "bestBuyStoreStock", "bestBuyAlerts", "bestBuyNightlyReports", "restockIntel", "restockPatterns", "intelImportReviews", "items", "routes"], passthrough: ["storeAliases"] },
  { name: "tidepool", key: keys.tidepool, field: "posts", arrays: ["posts", "comments", "reactions", "trustedCircle"] },
  { name: "marketPrices", key: keys.marketPrices, field: "prices", arrays: ["prices"], passthrough: ["failedMatches"] },
  ...["suggestions", "feedback", "adminReviewLog", "whatDidISee"].map((name) => ({ name, key: keys[name], list: true })),
];
const keep = { id: "retained-record", name: "Collector record", customRecordField: { exact: [1, 2] } };
const removable = [
  { id: "demo-record", name: "Seed record" },
  { id: "flagged-record", isDemo: true },
  { id: "source-record", source: "mock" },
  { id: "text-record", notes: "Demo product for a walkthrough" },
];
const unknownKey = "unrelated-storage-owner";
const unknownBytes = "  {\"keep\":true}\n";
const results = [];

function storageFor(seed = {}) {
  const data = new Map(Object.entries(seed));
  const reads = new Map();
  const writes = [];
  const attempts = [];
  return {
    data, reads, writes, attempts,
    beforeRead: null, beforeWrite: null,
    getItem(key) {
      const count = (reads.get(key) || 0) + 1;
      reads.set(key, count);
      this.beforeRead?.(key, count, data);
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      attempts.push({ key, value });
      this.beforeWrite?.(key, value, data);
      data.set(key, String(value));
      writes.push({ key, value: String(value) });
    },
  };
}

function check(name, run) {
  run();
  results.push(name);
  console.log("PASS " + name);
}

function status(result, key) {
  const entries = result.summary.filter((entry) => entry.key === key);
  assert.equal(entries.length, 1, "Each processed key must have one honest outcome");
  return entries[0].status;
}

function dirty(descriptor) {
  const rows = [keep, ...removable];
  return descriptor.list ? rows : { [descriptor.field]: rows, privateExtension: { exact: ["retain", 3] } };
}

function assertPreserved(descriptor, raw, expectedStatus = "invalid") {
  const storage = storageFor({ [descriptor.key]: raw, [unknownKey]: unknownBytes });
  const result = cleanupBrowserBetaStorage(storage);
  assert.equal(result.changed, false);
  assert.equal(status(result, descriptor.key), expectedStatus);
  assert.equal(storage.attempts.length, 0);
  assert.deepEqual([...storage.data], [[descriptor.key, raw], [unknownKey, unknownBytes]]);
}

check("absent keys stay absent and unavailable storage reports no successful change", () => {
  const storage = storageFor({ [unknownKey]: unknownBytes });
  const result = cleanupBrowserBetaStorage(storage);
  assert.equal(result.changed, false);
  assert.equal(result.summary.length, descriptors.length);
  for (const descriptor of descriptors) assert.equal(status(result, descriptor.key), "absent");
  assert.equal(storage.attempts.length, 0);
  assert.deepEqual([...storage.data], [[unknownKey, unknownBytes]]);
  assert.deepEqual(cleanupBrowserBetaStorage(null), { changed: false, summary: [] });
});

for (const descriptor of descriptors) {
  check(descriptor.name + ": malformed and wrong envelopes retain exact bytes", () => {
    const wrongEnvelope = descriptor.list ? "{}" : "[]";
    for (const raw of ["{broken", "", "   ", "null", "1", "true", '"text"', wrongEnvelope]) assertPreserved(descriptor, raw);
  });

  check(descriptor.name + ": invalid known arrays and record rows are never normalized into empties", () => {
    if (descriptor.list) {
      for (const invalid of [null, [], 1, "row"]) assertPreserved(descriptor, JSON.stringify([keep, invalid, ...removable]));
      return;
    }
    for (const field of [...descriptor.arrays, ...(descriptor.passthrough || [])]) {
      for (const invalid of [null, {}, 1, "rows"]) {
        assertPreserved(descriptor, JSON.stringify({ ...dirty(descriptor), [field]: invalid }));
      }
    }
    for (const field of descriptor.arrays) {
      for (const invalid of [null, [], 1, "row"]) {
        assertPreserved(descriptor, JSON.stringify({ ...dirty(descriptor), [field]: [keep, invalid, ...removable] }));
      }
    }
  });

  check(descriptor.name + ": valid demo cleanup preserves real records and unknown fields, then is idempotent", () => {
    const original = dirty(descriptor);
    const storage = storageFor({ [descriptor.key]: JSON.stringify(original), [unknownKey]: unknownBytes });
    const first = cleanupBrowserBetaStorage(storage);
    assert.equal(first.changed, true);
    assert.equal(status(first, descriptor.key), "sanitized");
    assert.equal(storage.writes.length, 1);
    assert.equal(storage.writes[0].key, descriptor.key);
    const cleaned = JSON.parse(storage.data.get(descriptor.key));
    assert.deepEqual(descriptor.list ? cleaned : cleaned[descriptor.field], [keep]);
    if (!descriptor.list) assert.deepEqual(cleaned.privateExtension, original.privateExtension);
    assert.equal(storage.data.get(unknownKey), unknownBytes);
    const bytes = storage.data.get(descriptor.key);
    const again = cleanupBrowserBetaStorage(storage);
    assert.equal(again.changed, false);
    assert.equal(status(again, descriptor.key), "unchanged");
    assert.equal(storage.writes.length, 1);
    assert.equal(storage.data.get(descriptor.key), bytes);
  });

  check(descriptor.name + ": read and quota failures retain bytes and report no successful write", () => {
    const raw = JSON.stringify(dirty(descriptor));
    for (const fault of ["read", "write"]) {
      const storage = storageFor({ [descriptor.key]: raw });
      if (fault === "read") storage.beforeRead = (key) => { if (key === descriptor.key) throw new Error("Synthetic read denial"); };
      else storage.beforeWrite = (key) => { if (key === descriptor.key) throw new Error("Synthetic quota failure"); };
      const result = cleanupBrowserBetaStorage(storage);
      assert.equal(result.changed, false);
      assert.equal(status(result, descriptor.key), fault === "read" ? "read-failed" : "write-failed");
      assert.equal(storage.data.get(descriptor.key), raw);
      assert.equal(storage.writes.length, 0);
      assert.equal(storage.attempts.length, fault === "read" ? 0 : 1);
    }
  });

  check(descriptor.name + ": changed or unreadable second snapshot blocks a stale cleanup write", () => {
    for (const fault of ["changed", "denied"]) {
      const raw = JSON.stringify(dirty(descriptor));
      const newer = descriptor.list ? JSON.stringify([keep]) : JSON.stringify({ [descriptor.field]: [keep], newerRevision: 2 });
      const storage = storageFor({ [descriptor.key]: raw });
      storage.beforeRead = (key, count, data) => {
        if (key !== descriptor.key || count !== 2) return;
        if (fault === "denied") throw new Error("Synthetic second read denial");
        data.set(key, newer);
      };
      const result = cleanupBrowserBetaStorage(storage);
      assert.equal(result.changed, false);
      assert.equal(status(result, descriptor.key), fault === "changed" ? "changed-during-read" : "read-failed");
      assert.equal(storage.attempts.length, 0);
      assert.equal(storage.data.get(descriptor.key), fault === "changed" ? newer : raw);
    }
  });

  check(descriptor.name + ": sparse legacy shape remains supported without inventing other storage keys", () => {
    const sparse = descriptor.list ? [keep] : { privateExtension: "retain" };
    const storage = storageFor({ [descriptor.key]: JSON.stringify(sparse) });
    const result = cleanupBrowserBetaStorage(storage);
    assert.equal(result.changed, storage.writes.length > 0);
    assert.ok(["unchanged", "sanitized"].includes(status(result, descriptor.key)));
    assert.deepEqual([...storage.data.keys()], [descriptor.key]);
    const cleaned = JSON.parse(storage.data.get(descriptor.key));
    if (descriptor.list) assert.deepEqual(cleaned, [keep]);
    else assert.equal(cleaned.privateExtension, "retain");
    const writes = storage.writes.length;
    assert.equal(cleanupBrowserBetaStorage(storage).changed, false);
    assert.equal(storage.writes.length, writes);
  });
}

check("nested app market cache validates envelope, known arrays and record rows before any write", () => {
  const app = descriptors[0];
  for (const invalid of [null, [], 1, "cache"]) assertPreserved(app, JSON.stringify({ items: [keep, ...removable], marketPriceCache: invalid }));
  for (const field of ["prices", "failedMatches"]) for (const invalid of [null, {}, 1, "rows"]) {
    assertPreserved(app, JSON.stringify({ items: [keep, ...removable], marketPriceCache: { [field]: invalid } }));
  }
  for (const invalid of [null, [], 1, "row"]) assertPreserved(app, JSON.stringify({ marketPriceCache: { prices: [keep, invalid, ...removable] } }));
});

check("valid nested cache retains unknown fields and permitted passthrough arrays", () => {
  const cache = { prices: [keep, ...removable], failedMatches: ["catalog-name", { reason: "unmatched" }], cacheExtension: { revision: 9 } };
  const storage = storageFor({
    [keys.app]: JSON.stringify({ marketPriceCache: cache, privateExtension: "app-retain" }),
    [keys.scout]: JSON.stringify({ stores: [keep, ...removable], storeAliases: ["legacy-alias", { alias: "P" }] }),
    [keys.marketPrices]: JSON.stringify(cache),
  });
  const result = cleanupBrowserBetaStorage(storage);
  assert.equal(result.changed, true);
  assert.equal(storage.writes.length, 3);
  for (const cleaned of [JSON.parse(storage.data.get(keys.app)).marketPriceCache, JSON.parse(storage.data.get(keys.marketPrices))]) {
    assert.deepEqual(cleaned.prices, [keep]);
    assert.deepEqual(cleaned.failedMatches, cache.failedMatches);
    assert.deepEqual(cleaned.cacheExtension, cache.cacheExtension);
  }
  assert.deepEqual(JSON.parse(storage.data.get(keys.scout)).storeAliases, ["legacy-alias", { alias: "P" }]);
});

check("legacy trades alias is sanitized into tradeRecords without losing unrelated data", () => {
  const storage = storageFor({ [keys.app]: JSON.stringify({ trades: [keep, ...removable], privateExtension: 1 }) });
  const result = cleanupBrowserBetaStorage(storage);
  assert.equal(status(result, keys.app), "sanitized");
  const cleaned = JSON.parse(storage.data.get(keys.app));
  assert.deepEqual(cleaned.tradeRecords, [keep]);
  assert.equal(cleaned.privateExtension, 1);
});

check("malformed inspected record fields stay intact and cannot abort independent key cleanup", () => {
  for (const descriptor of descriptors) {
    const badRow = { id: "unreadable-name", name: { toString: null } };
    const value = descriptor.list ? [keep, badRow] : { [descriptor.field]: [keep, badRow] };
    const raw = JSON.stringify(value);
    const independent = descriptors.find((other) => other.key !== descriptor.key);
    const storage = storageFor({ [descriptor.key]: raw, [independent.key]: JSON.stringify(dirty(independent)) });
    const result = cleanupBrowserBetaStorage(storage);
    assert.equal(status(result, descriptor.key), "invalid");
    assert.equal(storage.data.get(descriptor.key), raw);
    assert.equal(storage.attempts.some((entry) => entry.key === descriptor.key), false);
    assert.equal(status(result, independent.key), "sanitized");
    assert.equal(result.changed, true);
    assert.equal(storage.writes.length, 1);
  }
});

check("semantically unchanged valid data keeps original whitespace and reports no write", () => {
  for (const descriptor of descriptors) {
    const prepared = storageFor({ [descriptor.key]: JSON.stringify(dirty(descriptor)) });
    cleanupBrowserBetaStorage(prepared);
    const formatted = JSON.stringify(JSON.parse(prepared.data.get(descriptor.key)), null, 2) + "\n";
    const storage = storageFor({ [descriptor.key]: formatted });
    const result = cleanupBrowserBetaStorage(storage);
    assert.equal(result.changed, false);
    assert.equal(status(result, descriptor.key), "unchanged");
    assert.equal(storage.attempts.length, 0);
    assert.equal(storage.data.get(descriptor.key), formatted);
  }
});

check("mixed outcomes count successful writes only and continue processing independent keys", () => {
  const storage = storageFor(Object.fromEntries(descriptors.map((descriptor) => [descriptor.key, JSON.stringify(dirty(descriptor))])));
  storage.data.set(keys.marketPrices, "{broken");
  storage.beforeRead = (key) => { if (key === keys.scout) throw new Error("Synthetic denial"); };
  storage.beforeWrite = (key) => { if (key === keys.feedback) throw new Error("Synthetic quota"); };
  const result = cleanupBrowserBetaStorage(storage);
  assert.equal(result.changed, true);
  assert.equal(result.summary.length, 8);
  assert.equal(storage.writes.length, 5);
  assert.equal(result.summary.filter((entry) => entry.status === "sanitized").length, 5);
  assert.equal(status(result, keys.scout), "read-failed");
  assert.equal(status(result, keys.marketPrices), "invalid");
  assert.equal(status(result, keys.feedback), "write-failed");
});

const output = new URL("../artifacts/qa/release-readiness/beta-storage-cleanup/", import.meta.url);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(new URL("results.json", output), JSON.stringify({ passed: results.length, checks: results }, null, 2));
console.log("Beta startup cleanup safety: " + results.length + " checks passed; all eight keys, synthetic storage only.");
console.log("Evidence: " + fileURLToPath(new URL("results.json", output)));
