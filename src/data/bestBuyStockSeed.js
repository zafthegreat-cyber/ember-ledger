export const BEST_BUY_STOCK_STATUSES = [
  "In Stock",
  "Out of Stock",
  "Available for Pickup",
  "Shipping Available",
  "Limited Availability",
  "Unknown",
  "Check Store",
  "Needs Review",
  "Source Reported",
  "Expired",
];

export const BEST_BUY_SOURCE_STATUS = {
  LIVE: "live",
  CACHED: "cached",
  MANUAL: "manual",
  MOCK: "mock",
  UNKNOWN: "unknown",
};

export const BEST_BUY_ALERT_TYPES = [
  "Best Buy product in stock online",
  "Best Buy product available for pickup near you",
  "Favorite Best Buy store has a match",
  "Watchlist item found at Best Buy",
  "Price changed at Best Buy",
  "Stock status changed",
  "New nightly report available",
  "Possible dead stock / still sitting item",
];

export const BEST_BUY_NIGHTLY_DEFAULTS = {
  enabled: true,
  reportTime: "21:00",
  zip: "23435",
  radiusMiles: 25,
  favoriteStoresOnly: false,
  watchlistOnly: false,
  includePriceChanges: true,
  includeDeadStock: true,
  includeSoldOutChanges: true,
  deliveryMethod: "in-app",
};
