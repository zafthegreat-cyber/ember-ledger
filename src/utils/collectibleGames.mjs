import { POKEMON_SET_ALIAS_ROWS } from "../data/catalogSearchAliases.mjs";

// A focused presentation registry. A game being listed does not promise a
// catalog, price feed, checklist, retailer connection or automatic recognition.
export const COLLECTIBLE_GAMES = Object.freeze([
  Object.freeze({ id: "pokemon", name: "Pokémon", shortName: "PKMN", catalogSupported: true }),
  Object.freeze({ id: "magic", name: "Magic: The Gathering", shortName: "MTG", catalogSupported: false }),
  Object.freeze({ id: "yugioh", name: "Yu-Gi-Oh!", shortName: "YGO", catalogSupported: false }),
  Object.freeze({ id: "one-piece", name: "One Piece", shortName: "OP", catalogSupported: false }),
  Object.freeze({ id: "lorcana", name: "Disney Lorcana", shortName: "LOR", catalogSupported: false }),
]);

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function key(value) { return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
const aliases = new Map([
  ["pokemon", ["pokemon", "pokemon tcg", "pokemon trading card game", "pkmn"]],
  ["magic", ["magic", "magic the gathering", "mtg", "magic tcg"]],
  ["yugioh", ["yugioh", "yu gi oh", "yu gi oh tcg", "yugioh tcg", "yu gi oh trading card game"]],
  ["one-piece", ["one piece", "onepiece", "one piece tcg", "one piece card game"]],
  ["lorcana", ["lorcana", "disney lorcana", "disney lorcana tcg"]],
].flatMap(([id, values]) => values.map((value) => [key(value), id])));

export function normalizeCollectibleGame(value) { return aliases.get(key(value)) || "unspecified"; }

const EXPLICIT_FIELDS = ["tcgGame", "tcg_game", "gameId", "game_id", "game", "gameName", "game_name"];
const SECONDARY_FIELDS = ["category", "tcgType", "tcg_type", "productLine", "product_line"];
const POKEMON_SOURCES = new Set(["pokemon tcg api", "pokemon tcg api json", "pokemontcg io", "pokemon catalog", "pokemon catalog browse", "pokemon tcg"]);
const POKEMON_SET_NAMES = new Set(POKEMON_SET_ALIAS_ROWS.map((row) => key(row.name)));
function canonicalSetName(record) {
  const name = ["setName", "set_name", "expansionOfficialName", "expansion_official_name", "expansionDisplayName", "expansion_display_name", "expansion"].map((field) => text(record?.[field])).find(Boolean) || "";
  // A full catalog set name is a useful legacy clue; a bare short code is not.
  return key(name.replace(/^(?:sv\d*(?:\.\d+)?|swsh\d*|sm\d*|xy\d*|bw\d*|me\d*)\s*[:–—-]\s*/i, ""));
}

export function getRecordGame(record = {}) {
  const explicit = EXPLICIT_FIELDS.map((field) => record?.[field]).filter((value) => value != null && (typeof value !== "string" || text(value)));
  if (explicit.length) {
    const ids = new Set(explicit.map(normalizeCollectibleGame));
    return ids.size === 1 && !ids.has("unspecified") ? [...ids][0] : "unspecified";
  }
  const secondary = new Set(SECONDARY_FIELDS.map((field) => normalizeCollectibleGame(record?.[field])).filter((id) => id !== "unspecified"));
  if (secondary.size > 1) return "unspecified";
  if (secondary.size === 1) return [...secondary][0];
  const sources = ["source", "sourceType", "source_type", "sourceName", "source_name", "catalogSource", "catalog_source"].map((field) => key(record?.[field]));
  if (sources.some((value) => POKEMON_SOURCES.has(value))) return "pokemon";
  return POKEMON_SET_NAMES.has(canonicalSetName(record)) ? "pokemon" : "unspecified";
}

export function getRecordGameLabel(record = {}) {
  const id = getRecordGame(record);
  if (id !== "unspecified") return COLLECTIBLE_GAMES.find((game) => game.id === id).name;
  const explicit = EXPLICIT_FIELDS.map((field) => text(record?.[field])).filter(Boolean);
  const custom = explicit.find((value) => normalizeCollectibleGame(value) === "unspecified" && !["unspecified", "unknown", "not recorded", "other"].includes(key(value)));
  return custom && new Set(explicit.map(key)).size === 1 ? custom.slice(0, 80) : "Game not recorded";
}

export function matchesRecordGame(record, selected = "all") {
  if (selected === "all") return true;
  if (selected === "unspecified") return getRecordGame(record) === "unspecified";
  const game = normalizeCollectibleGame(selected);
  return game !== "unspecified" && getRecordGame(record) === game;
}

const GAME_IDS = new Set([...COLLECTIBLE_GAMES.map((game) => game.id), "unspecified"]);
function assignmentTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("The game change needs a valid date and time.");
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error("The game change needs a valid date and time.");
  return new Date(value).toISOString();
}
function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function validHistory(value) {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!isPlainObject(entry) || Object.keys(entry).some((field) => !["at", "previousLabels", "game"].includes(field)) || !GAME_IDS.has(entry.game) || !isPlainObject(entry.previousLabels) || Object.keys(entry.previousLabels).some((field) => !EXPLICIT_FIELDS.includes(field))) return false;
    try { assignmentTime(entry.at); return true; } catch { return false; }
  });
}

/** Apply an owner's explicit game selection to a draft, without writing storage.
 * Existing aliases are archived before cleanup so the ordinary Save action can
 * confirm a correction without discarding the exact labels imported earlier.
 */
export function assignCollectibleGame(record, selected, { at = new Date().toISOString() } = {}) {
  if (!isPlainObject(record)) throw new Error("The item could not be read safely.");
  if (!GAME_IDS.has(selected)) throw new Error("Choose a supported game or Unspecified / other.");
  if (Object.hasOwn(record, "tcgGameAssignmentHistory") && !validHistory(record.tcgGameAssignmentHistory)) throw new Error("Existing game change history needs review. Its original data has been kept.");
  const timestamp = assignmentTime(at);
  const previousLabels = Object.fromEntries(EXPLICIT_FIELDS.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]]));
  const nonempty = Object.values(previousLabels).some((value) => value != null && (typeof value !== "string" || text(value)));
  const changed = Object.keys(previousLabels).some((field) => field !== "tcgGame") || previousLabels.tcgGame !== selected;
  const next = { ...record };
  for (const field of EXPLICIT_FIELDS) if (field !== "tcgGame") delete next[field];
  next.tcgGame = selected;
  if (record.id && nonempty && changed) {
    next.tcgGameAssignmentHistory = [...(record.tcgGameAssignmentHistory || []), { at: timestamp, previousLabels, game: selected }];
  }
  return next;
}
