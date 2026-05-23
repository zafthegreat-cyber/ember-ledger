export const CATALOG_PAGE_SIZE = 50;

export function cleanCatalogSearch(value) {
  return normalizeCatalogQuery(value).slice(0, 140);
}

export function normalizeCatalogQuery(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pok(?:e|\u00e9)mon/gi, "pokemon")
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .replace(/[+_:/\\|]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/-/g, " ")
    .replace(/[.,%()[\]{}"!?]/g, " ")
    .toLowerCase()
    .replace(/\bpkmn\b/g, "pokemon")
    .replace(/\bpoke\b/g, "pokemon")
    .replace(/\bswsh\b/g, "sword shield")
    .replace(/\bs and v\b/g, "sv")
    .replace(/\b3\s*pk\b/g, "3 pack")
    .replace(/\bpc\s*etb\b/g, "pc etb")
    .replace(/\bb\s+and\s+b\b/g, "b and b")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function detectCatalogSearchMode(input) {
  const normalized = normalizeCatalogQuery(input);
  if (!normalized) return "general";
  if (/^\d{8,}$/.test(normalized)) return "barcode";
  if (/^(tg|gg|svp|h|rc)?\d{1,4}(\/(tg|gg|svp|h|rc)?\d{1,4})?$/i.test(normalized)) return "cardNumber";
  if (/^\d{5,}$/.test(normalized)) return "id";
  if (hasLikelyCatalogShorthand(normalized)) return "shorthand";
  return "general";
}

export function hasCatalogSearchCriteria({
  query = "",
  barcode = "",
  productGroup = "All",
  productType = "All",
  setName = "All",
  dataFilter = "All",
  rarity = "All",
} = {}) {
  return (
    cleanCatalogSearch(query).length >= 2 ||
    cleanCatalogSearch(barcode).length > 0 ||
    productGroup !== "All" ||
    productType !== "All" ||
    setName !== "All" ||
    dataFilter !== "All" ||
    rarity !== "All"
  );
}

function hasLikelyCatalogShorthand(normalized = "") {
  return /\b(etb|pc etb|elite trainer|booster|bundle|bb|tin|mini tin|portfolio|mini portfolio|blister|3 pack|collector|chest|upc|ultra premium|binder|poster|collection)\b/.test(normalized) ||
    /\b(pr evo|prismatic|sv\d|swsh\d|scarlet violet 151|151|crown zenith|surging sparks|journey together|destined rivals)\b/.test(normalized);
}
