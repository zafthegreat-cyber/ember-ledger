import {
  BOT_CAPABILITIES,
  BOT_INTEGRATION_MODES,
  BOT_PROVIDER_CONNECTION_STATUS,
  BOT_PROVIDER_KEYS,
} from "./constants.js";

const DISABLED_CAPABILITIES = Object.freeze(Object.fromEntries(Object.values(BOT_CAPABILITIES).map((key) => [key, false])));

function providerDefinition(providerKey, displayName) {
  return Object.freeze({
    providerKey,
    displayName,
    connectionStatus: BOT_PROVIDER_CONNECTION_STATUS.NOT_CONFIGURED,
    supportedIntegrationModes: Object.freeze([]),
    potentialIntegrationModes: Object.freeze([
      BOT_INTEGRATION_MODES.OFFICIAL_API,
      BOT_INTEGRATION_MODES.LOCAL_COMPANION,
      BOT_INTEGRATION_MODES.EXPORTED_DATA,
      BOT_INTEGRATION_MODES.WEBHOOK_EVENT,
      BOT_INTEGRATION_MODES.OWNER_APPROVED_LOCAL_AUTOMATION,
    ]),
    capabilities: DISABLED_CAPABILITIES,
    supportedRetailers: Object.freeze([]),
    supportedRetailersVerified: false,
    version: null,
    configurationReady: false,
    live: false,
    networkAccess: false,
    warnings: Object.freeze([
      "PROVIDER_NOT_CONFIGURED",
      "CAPABILITIES_UNVERIFIED",
      "LIVE_ADAPTER_NOT_IMPLEMENTED",
    ]),
  });
}

export const BOT_PROVIDER_REGISTRY = Object.freeze({
  [BOT_PROVIDER_KEYS.HAYHA]: providerDefinition(BOT_PROVIDER_KEYS.HAYHA, "Hayha"),
  [BOT_PROVIDER_KEYS.STELLAR]: providerDefinition(BOT_PROVIDER_KEYS.STELLAR, "Stellar"),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function listBotProviders() {
  return Object.values(BOT_PROVIDER_REGISTRY).map(clone);
}

export function getBotProvider(providerKey) {
  const provider = BOT_PROVIDER_REGISTRY[String(providerKey || "").toUpperCase()];
  return provider ? clone(provider) : null;
}

export function listAvailableBotProviders() {
  return [];
}

export const BOT_PROVIDER_FOUNDATION_STATUS = Object.freeze({
  providerCount: Object.keys(BOT_PROVIDER_REGISTRY).length,
  configuredProviderCount: 0,
  liveCapabilityCount: 0,
  liveTaskCount: 0,
  providerNetworkAccess: false,
});
