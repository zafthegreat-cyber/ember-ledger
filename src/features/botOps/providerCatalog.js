import { BOT_PROVIDER_KEYS } from "./constants.js";

export const BOT_PROVIDER_REVIEWED_AT = "2026-10-17T00:00:00.000Z";

const AVAILABLE_NOW = "Save and edit a local installation label, with an optional device name and version, on this device. Live status and task control are unavailable.";

function catalogEntry(providerKey, displayName, officialUrl, summary, nextStep, officialSourceHosts, sourcePathPrefixes = {}) {
  return Object.freeze({
    providerKey,
    displayName,
    officialSourceHosts: Object.freeze(officialSourceHosts),
    sourcePathPrefixes: Object.freeze(sourcePathPrefixes),
    setup: Object.freeze({ summary, availableNow: AVAILABLE_NOW, nextStep, officialUrl, reviewedAt: BOT_PROVIDER_REVIEWED_AT }),
  });
}

// This catalog describes reviewed products and local organization only. It
// neither imports discovery/registry modules nor grants provider capabilities.
export const BOT_PROVIDER_CATALOG = Object.freeze({
  [BOT_PROVIDER_KEYS.HAYHA]: catalogEntry(
    BOT_PROVIDER_KEYS.HAYHA, "Hayha", "https://www.hayhabots.com/",
    "Organize your Hayha setup. Its public guides describe desktop controls and Discord notifications, without a verified Code 3 connection.",
    "Ask Hayha support for a supported read-only status or order export format. Account-session exports contain login material and are not accepted.",
    ["hayhabots.com", "www.hayhabots.com", "docs.hayhabots.com", "hayha-bots.gitbook.io"],
  ),
  [BOT_PROVIDER_KEYS.STELLAR]: catalogEntry(
    BOT_PROVIDER_KEYS.STELLAR, "Stellar", "https://guides.stellaraio.com/stellar",
    "Organize your Stellar setup. Task-group file export is documented; the existing JSON preview does not connect to Stellar or create tasks.",
    "Use only a sanitized task export for offline preview. Confirm its format and version with Stellar before expecting native import or sync.",
    ["stellaraio.com", "www.stellaraio.com", "guides.stellaraio.com"],
  ),
  [BOT_PROVIDER_KEYS.SHIKARI]: catalogEntry(
    BOT_PROVIDER_KEYS.SHIKARI, "Shikari", "https://shikari.tech/",
    "Organize your Shikari setup. Public support directs members to its own support channels; no Code 3 connection is verified.",
    "Ask Shikari support for supported status, order export, or integration documentation before sharing any files or credentials.",
    ["shikari.tech", "www.shikari.tech"],
  ),
  [BOT_PROVIDER_KEYS.VALOR]: catalogEntry(
    BOT_PROVIDER_KEYS.VALOR, "Valor", "https://docs.valoraio.com/",
    "Organize your Valor setup. Valor documents Discord notifications, but a direct Code 3 event connection is unverified.",
    "Ask Valor for a supported order/status interface. Profile exports and full app backups include sensitive information and are not accepted.",
    ["valoraio.com", "www.valoraio.com", "docs.valoraio.com"],
  ),
  [BOT_PROVIDER_KEYS.REFRACT]: catalogEntry(
    BOT_PROVIDER_KEYS.REFRACT, "Refract", "https://help.refractbot.com/online-dashboard/home",
    "Organize your Refract setup. Its dashboard documents checkout-history CSV export; Code 3 has no verified native CSV importer yet.",
    "Confirm the checkout-history CSV headers, date and currency format before an importer is added. Do not use a full app backup.",
    ["refractbot.com", "www.refractbot.com", "help.refractbot.com"],
  ),
  [BOT_PROVIDER_KEYS.POLAR]: catalogEntry(
    BOT_PROVIDER_KEYS.POLAR, "Polar AIO", "https://whop.com/polar-aio/products/polar-aio/",
    "Organize your Polar AIO retail-bot setup. Its public storefront does not document a Code 3 status or order connection.",
    "Ask Polar AIO support for its supported export or integration documentation. Whop billing APIs are separate from the retail bot.",
    ["whop.com"],
    { "whop.com": "/polar-aio/" },
  ),
  [BOT_PROVIDER_KEYS.SNIPED]: catalogEntry(
    BOT_PROVIDER_KEYS.SNIPED, "Sniped", "https://sniped.gg/",
    "Organize your Sniped retail-bot setup. No public status, order export, or task-control integration is verified.",
    "Ask Sniped support for an approved integration or export guide before a native connection can be implemented.",
    ["sniped.gg", "www.sniped.gg"],
  ),
  [BOT_PROVIDER_KEYS.SWOOPER]: catalogEntry(
    BOT_PROVIDER_KEYS.SWOOPER, "Swooper AIO", "https://swooperhq.com/",
    "Organize your Swooper AIO setup. Its own Discord and iOS alerts do not establish a direct Code 3 connection.",
    "Ask Swooper support for a supported status or order export interface. Keep its app, account information, and private alerts in Swooper.",
    ["swooperhq.com", "www.swooperhq.com"],
  ),
});

export const BOT_REAL_PROVIDER_KEYS = Object.freeze(Object.keys(BOT_PROVIDER_CATALOG));

export function isRegisteredBotProvider(providerKey) {
  return BOT_REAL_PROVIDER_KEYS.includes(String(providerKey || "").toUpperCase());
}
