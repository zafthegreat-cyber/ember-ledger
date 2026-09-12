import { assertAnalysisInputHasNoAuthorityFields } from "../analysisHistory.js";

export const EBAY_EVIDENCE_ADAPTER_VERSION = "code3.ebay-active-listing-evidence.v1";

function cleanText(value, maximum = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}
function cleanNumber(value) {
  if (value === "" || value == null) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function decimalMoneyToMinor(value) {
  if (value === "" || value == null) return { amountMinor: null, error: null };
  const text = typeof value === "number" ? String(value) : String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) {
    return { amountMinor: null, error: "Provider money was not an exact non-negative value with at most two decimal places." };
  }
  const [whole, fraction = ""] = text.split(".");
  const amountMinor = (Number(whole) * 100) + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountMinor)) {
    return { amountMinor: null, error: "Provider money exceeded the safe integer range." };
  }
  return { amountMinor, error: null };
}

function providerObservation(type, value, sourceId, confidence = "MEDIUM") {
  return {
    observationType: type,
    value,
    provenance: {
      kind: "PROVIDER_SUPPLIED",
      providerId: "ebay",
      sourceId,
      independenceKey: sourceId,
    },
    confidence,
  };
}

function providerMoney(kind, value, currency, warnings) {
  const parsed = decimalMoneyToMinor(value);
  if (parsed.error) {
    warnings.push({ code: `INVALID_${kind}`, message: parsed.error });
    return null;
  }
  if (parsed.amountMinor == null) return null;
  if (!/^[A-Z]{3}$/.test(currency)) {
    warnings.push({ code: `MISSING_${kind}_CURRENCY`, message: "Provider money was present without a valid currency." });
    return null;
  }
  return { minorUnits: parsed.amountMinor, currency };
}

function activeListingEvidence(priceRole, amount, shipping, sourceId, observedAt) {
  if (!amount) return null;
  return {
    evidenceId: `${sourceId}:${priceRole.toLowerCase()}`,
    type: "ACTIVE_LISTING",
    priceRole,
    amount,
    shipping,
    observedAt,
    sourceId,
    underlyingSourceId: sourceId,
    sourceQuality: "MEDIUM",
    included: true,
    verifiedCompletedSale: false,
    provenance: {
      kind: "PROVIDER_SUPPLIED",
      providerId: "ebay",
      sourceId,
      independenceKey: sourceId,
    },
    notes: "Official eBay Browse active-listing evidence; not a completed sale.",
  };
}

/**
 * Normalize only fields supplied by the existing official Browse connector.
 * These snapshots are active/expired asking evidence, never completed sales.
 */
export function normalizeEbayActiveListingEvidence(listing = {}, options = {}) {
  assertAnalysisInputHasNoAuthorityFields(listing);
  assertAnalysisInputHasNoAuthorityFields(options);

  const externalListingId = cleanText(listing.externalListingId || listing.legacyListingId, 200);
  const sourceId = externalListingId ? `ebay:${externalListingId}` : `ebay:unidentified:${cleanText(listing.id, 200) || "listing"}`;
  const observedAtValue = cleanText(options.observedAt || listing.lastCheckedAt || listing.firstSeenAt, 60);
  const observedAt = Number.isFinite(Date.parse(observedAtValue)) ? new Date(observedAtValue).toISOString() : null;
  const currency = cleanText(listing.priceCurrency, 8).toUpperCase();
  const warnings = [];
  const observations = [];

  const fields = [
    ["LISTING_TITLE", cleanText(listing.title, 300)],
    ["LISTING_DESCRIPTION", cleanText(listing.description, 4_000)],
    ["PROVIDER_CONDITION_LABEL", cleanText(listing.condition, 120)],
    ["PRODUCT_CLASSIFICATION", cleanText(listing.productClassification, 120)],
    ["LISTING_FORMAT", cleanText(listing.listingType, 80)],
    ["SELLER_NAME", cleanText(listing.sellerName, 200)],
    ["LOCATION", cleanText(listing.location, 500)],
    ["LISTING_CREATED_AT", cleanText(listing.listingCreatedAt || listing.listingOriginTime, 60)],
    ["LISTING_ENDS_AT", cleanText(listing.auctionEndTime, 60)],
  ];
  fields.forEach(([type, value]) => {
    if (value) observations.push(providerObservation(type, value, sourceId));
  });

  const sellerRating = cleanNumber(listing.sellerRating);
  const sellerFeedbackScore = cleanNumber(listing.sellerFeedbackScore);
  const bidCount = cleanNumber(listing.numberOfBids);
  if (sellerRating != null) observations.push(providerObservation("SELLER_RATING", sellerRating, sourceId));
  if (sellerFeedbackScore != null) observations.push(providerObservation("SELLER_FEEDBACK_SCORE", sellerFeedbackScore, sourceId));
  if (bidCount != null) observations.push(providerObservation("BID_COUNT", bidCount, sourceId));

  const askingPrice = providerMoney("ACTIVE_ASKING_PRICE", listing.askingPrice, currency, warnings);
  const currentBid = providerMoney("ACTIVE_CURRENT_BID", listing.currentBid, currency, warnings);
  const shipping = providerMoney("PROVIDER_SHIPPING_QUOTE", listing.purchaseShipping, currency, warnings);
  const activePriceEvidence = [
    activeListingEvidence("ASKING_PRICE", askingPrice, shipping, sourceId, observedAt),
    activeListingEvidence("CURRENT_BID", currentBid, shipping, sourceId, observedAt),
  ].filter(Boolean);
  const imageReferences = Array.isArray(listing.imageReferences)
    ? [...new Set(listing.imageReferences.map((entry) => cleanText(entry, 2_000)).filter(Boolean))]
    : [];
  const expired = listing.isExpired === true || cleanText(listing.providerState, 80).toUpperCase() === "EXPIRED";

  if (!externalListingId) warnings.push({ code: "MISSING_EXTERNAL_LISTING_ID", message: "The provider listing identity is incomplete." });
  if (!observedAt) warnings.push({ code: "MISSING_OBSERVED_AT", message: "The provider snapshot time is unavailable." });
  if (!activePriceEvidence.length) warnings.push({ code: "NO_PROVIDER_PRICE", message: "The provider did not supply a usable price observation." });

  return Object.freeze({
    adapterVersion: EBAY_EVIDENCE_ADAPTER_VERSION,
    providerId: "ebay",
    sourceId,
    sourceKind: "ACTIVE_LISTING_SNAPSHOT",
    listingState: expired ? "EXPIRED" : "ACTIVE",
    observedAt,
    externalIdentity: {
      externalListingId: externalListingId || null,
      listingUrl: cleanText(listing.originalListingUrl || listing.listingUrl, 2_000) || null,
      marketplace: "eBay",
    },
    observations,
    imageReferences: imageReferences.map((url) => ({
      url,
      provenance: { kind: "PROVIDER_SUPPLIED", providerId: "ebay", sourceId, independenceKey: sourceId },
      imageAnalysisPerformed: false,
    })),
    valuationEvidence: {
      activeListings: activePriceEvidence,
      soldComparables: [],
      referencePrices: [],
    },
    coverage: {
      activeListingEvidence: activePriceEvidence.length > 0,
      completedSaleEvidence: false,
      soldComparableProviderConfigured: false,
    },
    warnings,
    limitations: [
      "This is eBay Browse active-listing evidence, not a completed sale or market value.",
      "Provider images are references only; this adapter did not infer condition from them.",
      "Missing provider fields remain missing and are not fabricated.",
    ],
  });
}
