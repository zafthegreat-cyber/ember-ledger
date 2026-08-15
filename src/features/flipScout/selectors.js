import { calculateSaleResults, nonNegative, safeNumber } from "./calculations.js";
import { soldQuantityForInventory } from "./inventory.js";

export function formatCurrency(value, options = {}) {
  const parsed = safeNumber(value, 0);
  if (options.emptyWhenZero && parsed === 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parsed);
}

export function formatPercent(value, options = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const decimal = Number(value);
  if (options.inputIsPercent) return `${decimal.toFixed(1)}%`;
  return `${(decimal * 100).toFixed(1)}%`;
}

export function daysUntil(value, now = new Date()) {
  const timestamp = new Date(value || "").getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.ceil((timestamp - now.getTime()) / 86400000);
}

export function timingIndicator(value, kind = "ending", now = new Date()) {
  const days = daysUntil(value, now);
  if (days === null) return null;
  if (days < 0) return { tone: "muted", label: kind === "pickup" ? "Pickup deadline passed" : "Ended" };
  if (days === 0) return { tone: "danger", label: kind === "pickup" ? "Pickup due today" : "Ending today" };
  if (days <= (kind === "pickup" ? 2 : 1)) return { tone: "warning", label: kind === "pickup" ? `Pickup in ${days}d` : `Ending in ${days}d` };
  return { tone: "calm", label: kind === "pickup" ? `Pickup in ${days}d` : `Ends in ${days}d` };
}

const riskRank = { low: 1, medium: 2, high: 3, unknown: 4 };
const confidenceRank = { high: 3, medium: 2, low: 1 };

export function sortFlipScoutRecords(records = [], sort = "newest") {
  return [...records].sort((a, b) => {
    if (sort === "ending_soon") {
      const aTime = new Date(a.auctionEndTime || a.endDateTime || "9999-12-31").getTime();
      const bTime = new Date(b.auctionEndTime || b.endDateTime || "9999-12-31").getTime();
      return aTime - bTime;
    }
    if (sort === "highest_profit") return safeNumber(b.projectedProfit ?? b.expectedProfit) - safeNumber(a.projectedProfit ?? a.expectedProfit);
    if (sort === "highest_roi") return safeNumber(b.projectedRoi ?? b.expectedRoi) - safeNumber(a.projectedRoi ?? a.expectedRoi);
    if (sort === "lowest_risk") return (riskRank[String(a.riskLevel || "unknown").toLowerCase()] || 4) - (riskRank[String(b.riskLevel || "unknown").toLowerCase()] || 4);
    if (sort === "highest_confidence") return (confidenceRank[String(b.confidence || "low").toLowerCase()] || 0) - (confidenceRank[String(a.confidence || "low").toLowerCase()] || 0);
    return new Date(b.dateDiscovered || b.createdAt || 0).getTime() - new Date(a.dateDiscovered || a.createdAt || 0).getTime();
  });
}

export function getActualVsProjectedRows(state = {}, now = new Date()) {
  const sales = Array.isArray(state.sales) ? state.sales : [];
  return (state.inventory || []).map((item) => {
    const itemSales = sales.filter((sale) => sale.inventoryItemId === item.id && String(sale.status || "").toLowerCase() === "completed");
    const actualSalesProceeds = itemSales.reduce((total, sale) => total + safeNumber(sale.netProceeds ?? calculateSaleResults(sale).netProceeds), 0);
    const actualProfit = itemSales.reduce((total, sale) => total + safeNumber(sale.realizedProfit ?? calculateSaleResults(sale).realizedProfit), 0);
    const actualCosts = itemSales.reduce((total, sale) => total + nonNegative(sale.allocatedCostOfGoodsSold) + nonNegative(sale.actualOutboundShipping) + nonNegative(sale.packaging) + nonNegative(sale.sellingFees) + nonNegative(sale.paymentFees) + nonNegative(sale.otherCosts), 0);
    const projectedProfit = safeNumber(item.originalProjectedProfit ?? item.projectedProfit);
    const projectedRoiInput = safeNumber(item.originalProjectedRoi ?? item.projectedRoi);
    const projectedRoi = Math.abs(projectedRoiInput) > 1 ? projectedRoiInput / 100 : projectedRoiInput;
    const actualPurchasePrice = safeNumber(item.actualPurchasePrice ?? item.allocatedItemCost ?? item.totalPurchaseCost);
    const lastSaleDate = itemSales.map((sale) => new Date(sale.saleDate || sale.createdAt || 0)).sort((a, b) => b - a)[0];
    const purchaseDate = new Date(item.purchaseDate || item.createdAt || now);
    const daysToSell = lastSaleDate && Number.isFinite(lastSaleDate.getTime()) && Number.isFinite(purchaseDate.getTime())
      ? Math.max(0, Math.ceil((lastSaleDate.getTime() - purchaseDate.getTime()) / 86400000))
      : null;
    const realizedRoi = actualPurchasePrice > 0 ? actualProfit / actualPurchasePrice : null;
    return {
      ...item,
      originalProjectedResaleLow: safeNumber(item.originalProjectedResaleLow ?? item.projectedResaleLow),
      originalProjectedResaleMid: safeNumber(item.originalProjectedResaleMid ?? item.projectedResaleMid),
      originalProjectedResaleHigh: safeNumber(item.originalProjectedResaleHigh ?? item.projectedResaleHigh),
      projectedProfit,
      projectedRoi,
      recommendedMaximumPurchasePrice: safeNumber(item.recommendedMaximumPurchasePrice),
      actualPurchasePrice,
      actualSalesProceeds,
      actualCosts,
      actualProfit,
      realizedRoi,
      profitDifference: actualProfit - projectedProfit,
      roiDifference: realizedRoi === null ? null : realizedRoi - projectedRoi,
      daysToSell,
      soldQuantity: soldQuantityForInventory(item.id, sales),
    };
  });
}

