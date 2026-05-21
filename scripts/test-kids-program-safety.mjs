import assert from "node:assert/strict";
import {
  SPARK_PROGRAM_STATUS_OPTIONS,
  normalizeSparkProgramStatus,
  sparkProgramStatusLabel,
  validateSparkApplication,
} from "../src/utils/kidsProgramSafety.js";

const baseRequest = {
  parentName: "Parent",
  email: "parent@example.com",
  childAgeRange: "9_12",
  childFirstName: "Kiddo",
  favoritePokemon: "Pikachu binder",
  collectingInterest: "Learning to collect safely.",
  requestedAccess: ["kids packs"],
  agreesNoResale: true,
  consentContact: true,
};

assert.equal(validateSparkApplication(baseRequest), "");
assert.match(validateSparkApplication({ ...baseRequest, parentName: "" }), /Parent\/guardian/i);
assert.match(validateSparkApplication({ ...baseRequest, email: "bad" }), /valid parent\/guardian email/i);
assert.match(validateSparkApplication({ ...baseRequest, childAgeRange: "" }), /age range/i);
assert.match(validateSparkApplication({ ...baseRequest, childAgeRange: "2017-05-01" }), /age range/i);
assert.match(validateSparkApplication({ ...baseRequest, reason: "DOB 5/12/2017" }), /birthdates/i);
assert.match(validateSparkApplication({ ...baseRequest, requestedAccess: [] }), /access type/i);
assert.match(validateSparkApplication({ ...baseRequest, favoritePokemon: "", collectingInterest: "" }), /Pokemon product/i);
assert.match(validateSparkApplication({ ...baseRequest, agreesNoResale: false }), /rules/i);

assert.deepEqual(SPARK_PROGRAM_STATUS_OPTIONS, [
  "interest_submitted",
  "waitlisted",
  "invited",
  "fulfilled",
  "not_available_yet",
  "denied",
]);
assert.equal(normalizeSparkProgramStatus("pending_review"), "interest_submitted");
assert.equal(normalizeSparkProgramStatus("approved"), "invited");
assert.equal(normalizeSparkProgramStatus("waitlist"), "waitlisted");
assert.equal(normalizeSparkProgramStatus("denied"), "not_available_yet");
assert.equal(sparkProgramStatusLabel("fulfilled"), "Fulfilled");
assert.equal(sparkProgramStatusLabel("not_available_yet"), "Not Available Yet");

console.log("Kids Program safety tests passed.");
