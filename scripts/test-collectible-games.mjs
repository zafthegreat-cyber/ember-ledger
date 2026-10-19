import assert from "node:assert/strict";
import { COLLECTIBLE_GAMES, normalizeCollectibleGame, getRecordGame, getRecordGameLabel, matchesRecordGame, assignCollectibleGame } from "../src/utils/collectibleGames.mjs";
import { normalizeFlipScoutState, serializeFlipScoutState, deserializeFlipScoutState } from "../src/features/flipScout/storageRepository.js";
import { validateBackupSourceData } from "../src/features/backup/backupValidation.js";
import { BACKUP_SOURCE_REGISTRY } from "../src/features/backup/backupSourceRegistry.js";
import { captureWorkspaceSources } from "../src/features/persistence/cloudWorkspaceSources.js";

let passed = 0;
const test = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };
const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test("focused registry lists five games and only promises the existing Pokémon catalog", () => {
  assert.deepEqual(COLLECTIBLE_GAMES.map((game) => game.id), ["pokemon", "magic", "yugioh", "one-piece", "lorcana"]);
  assert.deepEqual(COLLECTIBLE_GAMES.filter((game) => game.catalogSupported).map((game) => game.id), ["pokemon"]);
  assert.equal(Object.isFrozen(COLLECTIBLE_GAMES), true); assert.equal(COLLECTIBLE_GAMES.every(Object.isFrozen), true);
});
test("exact familiar aliases normalize without substring guesses", () => {
  for (const [value, game] of [["Pokémon TCG", "pokemon"], ["MTG", "magic"], ["Magic: The Gathering", "magic"], ["Yu-Gi-Oh!", "yugioh"], ["ONE PIECE CARD GAME", "one-piece"], ["Disney Lorcana", "lorcana"]]) assert.equal(normalizeCollectibleGame(value), game);
  for (const value of ["Magic sleeves", "Pokémon vs Magic", "One Piece art book", "", null, true, {}, "Digimon"]) assert.equal(normalizeCollectibleGame(value), "unspecified");
});
test("explicit game is authoritative over legacy set, catalog category and source clues", () => {
  assert.equal(getRecordGame({ tcgGame: "magic", setName: "Fusion Strike", category: "Pokemon", source: "pokemon_tcg_api_json" }), "magic");
  assert.equal(getRecordGame({ tcg_game: "lorcana", setName: "Celebrations" }), "lorcana");
});
test("conflicting explicit supported IDs are withheld instead of arbitrarily choosing one", () => {
  for (const record of [{ tcgGame: "magic", gameId: "pokemon" }, { tcgGame: "one-piece", gameName: "Lorcana" }, { game: "Pokemon", gameId: "magic" }, { tcgGame: "pokemon", tcg_game: "magic" }]) assert.equal(getRecordGame(record), "unspecified");
  assert.equal(getRecordGame({ tcgGame: "MTG", gameName: "Magic: The Gathering" }), "magic");
});
test("unsupported or intentionally unrecorded explicit games cannot fall back to Pokémon", () => {
  for (const record of [{ tcgGame: "Digimon" }, { gameId: "custom" }, { game: "unspecified" }, { tcgGame: "magic", game: "custom" }, { tcgGame: 1 }, { tcgGame: false }, { tcgGame: {} }]) assert.equal(getRecordGame({ setName: "Fusion Strike", category: "Pokemon", source: "pokemon_tcg_api", ...record }), "unspecified");
});
test("secondary game fields require exact matches and conflicting categories are withheld", () => {
  assert.equal(getRecordGame({ category: "Pokemon" }), "pokemon");
  assert.equal(getRecordGame({ productLine: "Disney Lorcana" }), "lorcana");
  assert.equal(getRecordGame({ gameName: "Yu-Gi-Oh!" }), "yugioh");
  assert.equal(getRecordGame({ productLine: "Sword & Shield" }), "unspecified");
  assert.equal(getRecordGame({ category: "Pokemon", productLine: "Magic: The Gathering" }), "unspecified");
});
test("legacy full canonical Pokémon set names are clues while abbreviations are not", () => {
  for (const setName of ["Fusion Strike", "SWSH08: Fusion Strike", "Prismatic Evolutions", "Celebrations"]) assert.equal(getRecordGame({ setName }), "pokemon");
  for (const setName of ["FST", "PE", "swsh8", "My Fusion Strike set", "Custom set", "001/264"]) assert.equal(getRecordGame({ setName }), "unspecified");
  assert.equal(getRecordGame({ setCode: "swsh8", cardNumber: "001/264", name: "Pikachu" }), "unspecified");
});
test("legacy source provenance accepts precise Pokémon providers without guessing generic sources", () => {
  for (const source of ["pokemon_tcg_api", "pokemon_tcg_api_json", "pokemon_catalog_browse", "pokemontcg.io"]) assert.equal(getRecordGame({ source }), "pokemon");
  for (const source of ["supabase", "manual", "cached", "pokemon artwork fan page", "local-beta-structure"]) assert.equal(getRecordGame({ source }), "unspecified");
});
test("labels retain supported names and custom text without labeling conflicting games Pokémon", () => {
  assert.equal(getRecordGameLabel({ tcgGame: "magic" }), "Magic: The Gathering");
  assert.equal(getRecordGameLabel({ tcgGame: "Flesh and Blood" }), "Flesh and Blood");
  assert.equal(getRecordGameLabel({ tcgGame: "unspecified" }), "Game not recorded");
  assert.equal(getRecordGameLabel({ tcgGame: "magic", game: "pokemon" }), "Game not recorded");
});
test("filters keep all and unspecified records accessible without an unsupported all-game fallback", () => {
  assert.equal(matchesRecordGame({ tcgGame: "magic" }), true);
  assert.equal(matchesRecordGame({ tcgGame: "MTG" }, "magic"), true);
  assert.equal(matchesRecordGame({ tcgGame: "magic" }, "pokemon"), false);
  assert.equal(matchesRecordGame({ tcgGame: "custom" }, "unspecified"), true);
  assert.equal(matchesRecordGame({ tcgGame: "custom" }, "custom"), false);
});
test("classification is pure and never stamps game IDs onto existing records", () => {
  const records = freeze([{ id: "legacy", setName: "Fusion Strike", allocatedItemCost: 12.5, marketPrice: 30 }, { id: "manual", tcgGame: "magic", category: "Pokemon", setName: "Foundations" }, { id: "custom", tcgGame: "Digimon", setName: "Fusion Strike" }]);
  const before = JSON.stringify(records);
  records.forEach((record) => { getRecordGame(record); getRecordGameLabel(record); matchesRecordGame(record, "pokemon"); });
  assert.equal(JSON.stringify(records), before); assert.equal(Object.hasOwn(records[0], "tcgGame"), false);
});
test("existing repository and backup envelopes retain optional game fields and original prices", () => {
  const inventory = freeze([{ id: "manual", tcgGame: "magic", name: "Saved card", quantity: 2, allocatedItemCost: 12.5, projectedResaleMid: 30, source: "manual", cardNumber: "001" }, { id: "legacy", name: "Legacy", quantity: 1, marketPrice: 37.25 }]);
  const before = JSON.stringify(inventory);
  const state = normalizeFlipScoutState({ inventory }, "2026-10-19T00:00:00.000Z");
  const decoded = deserializeFlipScoutState(serializeFlipScoutState(state));
  assert.equal(decoded.error, ""); assert.deepEqual(decoded.state.inventory, inventory);
  const source = BACKUP_SOURCE_REGISTRY.find((entry) => entry.sourceId === "deal-finder");
  assert.equal(validateBackupSourceData(source, decoded.state).valid, true);
  const stored = new Map([[source.storageKey, serializeFlipScoutState(state)]]);
  const captured = captureWorkspaceSources({ getItem: (key) => stored.get(key) ?? null });
  assert.deepEqual(captured["deal-finder"].data.inventory, inventory);
  assert.equal(stored.get(source.storageKey), serializeFlipScoutState(state));
  assert.equal(JSON.stringify(inventory), before); assert.equal(Object.hasOwn(decoded.state.inventory[1], "tcgGame"), false);
});

