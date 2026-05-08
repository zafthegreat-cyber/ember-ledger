export type CatalogItem = {
  id: string;
  name: string;
  brand?: string;
  franchise?: string;
  category?: string;
  productType?: string;
  setName?: string;
  releaseDate?: string;
  msrp?: number | null;
  marketValue?: number | null;
  upc?: string;
  sku?: string;
  tcgplayerUrl?: string;
  priceChartingUrl?: string;
  imageUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

