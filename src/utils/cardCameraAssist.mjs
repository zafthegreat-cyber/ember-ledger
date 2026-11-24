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

/** Average local contrast; drops when the camera is out of focus or moving. */
export function edgeSharpness(gray, width, height) {
  let sum = 0, count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
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
export function assessCardView(gray, width, height, { sharp = true, slab = false } = {}) {
  const what = slab ? "slab" : "card";
  const found = findCardBounds(gray, width, height);
  if (!found) return { card: null, tip: `Line the ${what} up with the frame.`, ready: false };
  if (found.sideways) return { card: found, tip: `Turn the ${what} upright, ${slab ? "label" : "name"} at the top.`, ready: false };
  if (found.h < CAMERA_ASSIST.minFill) return { card: found, tip: "Move a little closer.", ready: false };
  if (textGlare(gray, width, height, found, slab)) return { card: found, glare: true, tip: `Glare on the ${slab ? "label" : "name or number"}. Tilt the ${what} a little or move away from the light.`, ready: false };
  if (!sharp) return { card: found, tip: "Hold steady while it focuses.", ready: false };
  return { card: found, tip: "Hold still…", ready: true };
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
