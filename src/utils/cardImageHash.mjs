// Card picture matching groundwork (Nov 19 2026). Not wired to any screen yet.
//
// Plan: a small index of picture fingerprints (64-bit difference hashes of each
// card's artwork box) is built offline and loaded on demand. On the phone, the
// framed card photo is fingerprinted the same way and the nearest fingerprints
// become suggestions next to the text reader's result. The index holds only
// fingerprints, never card images. See docs/CARD_IMAGE_RECOGNITION_PLAN.md for the
// open decision on which images may be fingerprinted.

/** Area of an upright card photo used for the fingerprint: the artwork box. */
export const ART_BOX = { left: 0.08, top: 0.11, width: 0.84, height: 0.42 };

/**
 * 64-bit difference hash from a grayscale image (Uint8 array, width x height).
 * Samples a 9x8 grid inside `box` (fractions) and compares neighbours.
 * Returns 16 hex characters.
 */
export function differenceHash(gray, width, height, box = ART_BOX) {
  const cols = 9, rows = 8;
  const x0 = box.left * width, y0 = box.top * height;
  const cellW = (box.width * width) / cols, cellH = (box.height * height) / rows;
  const grid = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const xs = Math.floor(x0 + col * cellW), xe = Math.max(xs + 1, Math.floor(x0 + (col + 1) * cellW));
      const ys = Math.floor(y0 + row * cellH), ye = Math.max(ys + 1, Math.floor(y0 + (row + 1) * cellH));
      let sum = 0, count = 0;
      for (let y = ys; y < Math.min(ye, height); y += 1) {
        for (let x = xs; x < Math.min(xe, width); x += 1) { sum += gray[y * width + x]; count += 1; }
      }
      grid[row * cols + col] = count ? sum / count : 0;
    }
  }
  let hex = "";
  for (let row = 0; row < rows; row += 1) {
    let byte = 0;
    for (let col = 0; col < 8; col += 1) byte = (byte << 1) | (grid[row * cols + col] > grid[row * cols + col + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

const POPCOUNT = Uint8Array.from({ length: 256 }, (_, value) => {
  let bits = 0;
  for (let rest = value; rest; rest >>= 1) bits += rest & 1;
  return bits;
});

/** Number of differing bits between two 16-hex-character hashes (0-64). */
export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let distance = 0;
  for (let index = 0; index < a.length; index += 2) distance += POPCOUNT[Number.parseInt(a.slice(index, index + 2), 16) ^ Number.parseInt(b.slice(index, index + 2), 16)];
  return distance;
}

/**
 * Nearest fingerprints in an index of `{ id, hash }` entries. Only matches within
 * `maxDistance` bits are returned, closest first, with a 0-100 similarity.
 */
export function nearestCards(hash, index = [], { limit = 5, maxDistance = 12 } = {}) {
  const found = [];
  for (const entry of index) {
    const distance = hammingDistance(hash, entry.hash);
    if (distance <= maxDistance) found.push({ ...entry, distance, similarity: Math.round((1 - distance / 64) * 100) });
  }
  return found.sort((a, b) => a.distance - b.distance).slice(0, limit);
}
