export type MarketPrice = {
  id: string;
  catalogItemId?: string;
  catalogType?: "card" | "sealed" | string;
  externalSource?: string;
  externalId?: string;
  sourceUrl?: string;
  priceType?: string;
  condition?: string;
  variant?: string;
  currency?: string;
  price?: number | null;
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  marketPrice?: number | null;
  timestamp: string;
  marketStatus: "live" | "cached" | "manual" | "mock" | "unknown";
  confidenceScore?: number;
  createdAt: string;
  updatedAt: string;
};

