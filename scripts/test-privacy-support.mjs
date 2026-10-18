import assert from "node:assert/strict";
import { deletionHelpState, privacySupportDraft, SUPPORT_TOPICS } from "../src/features/privacy/privacySupport.js";

let checks = 0;
function check(run) { run(); checks++; }
const ready = { available: true, state: "ready", blockers: [] };
check(() => assert.equal(deletionHelpState(ready), null));
check(() => assert.equal(deletionHelpState(null), null));
for (const code of ["account_reauthentication_failed", "invalid_confirmation"]) check(() => assert.equal(deletionHelpState(ready, code), null));
for (const code of ["account_shared_workspace", "account_protected_owner"]) check(() => {
  const result = deletionHelpState({ ...ready, available: false, blockers: [{ code, message: "server-only-context" }] });
  assert.equal(result.topic, "ownership"); assert.match(result.explanation, /does not transfer/);
  assert.ok(!JSON.stringify(result).includes("server-only-context"));
});
for (const code of ["account_storage_review_required", "account_data_review_required"]) check(() => {
  const result = deletionHelpState(null, code); assert.equal(result.title, "Ask for a record ownership review");
  assert.match(result.steps.join(" "), /does not change or delete/);
});
for (const code of ["outcome_unknown", "account_deletion_pending"]) check(() => {
  const result = deletionHelpState(null, code); assert.equal(result.topic, "pending");
  assert.match(result.explanation, /already have removed/); assert.ok(!result.explanation.includes("unchanged"));
});
check(() => assert.equal(deletionHelpState({ ...ready, state: "pending" }).topic, "pending"));
check(() => assert.equal(deletionHelpState(null, "account_sign_in_required").topic, "access"));
check(() => assert.equal(deletionHelpState({ ...ready, available: false }).topic, "deletion"));
check(() => assert.equal(deletionHelpState(null, "account_deletion_unavailable").title, "Deletion is not available right now"));
check(() => assert.equal(deletionHelpState(null, "untrusted-code").topic, "deletion"));
for (const topic of Object.keys(SUPPORT_TOPICS)) check(() => {
  const draft = privacySupportDraft({ topic, recipient: "support@code3tcg.com", note: "Android: I cannot complete this step." });
  const url = new URL(draft.mailto);
  assert.equal(url.protocol, "mailto:"); assert.equal(decodeURIComponent(url.pathname), "support@code3tcg.com");
  assert.equal(url.searchParams.get("subject"), draft.subject); assert.equal(url.searchParams.get("body"), draft.body);
  assert.match(draft.body, /Android: I cannot complete this step/);
  assert.deepEqual([...url.searchParams.keys()], ["subject", "body"]);
});
check(() => {
  const draft = privacySupportDraft({ topic: "__proto__", recipient: "support@code3tcg.com", accountId: "private-id", accountEmail: "private@example.invalid", token: "private-token", password: "private-password", note: "Test" });
  assert.equal(draft.subject, "Code 3 TCG: General help");
  for (const sensitive of ["private-id", "private@example.invalid", "private-token", "private-password"]) assert.ok(!draft.text.includes(sensitive));
});
check(() => {
  const note = "?bcc=other@example.invalid&subject=changed\nsecond line";
  const draft = privacySupportDraft({ recipient: "support@code3tcg.com", note });
  const url = new URL(draft.mailto); assert.equal(url.searchParams.has("bcc"), false); assert.match(url.searchParams.get("body"), /second line/);
});
for (const recipient of ["", "bad-address", "support@code3tcg.com?bcc=other@example.invalid", "support@code3tcg.com\r\nCc:other@example.invalid"]) check(() => assert.equal(privacySupportDraft({ recipient }).mailto, ""));
check(() => assert.equal(privacySupportDraft({ note: "x".repeat(999) }).body.match(/x/g).length, 600));
check(() => assert.match(privacySupportDraft().body, /\[add the screen, device type, and what happened\]/));
console.log(`PASS ${checks} privacy support guidance and draft checks; no account identifiers, messages sent, or record writes.`);
