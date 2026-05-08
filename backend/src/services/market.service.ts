import { catalogService } from "./catalog.service";

export const marketService = {
  searchMarketData(query = "") {
    const items = catalogService.search(query);
    return items.map((item) => ({
      catalogItemId: item.id,
      name: item.name,
      msrp: item.msrp ?? null,
      marketValue: item.marketValue ?? null,
      source: item.marketValue ? "Manual" : "Unknown",
      marketStatus: item.marketValue ? "manual" : "unknown",
      lastUpdated: item.updatedAt,
    }));
  },
  getMarketPriceByCatalogId(id: string) {
    const item = catalogService.get(id);
    if (!item) return null;
    return {
      catalogItemId: item.id,
      name: item.name,
      msrp: item.msrp ?? null,
      marketValue: item.marketValue ?? null,
      marketStatus: item.marketValue ? "manual" : "unknown",
      source: item.marketValue ? "Manual" : "Unknown",
      lastUpdated: item.updatedAt,
    };
  },
  refreshMarketPrice(id: string) {
    const current = this.getMarketPriceByCatalogId(id);
    if (!current) return null;
    return {
      ...current,
      refreshedAt: new Date().toISOString(),
      message: "Live market refresh is not connected yet. Returning cached/manual beta data.",
    };
  },
  getMsrp(id: string) {
    return catalogService.get(id)?.msrp ?? null;
  },
  calculatePercentOfMarket(askingPrice: number, marketValue?: number | null) {
    if (!marketValue) return null;
    return (askingPrice / marketValue) * 100;
  },
  calculateMarketVsMsrp(marketValue?: number | null, msrp?: number | null) {
    if (!marketValue || !msrp) return null;
    return ((marketValue - msrp) / msrp) * 100;
  },
};

