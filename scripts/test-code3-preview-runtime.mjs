import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeProviderConnectionsPayload,
} from "../src/services/accountOpsProviderApi.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let assertions = 0;

function equal(actual, expected, message) {
  assertions += 1;
  assert.equal(actual, expected, message);
}

function matches(value, pattern, message) {
  assertions += 1;
  assert.match(value, pattern, message);
}

function excludes(value, pattern, message) {
  assertions += 1;
  assert.doesNotMatch(value, pattern, message);
}

const providerEntry = read("api/account-ops/provider-connections.ts").trim();
const sessionEntry = read("api/auth/session.ts").trim();
const expectedProviderEntry = 'import app from "../../backend/src/server";\n\nexport default app;';
equal(providerEntry.replaceAll("\r\n", "\n"), expectedProviderEntry, "the provider route should only export the canonical Express app");
equal(sessionEntry.replaceAll("\r\n", "\n"), expectedProviderEntry, "the session route should only export the canonical Express app");

const vercelConfig = JSON.parse(read("vercel.json"));
const filesystemIndex = vercelConfig.routes.findIndex((route) => route.handle === "filesystem");
const spaIndex = vercelConfig.routes.findIndex((route) => route.dest === "/index.html");
equal(filesystemIndex >= 0, true, "Vercel should resolve exact API functions through the filesystem");
equal(spaIndex > filesystemIndex, true, "the SPA fallback must come after exact API functions");
excludes(JSON.stringify(vercelConfig), /"prod"|production_environment|promote/i, "Phase 2B2-A must not configure a Production deployment");

const server = read("backend/src/server.ts");
matches(server, /process\.env\.VERCEL !== "1"[\s\S]*app\.listen/, "the Express app must not open a listener inside Vercel Functions");
matches(server, /app\.use\("\/api\/account-ops\/provider-connections", protectedCors, providerConnectionsRouter\)/, "the protected provider route should precede legacy API handling");
matches(server, /app\.use\("\/api\/auth", protectedCors, authRouter\)/, "the exact session function should reuse protected Express authentication");

const trustedRuntime = read("backend/src/providerRuntime/trustedRuntime.ts");
matches(trustedRuntime, /env\.VERCEL === "1"/, "runtime proof should require the server-owned Vercel marker");
matches(trustedRuntime, /vercelEnvironment === "preview"/, "runtime proof should require the exact Preview environment");
matches(trustedRuntime, /providerNetworkAccessEnabled: false/, "runtime proof must disclose that provider network access is disabled");
excludes(trustedRuntime, /request\.|headers|query|body|VERCEL_URL|VERCEL_DEPLOYMENT_ID|VERCEL_REGION/, "runtime proof must not trust requests or expose deployment infrastructure");

const safePayload = normalizeProviderConnectionsPayload({
  configurationState: "NOT_CONFIGURED",
  connections: [],
  providerCapabilities: [
    {
      providerId: "gmail",
      displayName: "Gmail",
      configurationStatus: "NOT_CONFIGURED",
      authorizationStatus: "UNAVAILABLE",
      capabilities: { connect: false, listBoundedMessageMetadata: false },
    },
    {
      providerId: "microsoft-outlook",
      displayName: "Outlook / Microsoft",
      configurationStatus: "NOT_CONFIGURED",
      authorizationStatus: "UNAVAILABLE",
      capabilities: { connect: false, listBoundedMessageMetadata: false },
    },
  ],
  runtime: {
    hostedRuntimeVerified: true,
    trustedRuntimeProof: {
      proofVersion: "code3.preview-runtime-proof.v1",
      execution: "SERVER",
      environment: "PREVIEW",
      previewEnvironment: true,
      productionEnvironment: false,
      providerRuntimeLoaded: true,
      providerNetworkAccessEnabled: false,
      hostedRuntimeVerified: true,
    },
  },
  warnings: [],
});
equal(safePayload.configurationState, "NOT_CONFIGURED", "trusted runtime availability must not imply provider configuration");
equal(safePayload.trustedRuntime.hostedRuntimeVerified, true, "the client should accept only complete safe Preview proof");
equal(safePayload.providers.length, 2, "the client should expose both bounded provider status rows");
equal(safePayload.providers[0].configurationStatus, "NOT_CONFIGURED", "Gmail should remain not configured");
equal(safePayload.providers[1].configurationStatus, "NOT_CONFIGURED", "Outlook should remain not configured");

const unsafeProductionPayload = normalizeProviderConnectionsPayload({
  ...safePayload,
  providerCapabilities: [],
  runtime: {
    hostedRuntimeVerified: true,
    trustedRuntimeProof: {
      proofVersion: "code3.preview-runtime-proof.v1",
      execution: "SERVER",
      environment: "PRODUCTION",
      previewEnvironment: false,
      productionEnvironment: true,
      providerRuntimeLoaded: true,
      providerNetworkAccessEnabled: false,
      hostedRuntimeVerified: true,
    },
  },
});
equal(unsafeProductionPayload.trustedRuntime.hostedRuntimeVerified, false, "Production must not satisfy the Preview-only proof");

const foundation = read("src/features/accountOps/InboxOrderFoundation.jsx");
matches(foundation, /Trusted runtime[\s\S]*Verified server-side in Vercel Preview/, "the UI should state trusted Preview runtime availability honestly");
matches(foundation, /Gmail and Outlook remain disconnected with live capabilities disabled/, "the UI should keep runtime and provider readiness separate");
matches(foundation, /Phase 2B2-A verifies only the Preview server boundary/, "the UI should state the phase boundary");
excludes(foundation, />\s*Connect\s*</, "the Preview proof must not activate a mailbox Connect action");
excludes(foundation, /Import Purchase|Create Purchase|Receive Inventory/, "the Preview proof must not activate business mutations");

console.log(`Code 3 Preview trusted-runtime contracts passed: ${assertions} assertions.`);
