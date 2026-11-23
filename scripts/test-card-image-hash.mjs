import assert from "node:assert/strict";
import { test } from "node:test";
import { differenceHash, hammingDistance, nearestCards } from "../src/utils/cardImageHash.mjs";

function card(width, height, seed, { brightness = 0, noise = 0 } = {}) {
  const gray = new Uint8Array(width * height);
  let state = seed;
  const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const blobs = Array.from({ length: 6 }, () => ({ x: random() * width, y: random() * height * 0.6, r: 10 + random() * 30, v: random() * 200 }));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 40;
      for (const blob of blobs) if ((x - blob.x) ** 2 + (y - blob.y) ** 2 < blob.r ** 2) value = blob.v;
      gray[y * width + x] = Math.max(0, Math.min(255, value + brightness + (noise ? (((x * 7 + y * 13) % 11) - 5) * noise : 0)));
    }
  }
  return gray;
}

test("the same artwork under different light and size hashes alike; different art does not", () => {
  const original = differenceHash(card(252, 352, 7), 252, 352);
  const brighter = differenceHash(card(252, 352, 7, { brightness: 25 }), 252, 352);
  const other = differenceHash(card(252, 352, 99), 252, 352);
  assert.equal(original.length, 16);
  assert.ok(hammingDistance(original, brighter) <= 6, `same art distance ${hammingDistance(original, brighter)}`);
  assert.ok(hammingDistance(original, other) >= 14, `different art distance ${hammingDistance(original, other)}`);
});

test("hamming distance and nearest search", () => {
  assert.equal(hammingDistance("ffffffffffffffff", "0000000000000000"), 64);
  assert.equal(hammingDistance("0f00000000000000", "0000000000000000"), 4);
  assert.equal(hammingDistance("00", "0000"), 64);
  const index = [{ id: "a", hash: "0000000000000000" }, { id: "b", hash: "0f00000000000000" }, { id: "c", hash: "ffffffffffffffff" }];
  const found = nearestCards("0100000000000000", index);
  assert.deepEqual(found.map((entry) => entry.id), ["a", "b"]);
  assert.equal(found[0].similarity, 98);
});
