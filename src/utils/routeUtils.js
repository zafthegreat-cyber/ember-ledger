import { getStoreGroup, STORE_GROUP_ORDER } from "./storeGroupingUtils";

export function numericDistance(store = {}) {
  const value = Number(store.distanceMiles || store.distance || store.miles || 0);
  return Number.isFinite(value) && value > 0 ? value : 999;
}

export function confidenceLabel(score) {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

function distanceScore(distance) {
  if (distance >= 999) return 10;
  return Math.max(0, 100 - distance * 4);
}

export function calculateStoreRouteScore(storeCandidate = {}, options = {}) {
  const store = storeCandidate.store || storeCandidate;
  const distance = storeCandidate.distance ?? numericDistance(store);
  const restockConfidence = Number(storeCandidate.dailyScore || store.restockConfidence || store.prediction_confidence || 20);
  const recentReportScore = Number(storeCandidate.reportCountToday || 0) > 0 ? Math.min(100, Number(storeCandidate.reportCountToday) * 25) : storeCandidate.recentConfirmed ? 80 : 20;
  const tidepoolScore = Number(storeCandidate.tidepoolScore || store.tidepoolScore || 0);
  const favoriteStoreBonus = store.priority || store.favorite ? 100 : 0;
  const avoidedStorePenalty = store.avoided || store.avoid ? 100 : 0;
  const staleReportPenalty = storeCandidate.lastReportTime ? 0 : 12;

  return (
    restockConfidence * 0.35 +
    recentReportScore * 0.25 +
    tidepoolScore * 0.2 +
    favoriteStoreBonus * 0.1 +
    distanceScore(distance) * 0.1 -
    avoidedStorePenalty -
    staleReportPenalty +
    Number(options.customBoost || 0)
  );
}

export function explainRouteChoice(storeCandidate = {}, routeGoal = "Highest restock chance") {
  const store = storeCandidate.store || storeCandidate;
  const pieces = [routeGoal];
  if (storeCandidate.recentConfirmed) pieces.push("recent confirmed sighting");
  if (storeCandidate.reportCountToday) pieces.push(`${storeCandidate.reportCountToday} reports today`);
  if (storeCandidate.tidepoolScore) pieces.push(`Tidepool ${Math.round(storeCandidate.tidepoolScore)}%`);
  if (store.priority || store.favorite) pieces.push("favorite/priority store");
  if (storeCandidate.strictLimit) pieces.push("strict limits noted");
  if (!storeCandidate.lastReportTime) pieces.push("needs newer report data");
  return pieces.join("; ");
}

export function sortStoresForRoute(stores = [], routeGoal = "Highest restock chance", options = {}) {
  return [...stores].sort((a, b) => {
    if (routeGoal === "Fastest route" || routeGoal === "Closest stores first") return a.distance - b.distance;
    if (routeGoal === "Most reports today") return b.reportCountToday - a.reportCountToday || b.routeScore - a.routeScore;
    if (routeGoal === "Best value route") return b.valueScore - a.valueScore || b.routeScore - a.routeScore || a.distance - b.distance;
    if (routeGoal === "Custom filters") return b.routeScore - a.routeScore || a.distance - b.distance;
    return b.routeScore - a.routeScore || a.distance - b.distance;
  });
}

export function buildSuggestedRoute(stores = [], options = {}) {
  const includedGroups = options.includedGroups?.length ? options.includedGroups : STORE_GROUP_ORDER;
  const maxStops = Math.max(1, Number(options.maxStops || 5));
  const maxDistance = Number(options.maxDistance || 0);
  const lockedStoreIds = options.lockedStoreIds || [];
  const routeGoal = options.routeGoal || "Highest restock chance";

  const candidates = stores
    .filter((candidate) => includedGroups.includes(candidate.group || getStoreGroup(candidate.store || candidate)))
    .filter((candidate) => !maxDistance || numericDistance(candidate.store || candidate) <= maxDistance || candidate.distance <= maxDistance)
    .filter((candidate) => !(candidate.store || candidate).avoided && !(candidate.store || candidate).avoid)
    .map((candidate) => ({
      ...candidate,
      group: candidate.group || getStoreGroup(candidate.store || candidate),
      distance: candidate.distance ?? numericDistance(candidate.store || candidate),
      routeScore: calculateStoreRouteScore(candidate, options),
    }));

  const locked = lockedStoreIds
    .map((storeId) => candidates.find((candidate) => String((candidate.store || candidate).id) === String(storeId)))
    .filter(Boolean);
  const unlocked = candidates.filter((candidate) => !lockedStoreIds.some((storeId) => String(storeId) === String((candidate.store || candidate).id)));

  return [...locked, ...sortStoresForRoute(unlocked, routeGoal, options)].slice(0, maxStops);
}
