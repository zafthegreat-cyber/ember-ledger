import assert from "node:assert/strict";
import {
  PHASE2B1_FIXED_NOW,
  PHASE2B1_FIXTURE_CONTEXT,
  PHASE2B1_QA_FIXTURES,
  createInboxOrderService,
  normalizeProviderConnectionMetadata,
  normalizeProviderMessage,
} from "../src/features/inboxOrder/index.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

let assertions = 0;
let sequence = 0;
assert.equal(PHASE2B1_QA_FIXTURES.length, 25);
assertions += 1;

for (const fixture of PHASE2B1_QA_FIXTURES) {
  if (fixture.kind === "CONNECTION") {
    const result = normalizeProviderConnectionMetadata(fixture.input);
    assert.equal(result.containsProviderSecret, false);
    assertions += 1;
  } else if (fixture.kind === "MESSAGE_ERROR") {
    await assert.rejects(
      () => normalizeProviderMessage(fixture.input, PHASE2B1_FIXTURE_CONTEXT),
      (error) => error.code === fixture.expectedError,
    );
    assertions += 1;
  } else {
    const storage = new MemoryStorage();
    const service = createInboxOrderService({
      storage,
      now: () => PHASE2B1_FIXED_NOW,
      idFactory: (prefix) => `${prefix}:fixture-${fixture.id}-${sequence += 1}`,
    });
    const result = await service.processMessage(fixture.input, PHASE2B1_FIXTURE_CONTEXT);
    assert.equal(result.event.rawContentRetained, false);
    assert.equal(result.event.purchaseCreated, false);
    assertions += 2;
    if (fixture.secretSentinel) {
      assert.equal(JSON.stringify(result).includes(fixture.secretSentinel), false);
      assert.equal(storage.values.values().next().value.includes(fixture.secretSentinel), false);
      assertions += 2;
    }
    if (fixture.kind === "REVIEW") {
      assert.ok(result.candidate);
      const reviewed = await service.reviewCandidate(result.candidate.id, fixture.review, result.candidate.recordVersion);
      assert.equal(reviewed.purchaseCreated, false);
      assert.ok(["CORRECTED", "REJECTED"].includes(reviewed.ownerReview.state));
      assertions += 3;
    }
  }
  process.stdout.write(`ok - fixture ${fixture.id}\n`);
}

console.log(`Code 3 Inbox/Order fixtures: 25/25 cases, ${assertions} assertions passed.`);
