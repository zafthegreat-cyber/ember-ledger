import { calculateRestockIntelligence } from "./restockIntelligenceAdapter.js";
import {
  RESTOCK_PREDICTION_OUTCOME,
  VISIT_OUTCOME,
  isConfirmedRestockStatus,
  restockPredictionOutcome,
  restockVisitOutcome,
} from "./restockStatus.js";

const DAY_MS = 86_400_000;

export function asNumber(value) {
  if (value === "" || value == null || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function isEndingSoon(record, now = Date.now(), hours = 24) {
  const end = timestamp(record?.endDateTime || record?.auctionEndTime || record?.endTime);
  return end != null && end >= now && end - now <= hours * 60 * 60 * 1000;
}

export function opportunityFinancials(record = {}) {
  const price = asNumber(record.askingPrice ?? record.currentBid ?? record.purchasePrice);
  const shipping = asNumber(record.purchaseShipping ?? record.shipping) || 0;
  const tax = asNumber(record.estimatedTax ?? record.purchaseTax) || 0;
  const other = [record.buyerPremium, record.fixedBuyerFees, record.travelOrPickupCost, record.preparationCost]
    .map(asNumber)
    .reduce((sum, value) => sum + (value || 0), 0);
  const landedCost = price == null ? null : price + shipping + tax + other;
  const resaleLow = asNumber(record.expectedResaleLow ?? record.estimatedResaleLow);
  const resaleMid = asNumber(record.expectedResaleMidpoint ?? record.expectedResaleMid ?? record.estimatedResaleMid);
  const resaleHigh = asNumber(record.expectedResaleHigh ?? record.estimatedResaleHigh);
  const explicitProfit = asNumber(record.expectedProfitMid ?? record.projectedProfit ?? record.originalProjectedProfit);
  const explicitRoi = asNumber(record.expectedRoiMid ?? record.projectedRoi ?? record.originalProjectedRoi);
  const profit = explicitProfit ?? (resaleMid != null && landedCost != null ? resaleMid - landedCost : null);
  const roi = explicitRoi ?? (profit != null && landedCost > 0 ? profit / landedCost : null);
  return { price, landedCost, resaleLow, resaleMid, resaleHigh, profit, roi };
}

function confidenceRank(value) {
  return { high: 3, medium: 2, low: 1 }[String(value || "").toLowerCase()] || 0;
}

function riskRank(value) {
  return { low: 1, medium: 2, high: 3, unknown: 4 }[String(value || "").toLowerCase()] || 4;
}

export function normalizeOpportunity(record = {}, sourceType = "Manual") {
  const financials = opportunityFinancials(record);
  const endAt = record.endDateTime || record.auctionEndTime || record.endTime || "";
  const rawImage = record.imageUrl || record.images?.[0]?.url || record.images?.[0] || record.imageReferences?.[0] || "";
  const status = record.reviewStatus || record.importStatus || record.status || record.watchStatus || "Needs Review";
  return {
    ...record,
    opportunityId: record.id || `${sourceType}-${record.externalListingId || record.title || "record"}`,
    sourceType,
    sourceLabel: record.marketplace || record.source || sourceType,
    title: record.title || "Untitled opportunity",
    image: typeof rawImage === "string" ? rawImage : rawImage?.url || rawImage?.src || "",
    status,
    reviewed: !/new|needs review|awaiting|review required/i.test(status),
    confidence: record.confidence || "Not rated",
    risk: record.riskLevel || record.risk || "Unknown",
    endAt,
    discoveredAt: record.dateDiscovered || record.createdAt || record.listingCreatedAt || "",
    ...financials,
  };
}

export function buildOpportunityFeed(flipState = {}) {
  const rows = [
    ...(flipState.deals || []).map((row) => normalizeOpportunity(row, row.marketplace || "Manual marketplace import")),
    ...(flipState.auctions || []).map((row) => normalizeOpportunity(row, "Auctions")),
    ...(flipState.providerListings || []).map((row) => normalizeOpportunity(row, row.providerId === "ebay" ? "eBay" : row.providerId || "Import")),
  ];
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${String(row.providerId || row.sourceType).toLowerCase()}::${row.externalListingId || row.id || row.opportunityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterAndSortOpportunities(rows = [], filters = {}, sort = "best") {
  const now = Date.now();
  const filtered = rows.filter((row) => {
    const classification = row.productClassification || row.classification || "Unknown";
    if (filters.source && row.sourceLabel !== filters.source) return false;
    if (filters.productType && classification !== filters.productType) return false;
    if (asNumber(filters.maximumPrice) != null && (row.price == null || row.price > asNumber(filters.maximumPrice))) return false;
    if (asNumber(filters.minimumProfit) != null && (row.profit == null || row.profit < asNumber(filters.minimumProfit))) return false;
    if (asNumber(filters.minimumRoi) != null && (row.roi == null || row.roi < asNumber(filters.minimumRoi) / 100)) return false;
    if (filters.confidence && confidenceRank(row.confidence) < confidenceRank(filters.confidence)) return false;
    if (asNumber(filters.maximumDistance) != null && (asNumber(row.distance) == null || asNumber(row.distance) > asNumber(filters.maximumDistance))) return false;
    if (filters.newlyListed && (!timestamp(row.discoveredAt) || now - timestamp(row.discoveredAt) > DAY_MS)) return false;
    if (filters.endingSoon && !isEndingSoon(row, now)) return false;
    if (filters.reviewed === "reviewed" && !row.reviewed) return false;
    if (filters.reviewed === "unreviewed" && row.reviewed) return false;
    return true;
  });
  const compare = {
    newest: (a, b) => (timestamp(b.discoveredAt) || 0) - (timestamp(a.discoveredAt) || 0),
    ending: (a, b) => (timestamp(a.endAt) || Number.MAX_SAFE_INTEGER) - (timestamp(b.endAt) || Number.MAX_SAFE_INTEGER),
    profit: (a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity),
    roi: (a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity),
    closest: (a, b) => (asNumber(a.distance) ?? Infinity) - (asNumber(b.distance) ?? Infinity),
    risk: (a, b) => riskRank(a.risk) - riskRank(b.risk),
    best: (a, b) => ((b.profit ?? -Infinity) - (a.profit ?? -Infinity)) || (confidenceRank(b.confidence) - confidenceRank(a.confidence)) || (riskRank(a.risk) - riskRank(b.risk)),
  }[sort] || (() => 0);
  return [...filtered].sort(compare);
}

export function restockPatternSummary({ events = [], visits = [], observations = [], predictions = [], purchases = [] } = {}) {
  const intelligence = calculateRestockIntelligence({ events, visits, observations });
  const confirmed = events.filter((event) => isConfirmedRestockStatus(event.confirmationStatus || event.status));
  const eventTimes = confirmed.map((event) => timestamp(event.eventTime || event.reportTime || event.date)).filter((value) => value != null).sort((a, b) => a - b);
  const weekdayCounts = {};
  const hourBuckets = {};
  for (const time of eventTimes) {
    const date = new Date(time);
    const weekday = date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    weekdayCounts[weekday] = (weekdayCounts[weekday] || 0) + 1;
    const hour = date.getUTCHours();
    const bucket = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    hourBuckets[bucket] = (hourBuckets[bucket] || 0) + 1;
  }
  const mostCommon = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const intervals = eventTimes.slice(1).map((time, index) => (time - eventTimes[index]) / DAY_MS);
  const completedPredictions = predictions.filter((prediction) => restockPredictionOutcome(prediction.outcome) !== RESTOCK_PREDICTION_OUTCOME.UNKNOWN);
  const correctPredictions = completedPredictions.filter((prediction) => restockPredictionOutcome(prediction.outcome) === RESTOCK_PREDICTION_OUTCOME.CORRECT);
  const completedVisits = visits.filter((visit) => restockVisitOutcome(visit) !== VISIT_OUTCOME.UNKNOWN);
  const successfulVisits = completedVisits.filter((visit) => restockVisitOutcome(visit) === VISIT_OUTCOME.SUCCESS);
  const miles = visits.reduce((sum, visit) => sum + (asNumber(visit.miles) || 0), 0);
  const hours = visits.reduce((sum, visit) => sum + (asNumber(visit.timeSpentHours) || (asNumber(visit.timeSpentMinutes) || 0) / 60), 0);
  const attributedProfit = purchases.reduce((sum, purchase) => sum + (asNumber(purchase.realizedProfit) || 0), 0);
  const hasProfitData = purchases.some((purchase) => asNumber(purchase.realizedProfit) != null);
  const patternStability = intelligence.confidence === "HIGH" && intelligence.likelihoodBand === "HIGH"
    ? "High-confidence pattern"
    : intelligence.confidence === "MEDIUM" && intelligence.likelihoodBand !== "INSUFFICIENT"
      ? "Moderate-confidence pattern"
      : intelligence.sampleSize >= 2
        ? "Weak pattern"
        : "Not enough data";
  return {
    intelligence,
    supportingReportCount: confirmed.length,
    mostCommonWeekday: confirmed.length >= 2 ? mostCommon(weekdayCounts) : null,
    mostCommonTimeWindow: confirmed.length >= 2 ? mostCommon(hourBuckets) : null,
    averageIntervalDays: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null,
    patternStability,
    predictionAccuracy: completedPredictions.length ? correctPredictions.length / completedPredictions.length : null,
    averageTimingErrorHours: completedPredictions.some((prediction) => asNumber(prediction.timingErrorHours) != null)
      ? completedPredictions.reduce((sum, prediction) => sum + (asNumber(prediction.timingErrorHours) || 0), 0) / completedPredictions.filter((prediction) => asNumber(prediction.timingErrorHours) != null).length
      : null,
    successfulTripRate: completedVisits.length ? successfulVisits.length / completedVisits.length : null,
    profitPerTrip: hasProfitData && visits.length ? attributedProfit / visits.length : null,
    profitPerMile: hasProfitData && miles > 0 ? attributedProfit / miles : null,
    profitPerHour: hasProfitData && hours > 0 ? attributedProfit / hours : null,
    missingProfitRequirements: hasProfitData ? [] : ["realized profit attributed to restock purchases"],
  };
}

export function sourcePerformance(flipState = {}) {
  const opportunities = buildOpportunityFeed(flipState);
  const purchases = flipState.purchases || [];
  const sales = flipState.sales || [];
  const sources = new Set(opportunities.map((row) => row.sourceLabel));
  purchases.forEach((row) => sources.add(row.purchaseSource || row.source || "Unassigned"));
  return [...sources].map((source) => {
    const sourceOpportunities = opportunities.filter((row) => row.sourceLabel === source);
    const sourcePurchases = purchases.filter((row) => (row.purchaseSource || row.source || "Unassigned") === source);
    const purchaseIds = new Set(sourcePurchases.map((row) => row.id));
    const sourceSales = sales.filter((row) => purchaseIds.has(row.purchaseId) || (row.source || row.purchaseSource) === source);
    const invested = sourcePurchases.reduce((sum, row) => sum + (asNumber(row.totalPurchaseCost ?? row.purchasePrice) || 0), 0);
    const revenue = sourceSales.reduce((sum, row) => sum + (asNumber(row.netProceeds ?? row.grossSalePrice) || 0), 0);
    const realizedProfitRows = sourceSales.map((row) => asNumber(row.realizedProfit)).filter((value) => value != null);
    const profit = realizedProfitRows.length ? realizedProfitRows.reduce((sum, value) => sum + value, 0) : null;
    return {
      source,
      opportunities: sourceOpportunities.length,
      purchases: sourcePurchases.length,
      conversionRate: sourceOpportunities.length ? sourcePurchases.length / sourceOpportunities.length : null,
      capitalInvested: sourcePurchases.length ? invested : null,
      revenue: sourceSales.length ? revenue : null,
      realizedProfit: profit,
      realizedRoi: profit != null && invested > 0 ? profit / invested : null,
      averageDaysToSell: null,
      lossRate: realizedProfitRows.length ? realizedProfitRows.filter((value) => value < 0).length / realizedProfitRows.length : null,
      projectedActualVariance: null,
    };
  });
}

export function searchRulePerformance(rule, flipState = {}) {
  const matches = (flipState.providerListings || []).filter((row) => row.searchRuleId === rule.id || row.ruleId === rule.id);
  const reviewed = matches.filter((row) => !/new|needs review/i.test(row.importStatus || row.status || "New"));
  const purchases = (flipState.purchases || []).filter((row) => row.searchRuleId === rule.id || row.ruleId === rule.id);
  const profitValues = purchases.map((row) => asNumber(row.realizedProfit)).filter((value) => value != null);
  const sampleSize = reviewed.length;
  let recommendation = "Not Enough Data";
  if (sampleSize >= 10) {
    const purchaseRate = purchases.length / sampleSize;
    recommendation = purchaseRate >= 0.15 ? "Keep" : purchaseRate >= 0.05 ? "Refine" : "Pause";
  }
  return {
    resultsFound: matches.length,
    resultsReviewed: reviewed.length,
    purchases: purchases.length,
    realizedProfit: profitValues.length ? profitValues.reduce((sum, value) => sum + value, 0) : null,
    averageRoi: null,
    falsePositiveRate: sampleSize ? reviewed.filter((row) => /passed|rejected/i.test(row.importStatus || row.status || "")).length / sampleSize : null,
    averageReviewTime: null,
    recommendation,
    minimumSampleMet: sampleSize >= 10,
  };
}
