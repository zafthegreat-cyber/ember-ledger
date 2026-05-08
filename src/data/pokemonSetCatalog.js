import { SET_SEARCH_METADATA } from "./sharedPokemonCatalog";
import importedPokemonSets from "./generated/pokemonTcgSets.json";

const SET_SERIES = {
  "Prismatic Evolutions": "Scarlet & Violet",
  "Mega Evolution": "Mega Evolution",
  "Destined Rivals": "Scarlet & Violet",
  "Journey Together": "Scarlet & Violet",
  "Surging Sparks": "Scarlet & Violet",
  "Stellar Crown": "Scarlet & Violet",
  "Shrouded Fable": "Scarlet & Violet",
  "Twilight Masquerade": "Scarlet & Violet",
  "Temporal Forces": "Scarlet & Violet",
  "Paldean Fates": "Scarlet & Violet",
  "Paradox Rift": "Scarlet & Violet",
  "Scarlet & Violet 151": "Scarlet & Violet",
  "Obsidian Flames": "Scarlet & Violet",
  "Paldea Evolved": "Scarlet & Violet",
  "Scarlet & Violet Base": "Scarlet & Violet",
  "Crown Zenith": "Sword & Shield",
  "Silver Tempest": "Sword & Shield",
  "Lost Origin": "Sword & Shield",
  "Astral Radiance": "Sword & Shield",
  "Brilliant Stars": "Sword & Shield",
  "Fusion Strike": "Sword & Shield",
  "Evolving Skies": "Sword & Shield",
  "Chilling Reign": "Sword & Shield",
  "Battle Styles": "Sword & Shield",
  "Shining Fates": "Sword & Shield",
  "Vivid Voltage": "Sword & Shield",
  "Champion's Path": "Sword & Shield",
  "Darkness Ablaze": "Sword & Shield",
  "Rebel Clash": "Sword & Shield",
  "Sword & Shield Base": "Sword & Shield",
  "Celebrations": "Sword & Shield",
  "Pokemon GO": "Sword & Shield",
};

const localPokemonSets = Object.entries(SET_SEARCH_METADATA).map(([name, metadata]) => ({
  setId: metadata.setCode || name.toLowerCase().replace(/\W+/g, "-"),
  name,
  series: SET_SERIES[name] || "",
  code: metadata.setCode || "",
  setAliases: metadata.setAliases || [],
  releaseDate: "",
  printedTotal: "",
  total: "",
  logoUrl: "",
  symbolUrl: "",
  imageSource: "placeholder",
  imageStatus: "placeholder",
  imageLastUpdated: "",
  imageNeedsReview: true,
  source: "local-beta-structure",
}));

const normalizedImportedSets = importedPokemonSets.map((set) => ({
  setId: set.setId || set.id || set.setCode || set.name,
  name: set.setName || set.name || "",
  series: set.series || "",
  code: set.setCode || set.code || set.ptcgoCode || "",
  setAliases: set.aliases || set.setAliases || [set.setCode, set.ptcgoCode, set.id].filter(Boolean),
  releaseDate: set.releaseDate || "",
  printedTotal: set.printedTotal || "",
  total: set.total || "",
  logoUrl: set.logoUrl || "",
  symbolUrl: set.symbolUrl || "",
  imageSource: set.imageSource || (set.logoUrl || set.symbolUrl ? "pokemon_tcg_api" : "placeholder"),
  imageStatus: set.imageStatus || (set.logoUrl || set.symbolUrl ? "api" : "placeholder"),
  imageLastUpdated: set.imageLastUpdated || set.lastUpdated || "",
  imageNeedsReview: Boolean(set.imageNeedsReview),
  source: set.sourceType || set.source || "pokemon_tcg_api_json",
}));

const setByCode = new Map();
[...localPokemonSets, ...normalizedImportedSets].forEach((set) => {
  const key = String(set.code || set.name || set.setId).toLowerCase();
  if (!setByCode.has(key)) setByCode.set(key, set);
  else setByCode.set(key, { ...setByCode.get(key), ...set });
});

export const POKEMON_SETS = [...setByCode.values()];

export function getSetByCodeOrAlias(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return POKEMON_SETS.find((set) =>
    [set.name, set.code, ...(set.setAliases || [])]
      .filter(Boolean)
      .some((entry) => String(entry).toLowerCase() === normalized)
  );
}
