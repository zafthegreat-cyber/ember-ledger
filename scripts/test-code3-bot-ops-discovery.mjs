import assert from "node:assert/strict";
import {
  BOT_DISCOVERY_CAPABILITIES,
  BOT_DISCOVERY_INTEGRATION_MODES,
  BOT_EVIDENCE_STATUSES,
  BOT_PILOT_READINESS,
  BOT_PROVIDER_KEYS,
} from "../src/features/botOps/constants.js";
import {
  BOT_DISCOVERY_RECOMMENDATION_STATUSES,
  BOT_EVIDENCE_TYPES,
  calculateBotPilotReadiness,
  getBotProviderDiscovery,
  listBotProviderDiscovery,
  normalizeBotProviderEvidence,
  recommendFirstBotPilot,
} from "../src/features/botOps/providerDiscovery.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function throws(callback, predicate, message) { assert.throws(callback, predicate, message); assertions += 1; }

const expectedCapabilities = [
  "OBSERVE_RUNTIME", "READ_TASK_GROUPS", "READ_TASKS", "READ_STATUS", "READ_HISTORY",
  "READ_CHECKOUT_EVIDENCE", "CREATE_TASK", "EDIT_TASK", "START_TASK", "STOP_TASK",
  "RESTART_TASK", "READ_ACCOUNT_METADATA", "READ_PROXY_METADATA", "READ_PROFILE_METADATA",
];
const expectedModes = [
  "OFFICIAL_API", "DOCUMENTED_WEBHOOK", "DOCUMENTED_EXPORT", "DOCUMENTED_LOCAL_INTERFACE",
  "SUPPORTED_PLUGIN", "OWNER_FILE_IMPORT", "LOCAL_READ_ONLY_COMPANION", "MANUAL_IMPORT",
  "UNSUPPORTED_PRIVATE_API", "REVERSE_ENGINEERED_INTERFACE",
];
deepEqual(Object.values(BOT_DISCOVERY_CAPABILITIES), expectedCapabilities, "discovery capability taxonomy is exact");
deepEqual(Object.values(BOT_DISCOVERY_INTEGRATION_MODES), expectedModes, "discovery integration-mode taxonomy is exact");
deepEqual(Object.values(BOT_EVIDENCE_STATUSES), [
  "VERIFIED_SUPPORTED", "DOCUMENTED_BUT_LIMITED", "UNKNOWN", "UNSUPPORTED", "DO_NOT_USE",
]);

const discoveries = listBotProviderDiscovery();
deepEqual(discoveries.map(({ provider }) => provider), [BOT_PROVIDER_KEYS.HAYHA, BOT_PROVIDER_KEYS.STELLAR]);
deepEqual(listBotProviderDiscovery("hayha").map(({ provider }) => provider), [BOT_PROVIDER_KEYS.HAYHA]);
deepEqual(listBotProviderDiscovery("unknown"), []);
equal(getBotProviderDiscovery("unknown"), null);

