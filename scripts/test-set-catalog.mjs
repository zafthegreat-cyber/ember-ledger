import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSetCatalogEntries, filterSetCatalogEntries, createSetCatalogItemSeed } from "../src/utils/setCatalog.mjs";
import { createSetCatalogLoader } from "../src/services/setCatalogLoader.mjs";
import { createSetCatalogSnapshot } from "../build/setCatalogPlugin.mjs";
import { normalizeOwnedItem } from "../src/features/ownedItems/ownedItemPurpose.js";

const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const card = freeze({ id: "catalog-a", tcgplayerProductId: "101", name: "Test Card", tcgGame: "pokemon", setName: "Aquapolis", language: "English", cardNumber: "001/147", catalogType: "card", marketPrice: 33, imageUrl: "/card.png" });
const box = freeze({ id: "catalog-box", tcgplayerProductId: "202", name: "Test Booster Box", tcgGame: "pokemon", setName: "Aquapolis", language: "English", catalogType: "sealed", marketPrice: 100 });
const owned = patch => freeze({ id: "owned-a", tcgGame: "pokemon", name: card.name, setName: card.setName, language: "English", quantity: 1, productClassification: "Raw card", ...patch });

test("matching catalog products stack original acquisitions without changing costs or saved prices", () => {
  const items = [owned({ tcgplayerProductId: "101", quantity: 2, marketPrice: 22, purchaseDate: "2026-10-01", allocatedItemCost: 4 }), owned({ id: "copy-b", catalogProductId: "catalog-a", quantity: 1, marketPrice: 31, purchaseDate: "2026-10-02", allocatedItemCost: 5 }), owned({ id: "box", name: "Old box name", tcgplayerProductId: "202", productClassification: "Sealed product", quantity: 3 })];
  const source = freeze({ catalogRecords: [card, box], ownedItems: items }); const before = JSON.stringify(source);
  const entries = buildSetCatalogEntries(source);
  assert.equal(entries.length, 2); assert.equal(entries[0].ownedQuantity, 3); assert.equal(entries[1].ownedQuantity, 3);
  assert.equal(entries[0].records[0], items[0]); assert.equal(entries[0].records[1], items[1]);
  assert.equal(JSON.stringify(source), before); assert.equal(entries[0].product.marketPrice, 33);
});

test("sealed contents never imply owned singles, and conflicting IDs/languages/games stay separate", () => {
  const items = [owned({ id: "sealed", name: box.name, productClassification: "Sealed product", tcgplayerProductId: "202", quantity: 2 }), owned({ id: "jp", language: "Japanese", tcgplayerProductId: "101" }), owned({ id: "foreign", tcgGame: "magic", tcgplayerProductId: "101" }), owned({ id: "conflict", tcgplayerProductId: "101", catalogProductId: "wrong-catalog-id" }), owned({ id: "variant", tcgplayerProductId: "101", edition: "First edition" })];
  const variantCard = { ...card, edition: "Unlimited" };
  const entries = buildSetCatalogEntries({ catalogRecords: [variantCard, box], ownedItems: items });
  assert.equal(entries.find(entry => entry.product.id === card.id).owned, false);
  assert.equal(entries.find(entry => entry.product.id === box.id).ownedQuantity, 2);
  assert.equal(entries.filter(entry => entry.savedOnly).length, 4);
  assert.equal(filterSetCatalogEntries(entries, { ownedOnly: true }).length, 5);
});

test("exact legacy identities can match, ambiguous cards and unrelated barcode IDs cannot", () => {
  const numbered = owned({ cardNumber: "001/147" });
  assert.equal(buildSetCatalogEntries({ catalogRecords: [card], ownedItems: [numbered] })[0].owned, true);
  const noNumber = owned({});
  const ambiguous = [card, { ...card, id: "catalog-b", tcgplayerProductId: "102" }];
  for (const [catalog, record] of [[ambiguous, numbered], [[card], noNumber], [[card], owned({ barcode: "not-matched" })]]) {
    const entries = buildSetCatalogEntries({ catalogRecords: catalog, ownedItems: [record] });
    assert.equal(entries.filter(entry => !entry.savedOnly && entry.owned).length, 0);
    assert.equal(entries.filter(entry => entry.savedOnly).length, 1);
  }
});

