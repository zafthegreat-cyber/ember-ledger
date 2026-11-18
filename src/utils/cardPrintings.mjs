// Card printings (Nov 17 2026, owner: "make sure it is getting holo, reverse holo,
// regular, trick or treat, all variations").
// The catalog's printing names are inconsistent ("holofoil", "Holofoil",
// "1stEditionHolofoil"); these helpers give one tidy label per printing and
// the full set of choices for a card. A photo cannot reliably tell foil from
// non-foil, so the person always confirms the printing; the catalog's own
// printings for that card are listed first.

const text = (value) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");

/** One tidy label for any catalog or typed printing name. */
export function printingLabel(value) {
  const raw = text(value);
  if (!raw) return "";
  const key = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .toLowerCase()
    .replace(/\bfirst edition\b|\b1st ed(?:ition)?\b|\b1stedition\b/g, "1st edition")
    .replace(/\bholofoil\b|\bholo foil\b/g, "holo")
    .replace(/\bnon ?holo\b|\bnon ?foil\b|\bregular\b|\bnormal\b|\bstandard\b/g, "normal")
    .replace(/\s+/g, " ")
    .trim();
  const known = {
    normal: "Normal",
    holo: "Holo",
    "reverse holo": "Reverse Holo",
    "1st edition": "1st Edition",
    "1st edition holo": "1st Edition Holo",
    "1st edition normal": "1st Edition",
    unlimited: "Unlimited",
    "unlimited holo": "Unlimited Holo",
    "unlimited normal": "Unlimited",
  };
  if (known[key]) return known[key];
  return key.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bEx\b/, "ex");
}

/** Finishes most modern cards can come in, in the order people look for them. */
export const COMMON_FINISHES = Object.freeze(["Normal", "Holo", "Reverse Holo"]);

/** Special printings and stamps that are the same card number but a different collectible. */
export const SPECIAL_PRINTINGS = Object.freeze([
  { key: "trick-or-treat", label: "Trick or Treat (Halloween stamp)", hint: "Pikachu pumpkin stamp; from Trick or Treat mini packs" },
  { key: "poke-ball-reverse", label: "Poké Ball reverse holo", hint: "Poké Ball pattern foil" },
  { key: "master-ball-reverse", label: "Master Ball reverse holo", hint: "Master Ball pattern foil" },
  { key: "cosmos-holo", label: "Cosmos holo", hint: "Circle-pattern foil, often promos and blister packs" },
  { key: "cracked-ice", label: "Cracked ice holo", hint: "Shattered-glass foil pattern" },
  { key: "prerelease", label: "Prerelease stamp", hint: "Prerelease logo stamped on the art" },
  { key: "staff", label: "Staff stamp", hint: "STAFF stamped on the card" },
  { key: "pokemon-center", label: "Pokémon Center stamp", hint: "Pokémon Center logo stamp" },
  { key: "league", label: "League or championship stamp", hint: "League, Regional, Worlds or similar stamp" },
  { key: "first-edition", label: "1st Edition", hint: "1st Edition symbol on the left under the art" },
  { key: "shadowless", label: "Shadowless", hint: "Base Set with no shadow beside the art box" },
  { key: "jumbo", label: "Jumbo / oversized", hint: "Oversized card" },
  { key: "error", label: "Error / misprint", hint: "Printing error you want to track separately" },
]);

/**
 * All printing choices for a card: the catalog's printings for this card first
 * (tidied and de-duplicated), then common finishes it does not list.
 * @returns {{ label: string, fromCatalog: boolean }[]}
 */
export function printingChoices(catalogNames = []) {
  const seen = new Set();
  const out = [];
  const add = (label, fromCatalog) => {
    const tidy = printingLabel(label);
    if (!tidy || seen.has(tidy.toLowerCase())) return;
    seen.add(tidy.toLowerCase());
    out.push({ label: tidy, fromCatalog });
  };
  for (const name of catalogNames) add(name, true);
  for (const name of COMMON_FINISHES) add(name, false);
  return out;
}

/** Combines a finish and an optional special printing into the saved variant text. */
export function combinePrinting(finish, specialKey = "") {
  const special = SPECIAL_PRINTINGS.find((item) => item.key === specialKey);
  const base = printingLabel(finish) || "";
  if (!special) return base;
  if (special.key === "first-edition") return base && base !== "Normal" ? `1st Edition ${base}` : "1st Edition";
  if (special.key.endsWith("-reverse") || special.key === "cosmos-holo" || special.key === "cracked-ice") return special.label.replace(/ \(.*\)$/, "");
  return base ? `${base} · ${special.label.replace(/ \(.*\)$/, "")}` : special.label.replace(/ \(.*\)$/, "");
}
