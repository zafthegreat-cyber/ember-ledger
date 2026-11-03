import {
  defaultStoreRegionForState,
  getStoreDirectoryState,
  otherStoreRegionForState,
  storeRegionsForState,
  storeStateName,
} from "./storeStates.js";

export const STORE_GROUP_ORDER = [
  "Target",
  "Walmart",
  "Walmart Neighborhood Market",
  "Warehouse Clubs",
  "Best Buy",
  "Bookstores / Hobby",
  "Craft / Hobby",
  "Sporting Goods",
  "Dollar / Discount Stores",
  "Grocery / Pharmacy",
  "Local Card Shops",
  "Local Game Stores",
  "Toy Stores",
  "Bookstores",
  "Other",
];

// Virginia names are kept for existing callers; regions for every directory
// state (VA, MD, DC, NC) live in storeStates.js.
export const STORE_COUNTRY = "United States";
export const VIRGINIA_STORE_COUNTRY = STORE_COUNTRY;
export const VIRGINIA_STORE_STATE = storeStateName("VA");
export const VIRGINIA_STORE_STATE_CODE = "VA";
export const DEFAULT_VIRGINIA_REGION = defaultStoreRegionForState("VA");

export const VIRGINIA_REGIONS = storeRegionsForState("VA");

export const VIRGINIA_REGION_CITY_HINTS = Object.fromEntries([
  ...getStoreDirectoryState("VA").regions.map((region) => [region.name, region.cities]),
  [otherStoreRegionForState("VA"), []],
]);

export const STORE_RETAILERS = [
  "Walmart",
  "Target",
  "Best Buy",
  "Pokemon Center",
  "Dollar General",
  "Family Dollar",
  "Dollar Tree",
  "Five Below",
  "Barnes & Noble",
  "GameStop",
  "Costco",
  "Sam's Club",
  "BJ's",
  "Kohl's",
  "Michaels",
  "Hobby Lobby",
  "DICK'S Sporting Goods",
  "Hot Topic",
  "BoxLunch",
  "Meijer",
  "Kroger",
  "Publix",
  "Wegmans",
  "Walgreens",
  "CVS",
  "Local Card Shops",
  "Local Game Stores",
  "Toy Stores",
  "Bookstores",
  "Other Pokemon-carrying Retailers",
];

export const VIRGINIA_RETAILERS = STORE_RETAILERS;

export const POKEMON_STOCK_LIKELIHOOD_OPTIONS = [
  "high",
  "medium",
  "low",
  "unknown",
];

export const CHAIN_CONFIDENCE_DEFAULTS = {
  Target: { carriesPokemonLikely: true, pokemonConfidence: "high" },
  Walmart: { carriesPokemonLikely: true, pokemonConfidence: "high" },
  "Walmart Neighborhood Market": { carriesPokemonLikely: true, pokemonConfidence: "medium" },
  "Best Buy": { carriesPokemonLikely: true, pokemonConfidence: "medium/high" },
  "Pokemon Center": { carriesPokemonLikely: true, pokemonConfidence: "high" },
  "Barnes & Noble": { carriesPokemonLikely: true, pokemonConfidence: "medium/high" },
  GameStop: { carriesPokemonLikely: true, pokemonConfidence: "medium/high" },
  Costco: { carriesPokemonLikely: true, pokemonConfidence: "medium" },
  "Sam's Club": { carriesPokemonLikely: true, pokemonConfidence: "medium" },
  "BJ's": { carriesPokemonLikely: true, pokemonConfidence: "medium" },
  "BJ's Wholesale Club": { carriesPokemonLikely: true, pokemonConfidence: "medium" },
  "Five Below": { carriesPokemonLikely: true, pokemonConfidence: "medium" },
  "Dollar General": { carriesPokemonLikely: true, pokemonConfidence: "low/medium" },
  "Family Dollar": { carriesPokemonLikely: true, pokemonConfidence: "low" },
  "Dollar Tree": { carriesPokemonLikely: true, pokemonConfidence: "low" },
  "Kohl's": { carriesPokemonLikely: true, pokemonConfidence: "low/medium" },
  Michaels: { carriesPokemonLikely: true, pokemonConfidence: "low/medium" },
  "Hobby Lobby": { carriesPokemonLikely: true, pokemonConfidence: "low/medium" },
  "DICK'S Sporting Goods": { carriesPokemonLikely: true, pokemonConfidence: "low/medium" },
  "Hot Topic": { carriesPokemonLikely: true, pokemonConfidence: "low/medium" },
  BoxLunch: { carriesPokemonLikely: true, pokemonConfidence: "low/medium" },
  Meijer: { carriesPokemonLikely: true, pokemonConfidence: "low/medium" },
  Kroger: { carriesPokemonLikely: true, pokemonConfidence: "low" },
  Publix: { carriesPokemonLikely: true, pokemonConfidence: "low" },
  Wegmans: { carriesPokemonLikely: true, pokemonConfidence: "low" },
  Walgreens: { carriesPokemonLikely: true, pokemonConfidence: "low" },
  CVS: { carriesPokemonLikely: true, pokemonConfidence: "low" },
  "Local Card Shop": { carriesPokemonLikely: true, pokemonConfidence: "high" },
  "Local Card Shops": { carriesPokemonLikely: true, pokemonConfidence: "high" },
  "Local Game Stores": { carriesPokemonLikely: true, pokemonConfidence: "high" },
  "Toy Stores": { carriesPokemonLikely: true, pokemonConfidence: "medium" },
  Bookstores: { carriesPokemonLikely: true, pokemonConfidence: "medium" },
  "Other Pokemon-carrying Retailers": { carriesPokemonLikely: true, pokemonConfidence: "unknown" },
};

export const VIRGINIA_STORE_IMPORT_FIELDS = [
  "retailer",
  "store_name",
  "nickname",
  "address",
  "city",
  "state",
  "zip_code",
  "region",
  "phone",
  "store_number",
  "retailer_store_id",
  "latitude",
  "longitude",
  "source",
  "source_url",
  "notes",
  "country",
  "active",
  "pokemon_stock_likelihood",
  "last_verified_at",
  "verified_by",
  "confidence",
  "store_type",
  "family_friendly_approved",
  "supports_kids_access",
  "supports_msrp_or_reasonable_pricing",
  "agreed_to_community_motto",
  "offers_kid_events",
  "offers_trade_nights",
  "advertising_partner",
  "featured_partner",
  "partner_notes",
];
