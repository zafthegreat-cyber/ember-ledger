import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Public, read-only deployment smoke. No cookies, saved sessions, app keys,
// account IDs, passwords, deletion POSTs, uploads or database client are used.
const args = process.argv.slice(2);
assert.equal(args.length, 0, "This check targets only the public production origin");
const origin = "https://code3tcg.app";
const output = path.resolve("artifacts/qa/privacy-beta-20261024/public-https-check.json");
const probes = [
  ...["/privacy", "/delete-account", "/support"].map(route => ({ name: route, route })),
  { name: "unauthenticated-status", route: "/api/account/deletion/status" },
  { name: "synthetic-invalid-bearer", route: "/api/account/deletion/status", headers: { Authorization: "Bearer code3-synthetic-invalid-token" } },
  ...[origin, "capacitor://localhost", "https://localhost", "https://untrusted.example.invalid"].map(pageOrigin => ({
    name: `preflight:${pageOrigin}`, route: "/api/account/deletion", method: "OPTIONS", headers: {
      Origin: pageOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Authorization, Content-Type",
    },
  })),
];

async function probe({ name, route, method = "GET", headers = {} }) {
  try {
    const response = await fetch(`${origin}${route}`, { method, headers, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(20000) });
    const result = { name, status: response.status, contentType: response.headers.get("content-type"), cacheControl: response.headers.get("cache-control"), allowOrigin: response.headers.get("access-control-allow-origin") };
    if (result.contentType?.includes("application/json")) {
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let raw = ""; let bytes = 0;
      try {
        while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; assert.ok(bytes <= 32768, "Unexpected public API response size"); raw += decoder.decode(next.value, { stream: true }); }
        const body = JSON.parse(raw + decoder.decode());
        const code = body?.error?.code;
        // Never persist raw errors, returned identities or account content.
        if (typeof code === "string" && /^[a-z_]{1,80}$/.test(code)) result.errorCode = code;
      } finally { await reader.cancel().catch(() => {}); }
    } else await response.body?.cancel();
    return result;
  } catch (error) { return { name, failed: true, reason: error.name || "REQUEST_FAILED" }; }
}

const results = await Promise.all(probes.map(probe));
const get = name => results.find(result => result.name === name);
const gates = {
  publicPagesLoad: ["/privacy", "/delete-account", "/support"].every(name => get(name).status === 200 && get(name).contentType?.includes("text/html")),
  unauthenticatedStatusProtected: get("unauthenticated-status").status === 401 && get("unauthenticated-status").errorCode === "account_sign_in_required",
  invalidBearerNeverAccepted: [401, 503].includes(get("synthetic-invalid-bearer").status),
  productionWebCors: get(`preflight:${origin}`).status === 204 && get(`preflight:${origin}`).allowOrigin === origin,
  iphoneCors: get("preflight:capacitor://localhost").status === 204 && get("preflight:capacitor://localhost").allowOrigin === "capacitor://localhost",
  androidCors: get("preflight:https://localhost").status === 204 && get("preflight:https://localhost").allowOrigin === "https://localhost",
  unrelatedOriginDenied: get("preflight:https://untrusted.example.invalid").status === 403 && !get("preflight:https://untrusted.example.invalid").allowOrigin,
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), origin, readOnly: true, accountCookiesOrKeysUsed: false,
  mutations: 0, results, gates, deletionOperationalVerified: false,
  limitation: "Public/unauthenticated HTTPS and CORS only. A503 can mean disabled or unconfigured. This cannot certify successful account deletion, real signed-in session isolation, file removal or phone behavior.",
}, null, 2));
console.log(JSON.stringify({ gates, syntheticStatusCode: get("synthetic-invalid-bearer").errorCode, evidence: path.relative(process.cwd(), output), deletionOperationalVerified: false }, null, 2));
if (!gates.publicPagesLoad || !gates.unauthenticatedStatusProtected || !gates.invalidBearerNeverAccepted || !gates.productionWebCors || !gates.unrelatedOriginDenied) process.exitCode = 1;