test("legacy set aliases and padded card numbers match without collapsing different subsets or sets", () => {
  const product = freeze({ ...card, setName: "SWSH08: Fusion Strike" });
  const copy = owned({ setName: "Fusion Strike", cardNumber: "1/147" });
  const matched = buildSetCatalogEntries({ catalogRecords: [product], ownedItems: [copy] });
  assert.equal(matched.length, 1); assert.equal(matched[0].owned, true); assert.equal(matched[0].records[0], copy); assert.equal(copy.cardNumber, "1/147");
  for (const record of [owned({ tcgplayerProductId: "101", cardNumber: "GG01" }), owned({ tcgplayerProductId: "101", setName: "Another set" })]) {
    const entries = buildSetCatalogEntries({ catalogRecords: [card], ownedItems: [record] }); assert.equal(entries.find(entry => !entry.savedOnly).owned, false); assert.equal(entries.filter(entry => entry.savedOnly).length, 1);
  }
});

test("zero quantities remain unowned and overflowing aggregates are flagged instead of rounded", () => {
  const hugeCopies = Array.from({ length: 101 }, (_, index) => owned({ id: `huge-copy-${index}`, tcgplayerProductId: "202", name: box.name, productClassification: "Sealed product", quantity: Math.floor(Number.MAX_SAFE_INTEGER / 100) }));
  const entries = buildSetCatalogEntries({ catalogRecords: [card, box], ownedItems: [owned({ tcgplayerProductId: "101", quantity: 0 }), ...hugeCopies] });
  assert.equal(entries[0].owned, false); assert.equal(entries[1].owned, true); assert.equal(entries[1].ownedQuantity, null);
});

test("duplicate catalog IDs retain the latest available price snapshot without using it as saved ownership", () => {
  const old = { ...card, marketPrice: 1, priceCheckedAt: "2026-10-01T00:00:00Z" };
  const latest = { ...card, marketPrice: 2, priceCheckedAt: "2026-11-08T00:00:00Z" };
  for (const catalog of [[old, latest], [latest, old]]) {
    const entries = buildSetCatalogEntries({ catalogRecords: catalog });
    assert.equal(entries.length, 1); assert.equal(entries[0].product, latest); assert.equal(entries[0].owned, false);
  }
});

test("a newer catalog alias keeps old saved links to the same proven TCGplayer product", () => {
  const newest = freeze({ ...card, id: "database-catalog-alias", marketPrice: 44, priceCheckedAt: "2026-11-08T20:00:00Z" });
  const record = owned({ catalogProductId: card.id, tcgplayerProductId: card.tcgplayerProductId, quantity: 2, marketPrice: 11 });
  const entries = buildSetCatalogEntries({ catalogRecords: [card, newest], ownedItems: [record] });
  assert.equal(entries.length, 1); assert.equal(entries[0].product, newest); assert.equal(entries[0].records[0], record); assert.equal(entries[0].ownedQuantity, 2); assert.equal(record.marketPrice, 11);
});

test("type, ownership and number/name search combine without changing the source", () => {
  const source = freeze({ catalogRecords: [box, { ...card, id: "card10", tcgplayerProductId: "110", cardNumber: "010" }, card, { ...card, id: "card2", tcgplayerProductId: "102", cardNumber: "002" }], ownedItems: [owned({ tcgplayerProductId: "101" })] });
  const before = JSON.stringify(source), entries = buildSetCatalogEntries(source);
  assert.deepEqual(entries.slice(0,3).map(entry => entry.product.cardNumber), ["001/147", "002", "010"]);
  assert.equal(filterSetCatalogEntries(entries, { kind: "sealed" }).length, 1);
  assert.equal(filterSetCatalogEntries(entries, { kind: "card", ownedOnly: true, query: "001" }).length, 1);
  assert.equal(filterSetCatalogEntries(entries, { query: "booster" })[0].product, box);
  assert.equal(JSON.stringify(source), before);
});

test("Add starts a new reviewed item with catalog links, never a catalog ID as a record ID or invented purchase data", () => {
  const product = freeze({ ...card, quantity: 100, allocatedItemCost: 99, purchaseDate: "2000-01-01", createdAt: "1999-01-01" });
  const seed = createSetCatalogItemSeed({ name: "Aquapolis", gameId: "pokemon" }, product);
  assert.equal(seed.id, undefined); assert.equal(seed.quantity, 1); assert.equal(seed.catalogProductId, card.id);
  assert.equal(seed.tcgplayerProductId, "101"); assert.equal(seed.marketPrice, 33);
  for (const field of ["allocatedItemCost", "purchaseDate", "createdAt"]) assert.equal(seed[field], undefined);
  const record = normalizeOwnedItem(seed); assert.equal(record.catalogProductId, card.id); assert.equal(record.cardNumber, "001/147");
  assert.equal(createSetCatalogItemSeed({ name: "Aquapolis", gameId: "pokemon" }, { ...card, marketPrice: 0, marketStatus: "unknown" }).marketPrice, undefined);
  assert.equal(createSetCatalogItemSeed({ name: "Aquapolis", gameId: "pokemon" }, { ...card, marketPrice: 0, marketStatus: "cached" }).marketPrice, 0);
});

