// These fields have no legacy Supabase table loader. Hosted inventory, sales,
// expenses, mileage, vehicles, membership, and profile authority remain in their
// existing tables and must never be replaced from a workspace snapshot cache.
export const HOSTED_APP_SUPPLEMENT_FIELDS = Object.freeze([
  "purchasers", "tideTradrWatchlist", "tideTradrLookupId", "marketPriceCache", "marketPriceMemories",
  "itemComparisons", "vaultCollectionSets", "vaultDisplayCase", "userSearchAliases", "tradeRecords",
  "sparkGifts", "sparkKidPacks", "sparkEventPlans", "collectorEventPlans", "dealForm", "locationSettings",
  "dashboardCardStyle", "appSetupPersonalization",
]);

export function selectHostedAppSupplement(value = {}) {
  const result = Object.fromEntries(HOSTED_APP_SUPPLEMENT_FIELDS.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
  if (!Object.hasOwn(result, "tradeRecords") && Array.isArray(value.trades)) result.tradeRecords = value.trades;
  return result;
}

export function canUseHostedAppSupplement({ localDevelopment, contextOwnerId, sessionOwnerId, guestPreview, profileReady, appAccess }) {
  return localDevelopment === false && Boolean(contextOwnerId) && contextOwnerId === sessionOwnerId
    && guestPreview === false && profileReady === true && appAccess === true;
}
