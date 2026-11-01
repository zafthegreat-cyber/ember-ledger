import { getPortfolioItemValuation, portfolioNumber } from "./collectionPortfolio.mjs";

function collectionItemValuation(item = {}) {
  const normalized = { ...item, quantity: item.quantity ?? item.qty ?? item.ownedQuantity ?? item.quantityOwned };
  const saved = getPortfolioItemValuation(normalized);
  if (saved.value !== null) return saved;
  const manual = [item.currentValue, item.estimatedValue, item.manualValue].map(portfolioNumber).find(value => value !== null);
  return manual === undefined ? saved : getPortfolioItemValuation({ ...normalized, marketPrice: manual });
}

export function collectionItemKnownValue(item = {}) {
  return collectionItemValuation(item).value ?? 0;
}

/** Dashboard coverage: listed copies remain owned; wishlist budgets stay separate. */
export function summarizeCollectionPortfolio({ owned = [], cards = [], sealed = [], wishlist = [], statusFor = item => item.vaultStatus || item.status } = {}) {
  const cardItems = new Set(cards);
  const sealedItems = new Set(sealed);
  const groups = ["Cards", "Sealed", "Other"].map(label => ({ label, quantity: 0, pricedQuantity: 0, value: 0 }));
  let listedQuantity = 0;
  for (const item of owned) {
    const valuation = collectionItemValuation(item);
    const quantity = valuation.quantity;
    const value = valuation.value ?? 0;
    const group = groups[cardItems.has(item) ? 0 : sealedItems.has(item) ? 1 : 2];
    group.quantity += quantity;
    group.value += value;
    if (valuation.value !== null) group.pricedQuantity += quantity;
    if (statusFor(item) === "listed") listedQuantity += quantity;
  }
  const ownedQuantity = groups.reduce((sum, group) => sum + group.quantity, 0);
  const pricedQuantity = groups.reduce((sum, group) => sum + group.pricedQuantity, 0);
  return {
    groups,
    ownedQuantity,
    pricedQuantity,
    unpricedQuantity: ownedQuantity - pricedQuantity,
    listedQuantity,
    wantedQuantity: wishlist.reduce((sum, item) => sum + collectionItemValuation(item).quantity, 0),
    totalKnownValue: groups.reduce((sum, group) => sum + group.value, 0),
  };
}
