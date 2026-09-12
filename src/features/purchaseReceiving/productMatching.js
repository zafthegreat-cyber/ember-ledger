import { PRODUCT_MATCH_STATES, PURCHASE_RECEIVING_LIMITS } from "./constants.js";
import { assertSafePurchaseReceivingInput } from "./security.js";

function bounded(value, field, maximum = PURCHASE_RECEIVING_LIMITS.maximumIdentifier) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text || text.length > maximum) throw new Error(`${field} must be a bounded non-empty string.`);
  return text;
}

function normalizedCode(value, field) {
  const text = bounded(value, field);
  return text ? text.toUpperCase().replace(/\s+/g, "") : null;
}

/** Product identity is a reference projection; it never creates or overrides product authority. */
export function normalizeProductIdentity(value = {}) {
  assertSafePurchaseReceivingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Product identity must be an object.");
  return Object.freeze({
    productReference: bounded(value.productReference, "productReference"),
    retailerItemId: normalizedCode(value.retailerItemId ?? value.productId, "retailerItemId"),
    sku: normalizedCode(value.sku, "sku"),
    upc: normalizedCode(value.upc, "upc"),
    gtin: normalizedCode(value.gtin, "gtin"),
    tcin: normalizedCode(value.tcin, "tcin"),
    title: bounded(value.title, "title", PURCHASE_RECEIVING_LIMITS.maximumLabel),
    category: bounded(value.category, "category"),
  });
}

function candidateIdentity(candidate) {
  return normalizeProductIdentity({
    productReference: candidate.productReference ?? candidate.id,
    retailerItemId: candidate.retailerItemId ?? candidate.productId,
    sku: candidate.sku,
    upc: candidate.upc,
    gtin: candidate.gtin,
    tcin: candidate.tcin,
    title: candidate.title ?? candidate.name,
    category: candidate.category ?? candidate.game,
  });
}

function exactEvidence(source, candidate) {
  const evidence = [];
  for (const field of ["productReference", "retailerItemId", "upc", "gtin", "tcin", "sku"]) {
    if (source[field] && candidate[field] && source[field] === candidate[field]) evidence.push(field);
  }
  return evidence;
}

/** Matches only exact identifiers supplied by the caller's existing product catalog; titles never force a match. */
export function matchPurchaseProduct(identityInput, candidates = []) {
  const identity = normalizeProductIdentity(identityInput);
  if (!Array.isArray(candidates)) throw new Error("Product candidates must be an array.");
  const matches = candidates.map((candidate) => {
    const normalized = candidateIdentity(candidate);
    return { candidate, normalized, evidence: exactEvidence(identity, normalized) };
  }).filter((entry) => entry.evidence.length);

  const strongestRank = (entry) => {
    const order = ["productReference", "upc", "gtin", "tcin", "retailerItemId", "sku"];
    return Math.min(...entry.evidence.map((field) => order.indexOf(field)));
  };
  matches.sort((left, right) => strongestRank(left) - strongestRank(right)
    || String(left.normalized.productReference || "").localeCompare(String(right.normalized.productReference || "")));
  if (!matches.length) {
    return Object.freeze({
      status: PRODUCT_MATCH_STATES.UNRESOLVED,
      productReference: null,
      candidates: Object.freeze([]),
      evidence: Object.freeze([]),
      titleOnlyCandidate: Boolean(identity.title),
    });
  }
  const bestRank = strongestRank(matches[0]);
  const strongest = matches.filter((entry) => strongestRank(entry) === bestRank);
  if (strongest.length !== 1) {
    return Object.freeze({
      status: PRODUCT_MATCH_STATES.AMBIGUOUS,
      productReference: null,
      candidates: Object.freeze(strongest.map((entry) => entry.normalized.productReference).filter(Boolean)),
      evidence: Object.freeze([...new Set(strongest.flatMap((entry) => entry.evidence))]),
      titleOnlyCandidate: false,
    });
  }
  return Object.freeze({
    status: PRODUCT_MATCH_STATES.MATCHED,
    productReference: strongest[0].normalized.productReference,
    candidates: Object.freeze([strongest[0].normalized.productReference].filter(Boolean)),
    evidence: Object.freeze(strongest[0].evidence),
    titleOnlyCandidate: false,
  });
}