test("per-set assets contain public catalog fields only and exclude digital code cards/accessories", () => {
  const input = freeze([{ ...card, privateNote: "must not ship", quantity: 123 }, { ...box, name: "Code Card Test", isSealed: true }, { ...box, id: "accessory", isAccessory: true }]);
  const before = JSON.stringify(input), rows = createSetCatalogSnapshot([input[0]], input.slice(1));
  assert.equal(rows.length, 1); const payload = JSON.parse(rows[0].json);
  assert.equal(payload.products.length, 1); assert.equal(payload.products[0].marketPrice, 33);
  assert.equal(payload.products[0].privateNote, undefined); assert.equal(payload.products[0].quantity, undefined);
  assert.equal(JSON.stringify(input), before);
});

test("actual Aquapolis snapshot contains its real 185 card entries and two sealed products in a small independent asset", () => {
  const cards = JSON.parse(readFileSync(new URL("../src/data/generated/pokemonTcgCards.json", import.meta.url)));
  const sealed = JSON.parse(readFileSync(new URL("../src/data/generated/sealedProducts.json", import.meta.url)));
  const rows = createSetCatalogSnapshot(cards, sealed), aquapolis = rows.find(row => row.key === "pokemon:aquapolis");
  assert.equal(aquapolis.cards, 185); assert.equal(aquapolis.sealed, 2); assert.ok(Buffer.byteLength(aquapolis.json) < 100_000);
  const payload = JSON.parse(aquapolis.json); assert.ok(payload.products.every(product => product.setName === "Aquapolis"));
  const original = new Map([...cards, ...sealed].map(product => [product.id, product]));
  assert.ok(payload.products.every(product => product.language === original.get(product.id).language), "Unrecorded languages are not guessed from the game category");
  assert.equal(new Set(payload.products.map(product => product.tcgplayerProductId)).size, 187);
  assert.equal(payload.products.find(product => product.id === cards.find(card => card.setName === "Aquapolis").id).marketPrice, cards.find(card => card.setName === "Aquapolis").marketPrice);
});

test("loader fetches only the selected asset, caches successful sets and never fetches unknown sets", async () => {
  const requests = [], manifest = async () => ({ "pokemon:aquapolis": { url: "/asset-a.json", cards: 1, sealed: 0 } });
  const load = createSetCatalogLoader({ manifest, fetcher: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ schemaVersion: 1, key: "pokemon:aquapolis", products: [card] }) }; } });
  assert.equal((await load("pokemon:aquapolis")).products[0], card); await load("pokemon:aquapolis");
  assert.equal(requests.length, 1); assert.equal(requests[0].url, "/asset-a.json");
  assert.equal((await load("magic:aquapolis")).available, false); assert.equal(requests.length, 1);
});

test("loader rejects wrong-set responses, retries failures, cancels requests and bounds its cache", async () => {
  let calls = 0, wrong = true;
  const manifest = async () => ({ a: { url: "/a" }, b: { url: "/b" } });
  const load = createSetCatalogLoader({ manifest, maxCachedSets: 1, fetcher: async url => { calls++; return { ok: true, json: async () => ({ schemaVersion: 1, key: wrong ? "wrong" : url.slice(1), products: [] }) }; } });
  await assert.rejects(load("a"), /verified/); wrong = false; await load("a"); await load("b"); await load("a"); assert.equal(calls, 4);
  const controller = new AbortController(); controller.abort(); await assert.rejects(load("a", { signal: controller.signal }), { name: "AbortError" }); assert.equal(calls, 4);
  let offline = true;
  const retry = createSetCatalogLoader({ manifest, fetcher: async () => { if (offline) throw Error("offline"); return { ok: true, json: async () => ({ schemaVersion: 1, key: "a", products: [] }) }; } });
  await assert.rejects(retry("a"), /offline/); offline = false; assert.equal((await retry("a")).available, true);
});
