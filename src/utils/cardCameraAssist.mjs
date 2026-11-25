// Card camera helper (Nov 21 2026): makes the card frame forgiving. The camera
// looks at a margin around the on-screen frame, finds the card's edges itself,
// and tells the person what to fix (closer, upright, glare, focus). The picture
// is cropped to the card it found, so lining it up exactly no longer matters.
// Pure, for tests (scripts/test-card-camera-assist.mjs).
import { findCardBounds } from "./cardPhotoReader.mjs";

export const CAMERA_ASSIST = Object.freeze({
  pad: 0.12, // margin looked at around the frame, as a share of the frame size
  minFill: 0.62, // card height as a share of the padded view before it is "close enough"
  glareCutoff: 248, // brightness counted as glare
  maxGlare: 0.025, // share of the name or number strip allowed to be glare
  maxArtGlare: 0.2, // share of the whole card: holo art shines, which is fine if the text is clear
  captureMargin: 0.03, // margin kept around the found card; the reader trims to the edges itself
  sharpShare: 0.72, // must be at least this share of the sharpest recent view
  minSharp: 3, // below this the view is a blur or blank
  sharpWindow: 12, // recent samples remembered for focus (about 3 seconds)
  // Nov 24 2026 (scanner review):
  cardSharpFloor: 3, // the card itself, not the table around it, must show at least this much detail
  sameBoxTolerance: 0.04, // the found card may shift this much between looks and still count as the same card
  steadyLooks: 12, // a found, close, upright card held still this many looks (about 3 s) is taken despite glare or soft focus
  minFrameDetail: 24, // brightness spread the frame needs before a no-edges picture is taken (not an empty table)
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Grows a rect (video pixels) by `pad` of its size on every side, kept inside the video. */
export function padRect(area, videoWidth, videoHeight, pad = CAMERA_ASSIST.pad) {
  if (!area) return null;
  const dx = area.width * pad, dy = area.height * pad;
  const x = clamp(area.x - dx, 0, videoWidth), y = clamp(area.y - dy, 0, videoHeight);
  return { x, y, width: clamp(area.x + area.width + dx, 0, videoWidth) - x, height: clamp(area.y + area.height + dy, 0, videoHeight) - y };
}

/** RGBA pixels to grayscale (0-255). */
export function toGray(rgba) {
  const gray = new Uint8Array(Math.floor(rgba.length / 4));
  for (let index = 0; index < gray.length; index += 1) gray[index] = (rgba[index * 4] * 3 + rgba[index * 4 + 1] * 6 + rgba[index * 4 + 2]) / 10;
  return gray;
}

/** Share of pixels inside the box (fractions) that are blown-out glare. */
export function glareShare(gray, width, height, box = { x: 0, y: 0, w: 1, h: 1 }, cutoff = CAMERA_ASSIST.glareCutoff) {
  const x0 = Math.floor(box.x * width), x1 = Math.ceil((box.x + box.w) * width);
  const y0 = Math.floor(box.y * height), y1 = Math.ceil((box.y + box.h) * height);
  let bright = 0, total = 0;
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
      total += 1;
      if (gray[y * width + x] >= cutoff) bright += 1;
    }
  }
  return total ? bright / total : 0;
}

/** Average local contrast; drops when the camera is out of focus or moving. box (fractions) limits it to part of the view. */
export function edgeSharpness(gray, width, height, box = null) {
  let sum = 0, count = 0;
  const x0 = box ? Math.max(1, Math.floor(box.x * width)) : 1, x1 = box ? Math.min(width - 1, Math.ceil((box.x + box.w) * width)) : width - 1;
  const y0 = box ? Math.max(1, Math.floor(box.y * height)) : 1, y1 = box ? Math.min(height - 1, Math.ceil((box.y + box.h) * height)) : height - 1;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      sum += Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width]);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

