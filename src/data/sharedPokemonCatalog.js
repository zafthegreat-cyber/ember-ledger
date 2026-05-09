// TideTradr shared beta catalog.
// Unknown UPC/SKU/MSRP values are intentionally kept as "Unknown".
// Market values are not live unless sourceType is "live".

import importedCards from "./generated/pokemonTcgCards.json";
import importedSealedProducts from "./generated/sealedProducts.json";
import catalogImportStatus from "./generated/catalogImportStatus.json";

export const SEALED_PRODUCT_TYPES = [
  "Booster Pack",
  "Elite Trainer Box",
  "Pokemon Center Elite Trainer Box",
  "Booster Bundle",
  "Booster Box",
  "Sleeved Booster",
  "Blister Pack",
  "3-Pack Blister",
  "Checklane Blister",
  "Mini Tin",
  "Poke Ball Tin",
  "Lunchbox / Collector Chest",
  "Collection Box",
  "Ex Box",
  "Premium Collection",
  "Ultra Premium Collection",
  "Tin",
  "Build & Battle Box",
  "Build & Battle Stadium",
  "First Partner Pack",
  "Special Collection",
  "Poster Collection",
  "Binder Collection",
  "Battle Deck",
  "League Battle Deck",
  "Starter Deck",
  "Theme Deck",
  "Trainer's Toolkit",
  "Figure Collection",
  "Holiday Calendar",
  "Retailer Exclusive Bundle",
  "Warehouse Club Bundle",
  "Third-Party Product",
  "Accessories",
  "Miscellaneous",
  "Mystery/Bundle item",
];

export const SET_SEARCH_METADATA = {
  "Prismatic Evolutions": { setCode: "PRE", setAliases: ["PRE", "PREN", "pri", "prism", "prismatic", "PE"] },
  "Mega Evolution": { setCode: "MEG", setAliases: ["MEG", "mega"] },
  "Destined Rivals": { setCode: "DRI", setAliases: ["SV10", "DRI", "destined", "dr", "rivals"] },
  "Journey Together": { setCode: "JTG", setAliases: ["SV9", "JTG", "journey", "jt"] },
  "Surging Sparks": { setCode: "SSP", setAliases: ["SV8", "SSP", "surging", "ss"] },
  "Stellar Crown": { setCode: "SCR", setAliases: ["SV7", "SCR", "stellar"] },
  "Shrouded Fable": { setCode: "SFA", setAliases: ["SV6.5", "SFA", "shrouded", "sf"] },
  "Twilight Masquerade": { setCode: "TWM", setAliases: ["SV6", "TWM", "twilight", "tm"] },
  "Temporal Forces": { setCode: "TEF", setAliases: ["SV5", "TEF", "temporal", "tf"] },
  "Paldean Fates": { setCode: "PAF", setAliases: ["SV4.5", "PAF", "paldean fates", "pf"] },
  "Paradox Rift": { setCode: "PAR", setAliases: ["SV4", "PAR", "paradox"] },
  "Scarlet & Violet 151": { setCode: "MEW", setAliases: ["SV3.5", "MEW", "151", "sv151", "pokemon 151"] },
  "Obsidian Flames": { setCode: "OBF", setAliases: ["SV3", "OBF", "obsidian", "of"] },
  "Paldea Evolved": { setCode: "PAL", setAliases: ["SV2", "PAL", "paldea evolved", "pevolved", "paldea"] },
  "Scarlet & Violet Base": { setCode: "SVI", setAliases: ["SV1", "SVI", "sv base", "scarlet violet base"] },
  "Crown Zenith": { setCode: "CRZ", setAliases: ["CRZ", "crown", "cz"] },
  "Silver Tempest": { setCode: "SIT", setAliases: ["SIT", "silver", "st"] },
  "Lost Origin": { setCode: "LOR", setAliases: ["LOR", "lost", "lo"] },
  "Astral Radiance": { setCode: "ASR", setAliases: ["ASR", "astral", "ar"] },
  "Brilliant Stars": { setCode: "BRS", setAliases: ["BRS", "brilliant", "bs"] },
  "Fusion Strike": { setCode: "FST", setAliases: ["FST", "fusion", "fs"] },
  "Evolving Skies": { setCode: "EVS", setAliases: ["EVS", "evo skies", "evolving", "es"] },
  "Chilling Reign": { setCode: "CRE", setAliases: ["CRE", "chilling", "cr"] },
  "Battle Styles": { setCode: "BST", setAliases: ["BST", "battle styles"] },
  "Shining Fates": { setCode: "SHF", setAliases: ["SHF", "shining fates"] },
  "Vivid Voltage": { setCode: "VIV", setAliases: ["VIV", "vivid voltage"] },
  "Champion's Path": { setCode: "CPA", setAliases: ["CPA", "champions path", "champion's path"] },
  "Darkness Ablaze": { setCode: "DAA", setAliases: ["DAA", "darkness ablaze"] },
  "Rebel Clash": { setCode: "RCL", setAliases: ["RCL", "rebel clash"] },
  "Sword & Shield Base": { setCode: "SSH", setAliases: ["SSH", "sword shield base", "swsh base"] },
  "Celebrations": { setCode: "CEL", setAliases: ["CEL", "celeb", "celebrations"] },
  "Pokemon GO": { setCode: "PGO", setAliases: ["PGO", "pokemon go", "pogo"] },
};

