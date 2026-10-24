import artwork from "../data/setArtwork.json" with { type: "json" };

// Artwork identity is separate from collection grouping, checklists and prices.
// Only reviewed exact names/aliases are indexed; a product photo is never a logo.
function key(value) {
  return typeof value === "string" ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ") : "";
}

function setKey(value) {
  return key(typeof value === "string" ? value.replace(/^(?:sv\d*(?:\.\d+)?|swsh\d*|sm\d*|xy\d*|bw\d*|me\d*)\s*[:–—-]\s*/i, "") : value);
}

const index = new Map();
for (const row of artwork.sets) {
  if (row.game !== "pokemon" || row.language !== "en") continue;
  for (const value of [row.name, row.id, ...(row.aliases || [])]) {
    const alias = setKey(value);
    if (!alias) continue;
    if (!index.has(alias)) index.set(alias, new Set());
    index.get(alias).add(row);
  }
}

export function resolveSetArtwork({ game, name, language = "en", code = "" } = {}) {
  if (game !== "pokemon" || !["en", "eng", "english"].includes(key(language))) return null;
  // A named custom set must not acquire another set's logo through its code.
  const matches = index.get(setKey(name) || setKey(code));
  return matches?.size === 1 ? [...matches][0] : null;
}

export function resolveGameArtwork(id) {
  return artwork.games.find((row) => row.id === id) || null;
}
