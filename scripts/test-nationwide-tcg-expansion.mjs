import test from "node:test";
import assert from "node:assert/strict";
import { COLLECTIBLE_GAMES, normalizeCollectibleGame, getRecordGame, assignCollectibleGame } from "../src/utils/collectibleGames.mjs";
import { US_STATES } from "../src/data/usStates.js";
import { prepareRestockFeedEntries, filterRestockFeed, restockFeedBrowseState, restockFeedLocationOptions } from "../src/utils/restockFeedPresentation.mjs";
import { parseStockScreenshotText, createStockScreenshotPatch } from "../src/utils/stockScreenshotDraft.mjs";
import { normalizeFlipScoutState, serializeFlipScoutState, deserializeFlipScoutState } from "../src/features/flipScout/storageRepository.js";
import { captureWorkspaceSources } from "../src/features/persistence/cloudWorkspaceSources.js";

const now = Date.parse("2026-11-08T17:00:00Z");
const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const category = (game) => game.id === "pokemon" ? "Pokemon TCG" : game.name;

test("every canonical game and publisher label round-trips without conflating separate games", () => {
  for (const game of COLLECTIBLE_GAMES) {
    assert.equal(normalizeCollectibleGame(game.id), game.id);
    assert.equal(normalizeCollectibleGame(game.name), game.id);
    assert.equal(getRecordGame({ tcgGame: game.id, source: "pokemon_tcg_api", setName: "Fusion Strike" }), game.id);
  }
  assert.equal(normalizeCollectibleGame("Flesh & Blood"), "flesh-and-blood");
  assert.equal(normalizeCollectibleGame("DBFW"), "dragon-ball-fusion-world");
  assert.equal(normalizeCollectibleGame("DBS Masters"), "dragon-ball-masters");
  for (const ambiguous of ["Dragon Ball", "Dragon Ball Super", "Star Wars", "Masters", "Union", "Magic sleeves"]) assert.equal(normalizeCollectibleGame(ambiguous), "unspecified");
});

test("all 663 state/game combinations filter exactly and preserve prices and reports", () => {
  const reports = freeze(US_STATES.flatMap((state) => COLLECTIBLE_GAMES.map((game) => ({
    id: `${state.code}:${game.id}`, state: state.code, city: "Shared city", region: "Shared metro",
    productCategory: category(game), productName: "Synthetic booster", stockStatus: "stock_on_shelf",
    observedAt: new Date(now - 3600000).toISOString(), marketPrice: 81.05, purchaseCost: 32.14,
  }))));
  const original = JSON.stringify(reports);
  const entries = prepareRestockFeedEntries(reports);
  assert.equal(restockFeedLocationOptions(entries).cities.length, US_STATES.length);
  for (const state of US_STATES) for (const game of COLLECTIBLE_GAMES) {
    const result = restockFeedBrowseState(entries, { state: state.code, game: game.id, period: "24h" }, now);
    assert.deepEqual(result.matches.map(({ report }) => report.id), [`${state.code}:${game.id}`]);
    assert.deepEqual(result.counts, { all: 1, stock: 1, low: 0, empty: 0 });
    assert.equal(result.recentCount, 1);
  }
  assert.equal(JSON.stringify(reports), original);
});

test("mixed and unknown games, empty states and old observations remain honest", () => {
  const reports = freeze([
    { id: "mixed", state: "TX", productCategory: "Other", itemsSeen: [{ category: "Gundam Card Game" }, { category: "Riftbound" }], observedAt: new Date(now).toISOString() },
    { id: "old", state: "CA", productCategory: "Digimon", observedAt: "2025-01-01T10:00:00Z", createdAt: new Date(now).toISOString() },
    { id: "unknown", productCategory: "Sealed product", productName: "Digimon style sleeves", notes: "Riftbound mentioned in a comment", itemsSeen: [null, "Unstructured legacy entry", []] },
  ]);
  const entries = prepareRestockFeedEntries(reports);
  for (const game of ["gundam", "riftbound"]) assert.deepEqual(filterRestockFeed(entries, { game, state: "Texas" }, now).map(({ report }) => report.id), ["mixed"]);
  assert.deepEqual(filterRestockFeed(entries, { state: "unspecified", game: "unspecified" }).map(({ report }) => report.id), ["unknown"]);
  assert.equal(filterRestockFeed(entries, { state: "NY" }).length, 0);
  assert.equal(filterRestockFeed(entries, { state: "invalid" }).length, 0);
  assert.equal(filterRestockFeed(entries, { game: "invalid" }).length, 0);
  assert.equal(restockFeedBrowseState(entries, { game: "digimon" }, now).recentCount, 0);
  assert.equal(filterRestockFeed(entries, { game: "digimon", period: "24h" }, now).length, 0);
});

test("every added game reaches screenshot review but needs an explicit store and observed time", () => {
  const stores = [{ id: "synthetic-tx", name: "Synthetic test shop", state: "TX", city: "Austin" }];
  for (const game of COLLECTIBLE_GAMES) {
    const parsed = parseStockScreenshotText(`${game.name} booster boxes in stock\nSynthetic test shop`, { stores });
    assert.equal(parsed.productCategory, category(game), game.name);
    assert.equal(parsed.flags.includes("observed_time_required"), true);
    assert.equal(createStockScreenshotPatch({}, { productName: parsed.items[0], productCategory: category(game) }, { stores, now }).ok, false);
    const reviewed = createStockScreenshotPatch({}, { storeId: stores[0].id, productName: parsed.items[0], productCategory: category(game), reportType: "stock_on_shelf", platform: "discord", reportDate: "2026-11-07", reportTime: "10:30", observedTimeConfirmed: true }, { stores, now });
    assert.equal(reviewed.ok, true, game.name);
  }
  assert.equal(parseStockScreenshotText("Dragon Ball Super booster boxes in stock").productCategory, "");
});

test("all new game records retain exact costs, copies and custom fields in the existing cloud envelope", () => {
  const inventory = freeze(COLLECTIBLE_GAMES.map((game, index) => assignCollectibleGame({ id: `saved-${index}`, name: "Saved item", quantity: 2, allocatedItemCost: 19.38, projectedResaleMid: 81.05, purchaseDate: "2026-10-01", customNotes: { keep: true } }, game.id)));
  const original = JSON.stringify(inventory);
  const state = normalizeFlipScoutState({ inventory }, "2026-11-08T12:00:00Z");
  const raw = serializeFlipScoutState(state);
  const reloaded = deserializeFlipScoutState(raw);
  assert.equal(reloaded.error, "");
  assert.deepEqual(reloaded.state.inventory, inventory);
  const captured = captureWorkspaceSources({ getItem: (key) => key === "ember-and-tide.flip-scout.v1" ? raw : null });
  assert.deepEqual(captured["deal-finder"].data.inventory, inventory);
  assert.equal(JSON.stringify(inventory), original);
});
