import importedCatalogStatus from "./generated/catalogImportStatus.json";
import { SEALED_PRODUCT_TYPES, SET_SEARCH_METADATA } from "./pokemonCatalogCoreData";

// Shared Pokemon catalog metadata and local seed import status.
// Full catalog search still comes from Supabase when configured; vetted sealed
// seed rows are bundled as a small fallback for common Add Item searches.

export { SEALED_PRODUCT_TYPES, SET_SEARCH_METADATA };

export const CATALOG_IMPORT_STATUS = {
  source: "supabase",
  totalCards: importedCatalogStatus.cardsImported || 0,
  totalSealedProducts: importedCatalogStatus.sealedProductsImported || 0,
  generatedAt: importedCatalogStatus.lastImportedAt || "",
  ...importedCatalogStatus,
};
