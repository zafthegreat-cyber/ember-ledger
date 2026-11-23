import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_PICTURES_KEY, fingerprintCardGray, matchCardPicture, readCardPictures, rememberCardPicture, writeCardPictures } from "../src/utils/cardPictureMemory.mjs";

// Synthetic photo: dark table, light card border, and "artwork" made of a seeded pattern.
function cardPhoto(seed, { brightness = 0, offsetX = 0 } = {}) {
  const width = 240, height = 336;
  const gray = new Uint8Array(width * height);
  let state = seed;
  const art = Array.from({ length: 64 }, () => { state = (state * 1103515245 + 12345) % 2147483648; return 40 + (state % 180); });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cx = x - offsetX;
      const onCard = cx >= 12 && cx < 228 && y >= 16 && y < 320;
      const inArt = cx >= 30 && cx < 210 && y >= 50 && y < 190;
      const cell = inArt ? art[Math.floor(((y - 50) / 140) * 8) * 8 + Math.floor(((cx - 30) / 180) * 8)] : 0;
      const value = !onCard ? 18 : inArt ? cell : 225;
      gray[y * width + x] = Math.max(0, Math.min(255, value + brightness));
    }
  }
  return { gray, width, height };
}
const hashOf = (photo) => fingerprintCardGray(photo.gray, photo.width, photo.height);

test("the same card matches across lighting and a small shift; a different card does not", () => {
  const charizard = hashOf(cardPhoto(7));
  const pikachu = hashOf(cardPhoto(99));
  assert.match(charizard, /^[0-9a-f]{16}$/);
  const memory = rememberCardPicture(rememberCardPicture([], { hash: charizard, catalogItemId: "c1", name: "Charizard ex", cardNumber: "199/165" }), { hash: pikachu, catalogItemId: "p1", name: "Pikachu" });
  const again = matchCardPicture(hashOf(cardPhoto(7, { brightness: 20, offsetX: 3 })), memory);
  assert.equal(again[0]?.catalogItemId, "c1");
  assert.equal(again.some((row) => row.catalogItemId === "p1"), false);
  assert.deepEqual(matchCardPicture(hashOf(cardPhoto(4242)), memory).map((row) => row.catalogItemId).filter((id) => id === "c1"), []);
});

test("memory keeps up to three photos per card, skips near-duplicates and ignores bad entries", () => {
  let memory = [];
  memory = rememberCardPicture(memory, { hash: "ffffffffffffffff", catalogItemId: "a" });
  memory = rememberCardPicture(memory, { hash: "fffffffffffffffe", catalogItemId: "a" }); // 1 bit away: replaces
  assert.equal(memory.length, 1);
  assert.equal(memory[0].hash, "fffffffffffffffe");
  memory = rememberCardPicture(memory, { hash: "0000000000000000", catalogItemId: "a" });
  memory = rememberCardPicture(memory, { hash: "00000000ffffffff", catalogItemId: "a" });
  memory = rememberCardPicture(memory, { hash: "ffffffff00000000", catalogItemId: "a" });
  assert.equal(memory.filter((row) => row.catalogItemId === "a").length, 3);
  assert.equal(rememberCardPicture(memory, { hash: "nothex", catalogItemId: "b" }).length, 3);
  assert.equal(rememberCardPicture(memory, { hash: "0123456789abcdef" }).length, 3);
  assert.deepEqual(matchCardPicture("", memory), []);
});

test("matches list each card once, closest first", () => {
  const memory = [
    { hash: "ffffffffffffff00", catalogItemId: "a", name: "A" },
    { hash: "ffffffffffffffff", catalogItemId: "a", name: "A" },
    { hash: "fffffffffffffff0", catalogItemId: "b", name: "B" },
  ];
  const found = matchCardPicture("ffffffffffffffff", memory);
  assert.deepEqual(found.map((row) => row.catalogItemId), ["a", "b"]);
  assert.equal(found[0].similarity, 100);
});

test("storage round-trip drops broken rows", () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  writeCardPictures([{ hash: "0123456789abcdef", catalogItemId: "x" }], storage);
  assert.equal(readCardPictures(storage).length, 1);
  store.set(CARD_PICTURES_KEY, JSON.stringify([{ hash: "zz", catalogItemId: "y" }, null, { hash: "0123456789abcdef", catalogItemId: "z" }]));
  assert.deepEqual(readCardPictures(storage).map((row) => row.catalogItemId), ["z"]);
  store.set(CARD_PICTURES_KEY, "{broken");
  assert.deepEqual(readCardPictures(storage), []);
});