export function getDashboardSummary(state = {}, now = new Date()) {
  const deals = state.deals || [];
  const providerListings = state.providerListings || [];
  const auctions = state.auctions || [];
  const inventory = state.inventory || [];
  const sales = state.sales || [];
  const expenses = state.expenses || [];
  const openAuctions = auctions.filter((auction) => {
    const end = new Date(auction.endDateTime || "").getTime();
    return (!end || end >= now.getTime()) && !["won", "lost", "cancelled"].includes(String(auction.outcome || "").toLowerCase());
  });
  const completedSales = sales.filter((sale) => String(sale.status || "").toLowerCase() === "completed");
  const inventoryCost = inventory.reduce((total, item) => {
    const quantity = Math.max(1, nonNegative(item.quantity || 1));
    const available = Math.max(0, quantity - soldQuantityForInventory(item.id, sales));
    const allocatedRecordCost = nonNegative(item.allocatedItemCost || item.totalPurchaseCost);
    return total + allocatedRecordCost * (available / quantity);
  }, 0);
  const projectedInventoryValue = inventory.reduce((total, item) => {
    const available = Math.max(0, nonNegative(item.quantity) - soldQuantityForInventory(item.id, sales));
    return total + nonNegative(item.projectedResaleMid) * available;
  }, 0);
  const realizedSalesRevenue = completedSales.reduce((total, sale) => total + nonNegative(sale.grossSalePrice), 0);
  const realizedProfit = completedSales.reduce((total, sale) => total + safeNumber(sale.realizedProfit ?? calculateSaleResults(sale).realizedProfit), 0);
  const expenseTotal = expenses.reduce((total, expense) => total + nonNegative(expense.amount) * Math.min(1, nonNegative(expense.businessPercentage || 100) / 100), 0);
  const agingCount = inventory.filter((item) => {
    if (soldQuantityForInventory(item.id, sales) >= nonNegative(item.quantity)) return false;
    const purchased = new Date(item.purchaseDate || item.createdAt || "").getTime();
    return Number.isFinite(purchased) && (now.getTime() - purchased) / 86400000 >= 90;
  }).length;
  return {
    awaitingReview: deals.filter((deal) => ["new", "needs review"].includes(String(deal.status || "").toLowerCase())).length
      + providerListings.filter((listing) => ["Pending Review", "Needs Re-review"].includes(listing.reviewStatus)).length,
    strongDeals: deals.filter((deal) => String(deal.status || "").toLowerCase() === "strong deal").length,
    watchedListings: deals.filter((deal) => String(deal.status || "").toLowerCase() === "watching").length,
    activeAuctions: openAuctions.length,
    endingSoon: openAuctions.filter((auction) => {
      const days = daysUntil(auction.endDateTime, now);
      return days !== null && days >= 0 && days <= 1;
    }).length,
    itemsPurchased: (state.purchases || []).length,
    inventoryCost,
    projectedInventoryValue,
    realizedSalesRevenue,
    realizedProfit,
    expenseTotal,
    agingCount,
  };
}
