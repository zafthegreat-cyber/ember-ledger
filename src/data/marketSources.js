export const MARKET_STATUS = {
  LIVE: "live",
  CACHED: "cached",
  MANUAL: "manual",
  MOCK: "mock",
  UNKNOWN: "unknown",
};

export const MARKET_STATUS_LABELS = {
  live: "Live",
  cached: "Cached",
  manual: "Manual",
  mock: "Mock",
  unknown: "Unknown",
};

export const MARKET_SOURCES = [
  {
    key: "pokemon_tcg_api",
    label: "Pokemon TCG API / Scrydex",
    itemTypes: ["card"],
    status: "future",
    notes: "Future card/set sync source. API keys must stay outside frontend if required.",
  },
  {
    key: "tcgdex",
    label: "TCGdex",
    itemTypes: ["card"],
    status: "future",
    notes: "Future card metadata and multilingual structure source.",
  },
  {
    key: "tcgcsv",
    label: "TCGCSV",
    itemTypes: ["card", "sealed"],
    status: "structured",
    notes: "Preferred beta import structure for TCGplayer-style product and price CSV/JSON data.",
  },
  {
    key: "tcgplayer_api",
    label: "TCGplayer API",
    itemTypes: ["card", "sealed"],
    status: "future",
    notes: "Future live provider if developer access is available. Do not expose API keys in frontend.",
  },
  {
    key: "manual",
    label: "Manual / Admin Value",
    itemTypes: ["card", "sealed"],
    status: "enabled",
    notes: "User/admin-entered beta values.",
  },
  {
    key: "cache",
    label: "Local Cache",
    itemTypes: ["card", "sealed"],
    status: "enabled",
    notes: "Previously refreshed or imported values stored in localStorage for beta.",
  },
  {
    key: "mock",
    label: "Mock / Demo",
    itemTypes: ["card", "sealed"],
    status: "enabled",
    notes: "Demo starter values. Never label these as live.",
  },
];

export const PRICE_TYPES = [
  "market",
  "low",
  "mid",
  "high",
  "directLow",
  "buylist",
  "manual",
  "mock",
];
