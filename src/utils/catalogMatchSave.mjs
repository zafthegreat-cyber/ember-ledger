import { catalogMatchIdentityPatch } from './collectionBrowse.mjs';

// This applies only to the reviewed catalog-match workflow. Quote/provider
// fields are never copied out of the long-lived form snapshot.
const EDITABLE_RECORD_FIELDS = [
  'quantity', 'pokemonName', 'condition', 'purchaseId', 'lotId', 'purchaseSource',
  'purchaseDate', 'allocatedItemCost', 'ownedItemPurpose', 'status', 'storageLocation',
  'intendedSalesChannel', 'projectedResaleLow', 'projectedResaleMid', 'projectedResaleHigh',
  'notes', 'tcgGameAssignmentHistory',
];

export function applyReviewedCatalogMatch(current, baseline, submitted) {
  if (!current || !baseline?.id || current.id !== baseline.id || submitted?.id !== baseline.id) {
    throw new Error('The original item is no longer available. Reopen the catalog match before saving.');
  }
  if (current.provenanceManaged === true) {
    throw new Error('This acquisition now requires its original correction workflow. Reopen the item to continue.');
  }
  const identity = catalogMatchIdentityPatch({ ...submitted, id: submitted.catalogProductId });
  const result = { ...current, ...identity };
  for (const field of EDITABLE_RECORD_FIELDS) {
    if (JSON.stringify(submitted[field]) !== JSON.stringify(baseline[field])) result[field] = submitted[field];
  }
  return result;
}