function setMetadata(setName) {
  return SET_SEARCH_METADATA[setName] || { setCode: "", setAliases: [] };
}

function normalizeGeneratedCard(item = {}) {
  const metadata = setMetadata(item.setName);
  return {
    ...item,
    catalogType: "card",
    cardName: item.cardName || item.name || "",
    name: item.cardName || item.name || "",
    pokemonName: item.pokemonName || item.cardName || item.name || "",
    setCode: item.setCode || metadata.setCode || item.setId || "",
    setAliases: item.setAliases || metadata.setAliases || [],
    series: item.series || item.era || "",
    era: item.era || item.series || "",
    imageSource: item.imageSource || (item.imageSmall || item.imageLarge ? "pokemon_tcg_api" : "placeholder"),
    imageStatus: item.imageStatus || (item.imageSmall || item.imageLarge ? "api" : "placeholder"),
    marketSource: item.marketSource || "Unknown",
    marketStatus: item.marketStatus || (item.marketValueNearMint ? "cached" : "unknown"),
    marketConfidenceLevel: item.marketConfidenceLevel || (item.marketValueNearMint ? "Cached" : "Unknown"),
  };
}

function normalizeGeneratedSealedProduct(item = {}) {
  const metadata = setMetadata(item.setName);
  return {
    ...item,
    catalogType: "sealed",
    productName: item.productName || item.name || "",
    name: item.productName || item.name || "",
    setCode: item.setCode || metadata.setCode || "",
    setAliases: item.setAliases || metadata.setAliases || [],
    era: item.era || item.series || "",
    releaseYear: item.releaseYear || "Unknown",
    msrp: item.msrp || item.MSRP || "Unknown",
    upc: item.upc || item.UPC || "Unknown",
    sku: item.sku || item.SKU || "Unknown",
    imageSource: item.imageSource || (item.imageUrl ? "manual" : "placeholder"),
    imageStatus: item.imageStatus || (item.imageUrl ? "manual" : "placeholder"),
    marketSource: item.marketSource || "Unknown",
    marketStatus: item.marketStatus || (item.marketValue ? "manual" : "unknown"),
    marketConfidenceLevel: item.marketConfidenceLevel || (item.marketValue ? "Manual" : "Unknown"),
  };
}

function catalogKey(item = {}) {
  const type = item.catalogType || "sealed";
  const name = item.cardName || item.productName || item.name || "";
  return String(`${type}|${item.id || item.externalCardId || item.externalProductId || ""}|${name}|${item.setName || ""}|${item.cardNumber || item.productType || ""}`)
    .toLowerCase();
}

function mergeCatalogRows(rows = []) {
  const byKey = new Map();
  rows.forEach((item) => {
    const key = catalogKey(item);
    if (!byKey.has(key)) byKey.set(key, item);
  });
  return [...byKey.values()];
}

