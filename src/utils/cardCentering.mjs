// Centering check (Nov 19 2026). Pure measurement from a photo of the card:
// where the card's outer edge is and where the printed border ends. No AI and
// no grade prediction; it shows ratios next to the grading companies' published
// centering guides, which they can change at any time.

/** Ratios from edge positions given as fractions (0-1) of the photo. */
export function centeringRatios({ outer = {}, inner = {} } = {}) {
  const left = Math.max(0, (inner.left ?? 0) - (outer.left ?? 0));
  const right = Math.max(0, (outer.right ?? 1) - (inner.right ?? 1));
  const top = Math.max(0, (inner.top ?? 0) - (outer.top ?? 0));
  const bottom = Math.max(0, (outer.bottom ?? 1) - (inner.bottom ?? 1));
  const split = (a, b) => {
    const total = a + b;
    if (!(total > 0)) return null;
    const first = Math.round((a / total) * 100);
    return [first, 100 - first];
  };
  const lr = split(left, right);
  const tb = split(top, bottom);
  return { lr, tb, worst: Math.max(lr ? Math.max(...lr) : 50, tb ? Math.max(...tb) : 50) };
}

export function ratioLabel(pair) {
  return pair ? `${pair[0]}/${pair[1]}` : "Not measured";
}

// Largest side allowed, front and back (e.g. 55 means 55/45). Published guides, Nov 2026.
export const CENTERING_GUIDES = [
  { company: "PSA", grade: "10 Gem Mint", front: 55, back: 75 },
  { company: "PSA", grade: "9 Mint", front: 60, back: 90 },
  { company: "PSA", grade: "8 NM-MT", front: 65, back: 90 },
  { company: "BGS", grade: "10 Pristine", front: 50, back: 55 },
  { company: "BGS", grade: "9.5 Gem Mint", front: 55, back: 60 },
  { company: "BGS", grade: "9 Mint", front: 60, back: 65 },
  { company: "CGC", grade: "10 Pristine", front: 50, back: 55 },
  { company: "CGC", grade: "10 Gem Mint", front: 55, back: 75 },
  { company: "CGC", grade: "9.5 Mint+", front: 60, back: 80 },
];

/** Which centering guides the measured worst side fits. Centering is only one part of a grade. */
export function centeringGuideCheck(ratios, side = "front") {
  const worst = ratios?.worst;
  return CENTERING_GUIDES.map((guide) => {
    const limit = side === "back" ? guide.back : guide.front;
    return { ...guide, limit, fits: Number.isFinite(worst) && worst <= limit };
  });
}

/** Best guide per company that the centering fits, e.g. "PSA 10 Gem Mint". */
export function centeringSummary(ratios, side = "front") {
  const rows = centeringGuideCheck(ratios, side);
  const best = [];
  for (const company of ["PSA", "BGS", "CGC"]) {
    const fit = rows.find((row) => row.company === company && row.fits);
    best.push(fit ? `${company} ${fit.grade}` : `${company}: outside its ${rows.filter((row) => row.company === company).at(-1).grade} guide`);
  }
  return best;
}

function columnProfile(gray, width, height, from, to, rowStart, rowEnd) {
  const scores = [];
  for (let x = Math.max(1, from); x <= Math.min(width - 1, to); x += 1) {
    let sum = 0;
    for (let y = rowStart; y < rowEnd; y += 1) sum += Math.abs(gray[y * width + x] - gray[y * width + x - 1]);
    scores.push({ at: x, score: sum / Math.max(1, rowEnd - rowStart) });
  }
  return scores;
}

function rowProfile(gray, width, height, from, to, colStart, colEnd) {
  const scores = [];
  for (let y = Math.max(1, from); y <= Math.min(height - 1, to); y += 1) {
    let sum = 0;
    for (let x = colStart; x < colEnd; x += 1) sum += Math.abs(gray[y * width + x] - gray[(y - 1) * width + x]);
    scores.push({ at: y, score: sum / Math.max(1, colEnd - colStart) });
  }
  return scores;
}

const strongest = (scores) => scores.reduce((best, entry) => (entry.score > best.score ? entry : best), { at: -1, score: 0 });

/**
 * Finds the card's outer edge and the inner edge of the printed border on a
 * grayscale image (Uint8 array, width x height). Returns fractions 0-1.
 * Works best on a photo taken in the card frame on a plain background; the
 * person can always drag the lines to correct it.
 */
export function detectCardBorders(gray, width, height) {
  const band = (size, a, b) => [Math.round(size * a), Math.round(size * b)];
  const [rowStart, rowEnd] = band(height, 0.25, 0.75);
  const [colStart, colEnd] = band(width, 0.25, 0.75);
  const edge = (scores, fallback) => {
    const best = strongest(scores);
    return best.score >= 18 ? best.at : fallback;
  };
  // Outer edge: a strong step inside the outer 12% (or the photo edge itself).
  const outerLeft = edge(columnProfile(gray, width, height, 1, Math.round(width * 0.12), rowStart, rowEnd), 0);
  const outerRight = edge(columnProfile(gray, width, height, Math.round(width * 0.88), width - 1, rowStart, rowEnd), width);
  const outerTop = edge(rowProfile(gray, width, height, 1, Math.round(height * 0.12), colStart, colEnd), 0);
  const outerBottom = edge(rowProfile(gray, width, height, Math.round(height * 0.88), height - 1, colStart, colEnd), height);
  const gapX = Math.max(2, Math.round(width * 0.01));
  const gapY = Math.max(2, Math.round(height * 0.01));
  const innerLeft = strongest(columnProfile(gray, width, height, outerLeft + gapX, outerLeft + Math.round(width * 0.2), rowStart, rowEnd)).at;
  const innerRight = strongest(columnProfile(gray, width, height, outerRight - Math.round(width * 0.2), outerRight - gapX, rowStart, rowEnd)).at;
  const innerTop = strongest(rowProfile(gray, width, height, outerTop + gapY, outerTop + Math.round(height * 0.2), colStart, colEnd)).at;
  const innerBottom = strongest(rowProfile(gray, width, height, outerBottom - Math.round(height * 0.2), outerBottom - gapY, colStart, colEnd)).at;
  const fx = (value, fallback) => (value >= 0 ? value / width : fallback);
  const fy = (value, fallback) => (value >= 0 ? value / height : fallback);
  return {
    outer: { left: fx(outerLeft, 0), right: fx(outerRight, 1), top: fy(outerTop, 0), bottom: fy(outerBottom, 1) },
    inner: { left: fx(innerLeft, 0.05), right: fx(innerRight, 0.95), top: fy(innerTop, 0.05), bottom: fy(innerBottom, 0.95) },
  };
}
