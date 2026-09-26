import {
  BOT_ATTEMPT_EVENTS,
  BOT_CAPABILITIES,
  BOT_FAILURE_CATEGORIES,
  BOT_PROVIDER_CONNECTION_STATUS,
  BOT_PROVIDER_KEYS,
  BOT_TASK_STATUSES,
} from "./constants.js";
import { assertSafeBotOpsInput, safeBotOpsClone, sanitizeBotProviderMessage } from "./security.js";

const ADAPTER_METHODS = Object.freeze([
  "describe",
  "runtimeHealth",
  "discoverTasks",
  "normalizeEvent",
  "startTask",
  "stopTask",
  "restartTask",
]);

export class BotProviderAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BotProviderAdapterError";
    this.code = code;
    this.details = details;
  }
}

export function assertBotProviderAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") throw new BotProviderAdapterError("INVALID_ADAPTER", "A Bot provider adapter object is required.");
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter[method] !== "function") throw new BotProviderAdapterError("INVALID_ADAPTER", `Bot provider adapter is missing ${method}().`);
  }
  const description = adapter.describe();
  assertSafeBotOpsInput(description);
  if (description.live !== false || description.networkAccess !== false) {
    throw new BotProviderAdapterError("LIVE_ADAPTER_PROHIBITED", "Phase 2D-A adapters must not be live or use provider network access.");
  }
  return adapter;
}

function unavailableAction(action) {
  throw new BotProviderAdapterError(
    "CAPABILITY_UNAVAILABLE",
    `${action} is unavailable because no live bot provider is configured.`,
    { action, externalEffect: false },
  );
}

export function createUnavailableBotAdapter(providerKey) {
  const provider = String(providerKey || "").toUpperCase();
  if (![BOT_PROVIDER_KEYS.HAYHA, BOT_PROVIDER_KEYS.STELLAR].includes(provider)) {
    throw new BotProviderAdapterError("UNKNOWN_PROVIDER", "Only registered bot providers may use the unavailable adapter.");
  }
  const capabilities = Object.freeze(Object.fromEntries(Object.values(BOT_CAPABILITIES).map((key) => [key, false])));
  return Object.freeze(assertBotProviderAdapter({
    describe: () => ({
      provider,
      connectionStatus: BOT_PROVIDER_CONNECTION_STATUS.NOT_CONFIGURED,
      capabilities,
      live: false,
      networkAccess: false,
    }),
    runtimeHealth: async () => ({ state: "DISCONNECTED", provider, live: false, networkAccess: false }),
    discoverTasks: async () => [],
    normalizeEvent: () => unavailableAction("normalizeEvent"),
    startTask: () => unavailableAction("startTask"),
    stopTask: () => unavailableAction("stopTask"),
    restartTask: () => unavailableAction("restartTask"),
  }));
}

const EVENT_FIELDS = new Set([
  "providerEventId", "installationId", "taskId", "retailerId", "occurredAt", "normalizedEvent",
  "runtimeStatus", "success", "failureCategory", "message", "productTargetId", "retailerAccountLinkId",
  "botProfileId", "proxyGroupId", "quantity", "expectedAmount", "externalOrderReference", "confidence", "warnings",
]);

function normalizeMockEvent(input) {
  assertSafeBotOpsInput(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BotProviderAdapterError("INVALID_EVENT", "A normalized synthetic provider event is required.");
  const unknown = Object.keys(input).filter((key) => !EVENT_FIELDS.has(key));
  if (unknown.length) throw new BotProviderAdapterError("UNSUPPORTED_PROVIDER_FIELD", `Unsupported synthetic provider event field: ${unknown[0]}.`);
  const required = ["providerEventId", "installationId", "taskId", "retailerId", "occurredAt"];
  const missing = required.find((key) => !String(input[key] || "").trim());
  if (missing) throw new BotProviderAdapterError("MISSING_PROVIDER_FIELD", `${missing} is required.`, { field: missing });
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new BotProviderAdapterError("INVALID_EVENT_TIME", "occurredAt must be a valid date and time.");
  if (!Object.values(BOT_ATTEMPT_EVENTS).includes(input.normalizedEvent)) throw new BotProviderAdapterError("INVALID_EVENT_TYPE", "normalizedEvent is unsupported.");
  if (!Object.values(BOT_TASK_STATUSES).includes(input.runtimeStatus)) throw new BotProviderAdapterError("INVALID_TASK_STATUS", "runtimeStatus is unsupported.");
  if (!Object.values(BOT_FAILURE_CATEGORIES).includes(input.failureCategory || BOT_FAILURE_CATEGORIES.NONE)) {
    throw new BotProviderAdapterError("INVALID_FAILURE_CATEGORY", "failureCategory is unsupported.");
  }
  return safeBotOpsClone({
    ...input,
    providerEventId: String(input.providerEventId),
    installationId: String(input.installationId),
    taskId: String(input.taskId),
    retailerId: String(input.retailerId),
    occurredAt: new Date(input.occurredAt).toISOString(),
    success: input.success === true,
    failureCategory: input.failureCategory || BOT_FAILURE_CATEGORIES.NONE,
    message: sanitizeBotProviderMessage(input.message, "Synthetic provider status recorded."),
    warnings: Array.isArray(input.warnings) ? [...new Set(input.warnings.map(String))] : [],
  });
}

/** Explicit test-only adapter. It never performs network I/O or controls a bot. */
export function createTestOnlyMockBotAdapter(options = {}) {
  if (options.testMode !== true || options.environment !== "test") {
    throw new BotProviderAdapterError("TEST_ADAPTER_RESTRICTED", "The mock Bot adapter is available only to explicit automated-test fixtures.");
  }
  const supported = new Set(options.capabilities || [BOT_CAPABILITIES.RUNTIME_HEALTH, BOT_CAPABILITIES.TASK_STATUS, BOT_CAPABILITIES.EVENT_HISTORY, BOT_CAPABILITIES.CHECKOUT_EVIDENCE]);
  const capabilities = Object.freeze(Object.fromEntries(Object.values(BOT_CAPABILITIES).map((key) => [key, supported.has(key)])));
  const syntheticTasks = safeBotOpsClone(options.tasks || []);
  const testAction = (action, taskId) => ({ action, taskId: String(taskId || ""), testOnly: true, externalEffect: false });
  return Object.freeze(assertBotProviderAdapter({
    describe: () => ({
      provider: BOT_PROVIDER_KEYS.MOCK,
      connectionStatus: BOT_PROVIDER_CONNECTION_STATUS.CONNECTED,
      capabilities,
      live: false,
      networkAccess: false,
      testOnly: true,
    }),
    runtimeHealth: async () => ({ state: options.healthState || "HEALTHY", provider: BOT_PROVIDER_KEYS.MOCK, live: false, networkAccess: false, testOnly: true }),
    discoverTasks: async () => safeBotOpsClone(syntheticTasks),
    normalizeEvent: normalizeMockEvent,
    startTask: (taskId) => testAction("startTask", taskId),
    stopTask: (taskId) => testAction("stopTask", taskId),
    restartTask: (taskId) => testAction("restartTask", taskId),
  }));
}