test("a deliberate game correction archives exact imported labels before removing conflicting aliases", () => {
  const record = freeze({ id: "manual", tcgGame: "pokemon", game: "MTG", game_name: "Magic: The Gathering", category: "Pokemon", name: "Saved card", ownedItemPurpose: "PERSONAL_COLLECTION", quantity: 2, allocatedItemCost: 12.5, projectedResaleMid: 37.25, catalogProductId: "existing-id", images: { small: "/saved.png" } });
  const before = JSON.stringify(record);
  const result = assignCollectibleGame(record, "magic", { at: "2026-10-19T12:30:00.000Z" });
  assert.equal(getRecordGame(record), "unspecified"); assert.equal(getRecordGame(result), "magic");
  assert.equal(Object.hasOwn(result, "game"), false); assert.equal(Object.hasOwn(result, "game_name"), false);
  assert.deepEqual(result.tcgGameAssignmentHistory, [{ at: "2026-10-19T12:30:00.000Z", previousLabels: { tcgGame: "pokemon", game: "MTG", game_name: "Magic: The Gathering" }, game: "magic" }]);
  const withoutGame = (item) => Object.fromEntries(Object.entries(item).filter(([field]) => !["tcgGame", "game", "game_name", "tcgGameAssignmentHistory"].includes(field)));
  assert.deepEqual(withoutGame(result), withoutGame(record)); assert.equal(JSON.stringify(record), before);
});
test("prior assignment history is retained and exact custom labels remain recoverable", () => {
  const previous = freeze({ at: "2026-10-18T12:00:00.000Z", previousLabels: { gameId: "MTG" }, game: "magic" });
  const record = freeze({ id: "custom", tcgGame: "  Flesh and Blood  ", gameId: "custom", tcgGameAssignmentHistory: [previous], marketPrice: 0 });
  const result = assignCollectibleGame(record, "unspecified", { at: "2026-10-19T00:00:00.000Z" });
  assert.equal(result.tcgGameAssignmentHistory.length, 2); assert.deepEqual(result.tcgGameAssignmentHistory[0], previous);
  assert.deepEqual(result.tcgGameAssignmentHistory[1].previousLabels, { tcgGame: "  Flesh and Blood  ", gameId: "custom" });
  assert.equal(getRecordGame(result), "unspecified"); assert.equal(result.marketPrice, 0);
});
test("new records and unchanged canonical labels do not invent correction history", () => {
  const existing = freeze({ id: "same", tcgGame: "magic", quantity: 1 });
  const same = assignCollectibleGame(existing, "magic");
  assert.deepEqual(same, existing); assert.notEqual(same, existing);
  assert.equal(Object.hasOwn(assignCollectibleGame({ game: "MTG", name: "New card" }, "magic"), "tcgGameAssignmentHistory"), false);
  assert.equal(Object.hasOwn(assignCollectibleGame({ id: "unrecorded", name: "Existing card" }, "magic"), "tcgGameAssignmentHistory"), false);
});
test("alias cleanup preserves the exact old alias even when its normalized game is unchanged", () => {
  const record = freeze({ id: "alias", game_name: "MTG", tcg_game: "Magic: The Gathering" });
  const result = assignCollectibleGame(record, "magic");
  assert.equal(getRecordGame(result), "magic");
  assert.deepEqual(result.tcgGameAssignmentHistory[0].previousLabels, { tcg_game: "Magic: The Gathering", game_name: "MTG" });
});
test("malformed prior history fails closed instead of being discarded during manual correction", () => {
  const malformed = [null, {}, "old", [null], [{ at: "yesterday", previousLabels: { game: "MTG" }, game: "magic" }], [{ at: "2026-10-18T00:00:00.000Z", previousLabels: [], game: "magic" }], [{ at: "2026-10-18T00:00:00.000Z", previousLabels: { name: "Do not lose" }, game: "magic" }], [{ at: "2026-10-18T00:00:00.000Z", previousLabels: { game: "MTG" }, game: "custom" }]];
  for (const tcgGameAssignmentHistory of malformed) {
    const record = freeze({ id: "review", game: "MTG", tcgGameAssignmentHistory }); const before = JSON.stringify(record);
    assert.throws(() => assignCollectibleGame(record, "magic"), /history needs review/);
    assert.equal(JSON.stringify(record), before);
  }
});
test("manual assignment rejects unsupported selections and impossible event times without mutations", () => {
  const record = freeze({ id: "source", game: "MTG" }); const before = JSON.stringify(record);
  for (const selected of ["all", "MTG", "Digimon", "", null]) assert.throws(() => assignCollectibleGame(record, selected), /Choose a supported game/);
  for (const at of ["", "2026-02-30T00:00:00.000Z", "yesterday", "2026-10-19", null]) assert.throws(() => assignCollectibleGame(record, "magic", { at }), /valid date and time/);
  assert.equal(JSON.stringify(record), before);
});
test("reviewed game correction history survives repository, backup, and cloud-envelope capture", () => {
  const original = freeze({ id: "saved", tcgGame: "pokemon", gameName: "Magic", name: "Existing card", quantity: 2, allocatedItemCost: 12.5, projectedResaleMid: 37.25, ownedItemPurpose: "PERSONAL_COLLECTION" });
  const changed = assignCollectibleGame(original, "magic", { at: "2026-10-19T01:00:00.000Z" });
  const state = normalizeFlipScoutState({ inventory: [changed] }, "2026-10-19T01:00:00.000Z");
  const roundtrip = deserializeFlipScoutState(serializeFlipScoutState(state));
  assert.equal(roundtrip.error, ""); assert.deepEqual(roundtrip.state.inventory[0], changed);
  const source = BACKUP_SOURCE_REGISTRY.find((entry) => entry.sourceId === "deal-finder");
  assert.equal(validateBackupSourceData(source, roundtrip.state).valid, true);
  const bytes = serializeFlipScoutState(state);
  const captured = captureWorkspaceSources({ getItem: (key) => key === source.storageKey ? bytes : null });
  assert.deepEqual(captured["deal-finder"].data.inventory[0], changed);
  assert.equal(captured["deal-finder"].data.inventory[0].projectedResaleMid, 37.25);
  assert.equal(Object.hasOwn(original, "tcgGameAssignmentHistory"), false);
});

console.log(`Collectible games: ${passed} scenarios passed.`);