for (const discovery of discoveries) {
  equal(discovery.liveCapabilitiesEnabled, false, `${discovery.provider} discovery never enables a live capability`);
  equal(discovery.providerNetworkAccess, false, `${discovery.provider} discovery never enables network access`);
  equal(Object.keys(discovery.capabilities).length, expectedCapabilities.length);
  for (const capability of expectedCapabilities) {
    equal(discovery.capabilities[capability].enabled, false, `${discovery.provider}.${capability} defaults disabled`);
    ok(Object.values(BOT_EVIDENCE_STATUSES).includes(discovery.capabilities[capability].evidenceStatus));
    ok(Array.isArray(discovery.capabilities[capability].evidenceIds));
  }
  deepEqual(discovery.integrationModes.map(({ mode }) => mode), expectedModes, `${discovery.provider} reviews every integration mode`);
  for (const mode of discovery.integrationModes) {
    ok(Object.values(BOT_EVIDENCE_STATUSES).includes(mode.availability));
    ok(Object.values(BOT_DISCOVERY_RECOMMENDATION_STATUSES).includes(mode.recommendationStatus));
    ok(Array.isArray(mode.evidenceIds));
    ok(Array.isArray(mode.dataAvailable));
    ok(Array.isArray(mode.securityRisks));
  }
  for (const prohibitedMode of [
    BOT_DISCOVERY_INTEGRATION_MODES.UNSUPPORTED_PRIVATE_API,
    BOT_DISCOVERY_INTEGRATION_MODES.REVERSE_ENGINEERED_INTERFACE,
  ]) {
    const review = discovery.integrationModes.find(({ mode }) => mode === prohibitedMode);
    equal(review.availability, BOT_EVIDENCE_STATUSES.DO_NOT_USE, `${discovery.provider}.${prohibitedMode} is prohibited`);
    equal(review.recommendationStatus, BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE, `${discovery.provider}.${prohibitedMode} is never recommended`);
  }
  ok(discovery.evidence.length > 0);
  for (const item of discovery.evidence) {
    equal(item.provider, discovery.provider);
    equal(item.sourceUrl.startsWith("https://"), true);
    equal(Object.values(BOT_EVIDENCE_STATUSES).includes(item.status), true);
    equal(Object.values(BOT_EVIDENCE_TYPES).includes(item.evidenceType), true);
    equal(item.verifiedAt, "2026-08-31T00:00:00.000Z");
    equal("sourceText" in item, false, "long provider documentation is not retained");
  }
}

const hayha = getBotProviderDiscovery(BOT_PROVIDER_KEYS.HAYHA);
equal(hayha.pilotReadiness, BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET);
equal(hayha.officialApiStatus, BOT_EVIDENCE_STATUSES.UNKNOWN);
equal(hayha.recommendedMode, null);
equal(hayha.evidence.find(({ id }) => id === "hayha.private-interface-policy").status, BOT_EVIDENCE_STATUSES.DO_NOT_USE);
equal(hayha.evidence.find(({ id }) => id === "hayha.reverse-engineering-policy").status, BOT_EVIDENCE_STATUSES.DO_NOT_USE);
equal(hayha.evidence.find(({ id }) => id === "hayha.session-export").status, BOT_EVIDENCE_STATUSES.DO_NOT_USE);
equal(
  hayha.integrationModes.find(({ mode }) => mode === BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_LOCAL_INTERFACE).recommendationStatus,
  BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
  "documented Hayha CLI is not treated as a supported automation hook",
);

const stellar = getBotProviderDiscovery(BOT_PROVIDER_KEYS.STELLAR);
equal(stellar.pilotReadiness, BOT_PILOT_READINESS.OFFLINE_REVIEW_CANDIDATE);
equal(stellar.officialApiStatus, BOT_EVIDENCE_STATUSES.UNKNOWN);
equal(stellar.recommendedMode, BOT_DISCOVERY_INTEGRATION_MODES.OWNER_FILE_IMPORT);
equal(stellar.capabilities.READ_TASK_GROUPS.enabled, false);
equal(stellar.capabilities.READ_TASK_GROUPS.evidenceStatus, BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED);
equal(stellar.capabilities.READ_CHECKOUT_EVIDENCE.enabled, false);
equal(stellar.capabilities.READ_CHECKOUT_EVIDENCE.evidenceStatus, BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED);
equal(stellar.capabilities.READ_ACCOUNT_METADATA.evidenceStatus, BOT_EVIDENCE_STATUSES.DO_NOT_USE);
equal(stellar.capabilities.READ_PROFILE_METADATA.evidenceStatus, BOT_EVIDENCE_STATUSES.DO_NOT_USE);
equal(stellar.evidence.find(({ id }) => id === "stellar.profile-export").status, BOT_EVIDENCE_STATUSES.DO_NOT_USE);
const stellarWebSocket = stellar.integrationModes.find(({ mode }) => mode === BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_LOCAL_INTERFACE);
equal(stellarWebSocket.availability, BOT_EVIDENCE_STATUSES.VERIFIED_SUPPORTED);
equal(stellarWebSocket.readOnlyPossible, false, "documented Stellar WebSocket is input-oriented, not a read/status output");
equal(stellarWebSocket.recommendationStatus, BOT_DISCOVERY_RECOMMENDATION_STATUSES.NOT_RECOMMENDED);
const stellarFile = stellar.integrationModes.find(({ mode }) => mode === BOT_DISCOVERY_INTEGRATION_MODES.OWNER_FILE_IMPORT);
equal(stellarFile.recommendationStatus, BOT_DISCOVERY_RECOMMENDATION_STATUSES.OFFLINE_CANDIDATE);
equal(stellarFile.readOnlyPossible, true);
equal(stellarFile.taskControlAvailable, false);
equal(stellarFile.secretsRequired, false);

