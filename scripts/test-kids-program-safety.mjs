import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SPARK_PROGRAM_STATUS_OPTIONS,
  normalizeSparkProgramStatus,
  sparkProgramStatusLabel,
  validateSparkApplication,
} from "../src/utils/kidsProgramSafety.js";

const sparkSource = fs.readFileSync("src/pages/Spark.jsx", "utf8");

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
assert.match(sparkSource, /Parent-managed access support, kid-pack planning, donations, proof, and family-safe event help/, "The active Spark page should explain its family support purpose");
assert.match(sparkSource, /No direct child messaging, public child profiles, or payment processing/, "The active Spark mission should retain its safety boundaries");
assert.match(sparkSource, /Other family collecting support/, "The Spark page should list broader support categories beyond bulk cards");
assert.match(sparkSource, /Volunteer time/, "The Spark support examples should include non-product help");

console.log("Kids Program safety tests passed.");
