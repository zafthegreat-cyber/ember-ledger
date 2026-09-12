import { getEbayHealth, searchEbayListings } from "./ebayClient.js";

export const PROVIDER_STATUSES = {
  AVAILABLE: "Available",
  MANUAL_ONLY: "Manual Import Only",
  NOT_CONFIGURED: "Not Configured",
  AUTHORIZATION_REQUIRED: "Authorization Required",
  UNSUPPORTED: "Unsupported",
};

function unavailable(capabilityStatus, message) {
  return async () => ({ ok: false, capabilityStatus, listings: [], error: message });
}

export function createProvider({ providerId, displayName, capabilityStatus, detail }) {
  return {
    providerId,
    displayName,
    capabilityStatus,
    detail,
    searchListings: unavailable(capabilityStatus, `${displayName} automated search is not configured.`),
    getListing: unavailable(capabilityStatus, `${displayName} listing retrieval is not configured.`),
    normalizeListing: (listing = {}) => ({ ...listing, marketplace: listing.marketplace || displayName }),
    validateConfiguration: async () => ({ valid: capabilityStatus === PROVIDER_STATUSES.AVAILABLE, capabilityStatus }),
    healthCheck: async () => ({ healthy: capabilityStatus === PROVIDER_STATUSES.AVAILABLE, capabilityStatus }),
  };
}

export const FLIP_SCOUT_PROVIDERS = [
  {
    ...createProvider({ providerId: "ebay", displayName: "eBay", capabilityStatus: PROVIDER_STATUSES.NOT_CONFIGURED, detail: "Server configuration and authorization are reported by the live health check." }),
    searchListings: searchEbayListings,
    normalizeListing: (listing = {}) => ({ ...listing, providerId: "ebay", marketplace: "eBay" }),
    validateConfiguration: async () => getEbayHealth({ verify: false }),
    healthCheck: async () => getEbayHealth({ verify: true }),
  },
  createProvider({ providerId: "mercari", displayName: "Mercari", capabilityStatus: PROVIDER_STATUSES.UNSUPPORTED, detail: "Manual listing entry only; no scraping or login automation." }),
  createProvider({ providerId: "poshmark", displayName: "Poshmark", capabilityStatus: PROVIDER_STATUSES.UNSUPPORTED, detail: "Manual listing entry only; no scraping or login automation." }),
  createProvider({ providerId: "whatnot", displayName: "Whatnot", capabilityStatus: PROVIDER_STATUSES.AUTHORIZATION_REQUIRED, detail: "No account authorization is configured." }),
  createProvider({ providerId: "facebook", displayName: "Facebook Marketplace", capabilityStatus: PROVIDER_STATUSES.UNSUPPORTED, detail: "Manual listing entry only; no browser automation." }),
  createProvider({ providerId: "offerup", displayName: "OfferUp", capabilityStatus: PROVIDER_STATUSES.UNSUPPORTED, detail: "Manual listing entry only; no scraping or login automation." }),
  createProvider({ providerId: "auction", displayName: "Auction source", capabilityStatus: PROVIDER_STATUSES.MANUAL_ONLY, detail: "Auction records can be entered or imported manually." }),
  createProvider({ providerId: "manual-url", displayName: "Manual URL", capabilityStatus: PROVIDER_STATUSES.AVAILABLE, detail: "Paste a URL and enter the listing details yourself." }),
  createProvider({ providerId: "screenshot", displayName: "Screenshot/manual entry", capabilityStatus: PROVIDER_STATUSES.MANUAL_ONLY, detail: "Store image references and transcribed details; OCR is not active." }),
  createProvider({ providerId: "email-alert", displayName: "Email alert import", capabilityStatus: PROVIDER_STATUSES.NOT_CONFIGURED, detail: "No email inbox access or background import is active." }),
];

export function getProvider(providerId) {
  return FLIP_SCOUT_PROVIDERS.find((provider) => provider.providerId === providerId) || null;
}