const pilot = recommendFirstBotPilot();
equal(pilot.readiness, BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET);
equal(pilot.livePilotRecommended, false);
equal(pilot.requiresSeparateAuthorization, true);
equal(pilot.live, false);
equal(pilot.networkAccess, false);
equal(pilot.provider, null);
equal(pilot.integrationMode, null);
equal(pilot.offlineCandidate.provider, BOT_PROVIDER_KEYS.STELLAR);
equal(pilot.offlineCandidate.integrationMode, BOT_DISCOVERY_INTEGRATION_MODES.OWNER_FILE_IMPORT);
ok(pilot.prerequisites.includes("SECRET_AND_PII_SANITIZER"));
ok(pilot.prerequisites.includes("NO_BOT_NETWORK_OR_TASK_CONTROL"));

const hayhaReadiness = calculateBotPilotReadiness(hayha);
equal(hayhaReadiness.readiness, BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET);
equal(hayhaReadiness.eligibleForSeparateAuthorization, false);
equal(hayhaReadiness.live, false);
equal(hayhaReadiness.networkAccess, false);

const stellarReadiness = calculateBotPilotReadiness(stellar);
equal(stellarReadiness.readiness, BOT_PILOT_READINESS.OFFLINE_REVIEW_CANDIDATE);
equal(stellarReadiness.offlineCandidateMode, BOT_DISCOVERY_INTEGRATION_MODES.OWNER_FILE_IMPORT);
equal(stellarReadiness.eligibleForSeparateAuthorization, false);

const syntheticReadCandidate = structuredClone(hayha);
const syntheticOfficialApi = syntheticReadCandidate.integrationModes.find(({ mode }) => mode === BOT_DISCOVERY_INTEGRATION_MODES.OFFICIAL_API);
Object.assign(syntheticOfficialApi, {
  availability: BOT_EVIDENCE_STATUSES.VERIFIED_SUPPORTED,
  readOnlyPossible: true,
  statusHistoryAvailable: true,
  taskControlAvailable: false,
  secretsRequired: false,
  securityRisks: [],
  recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.PROVIDER_CONFIRMATION_REQUIRED,
});
const eligibleReadiness = calculateBotPilotReadiness(syntheticReadCandidate);
equal(eligibleReadiness.readiness, BOT_PILOT_READINESS.ELIGIBLE_FOR_SEPARATE_AUTHORIZATION);
equal(eligibleReadiness.eligibleForSeparateAuthorization, true);
equal(eligibleReadiness.liveCandidateMode, BOT_DISCOVERY_INTEGRATION_MODES.OFFICIAL_API);
equal(eligibleReadiness.livePilotRecommended, false, "even complete synthetic evidence cannot authorize execution");
equal(eligibleReadiness.requiresSeparateAuthorization, true);
equal(eligibleReadiness.live, false);
equal(eligibleReadiness.networkAccess, false);

syntheticOfficialApi.taskControlAvailable = true;
const controlReadiness = calculateBotPilotReadiness(syntheticReadCandidate);
equal(controlReadiness.eligibleForSeparateAuthorization, false, "read evidence cannot silently imply control authority");
equal(controlReadiness.readiness, BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET);