/** Remembers recent sharpness so "sharp" means "as sharp as this camera gets here". */
export function createSharpnessGate({ window = CAMERA_ASSIST.sharpWindow, share = CAMERA_ASSIST.sharpShare, min = CAMERA_ASSIST.minSharp } = {}) {
  let recent = [];
  return {
    push(value) {
      recent = [...recent.slice(-(window - 1)), value];
      return value >= min && value >= Math.max(...recent) * share;
    },
    reset() { recent = []; },
  };
}

/**
 * Looks at one grayscale sample of the padded view and says what to fix.
 * Returns { card, tip, ready } where card is the found card box in fractions of
 * the padded view (or null) and tip is short plain text for the person.
 */
// usable (Nov 24 2026): a card of the right shape, upright and close enough;
// only glare or focus stands between it and ready, so holding it still for a
// few seconds takes the picture anyway instead of waiting forever.
export function assessCardView(gray, width, height, { sharp = true, slab = false } = {}) {
  const what = slab ? "slab" : "card";
  const found = findCardBounds(gray, width, height, { shape: slab ? "slab" : "card" });
  if (!found) return { card: null, tip: `Line the ${what} up with the frame.`, ready: false, usable: false };
  if (found.sideways) return { card: found, tip: `Turn the ${what} upright, ${slab ? "label" : "name"} at the top.`, ready: false, usable: false };
  if (found.h < CAMERA_ASSIST.minFill) return { card: found, tip: "Move a little closer.", ready: false, usable: false };
  if (textGlare(gray, width, height, found, slab)) return { card: found, glare: true, tip: `Glare on the ${slab ? "label" : "name or number"}. Tilt the ${what} a little or move away from the light.`, ready: false, usable: true };
  // The relative gate alone passes a view that is blurry from the start; the card must also show real detail.
  // Measured inside the outline, so the card's edge against the table does not count as detail.
  const inside = { x: found.x + found.w * 0.1, y: found.y + found.h * 0.1, w: found.w * 0.8, h: found.h * 0.8 };
  if (!sharp || edgeSharpness(gray, width, height, inside) < CAMERA_ASSIST.cardSharpFloor) return { card: found, tip: "Hold steady while it focuses.", ready: false, usable: true };
  return { card: found, tip: "Hold still…", ready: true, usable: true };
}

/** True when two found card boxes (fractions) are the same card in the same place, give or take a little. */
export function sameCardBox(a, b, tolerance = CAMERA_ASSIST.sameBoxTolerance) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
    && Math.abs(a.x + a.w - (b.x + b.w)) <= tolerance && Math.abs(a.y + a.h - (b.y + b.h)) <= tolerance;
}

/**
 * Glare only blocks a scan where the reader needs the text (Nov 24 2026): the
 * name strip and number strip of a card, or the label of a slab. Shine across
 * holo art is fine unless it covers most of the card.
 */
export function textGlare(gray, width, height, card, slab = false) {
  const strip = (top, share) => ({ x: card.x, y: card.y + card.h * top, w: card.w, h: card.h * share });
  const strips = slab ? [strip(0, 0.25)] : [strip(0, 0.14), strip(0.88, 0.12)];
  return strips.some((box) => glareShare(gray, width, height, box) > CAMERA_ASSIST.maxGlare)
    || glareShare(gray, width, height, card) > CAMERA_ASSIST.maxArtGlare;
}

/** Where to cut the picture (video pixels): the found card plus a hair of margin, else the frame itself. */
export function captureRect({ padded, frame, card }) {
  if (!padded || !card) return frame;
  const margin = CAMERA_ASSIST.captureMargin;
  const x = padded.x + clamp(card.x - margin, 0, 1) * padded.width;
  const y = padded.y + clamp(card.y - margin, 0, 1) * padded.height;
  const right = padded.x + clamp(card.x + card.w + margin, 0, 1) * padded.width;
  const bottom = padded.y + clamp(card.y + card.h + margin, 0, 1) * padded.height;
  return { x, y, width: right - x, height: bottom - y };
}
