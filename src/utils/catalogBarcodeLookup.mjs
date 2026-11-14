import evidence from "../data/catalogBarcodeEvidence.mjs";
import { resolveInspectionArtwork } from "./productInspection.mjs";
import { identifiersMatch, gtinKey, normalizeBarcodeValue } from "./barcodeIdentity.mjs";

// This overlay only adds reviewed lookup evidence. It never writes to a record,
// replaces its price, or assigns a barcode to a different packaging edition.
export function catalogBarcodeEvidenceForProduct(product = {}) {
  const id = String(product.tcgplayerProductId ?? "").trim();
  const keys = id ? [`tcgplayer:${id}`] : [...new Set([product.catalogProductId, product.id].filter(Boolean).map(value => `catalog:${value}`))];
  const matched = keys.map(key => ({ key, entry: evidence[key] })).filter(row => row.entry);
  if (matched.length !== 1) return null;
  const { key, entry } = matched[0];
  if (!resolveInspectionArtwork(product, { [key]: { name: entry.name, identity: entry.identity } })) return null;
  // A documented old catalog value can coexist with a photographed identifier.
  // It is accepted only as record metadata, never promoted to verified evidence.
  const metadata = (entry.catalogMetadataUpcs || []).filter(row => row.value && row.sourcePage && row.reason);
  const known = [...entry.barcodes, ...(entry.rejectedImportedBarcodes || []), ...metadata];
  for (const current of [product.upc, product.barcode]) {
    if (current && !known.some(row => identifiersMatch(current, row.value))) return null;
  }
  return entry;
}

export function verifiedBarcodeEntriesForProduct(product = {}) {
  return (catalogBarcodeEvidenceForProduct(product)?.barcodes || []).map(row => ({
    identifierType: row.type,
    identifierValue: row.value,
    source: row.sourcePage,
    confidence: "verified",
    isVerified: true,
  }));
}

export function isRejectedImportedBarcode(product, value) {
  return (catalogBarcodeEvidenceForProduct(product)?.rejectedImportedBarcodes || []).some(row => identifiersMatch(row.value, value));
}

// Use only for a new, reviewable draft. Existing stored catalog/owned rows stay intact.
export function reviewedProductBarcode(product = {}, scannedValue = "") {
  const verified = verifiedBarcodeEntriesForProduct(product);
  if (gtinKey(scannedValue) && verified.some(row => identifiersMatch(row.identifierValue, scannedValue))) return normalizeBarcodeValue(scannedValue);
  if (verified.length) return verified[0].identifierValue;
  return [product.barcode, product.upc].find(value => value && !isRejectedImportedBarcode(product, value)) || "";
}