const malformedReadiness = calculateBotPilotReadiness({
  provider: BOT_PROVIDER_KEYS.HAYHA,
  integrationModes: [{
    mode: BOT_DISCOVERY_INTEGRATION_MODES.UNSUPPORTED_PRIVATE_API,
    availability: BOT_EVIDENCE_STATUSES.VERIFIED_SUPPORTED,
    readOnlyPossible: true,
    statusHistoryAvailable: true,
    taskControlAvailable: false,
    secretsRequired: false,
    securityRisks: [],
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.PROVIDER_CONFIRMATION_REQUIRED,
  }],
});
equal(malformedReadiness.eligibleForSeparateAuthorization, false, "a private interface cannot qualify despite forged positive fields");
equal(malformedReadiness.readiness, BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET);

const normalized = normalizeBotProviderEvidence({
  id: "stellar.synthetic-evidence",
  provider: BOT_PROVIDER_KEYS.STELLAR,
  capability: BOT_DISCOVERY_CAPABILITIES.READ_STATUS,
  status: BOT_EVIDENCE_STATUSES.UNKNOWN,
  evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_DOCUMENTATION_REVIEW,
  sourceTitle: "StellarAIO official guides",
  sourceUrl: "https://guides.stellaraio.com/stellar",
  sourceDate: null,
  sourceVersion: "Review fixture",
  verifiedAt: "2026-08-31T00:00:00.000Z",
  summary: "No public status contract was located in the reviewed guide fixture.",
  notes: null,
  requiresOwnerAction: true,
});
equal(normalized.provider, BOT_PROVIDER_KEYS.STELLAR);
equal(normalized.capability, BOT_DISCOVERY_CAPABILITIES.READ_STATUS);
equal(normalized.integrationMode, null);
equal(Object.isFrozen(normalized), true);

throws(
  () => normalizeBotProviderEvidence({ ...normalized, sourceUrl: "https://example.test/guide" }),
  (error) => error.code === "UNTRUSTED_SOURCE",
  "non-provider sources are not normalized as official evidence",
);
throws(
  () => normalizeBotProviderEvidence({ ...normalized, apiToken: "synthetic-forbidden" }),
  (error) => ["SECRET_FIELD_REJECTED", "UNKNOWN_FIELD"].includes(error.code),
  "secret fields are rejected",
);
throws(
  () => normalizeBotProviderEvidence({ ...normalized, sourceText: "copied documentation" }),
  (error) => error.code === "UNKNOWN_FIELD",
  "copied source text has no evidence field",
);
throws(
  () => normalizeBotProviderEvidence({ ...normalized, capability: null, integrationMode: null }),
  (error) => error.code === "MISSING_SUBJECT",
);
throws(
  () => normalizeBotProviderEvidence({ ...normalized, status: "SUPPORTED_BECAUSE_HTTP" }),
  (error) => error.code === "INVALID_ENUM",
);
throws(
  () => normalizeBotProviderEvidence({ ...normalized, provider: BOT_PROVIDER_KEYS.MOCK }),
  (error) => error.code === "INVALID_ENUM",
  "test mock is not presented as provider research",
);
throws(
  () => normalizeBotProviderEvidence({ ...normalized, sourceUrl: "https://user:pass@guides.stellaraio.com/stellar" }),
  (error) => ["CREDENTIAL_TEXT_REJECTED", "UNTRUSTED_SOURCE"].includes(error.code),
  "credential-bearing source URLs are rejected",
);

const clone = getBotProviderDiscovery(BOT_PROVIDER_KEYS.STELLAR);
clone.recommendation = "mutated in test";
clone.capabilities.READ_TASKS.enabled = true;
equal(getBotProviderDiscovery(BOT_PROVIDER_KEYS.STELLAR).recommendation === "mutated in test", false);
equal(getBotProviderDiscovery(BOT_PROVIDER_KEYS.STELLAR).capabilities.READ_TASKS.enabled, false);
const pilotClone = recommendFirstBotPilot();
pilotClone.livePilotRecommended = true;
equal(recommendFirstBotPilot().livePilotRecommended, false);

console.log(`Code 3 Bot Operations provider discovery: ${assertions} assertions passed.`);
