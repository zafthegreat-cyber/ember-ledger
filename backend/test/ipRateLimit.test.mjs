// Audit 2026-11-14: public Best Buy lookups are limited per client address.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { createIpRateLimit, clientAddress } = require("../dist/security/ipRateLimit.js");

function call(limit, ip, method = "GET") {
  let status = 200; let body = null; const headers = {}; let passed = false;
  const response = { setHeader: (k, v) => { headers[k] = v; }, status: (code) => { status = code; return { json: (value) => { body = value; return value; } }; } };
  limit({ method, headers: { "x-forwarded-for": `${ip}, 10.0.0.1` }, ip: "10.0.0.1", socket: {} }, response, () => { passed = true; });
  return { status, body, headers, passed };
}

test("client address comes from the first x-forwarded-for entry", () => {
  assert.equal(clientAddress({ headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" }, ip: "10.0.0.1", socket: {} }), "203.0.113.5");
  assert.equal(clientAddress({ headers: {}, ip: "198.51.100.7", socket: {} }), "198.51.100.7");
});

test("each address gets its own budget and is blocked with 429 after it", () => {
  let now = 0;
  const limit = createIpRateLimit({ maximumRequests: 3, windowMs: 60_000, now: () => now, label: "Best Buy lookups" });
  for (let i = 0; i < 3; i += 1) assert.equal(call(limit, "203.0.113.5").passed, true);
  const blocked = call(limit, "203.0.113.5");
  assert.equal(blocked.passed, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, "rate_limited");
  assert.ok(Number(blocked.headers["Retry-After"]) >= 1);
  assert.equal(call(limit, "198.51.100.7").passed, true, "another address is unaffected");
  assert.equal(call(limit, "203.0.113.5", "OPTIONS").passed, true, "preflight is never counted");
  now = 60_000;
  assert.equal(call(limit, "203.0.113.5").passed, true, "the budget resets after the window");
});
