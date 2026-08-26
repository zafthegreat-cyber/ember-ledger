import { RECORD_STATUS } from "./constants.js";
import { AccountOpsValidationError } from "./validators.js";

const PRESETS = [
  ["best-buy", "Best Buy", "https://www.bestbuy.com/"],
  ["target", "Target", "https://www.target.com/"],
  ["walmart", "Walmart", "https://www.walmart.com/"],
  ["pokemon-center", "Pokémon Center", "https://www.pokemoncenter.com/"],
  ["gamestop", "GameStop", "https://www.gamestop.com/"],
  ["barnes-noble", "Barnes & Noble", "https://www.barnesandnoble.com/"],
  ["costco", "Costco", "https://www.costco.com/"],
  ["sams-club", "Sam's Club", "https://www.samsclub.com/"],
].map(([slug, displayName, website]) => Object.freeze({
  id: `retailer-preset:${slug}`,
  displayName,
  website,
  signupUrl: null,
  accountUrl: null,
  orderHistoryUrl: null,
  notes: "Owner-assisted metadata only. Account rules and direct signup URLs have not been asserted by Code 3.",
  iconMetadata: {},
  capabilities: ["MANUAL_OWNER_ASSISTED_SETUP"],
  accountRulesMetadata: {},
  automatedProvisioningSupported: false,
  custom: false,
  status: RECORD_STATUS.ACTIVE,
  recordVersion: 1,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
}));

export const ACCOUNT_OPS_RETAILER_PRESETS = Object.freeze(PRESETS);
export const ACCOUNT_OPS_RETAILER_PRESET_IDS = Object.freeze(new Set(PRESETS.map((retailer) => retailer.id)));

export function isRetailerPresetId(value) {
  return typeof value === "string" && value.startsWith("retailer-preset:");
}

export function retailerDirectory(customRetailers = [], { includeArchived = false } = {}) {
  const custom = Array.isArray(customRetailers) ? customRetailers : [];
  return [...ACCOUNT_OPS_RETAILER_PRESETS, ...custom]
    .filter((retailer) => includeArchived || retailer.status !== RECORD_STATUS.ARCHIVED)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function getRetailerById(retailerId, customRetailers = []) {
  return retailerDirectory(customRetailers, { includeArchived: true }).find((retailer) => retailer.id === retailerId) || null;
}

export function retailerSetupUrl(retailer) {
  if (!retailer) throw new AccountOpsValidationError("RETAILER_REQUIRED", "Choose a retailer before starting setup.");
  const candidate = retailer.signupUrl || retailer.website;
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") throw new Error("HTTPS required");
    return parsed.toString();
  } catch {
    throw new AccountOpsValidationError("UNSAFE_RETAILER_URL", "The retailer setup link must be a valid HTTPS URL.");
  }
}
