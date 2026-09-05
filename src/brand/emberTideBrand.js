import { BRAND_CONFIG } from "../config/brand.js";

export const EMBER_TIDE_PRODUCT_STANDARD = Object.freeze({
  name: BRAND_CONFIG.applicationDisplayName,
  definition: "Private collecting and business operations application",
  referenceRoute: "Dark Hearth",
  promise: BRAND_CONFIG.tagline,
  brandLine: BRAND_CONFIG.tagline,
});

export const BRAND_ASSETS = Object.freeze({
  mark: BRAND_CONFIG.logoReference,
  logo: BRAND_CONFIG.logoReference,
  appIcon: BRAND_CONFIG.faviconReference,
  loadingMark: BRAND_CONFIG.logoReference,
  promoHero: BRAND_CONFIG.logoReference,
  linkBioHeader: BRAND_CONFIG.logoReference,
  pwaInstallPromo: BRAND_CONFIG.logoReference,
});

export const ROUTE_PRODUCT_STANDARDS = Object.freeze({
  hearth: {
    accent: "ember",
    job: "Short command center",
    nextAction: "Show the next best step before tools or previews.",
  },
  scout: {
    accent: "tide",
    job: "Proof-first local intel",
    nextAction: "Scan proof, add report, or choose watched store.",
  },
  vault: {
    accent: "brass",
    job: "Protected collection storage",
    nextAction: "Add, scan, or manage a collection object.",
  },
  market: {
    accent: "research",
    job: "Manual research",
    nextAction: "Search or compare; never feel like checkout.",
  },
  forge: {
    accent: "ledger",
    job: "Private seller ledger",
    nextAction: "Record, review, or export private business data.",
  },
  spark: {
    accent: "gold",
    job: "Parent-safe giving",
    nextAction: "Build a kid pack, plan support, or review safety.",
  },
  tidepool: {
    accent: "tide",
    job: "Community notes",
    nextAction: "Read or save moderated notes without social-feed pressure.",
  },
  assist: {
    accent: "ember",
    job: "Friendly guide",
    nextAction: "Guide the user without implying a live AI backend.",
  },
  utility: {
    accent: "neutral",
    job: "Calm utility",
    nextAction: "Keep configuration clear, compact, and safe.",
  },
});