const STANDARD_RELEASES = [
  { setName: "Destined Rivals", series: "Scarlet & Violet", releaseYear: 2025, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister"] },
  { setName: "Journey Together", series: "Scarlet & Violet", releaseYear: 2025, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister"] },
  { setName: "Surging Sparks", series: "Scarlet & Violet", releaseYear: 2024, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Stellar Crown", series: "Scarlet & Violet", releaseYear: 2024, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Twilight Masquerade", series: "Scarlet & Violet", releaseYear: 2024, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Temporal Forces", series: "Scarlet & Violet", releaseYear: 2024, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Paradox Rift", series: "Scarlet & Violet", releaseYear: 2023, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Obsidian Flames", series: "Scarlet & Violet", releaseYear: 2023, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Paldea Evolved", series: "Scarlet & Violet", releaseYear: 2023, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Scarlet & Violet Base", series: "Scarlet & Violet", releaseYear: 2023, types: ["Elite Trainer Box", "Booster Bundle", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Brilliant Stars", series: "Sword & Shield", releaseYear: 2022, types: ["Elite Trainer Box", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Fusion Strike", series: "Sword & Shield", releaseYear: 2021, types: ["Elite Trainer Box", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Chilling Reign", series: "Sword & Shield", releaseYear: 2021, types: ["Elite Trainer Box", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Lost Origin", series: "Sword & Shield", releaseYear: 2022, types: ["Elite Trainer Box", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Silver Tempest", series: "Sword & Shield", releaseYear: 2022, types: ["Elite Trainer Box", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Astral Radiance", series: "Sword & Shield", releaseYear: 2022, types: ["Elite Trainer Box", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
  { setName: "Evolving Skies", series: "Sword & Shield", releaseYear: 2021, types: ["Elite Trainer Box", "Booster Box", "Sleeved Booster", "3-Pack Blister", "Checklane Blister", "Build & Battle Box", "Build & Battle Stadium"] },
];

const SPECIAL_RELEASES = [
  { setName: "Prismatic Evolutions", series: "Scarlet & Violet", releaseYear: 2025, types: ["Elite Trainer Box", "Booster Bundle", "Poster Collection", "Binder Collection", "Surprise Box", "Mini Tin", "Tin", "Special Collection", "Premium Collection"] },
  { setName: "Shrouded Fable", series: "Scarlet & Violet", releaseYear: 2024, types: ["Elite Trainer Box", "Booster Bundle", "Mini Tin", "Collection Box", "Special Collection"] },
  { setName: "Paldean Fates", series: "Scarlet & Violet", releaseYear: 2024, types: ["Elite Trainer Box", "Booster Bundle", "Mini Tin", "Tin", "Premium Collection", "Collection Box", "Special Collection"] },
  { setName: "Scarlet & Violet 151", series: "Scarlet & Violet", releaseYear: 2023, types: ["Elite Trainer Box", "Booster Bundle", "Ultra Premium Collection", "Poster Collection", "Binder Collection", "Mini Tin", "Collection Box", "Special Collection"] },
  { setName: "Crown Zenith", series: "Sword & Shield", releaseYear: 2023, types: ["Elite Trainer Box", "Mini Tin", "Tin", "Premium Collection", "Collection Box", "Special Collection"] },
  { setName: "Celebrations", series: "Sword & Shield", releaseYear: 2021, types: ["Elite Trainer Box", "Ultra Premium Collection", "Collection Box", "Premium Collection", "Mini Tin", "First Partner Pack", "Special Collection"] },
];

function msrpFor(type) {
  const values = {
    "Elite Trainer Box": 49.99,
    "Booster Bundle": "Unknown",
    "Booster Box": "Unknown",
    "Sleeved Booster": 4.99,
    "3-Pack Blister": 13.99,
    "Checklane Blister": 5.99,
    "Mini Tin": 9.99,
    "Collection Box": "Unknown",
    "Ex Box": 19.99,
    "Premium Collection": "Unknown",
    "Ultra Premium Collection": "Unknown",
    "Tin": "Unknown",
    "Build & Battle Box": 19.99,
    "Build & Battle Stadium": 59.99,
    "First Partner Pack": 9.99,
    "Special Collection": "Unknown",
    "Poster Collection": "Unknown",
    "Binder Collection": "Unknown",
    "Battle Deck": 14.99,
    "League Battle Deck": 29.99,
    "Trainer's Toolkit": 34.99,
    "Mystery/Bundle item": "Unknown",
    "Surprise Box": "Unknown",
  };
  return values[type] ?? "Unknown";
}

function packCountFor(type) {
  const values = {
    "Elite Trainer Box": 9,
    "Booster Bundle": 6,
    "Booster Box": 36,
    "Sleeved Booster": 1,
    "3-Pack Blister": 3,
    "Checklane Blister": 1,
    "Mini Tin": 2,
    "Collection Box": "Unknown",
    "Ex Box": 4,
    "Premium Collection": "Unknown",
    "Ultra Premium Collection": "Unknown",
    "Tin": "Unknown",
    "Build & Battle Box": 4,
    "Build & Battle Stadium": 12,
    "First Partner Pack": 2,
    "Special Collection": "Unknown",
    "Poster Collection": "Unknown",
    "Binder Collection": "Unknown",
    "Battle Deck": 0,
    "League Battle Deck": 0,
    "Trainer's Toolkit": 4,
    "Mystery/Bundle item": "Unknown",
    "Surprise Box": "Unknown",
  };
  return values[type] ?? "Unknown";
}

function sealedProduct({ setName, series, releaseYear, type, productName }) {
  const metadata = setMetadata(setName);
  return {
    catalogType: "sealed",
    productName: productName || `${setName} ${type}`,
    productType: type,
    setName,
    setCode: metadata.setCode,
    setAliases: metadata.setAliases,
    series,
    era: series,
    releaseYear,
    releaseDate: "Unknown",
    msrp: msrpFor(type),
    upc: "Unknown",
    sku: "Unknown",
    packCount: packCountFor(type),
    imageUrl: "",
    imageSmall: "",
    imageLarge: "",
    imageSource: "placeholder",
    imageSourceUrl: "",
    imageStatus: "placeholder",
    imageLastUpdated: "Unknown",
    imageNeedsReview: true,
    marketValue: 0,
    marketSource: "Manual",
    marketLastUpdated: "Unknown",
    marketConfidenceLevel: "Manual needed",
    notes: "Starter beta sealed catalog row. UPC/SKU/live market value not verified yet.",
    sourceType: "manual",
    lastUpdated: "Unknown",
  };
}

const sealedProducts = [
  ...STANDARD_RELEASES.flatMap((release) =>
    release.types.map((type) => sealedProduct({ ...release, type }))
  ),
  ...SPECIAL_RELEASES.flatMap((release) =>
    release.types.map((type) => sealedProduct({ ...release, type }))
  ),
  sealedProduct({ setName: "Assorted", series: "Scarlet & Violet", releaseYear: "Unknown", type: "Ex Box", productName: "Pokemon ex Box" }),
  sealedProduct({ setName: "Assorted", series: "Scarlet & Violet", releaseYear: "Unknown", type: "Premium Collection", productName: "Pokemon Premium Collection Box" }),
  sealedProduct({ setName: "Assorted", series: "Scarlet & Violet", releaseYear: "Unknown", type: "Tin", productName: "Pokemon Tin" }),
  sealedProduct({ setName: "Assorted", series: "Scarlet & Violet", releaseYear: "Unknown", type: "Battle Deck", productName: "Pokemon Battle Deck" }),
  sealedProduct({ setName: "Assorted", series: "Scarlet & Violet", releaseYear: "Unknown", type: "League Battle Deck", productName: "Pokemon League Battle Deck" }),
  sealedProduct({ setName: "Assorted", series: "Scarlet & Violet", releaseYear: "Unknown", type: "Trainer's Toolkit", productName: "Pokemon Trainer's Toolkit" }),
  sealedProduct({ setName: "Assorted", series: "Mixed", releaseYear: "Unknown", type: "Mystery/Bundle item", productName: "Pokemon Mystery/Bundle Item" }),
];

const individualCards = [
  { catalogType: "card", cardName: "Charizard ex", pokemonName: "Charizard", setName: "Scarlet & Violet 151", series: "Scarlet & Violet", cardNumber: "199/165", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueRaw: 0, marketValueNearMint: 120, marketValueLightPlayed: 95, marketValueGraded: 260, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Charizard ex", pokemonName: "Charizard", setName: "Obsidian Flames", series: "Scarlet & Violet", cardNumber: "223/197", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 45, marketValueLightPlayed: 34, marketValueGraded: 120, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Charizard V", pokemonName: "Charizard", setName: "Brilliant Stars", series: "Sword & Shield", cardNumber: "154/172", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 165, marketValueLightPlayed: 130, marketValueGraded: 360, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Charizard VSTAR", pokemonName: "Charizard", setName: "Crown Zenith", series: "Sword & Shield", cardNumber: "SWSH262", rarity: "Promo", variant: "Promo", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 12, marketValueLightPlayed: 9, marketValueGraded: 45, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Blastoise ex", pokemonName: "Blastoise", setName: "Scarlet & Violet 151", series: "Scarlet & Violet", cardNumber: "200/165", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 55, marketValueLightPlayed: 42, marketValueGraded: 130, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Venusaur ex", pokemonName: "Venusaur", setName: "Scarlet & Violet 151", series: "Scarlet & Violet", cardNumber: "198/165", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 45, marketValueLightPlayed: 35, marketValueGraded: 110, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Pikachu", pokemonName: "Pikachu", setName: "Scarlet & Violet 151", series: "Scarlet & Violet", cardNumber: "173/165", rarity: "Illustration Rare", variant: "IR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 22, marketValueLightPlayed: 17, marketValueGraded: 65, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Pikachu VMAX", pokemonName: "Pikachu", setName: "Celebrations", series: "Sword & Shield", cardNumber: "SWSH062", rarity: "Promo", variant: "Promo", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 8, marketValueLightPlayed: 6, marketValueGraded: 35, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Pikachu V-UNION", pokemonName: "Pikachu", setName: "Celebrations", series: "Sword & Shield", cardNumber: "SWSH139-142", rarity: "Promo", variant: "V-UNION", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 18, marketValueLightPlayed: 14, marketValueGraded: 60, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Eevee", pokemonName: "Eevee", setName: "Twilight Masquerade", series: "Scarlet & Violet", cardNumber: "188/167", rarity: "Illustration Rare", variant: "IR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 45, marketValueLightPlayed: 35, marketValueGraded: 110, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Mew ex", pokemonName: "Mew", setName: "Paldean Fates", series: "Scarlet & Violet", cardNumber: "232/091", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 90, marketValueLightPlayed: 72, marketValueGraded: 210, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Mewtwo VSTAR", pokemonName: "Mewtwo", setName: "Crown Zenith", series: "Sword & Shield", cardNumber: "GG44/GG70", rarity: "Galarian Gallery", variant: "GG", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 65, marketValueLightPlayed: 50, marketValueGraded: 150, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Mewtwo ex", pokemonName: "Mewtwo", setName: "Scarlet & Violet 151", series: "Scarlet & Violet", cardNumber: "193/165", rarity: "Ultra Rare", variant: "Full Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 18, marketValueLightPlayed: 14, marketValueGraded: 55, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Gardevoir ex", pokemonName: "Gardevoir", setName: "Paldean Fates", series: "Scarlet & Violet", cardNumber: "233/091", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 55, marketValueLightPlayed: 43, marketValueGraded: 130, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Iono", pokemonName: "", setName: "Paldea Evolved", series: "Scarlet & Violet", cardNumber: "269/193", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 75, marketValueLightPlayed: 58, marketValueGraded: 180, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Magikarp", pokemonName: "Magikarp", setName: "Paldea Evolved", series: "Scarlet & Violet", cardNumber: "203/193", rarity: "Illustration Rare", variant: "IR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 125, marketValueLightPlayed: 100, marketValueGraded: 300, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Gengar VMAX", pokemonName: "Gengar", setName: "Fusion Strike", series: "Sword & Shield", cardNumber: "271/264", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 420, marketValueLightPlayed: 340, marketValueGraded: 760, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Snorlax", pokemonName: "Snorlax", setName: "Scarlet & Violet 151", series: "Scarlet & Violet", cardNumber: "051/165", rarity: "Rare", variant: "Holo", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 2, marketValueLightPlayed: 1, marketValueGraded: 20, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Ditto", pokemonName: "Ditto", setName: "Crown Zenith", series: "Sword & Shield", cardNumber: "GG22/GG70", rarity: "Galarian Gallery", variant: "GG", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 4, marketValueLightPlayed: 3, marketValueGraded: 28, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Mimikyu", pokemonName: "Mimikyu", setName: "Paldea Evolved", series: "Scarlet & Violet", cardNumber: "097/193", rarity: "Rare", variant: "Holo", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 2, marketValueLightPlayed: 1, marketValueGraded: 18, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Phantump", pokemonName: "Phantump", setName: "Obsidian Flames", series: "Scarlet & Violet", cardNumber: "011/197", rarity: "Common", variant: "Common", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 0.25, marketValueLightPlayed: 0.1, marketValueGraded: 0, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Giratina V", pokemonName: "Giratina", setName: "Lost Origin", series: "Sword & Shield", cardNumber: "186/196", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 360, marketValueLightPlayed: 300, marketValueGraded: 650, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Giratina VSTAR", pokemonName: "Giratina", setName: "Crown Zenith", series: "Sword & Shield", cardNumber: "GG69/GG70", rarity: "Galarian Gallery", variant: "Gold GG", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 115, marketValueLightPlayed: 90, marketValueGraded: 230, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Arceus VSTAR", pokemonName: "Arceus", setName: "Crown Zenith", series: "Sword & Shield", cardNumber: "GG70/GG70", rarity: "Galarian Gallery", variant: "Gold GG", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 75, marketValueLightPlayed: 58, marketValueGraded: 160, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Lugia V", pokemonName: "Lugia", setName: "Silver Tempest", series: "Sword & Shield", cardNumber: "186/195", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 170, marketValueLightPlayed: 135, marketValueGraded: 320, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Moonbreon - Umbreon VMAX", pokemonName: "Umbreon", setName: "Evolving Skies", series: "Sword & Shield", cardNumber: "215/203", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 1200, marketValueLightPlayed: 1000, marketValueGraded: 2200, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Umbreon V", pokemonName: "Umbreon", setName: "Evolving Skies", series: "Sword & Shield", cardNumber: "189/203", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 115, marketValueLightPlayed: 90, marketValueGraded: 230, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Rayquaza VMAX", pokemonName: "Rayquaza", setName: "Evolving Skies", series: "Sword & Shield", cardNumber: "218/203", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 430, marketValueLightPlayed: 350, marketValueGraded: 760, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Rayquaza V", pokemonName: "Rayquaza", setName: "Evolving Skies", series: "Sword & Shield", cardNumber: "194/203", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 95, marketValueLightPlayed: 75, marketValueGraded: 190, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Sylveon VMAX", pokemonName: "Sylveon", setName: "Evolving Skies", series: "Sword & Shield", cardNumber: "212/203", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 250, marketValueLightPlayed: 200, marketValueGraded: 460, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Sylveon V", pokemonName: "Sylveon", setName: "Evolving Skies", series: "Sword & Shield", cardNumber: "184/203", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 75, marketValueLightPlayed: 58, marketValueGraded: 150, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Greninja ex", pokemonName: "Greninja", setName: "Twilight Masquerade", series: "Scarlet & Violet", cardNumber: "214/167", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 250, marketValueLightPlayed: 200, marketValueGraded: 450, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Radiant Greninja", pokemonName: "Greninja", setName: "Astral Radiance", series: "Sword & Shield", cardNumber: "046/189", rarity: "Radiant Rare", variant: "Radiant", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 5, marketValueLightPlayed: 4, marketValueGraded: 35, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Pikachu ex", pokemonName: "Pikachu", setName: "Surging Sparks", series: "Scarlet & Violet", cardNumber: "238/191", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 420, marketValueLightPlayed: 340, marketValueGraded: 760, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Latias ex", pokemonName: "Latias", setName: "Surging Sparks", series: "Scarlet & Violet", cardNumber: "239/191", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 190, marketValueLightPlayed: 150, marketValueGraded: 340, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Terapagos ex", pokemonName: "Terapagos", setName: "Stellar Crown", series: "Scarlet & Violet", cardNumber: "170/142", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 95, marketValueLightPlayed: 75, marketValueGraded: 190, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Lillie's Clefairy ex", pokemonName: "Clefairy", setName: "Journey Together", series: "Scarlet & Violet", cardNumber: "184/159", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 160, marketValueLightPlayed: 125, marketValueGraded: 300, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "N's Zoroark ex", pokemonName: "Zoroark", setName: "Journey Together", series: "Scarlet & Violet", cardNumber: "185/159", rarity: "Special Illustration Rare", variant: "SIR", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 95, marketValueLightPlayed: 75, marketValueGraded: 190, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Leafeon VMAX", pokemonName: "Leafeon", setName: "Evolving Skies", series: "Sword & Shield", cardNumber: "205/203", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 300, marketValueLightPlayed: 240, marketValueGraded: 540, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Glaceon VMAX", pokemonName: "Glaceon", setName: "Evolving Skies", series: "Sword & Shield", cardNumber: "209/203", rarity: "Alternate Art Secret", variant: "Alt Art", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 230, marketValueLightPlayed: 180, marketValueGraded: 420, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Snorlax VMAX", pokemonName: "Snorlax", setName: "Sword & Shield Base", series: "Sword & Shield", cardNumber: "142/202", rarity: "Ultra Rare", variant: "VMAX", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 10, marketValueLightPlayed: 7, marketValueGraded: 45, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Mimikyu VMAX", pokemonName: "Mimikyu", setName: "Brilliant Stars", series: "Sword & Shield", cardNumber: "TG17/TG30", rarity: "Trainer Gallery", variant: "TG", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 14, marketValueLightPlayed: 10, marketValueGraded: 55, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
  { catalogType: "card", cardName: "Ditto - Peelable", pokemonName: "Ditto", setName: "Pokemon GO", series: "Sword & Shield", cardNumber: "053/078", rarity: "Rare", variant: "Peelable", condition: "Near Mint", language: "English", graded: false, marketValueNearMint: 3, marketValueLightPlayed: 2, marketValueGraded: 25, marketSource: "Beta estimate", marketConfidenceLevel: "Estimated", sourceType: "estimated" },
];

const generatedCatalogRows = [
  ...importedSealedProducts.map(normalizeGeneratedSealedProduct),
  ...importedCards.map(normalizeGeneratedCard),
];

export const CATALOG_IMPORT_STATUS = {
  ...catalogImportStatus,
  localSeedSets: Object.keys(SET_SEARCH_METADATA).length,
  localSeedCards: individualCards.length,
  localSeedSealedProducts: sealedProducts.length,
  totalCards: individualCards.length + importedCards.length,
  totalSealedProducts: sealedProducts.length + importedSealedProducts.length,
};

export const SHARED_POKEMON_PRODUCTS = mergeCatalogRows([...sealedProducts, ...individualCards, ...generatedCatalogRows]).map((item) => {
  const metadata = setMetadata(item.setName);
  return {
    ...item,
    setCode: item.setCode || metadata.setCode,
    setAliases: item.setAliases || metadata.setAliases,
    era: item.era || item.series || "",
    releaseYear: item.releaseYear || "Unknown",
    imageUrl: item.imageUrl || item.images?.large || item.images?.small || "",
    imageSmall: item.imageSmall || item.images?.small || "",
    imageLarge: item.imageLarge || item.images?.large || item.imageUrl || "",
    imageSource: item.imageSource || (item.catalogType === "card" && (item.imageSmall || item.imageLarge || item.images?.small || item.images?.large) ? "pokemon_tcg_api" : item.imageUrl ? "manual" : "placeholder"),
    imageSourceUrl: item.imageSourceUrl || "",
    imageStatus: item.imageStatus || (item.catalogType === "card" && (item.imageSmall || item.imageLarge || item.images?.small || item.images?.large) ? "api" : item.imageUrl ? "manual" : "placeholder"),
    imageLastUpdated: item.imageLastUpdated || item.lastUpdated || "Unknown",
    imageNeedsReview: item.imageNeedsReview ?? !(item.imageUrl || item.imageSmall || item.imageLarge || item.images?.small || item.images?.large),
  };
});
