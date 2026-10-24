import assert from "node:assert/strict";
import { findProhibitedData, isProhibitedDataValue, sanitizeBackupData } from "../src/features/backup/backupSecurity.js";
import { createPrivateStorageReference, projectPrivateImageReferences } from "../src/services/privateStorageReferences.js";

const projectUrl = "https://guard-fixture.supabase.co";
const path = "users/11111111-1111-4111-8111-111111111111/scout-reports/1792512000002-ab12cd.png";
const reference = createPrivateStorageReference({ bucket: "receipt-images", path }, projectUrl);
const options = { projectUrl };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

check("real generated timestamp/UUID shape triggers Luhn outside the approved image context", () => {
  assert.equal(isProhibitedDataValue("1792512000002"), true, "fixed timestamp must exercise the false positive");
  assert.equal(isProhibitedDataValue(reference, "notes", options), true);
  assert.equal(isProhibitedDataValue(reference, "photoUrl"), true, "unconfigured projects are not implicitly trusted");
});

check("canonical configured-project private images survive scanning and sanitization unchanged", () => {
  const data = { photo_url: reference, photoUrls: [reference], nested: { receiptImage: reference } };
  const before = JSON.stringify(data);
  assert.deepEqual(findProhibitedData(data, options), []);
  const sanitized = sanitizeBackupData(data, options);
  assert.deepEqual(sanitized.excludedPaths, []);
  assert.equal(JSON.stringify(sanitized.data), before);
  assert.equal(JSON.stringify(data), before);
});

check("legacy signed image projection preserves original bytes and exact token-free object identity", () => {
  const legacy = `${projectUrl}/storage/v1/object/sign/receipt-images/${path}?token=synthetic-private-signature`;
  const data = { photoUrl: legacy, note: "Keep original note" };
  const before = JSON.stringify(data);
  assert.equal(findProhibitedData(data, options).length, 1, "signed credentials are rejected before projection");
  const projected = projectPrivateImageReferences(data, projectUrl);
  assert.equal(projected.photoUrl, reference);
  assert.deepEqual(findProhibitedData(projected, options), []);
  assert.equal(JSON.stringify(data), before);
});

check("non-image fields, foreign projects, public routes and unknown buckets receive no exemption", () => {
  assert.equal(findProhibitedData({ notes: reference, reference }, options).length, 2);
  for (const value of [
    reference.replace("guard-fixture.supabase.co", "foreign-fixture.supabase.co"),
    reference.replace("/object/authenticated/", "/object/public/"),
    reference.replace("/receipt-images/", "/unknown-bucket/"),
    `${reference}?view=1`,
    `${reference}#preview`,
    ` ${reference}`,
  ]) assert.equal(findProhibitedData({ photoUrl: value }, options).length, 1, value);
});

check("real payment values in notes and image fields remain rejected", () => {
  const payment = "4111111111111111";
  assert.equal(findProhibitedData({ notes: payment, photoUrl: payment, reference: payment }, options).length, 3);
  assert.equal(sanitizeBackupData({ photoUrl: payment }, options).excludedPaths.length, 1);
  assert.equal(findProhibitedData({ photoUrl: reference, password: "synthetic-password", roleValue: "owner" }, options).length, 2);
});

check("queries, embedded credentials and encoded token text stay rejected in private image fields", () => {
  for (const value of [
    `${reference}?token=synthetic-token`,
    `${reference}?signature=synthetic-signature`,
    reference.replace("1792512000002-ab12cd.png", "proof%3Ftoken%3Dsynthetic-token.png"),
    reference.replace("1792512000002-ab12cd.png", "password%3Dsynthetic-password.png"),
    reference.replace("1792512000002-ab12cd.png", "Bearer%20synthetic-token-value.png"),
    reference.replace("https://", "https://synthetic-user@"),
  ]) assert.equal(findProhibitedData({ photoUrl: value }, options).length, 1, value);
});

check("JWT and private-key detections remain active even in otherwise canonical private locators", () => {
  for (const value of [
    "eyJaaaaaaaaaaaa.bbbbbbbbbbbbb.ccccccccccccc",
    "-----BEGIN PRIVATE KEY-----",
  ]) {
    const locator = createPrivateStorageReference({ bucket: "receipt-images", path: `users/fixture/${value}.png` }, projectUrl);
    assert.equal(findProhibitedData({ photoUrl: locator }, options).length, 1);
  }
});

console.log(`Private image guard: ${checks} checks passed; synthetic offline references only.`);
