// Card reader (Nov 17 2026): reads one card photo on the device.
// 1. Finds the card in the photo (the large bright/dark-edged rectangle) when
//    it can, otherwise uses the whole photo.
// 2. Crops the name strip (top of the card) and the number strip (bottom),
//    enlarges them, turns them grey and stretches the contrast.
// 3. Reads both strips plus the whole card in one load of the local text model.
// 4. Turns the text into a search like "Charizard ex 125/197".
// The photo, crops and text never leave the device; only the reviewed search does.
import { validateProductPhotoFile, PRODUCT_PHOTO_LIMITS } from "./productPhotoLookup.mjs";
import { findCardClues, isGenericCardWord, parseCardPhotoText } from "./cardPhotoText.mjs";
import { isKnownCardName } from "./cardNameSnap.mjs";
import { findSlabInCardText, parseSlabLabel } from "./slabLabelText.mjs";

export const CARD_PHOTO_READER = Object.freeze({
  timeoutMs: 120_000,
  // A single card should never take this long; a stuck read gives up sooner (Nov 24 2026).
  // 20 s once the text reader is loaded, 40 s for the first scan, which also loads it.
  cardTimeoutMs: 20_000,
  cardColdTimeoutMs: 40_000,
  // Fractions of the card's height. Pokémon, Lorcana and Magic print the name at
  // the top and the number at the bottom; One Piece prints its code bottom right.
  nameBand: [0.025, 0.155],
  numberBand: [0.86, 0.985],
  stripWidth: 1500,
  sharpWidth: 1000, // stage-3 adaptive-cut crops: smaller, since they only run on hard cards
  cornerWidth: 1200,
  uprightMaxSide: 2400,
  fullMaxSide: 1600,
});

const MODEL_GZIP = import.meta.env?.VITE_NATIVE_BUILD !== "true";
// Characters a printed card number or set code can contain ("SV1 EN 125/198", "TG05/TG30", "OP01-001").
const NUMBER_CHARACTERS = "0123456789/-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// Tesseract thresholding_method 2 (Sauvola): a black-and-white cut that adapts to each patch of the crop.
const LOCAL_THRESHOLD = "2";
const fail = (code) => Object.assign(new Error(code), { code });
const result = (status, code, message, extra = {}) => ({ status, code, message, text: "", suggestions: [], query: "", ...extra });

// One text reader stays loaded between scans (Nov 23 2026). Loading the model takes
// 2-4 s on a phone; before this every card, slab and receipt paid that again. The
// worker is ended after READER_IDLE_MS without a read, and immediately when a read
// is cancelled or times out (a running recognition cannot be interrupted otherwise).
export const READER_IDLE_MS = 120_000;
const readers = new Map();
let readSequence = 0;
const defaultWorkerUrl = () => new URL("/ocr/card-photo-v2.worker.js", window.location.href).href;

function closeReader(url, code) {
  const reader = readers.get(url);
  if (!reader) return;
  readers.delete(url);
  clearTimeout(reader.idleTimer);
  reader.worker.terminate();
  for (const job of reader.pending.values()) job.reject(fail(code));
  reader.pending.clear();
}

function scheduleIdleClose(url) {
  const reader = readers.get(url);
  if (!reader) return;
  clearTimeout(reader.idleTimer);
  if (reader.pending.size) return;
  reader.idleTimer = setTimeout(() => closeReader(url, "cancelled"), READER_IDLE_MS);
}

function openReader(url) {
  const existing = readers.get(url);
  if (existing) return existing;
  const worker = new Worker(url, { name: "Code 3 card reader" });
  const reader = { worker, pending: new Map(), idleTimer: 0, warmed: false };
  worker.onerror = (event) => { event.preventDefault?.(); closeReader(url, "ocr_failed"); };
  worker.onmessageerror = () => closeReader(url, "ocr_failed");
  worker.onmessage = ({ data }) => {
    const id = String(data?.id || "");
    const job = reader.pending.get(id);
    if (!job) return;
    if (data.type === "progress") { try { job.onProgress?.(data); } catch { /* presentation only */ } return; }
    if (data.type !== "result" && data.type !== "failure") return;
    reader.pending.delete(id);
    if (data.type === "result") job.resolve(data); else job.reject(fail("ocr_failed"));
    scheduleIdleClose(url);
  };
  readers.set(url, reader);
  return reader;
}

const readerSupported = () => typeof window !== "undefined" && typeof Worker === "function" && typeof WebAssembly === "object";

/** Start loading the text model before the first photo, e.g. when the card camera opens. Safe to call often. */
export function warmCardReader({ workerUrl } = {}) {
  if (!readerSupported()) return;
  try {
    const url = String(workerUrl || defaultWorkerUrl());
    const reader = openReader(url);
    if (!reader.warmed) {
      reader.warmed = true;
      reader.worker.postMessage({ type: "warm", gzip: MODEL_GZIP });
    }
    scheduleIdleClose(url);
  } catch { /* warming is only a head start */ }
}

/** Reads the prepared images on the shared reader. cancel() ends the reader so a stuck read stops at once. */
function recognizeImages(images, { workerUrl, onProgress } = {}) {
  const url = String(workerUrl || defaultWorkerUrl());
  const reader = openReader(url);
  clearTimeout(reader.idleTimer);
  const id = `read-${++readSequence}`;
  const promise = new Promise((resolve, reject) => { reader.pending.set(id, { resolve, reject, onProgress }); });
  reader.worker.postMessage({ type: "recognize-many", id, images, gzip: MODEL_GZIP }, images.map((entry) => entry.image.buffer));
  return { promise, cancel: (code = "cancelled") => { if (readers.get(url)?.pending.has(id)) closeReader(url, code); } };
}

/**
 * Pure: stretch contrast on RGBA pixels in place, returning greyscale. Exported for tests.
 * Two more modes for reverse holo cards (Nov 26 2026, owner's inventory scans), where
 * black print sits on a dark, patterned foil:
 *   "bright"  takes the brightest colour channel in place of the usual weighted grey.
 *             Black print on dark purple, blue or red foil is almost the same grey as
 *             the card; in its brightest channel the card is about twice as light.
 *   "ink"     does the same and then keeps only the darkest print: everything lighter
 *             than a level two fifths of the way from the darkest tone to the middle
 *             tone becomes white. The foil pattern is darker than the card but lighter
 *             than the print, so it drops out and the letters stand alone.
 */
export function enhanceForText(pixels, mode = "") {
  const grey = new Uint8ClampedArray(pixels.length / 4);
  const histogram = new Uint32Array(256);
  const bright = mode === "bright" || mode === "ink";
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const value = bright ? Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) : Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    grey[p] = value;
    histogram[value] += 1;
  }
  // Clip 1% at each end so glare and deep shadows do not flatten the text.
  const clip = Math.max(1, Math.floor(grey.length * 0.01));
  let low = 0, high = 255, seen = 0;
  for (; low < 255; low += 1) { seen += histogram[low]; if (seen > clip) break; }
  seen = 0;
  for (; high > 0; high -= 1) { seen += histogram[high]; if (seen > clip) break; }
  if (mode === "ink") {
    let middle = 0;
    seen = 0;
    for (; middle < 255; middle += 1) { seen += histogram[middle]; if (seen >= grey.length / 2) break; }
    const cut = low + (middle - low) * 0.4;
    for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = grey[p] < cut ? 0 : 255;
      pixels[i + 3] = 255;
    }
    return pixels;
  }
  const span = Math.max(1, high - low);
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const value = Math.max(0, Math.min(255, Math.round(((grey[p] - low) * 255) / span)));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  return pixels;
}

/**
 * Pure: finds the card's rectangle from a small greyscale thumbnail by looking for
 * the strongest vertical and horizontal edges near each side. Returns fractions
 * of the image, or null when the photo already looks like a tight card crop.
 */
// Width / height of the outline, upright and lying sideways. "any" is for
// uploaded photos; the live camera knows whether it wants a card (63 x 88 mm,
// 0.716) or a graded slab (about 0.585), so it accepts only that shape, give or
// take a slight tilt (Nov 24 2026: the loose range let the art box or a slab
// label pass as the card, and the picture was cut to it).
const CARD_SHAPES = Object.freeze({
  any: { upright: [0.55, 0.9], sideways: [1.15, 1.8] },
  card: { upright: [0.63, 0.81], sideways: [1.23, 1.6] },
  slab: { upright: [0.5, 0.68], sideways: [1.47, 2] },
});

export function findCardBounds(grey, width, height, { shape = "any" } = {}) {
  if (!grey || width < 20 || height < 20) return null;
  const colEdge = new Float64Array(width);
  const rowEdge = new Float64Array(height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const dx = Math.abs(grey[i + 1] - grey[i - 1]);
      const dy = Math.abs(grey[i + width] - grey[i - width]);
      colEdge[x] += dx;
      rowEdge[y] += dy;
    }
  }
  const strongest = (edges, from, to) => {
    let best = -1, bestValue = 0;
    for (let i = from; i < to; i += 1) if (edges[i] > bestValue) { bestValue = edges[i]; best = i; }
    return { index: best, value: bestValue };
  };
  const mean = (edges) => edges.reduce((sum, v) => sum + v, 0) / edges.length;
  const left = strongest(colEdge, 1, Math.floor(width * 0.35));
  const right = strongest(colEdge, Math.ceil(width * 0.65), width - 1);
  const top = strongest(rowEdge, 1, Math.floor(height * 0.35));
  const bottom = strongest(rowEdge, Math.ceil(height * 0.65), height - 1);
  const colMean = mean(colEdge), rowMean = mean(rowEdge);
  // Edges must stand well above the average, otherwise there is no clear border.
  const clear = left.value > colMean * 2.2 && right.value > colMean * 2.2 && top.value > rowMean * 2.2 && bottom.value > rowMean * 2.2;
  if (!clear) return null;
  const box = { x: left.index / width, y: top.index / height, w: (right.index - left.index) / width, h: (bottom.index - top.index) / height };
  const aspect = (box.w * width) / (box.h * height);
  // Trading cards are about 63 x 88 mm (0.716 upright, 1.40 lying sideways).
  const range = CARD_SHAPES[shape] || CARD_SHAPES.any;
  const upright = aspect >= range.upright[0] && aspect <= range.upright[1];
  const sideways = aspect >= range.sideways[0] && aspect <= range.sideways[1];
  if ((!upright && !sideways) || box.w < 0.2 || box.h < 0.2) return null;
  if (box.x < 0.03 && box.y < 0.03 && box.w > 0.94 && box.h > 0.94) return null;
  return { ...box, sideways };
}

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(fail("invalid_image")); image.src = url; });
    return image;
  } finally { URL.revokeObjectURL(url); }
}

function crop(source, sx, sy, sw, sh, targetWidth, enhance) {
  const scale = targetWidth / Math.max(1, sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw fail("unsupported");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  if (enhance) {
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    enhanceForText(data.data, typeof enhance === "string" ? enhance : "");
    context.putImageData(data, 0, 0);
  }
  return canvas;
}

const toPng = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(fail("invalid_image")), "image/png"))
  .then((blob) => blob.arrayBuffer()).then((buffer) => new Uint8Array(buffer));

// Copies the card out of the photo, turned upright (rotate is 0, 90, -90 or 180 degrees).
function uprightCard(image, card, rotate, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(card.w, card.h));
  const w = Math.max(1, Math.round(card.w * scale)), h = Math.max(1, Math.round(card.h * scale));
  const canvas = document.createElement("canvas");
  const quarter = Math.abs(rotate) === 90;
  canvas.width = quarter ? h : w;
  canvas.height = quarter ? w : h;
  const context = canvas.getContext("2d");
  if (!context) throw fail("unsupported");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotate * Math.PI) / 180);
  context.drawImage(image, card.x, card.y, card.w, card.h, -w / 2, -h / 2, w, h);
  return canvas;
}

/**
 * Locate the card, then return the crops to read. Exported for the evaluation script.
 * framed: the photo came from the card-shaped camera frame, so the whole image is the card.
 */
/**
 * Pure: the part of a jammed scan that is still a picture (Nov 26 2026, owner's scan
 * H-1058). A sheet-fed scanner that jams keeps scanning the same line, so the file
 * comes out several cards long and most of it is that one line repeated. Rows of a
 * smear barely differ from the row above; rows of a real picture do. Returns the
 * longest stretch of real rows as { top, bottom } fractions of the height, or null
 * when the picture is not smeared. grey is one byte per pixel of a small copy.
 */
export function findUnsmearedSpan(grey, width, height) {
  if (!grey || height < 40 || width < 8) return null;
  const change = new Float32Array(height);
  for (let y = 1; y < height; y += 1) {
    let sum = 0;
    for (let x = 0, at = y * width; x < width; x += 1, at += 1) sum += Math.abs(grey[at] - grey[at - width]);
    change[y] = sum / width;
  }
  const reach = 8;
  const live = new Uint8Array(height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0, count = 0;
    for (let k = Math.max(1, y - reach); k <= Math.min(height - 1, y + reach); k += 1) { sum += change[k]; count += 1; }
    live[y] = count && sum / count > 1.8 ? 1 : 0;
  }
  // The longest stretch of real rows; a plain band inside the card (up to 5% of the height) does not end it.
  const bridge = Math.round(height * 0.05);
  let best = null, start = -1, lastLive = -1;
  for (let y = 0; y <= height; y += 1) {
    const isLive = y < height && live[y] === 1;
    if (isLive) { if (start < 0) start = y; lastLive = y; }
    if (start >= 0 && (y === height || (!isLive && y - lastLive > bridge))) {
      if (!best || lastLive - start > best.end - best.start) best = { start, end: lastLive };
      start = -1;
    }
  }
  if (!best) return null;
  const length = best.end - best.start + 1;
  if (length < height * 0.08 || length > height * 0.85) return null;
  return { top: best.start / height, bottom: (best.end + 1) / height };
}

export async function prepareCardCrops(file, { framed = false, staged = false } = {}) {
  const image = await decode(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height || width * height > 40_000_000) throw fail("image_dimensions");
  // Find the card on a small thumbnail.
  const thumbWidth = 160, thumbHeight = Math.max(20, Math.round((height / width) * 160));
  const thumb = crop(image, 0, 0, width, height, thumbWidth, false);
  const context = thumb.getContext("2d", { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, thumb.width, thumb.height).data;
  const grey = new Uint8Array(thumb.width * thumb.height);
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) grey[p] = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
  // A picture more than two and a half cards long is a jammed scan: only the part that
  // is still a picture is kept, and it is read as loose text both ways up.
  const jam = height > width * 2.6 ? findUnsmearedSpan(grey, thumb.width, thumbHeight) : null;
  const found = framed || jam ? null : findCardBounds(grey, thumb.width, thumbHeight);
  // A slightly tilted card has slanted edges; keep a small margin so the name is not cut off.
  const pad = 0.015;
  const box = jam ? { x: 0, y: jam.top, w: 1, h: jam.bottom - jam.top } : found ? { x: Math.max(0, found.x - pad), y: Math.max(0, found.y - pad), w: Math.min(1, found.w + pad * 2), h: Math.min(1, found.h + pad * 2) } : { x: 0, y: 0, w: 1, h: 1 };
  thumb.width = 0;
  const card = { x: box.x * width, y: box.y * height, w: box.w * width, h: box.h * height };
  const [nameTop, nameBottom] = CARD_PHOTO_READER.nameBand;
  const [numTop, numBottom] = CARD_PHOTO_READER.numberBand;
  // A card lying sideways is read both ways up; the reads that agree win.
  const turns = found?.sideways ? [90, -90] : [0];
  // Nov 24 2026: reads come in two stages. Stage 1 is the name strip and the two
  // number corners, which usually give both the name and the number. The slower
  // reads (wide name, whole number strip, whole card) are stage 2 and only run
  // when stage 1 was not enough. A sideways card is read both ways in one stage.
  // Nov 25 2026 (owner: "it is so slow"): crops are cut and contrast-stretched
  // only when their stage is read, so a card that stage 1 settles never pays for
  // the wide name, number strip and whole-card crops. Upright copies are kept
  // until release() so stage 2 can still be cut from them.
  const entries = [];
  const canvases = [];
  const S = CARD_PHOTO_READER;
  if (jam) {
    // What is left of the card has no top or bottom to measure from, so there are no
    // name and number strips: the whole piece is read, and again turned around.
    const piece = uprightCard(image, card, 0, S.uprightMaxSide);
    const pw = piece.width, ph = piece.height;
    const scale = Math.min(1, 1800 / Math.max(pw, ph));
    let pieceTurned = null;
    const turnedPiece = () => {
      if (!pieceTurned) { pieceTurned = turnAround(piece); canvases.push(pieceTurned); }
      return pieceTurned;
    };
    entries.push(
      { key: "full", psm: "11", stage: 1, make: () => crop(piece, 0, 0, pw, ph, Math.round(pw * scale), true) },
      { key: "fullFlip", psm: "11", stage: 1, make: () => crop(turnedPiece(), 0, 0, pw, ph, Math.round(pw * scale), true) },
      // A card that jammed went through crooked, so its lines are tilted. Read as a page
      // (the reader then follows each line's own slant), cut patch by patch.
      { key: "fullPage", psm: "3", threshold: LOCAL_THRESHOLD, stage: 1, make: () => crop(piece, 0, 0, pw, ph, Math.round(pw * scale), true) },
      { key: "fullPageFlip", psm: "3", threshold: LOCAL_THRESHOLD, stage: 1, make: () => crop(turnedPiece(), 0, 0, pw, ph, Math.round(pw * scale), true) },
    );
    canvases.push(piece);
  }
  for (const [index, turn] of (jam ? [] : turns).entries()) {
    const upright = uprightCard(image, card, turn, S.uprightMaxSide);
    const cw = upright.width, ch = upright.height;
    const later = found?.sideways ? 1 : 2;
    entries.push(
      { key: `name${index}`, psm: "6", stage: 1, make: () => crop(upright, 0, ch * nameTop, cw, ch * (nameBottom - nameTop), S.stripWidth, true) },
      // A taller second look at the top of the card, for tilted cards and tall name bars.
      { key: `nameWide${index}`, psm: "11", stage: later, make: () => crop(upright, 0, 0, cw, ch * 0.24, S.stripWidth, true) },
      { key: `number${index}`, psm: "11", stage: later, make: () => crop(upright, 0, ch * numTop, cw, ch * (numBottom - numTop), S.stripWidth, true) },
      // Nov 25 2026 (owner's 63 test photos): the text model's own black-and-white
      // cut is one level for the whole strip, and a shaded name bar or bright border
      // can wipe out the name. Stage 3 reads the strips again with a cut that adapts
      // to each patch (Sauvola); it only runs when the first reads found no real name.
      { key: `nameSharp${index}`, psm: "6", threshold: LOCAL_THRESHOLD, stage: 3, make: () => crop(upright, 0, ch * nameTop, cw, ch * (nameBottom - nameTop), S.sharpWidth, true) },
      { key: `nameWideSharp${index}`, psm: "11", threshold: LOCAL_THRESHOLD, stage: 3, make: () => crop(upright, 0, 0, cw, ch * 0.24, S.sharpWidth, true) },
      { key: `numberSharp${index}`, psm: "11", threshold: LOCAL_THRESHOLD, stage: 3, make: () => crop(upright, 0, ch * numTop, cw, ch * (numBottom - numTop), S.sharpWidth, true) },
      // Nov 26 2026 (owner's reverse holo scans): dark print on a dark, patterned foil
      // card. The same strips again with only the darkest print kept (see enhanceForText).
      { key: `nameInk${index}`, psm: "6", stage: 3, make: () => crop(upright, 0, ch * nameTop, cw, ch * (nameBottom - nameTop), S.stripWidth, "ink") },
      { key: `nameWideInk${index}`, psm: "11", stage: 3, make: () => crop(upright, 0, 0, cw, ch * 0.24, S.sharpWidth, "ink") },
    );
    if (index === 0) {
      // Nov 23 2026: the number is tiny and sits in a corner (bottom left on Scarlet &
      // Violet and later, bottom right on older cards). Read each corner as one line,
      // enlarged, with only the characters a card number can have.
      const cornerTop = ch * 0.875, cornerHeight = ch * 0.115;
      entries.push(
        { key: "numberLeft0", psm: "7", whitelist: NUMBER_CHARACTERS, stage: 1, make: () => crop(upright, 0, cornerTop, cw * 0.5, cornerHeight, S.cornerWidth, true) },
        { key: "numberRight0", psm: "7", whitelist: NUMBER_CHARACTERS, stage: 1, make: () => crop(upright, cw * 0.5, cornerTop, cw * 0.5, cornerHeight, S.cornerWidth, true) },
        // The bottom strip as free text: the copyright year and part of a hidden number are clues.
        { key: "numberInk0", psm: "11", stage: 3, make: () => crop(upright, 0, ch * numTop, cw, ch * (numBottom - numTop), S.stripWidth, "ink") },
        // The bottom band as lines of text, cut patch by patch: on foil cards this is
        // the read that most often gets the whole number ("128/198").
        { key: "numberLines0", psm: "6", threshold: LOCAL_THRESHOLD, stage: 3, make: () => crop(upright, 0, ch * (1 - nameBottom), cw, ch * (nameBottom - nameTop), S.stripWidth, true) },
      );
      // Nov 25 2026 (owner's 63 test photos): a card held upside down reads as
      // gibberish. Stage 3 reads the name strip and number corners of the card
      // turned around; it only runs when the first reads found no real card name.
      if (!found?.sideways) {
        let turned = null;
        const flipped = () => {
          if (!turned) { turned = turnAround(upright); canvases.push(turned); }
          return turned;
        };
        entries.push(
          { key: "nameFlip", psm: "6", threshold: LOCAL_THRESHOLD, stage: 3, make: () => crop(flipped(), 0, ch * nameTop, cw, ch * (nameBottom - nameTop), S.stripWidth, true) },
          { key: "numberLeftFlip", psm: "7", whitelist: NUMBER_CHARACTERS, stage: 3, make: () => crop(flipped(), 0, cornerTop, cw * 0.5, cornerHeight, S.cornerWidth, true) },
          { key: "numberRightFlip", psm: "7", whitelist: NUMBER_CHARACTERS, stage: 3, make: () => crop(flipped(), cw * 0.5, cornerTop, cw * 0.5, cornerHeight, S.cornerWidth, true) },
          { key: "nameInkFlip", psm: "6", stage: 3, make: () => crop(flipped(), 0, ch * nameTop, cw, ch * (nameBottom - nameTop), S.stripWidth, "ink") },
          // Stage 4 runs only for a card that turned out to be upside down, or that still
          // has no name: the whole card and its bottom band the right way up, for the
          // year, HP, attack names and number pieces that tell printings apart.
          { key: "fullFlip", psm: "11", stage: 4, make: () => crop(flipped(), 0, 0, cw, ch, Math.round(cw * Math.min(1, S.fullMaxSide / Math.max(cw, ch))), true) },
          { key: "numberLinesFlip", psm: "6", threshold: LOCAL_THRESHOLD, stage: 4, make: () => crop(flipped(), 0, ch * (1 - nameBottom), cw, ch * (nameBottom - nameTop), S.stripWidth, true) },
        );
      }
      // No clear card edge: the card may be small in a wide shot, so read the whole photo larger.
      const fullSide = found || framed ? S.fullMaxSide : 2400;
      const fullScale = Math.min(1, fullSide / Math.max(cw, ch));
      entries.push({ key: "full", psm: "11", stage: later, make: () => crop(upright, 0, 0, cw, ch, Math.round(cw * fullScale), true) });
    }
    canvases.push(upright);
  }
  image.close?.();
  let released = false;
  const encode = async (stage, only = null) => {
    const images = [];
    for (const entry of entries) {
      if (entry.stage !== stage || released || (only && !only(entry.key))) continue;
      const canvas = entry.make();
      try {
        if (canvas.width) images.push({ key: entry.key, psm: entry.psm, ...(entry.whitelist ? { whitelist: entry.whitelist } : {}), ...(entry.threshold ? { threshold: entry.threshold } : {}), image: await toPng(canvas) });
      } finally { canvas.width = 0; canvas.height = 0; }
    }
    return images;
  };
  const release = () => { released = true; for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; } };
  const lastTry = (only = null) => encode(3, only);
  const flipTry = () => encode(4);
  const meta = { foundCard: Boolean(found) || framed || Boolean(jam), sideways: Boolean(found?.sideways), partial: Boolean(jam) };
  if (!staged) {
    try { return { images: [...await encode(1), ...await encode(2)], ...meta }; } finally { release(); }
  }
  // Staged: stage-2 crops are only cut and encoded if more() is called; release() frees the card copies.
  return { images: await encode(1), more: () => encode(2), lastTry, flipTry, release, ...meta };
}

/** A copy of the upright card turned 180 degrees. */
function turnAround(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) throw fail("unsupported");
  context.translate(canvas.width, canvas.height);
  context.rotate(Math.PI);
  context.drawImage(source, 0, 0);
  return canvas;
}

/** Stage 1 is enough when it found a number and a name that looks like a real word. */
export function stageOneIsEnough(parsed) {
  if (parsed?.certainty !== "name-and-number") return false;
  const letters = String(parsed.name || "").replace(/[^A-Za-zÀ-ž]/g, "");
  return letters.length >= 4 && /^[A-ZÀ-Ž]/.test(parsed.name) && !/^[A-Z]+$/.test(letters.slice(0, 5));
}

// Printed card names for correcting misreads (about 24 KB compressed), loaded once
// on the first card scan. Without it the reader still works, uncorrected.
let cardNameIndex = null;
function loadCardNameIndex() {
  cardNameIndex ||= Promise.all([import("../data/generated/cardNames.json"), import("./cardNameSnap.mjs")])
    .then(([names, snap]) => snap.createNameIndex(names.default || names))
    .catch(() => { cardNameIndex = null; return null; });
  return cardNameIndex;
}

// The species for each Pokédex number (about 5 KB compressed), for cards whose name bar
// cannot be read but whose Pokédex line can. Without it the reader still works.
let dexNameList = null;
function loadDexNames() {
  dexNameList ||= import("../data/pokedexNames.json")
    .then((names) => (Array.isArray(names.default || names) ? names.default || names : null))
    .catch(() => { dexNameList = null; return null; });
  return dexNameList;
}

export async function readCardPhoto(file, { signal, onProgress, timeoutMs = readers.size ? CARD_PHOTO_READER.cardTimeoutMs : CARD_PHOTO_READER.cardColdTimeoutMs, workerUrl, framed = false, debug = false } = {}) {
  const invalid = validateProductPhotoFile(file);
  if (invalid) return result("invalid", "file_invalid", invalid);
  if (signal?.aborted) return result("cancelled", "cancelled", "Reading stopped. You can type the card name and number below.");
  if (typeof window === "undefined" || typeof Worker !== "function" || typeof document === "undefined" || typeof WebAssembly !== "object") {
    return result("unsupported", "unsupported", "This device cannot read cards automatically. Type the card name and number below.");
  }
  let job, timer, stopped = false, rejectStop, prepared = null;
  const interrupted = new Promise((_, reject) => { rejectStop = reject; });
  const stop = (code) => { stopped = true; job?.cancel(code); rejectStop(fail(code)); };
  const abort = () => stop("cancelled");
  const progress = (label, value = null) => { if (!stopped) try { onProgress?.({ label, progress: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null }); } catch { /* presentation only */ } };
  signal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => stop("timeout"), Math.min(180_000, Math.max(1, timeoutMs)));
  try {
    return await Promise.race([interrupted, (async () => {
      progress("Finding the card in your photo…");
      prepared = await prepareCardCrops(file, { framed, staged: true });
      const { foundCard } = prepared;
      if (stopped) { prepared.release(); throw fail("cancelled"); }
      progress("Loading the private card reader…");
      const byKey = {};
      const read = async (images, label, start, span) => {
        let readsDone = 0;
        const count = images.length;
        job = recognizeImages(images, {
          workerUrl,
          onProgress: (data) => {
            if (stopped || data.status !== "recognizing text") return;
            if (data.progress >= 1) readsDone += 1;
            progress(`${label} (${Math.min(count, readsDone + 1)} of ${count})…`, start + span * ((readsDone + Number(data.progress || 0)) / count));
          },
        });
        const response = await job.promise;
        for (const entry of response.texts || []) byKey[entry.key] = String(entry.text || "");
      };
      let nameIndex = null;
      const parse = () => parseCardPhotoText({ nameIndex, nameText: byKey.name0, extraNameTexts: [byKey.nameWide0, byKey.name1, byKey.nameWide1].filter(Boolean), numberText: [byKey.numberLeft0, byKey.numberRight0, byKey.number0, byKey.number1].filter(Boolean).join("\n"), fullText: byKey.full });
      const namesReady = loadCardNameIndex();
      const dexReady = loadDexNames();
      await read(prepared.images, "Reading the card", 0, 0.5);
      nameIndex = await namesReady;
      const dexNames = await dexReady;
      let parsed = parse();
      if (!stageOneIsEnough(parsed)) {
        if (stopped) throw fail("cancelled");
        const more = await prepared.more();
        if (stopped) throw fail("cancelled");
        if (more.length) {
          await read(more, "Taking a closer look", 0.5, 0.5);
          parsed = parse();
        }
      }
      // Still no real card name: read the strips again with the adaptive cut, and
      // the card turned around in case it is upside down. A new read is kept only
      // when it gives a real card name (short names like "Dan" are too easy to get
      // from noise to trust here).
      const trusted = (name) => isKnownCardName(name, nameIndex) && String(name).replace(/[^A-Za-zÀ-ž]/g, "").length >= 5 && !/^pok[eé]mon$/i.test(name);
      const nameKnown = () => isKnownCardName(parsed.name, nameIndex) && !isGenericCardWord(parsed.name);
      let upsideDown = false;
      let lookedAgain = false;
      if (nameIndex && prepared.lastTry && (!nameKnown() || !parsed.number)) {
        if (stopped) throw fail("cancelled");
        // Nov 26 2026: a name that two reads already agree on is settled; only the number
        // is missing, so only the number reads are made (and the bottom band turned
        // around, where a number sometimes reads upside down). Everything else in the
        // last look is for finding a name, and costs about two seconds a card.
        const settledName = nameKnown() && trusted(parsed.name) && (parsed.nameAgreement || 0) >= 2;
        const last = await prepared.lastTry(settledName ? (key) => /^number(?:Sharp|Lines)/.test(key) || key === "nameFlip" : null);
        if (stopped) throw fail("cancelled");
        if (last.length) {
          await read(last, "Taking one more look", 0.9, 0.1);
          lookedAgain = true;
          const numberTexts = [byKey.numberLeft0, byKey.numberRight0, byKey.number0, byKey.number1, byKey.numberSharp0, byKey.numberSharp1, byKey.numberInk0, byKey.numberLines0];
          const everyNumber = numberTexts.filter(Boolean).join("\n");
          // Nov 26 2026: every upright read of the name is weighed together, so the name
          // that several reads agree on wins over one stray word read from the pattern
          // ("Ether" for a foil Golurk). The turned-around reads are weighed the same way.
          const sharpNames = [byKey.nameSharp0, byKey.nameWideSharp0, byKey.nameSharp1, byKey.nameWideSharp1, byKey.nameInk0, byKey.nameWideInk0, byKey.nameInk1, byKey.nameWideInk1].filter(Boolean);
          const together = parseCardPhotoText({ nameIndex, nameText: sharpNames[0] || "", extraNameTexts: [...sharpNames.slice(1), byKey.name0, byKey.nameWide0, byKey.name1, byKey.nameWide1].filter(Boolean), numberText: everyNumber, fullText: byKey.full });
          const flippedRead = parseCardPhotoText({ nameIndex, nameText: byKey.nameFlip, extraNameTexts: [byKey.nameInkFlip].filter(Boolean), numberText: [byKey.numberLeftFlip, byKey.numberRightFlip].filter(Boolean).join("\n") });
          const withEveryNumber = () => parseCardPhotoText({ nameIndex, nameText: byKey.name0, extraNameTexts: [byKey.nameWide0, byKey.name1, byKey.nameWide1].filter(Boolean), numberText: everyNumber, fullText: byKey.full });
          if (trusted(together.name)) parsed = together;
          else if (trusted(flippedRead.name)) { parsed = flippedRead; upsideDown = true; }
          else if (nameKnown()) { const again = withEveryNumber(); if (again.number && isKnownCardName(again.name, nameIndex)) parsed = again; }
          else if (!parsed.number && together.number && together.certainty !== "name-only") parsed = withEveryNumber();
        }
      }
      // Stage 4: the card is upside down. Read it turned around for its clues.
      if (nameIndex && lookedAgain && prepared.flipTry && !prepared.partial && upsideDown) {
        if (stopped) throw fail("cancelled");
        const turned = await prepared.flipTry();
        if (stopped) throw fail("cancelled");
        if (turned.length) await read(turned, "Taking one more look", 0.95, 0.05);
      }
      // Nov 26 2026: the clues that tell printings apart when the number is hidden (year,
      // HP, "Evolves from", pieces of the number, names in the card's text), worked out
      // from the reads made the way up the card really is. A number seen in the reads
      // made the other way up is upside down there and is turned back.
      const textOf = (wanted) => Object.entries(byKey).filter(([key, text]) => text && wanted(key)).map(([, text]) => text).join("\n");
      const isTurned = (key) => /Flip$/.test(key);
      const cluesFor = (turned) => findCardClues(textOf((key) => isTurned(key) === turned), {
        nameIndex,
        dexNames,
        nameStripText: textOf((key) => /^name/.test(key) && isTurned(key) === turned),
        numberStripText: textOf((key) => /^number/.test(key) && isTurned(key) === turned),
        turnedText: textOf((key) => /^name/.test(key) && isTurned(key) !== turned),
        bodyText: textOf((key) => !/^name/.test(key) && isTurned(key) === turned),
        readName: nameKnown() ? parsed.name : "",
      });
      let clues = cluesFor(upsideDown);
      if (nameIndex && !upsideDown && byKey.fullFlip && (prepared.partial || !nameKnown())) {
        // No name either way up: the way up that reads like a card (a year, HP, card names) is the right one.
        const weight = (found) => found.namesInText.length * 2 + (found.years.length ? 2 : 0) + (found.hp ? 1 : 0) + (found.evolvesFrom ? 2 : 0) + (found.species ? 3 : 0);
        const other = cluesFor(true);
        if (weight(other) > weight(clues)) { clues = other; upsideDown = true; }
      }
      const lettersIn = (value) => String(value || "").toLowerCase().replace(/[^a-zà-ž]/g, "");
      let nameSource = "name-bar";
      // Nov 26 2026 (dark foil cards): the name bar gave no real name, but the Pokédex line
      // under the picture was read ("NO. 0300 Kitten Pokémon" is Skitty). The species is the
      // name to search by; the catalog match then settles which card of that species it is.
      // On a piece of a jammed scan the Pokédex line also outranks a name taken from loose text.
      if (clues.species && (!nameKnown() || (prepared.partial && !lettersIn(parsed.name).includes(lettersIn(clues.species))))) {
        const numberKept = parsed.certainty === "name-and-number" || parsed.certainty === "number-only" ? parsed.number : "";
        parsed = { ...parsed, name: clues.species, number: numberKept, query: [clues.species, numberKept].filter(Boolean).join(" "), certainty: numberKept ? "name-and-number" : "name-only" };
        nameSource = "dex-line";
      }
      // The name bar gave no real name, but the card's own text names it ("...except any
      // Abomasnow", "Galarian Slowpoke eat the seeds"). On a whole card the name bar must
      // at least start the same way; a piece of a jammed scan has no name bar to ask.
      // A piece whose own name was read is left alone: its text also names the card it
      // evolves from (a jammed Electivire came back as "Electabuzz").
      if (nameIndex && clues.namesInText.length && !nameKnown()) {
        const strips = textOf((key) => /^name/.test(key) && isTurned(key) === upsideDown).toLowerCase();
        // A name bar that already holds the whole name and more ("Ethan's Pikachu") is the fuller name: kept.
        const fromText = clues.namesInText.find((candidate) => {
          const first = candidate.split(" ")[0].toLowerCase();
          if (prepared.partial) return true;
          return first.length >= 5 && strips.includes(first) && !lettersIn(parsed.name).includes(lettersIn(candidate));
        });
        if (fromText) {
          const numberKept = parsed.certainty === "name-and-number" || parsed.certainty === "number-only" ? parsed.number : "";
          parsed = { ...parsed, name: fromText, number: numberKept, query: [fromText, numberKept].filter(Boolean).join(" "), certainty: numberKept ? "name-and-number" : "name-only" };
          nameSource = "card-text";
        }
      }
      // Nov 27 2026 (owner's slab photos): a graded slab held up to the card camera. Its label
      // sits where a card's name bar would be, so the label is what was read there. The label
      // says the card's name and number better than the card behind the plastic does, and the
      // grader, grade and certificate besides (findSlabInCardText: a raw card never has a label).
      // The reads of the top of the picture go first line by line (psm 6), then the wide ones.
      const topKeys = Object.keys(byKey).filter((key) => /^name/.test(key) && !isTurned(key)).sort((a, b) => Number(/Wide/.test(a)) - Number(/Wide/.test(b)));
      const slab = upsideDown ? null : findSlabInCardText(topKeys.map((key) => byKey[key]).join("\n"), { nameIndex });
      if (slab && (slab.name || slab.number)) {
        // The card's own full number ("151/131") says more than the label's "#151".
        const ownNumber = (parsed.certainty === "name-and-number" || parsed.certainty === "number-only") && parsed.number.includes("/") ? parsed.number : "";
        const name = slab.name || (nameKnown() ? parsed.name : "");
        const number = ownNumber || slab.number;
        parsed = { ...parsed, name, number, query: [name, number].filter(Boolean).join(" "), certainty: name && number ? "name-and-number" : name ? "name-only" : number ? "number-only" : "none" };
        nameSource = "slab-label";
      }
      const graded = slab ? { gradingCompany: slab.gradingCompany, grade: slab.grade, certificationNumber: slab.certificationNumber } : null;
      const gradedWords = graded ? [graded.gradingCompany, graded.grade].filter(Boolean).join(" ") || "graded" : "";
      const message = graded
        ? `Read a graded slab (${gradedWords}). Check the card, grade and certificate number, then review the matches.`
        : parsed.certainty === "name-and-number"
        ? "Found a name and card number. Check them, then review the matches."
        : parsed.certainty === "number-only"
          ? "Found the card number but not the name. Add the name if you can, then review the matches."
          : parsed.certainty === "name-only"
            ? "Found the name but not the card number. Add the number from the bottom of the card for an exact match."
            : "Could not read this card. Try a closer, straight-on photo in good light, or type the name and number.";
      const everything = textOf((key) => isTurned(key) === upsideDown);
      return { ...parsed, clues, nameSource, nameKnown: nameKnown() || nameSource === "dex-line" || Boolean(slab?.name), gradedSlab: graded, upsideDown, text: everything.slice(0, 6000), ...(debug ? { reads: { ...byKey } } : {}), status: parsed.certainty === "none" ? "low_confidence" : "complete", code: "card_read", foundCard, message, query: parsed.query.slice(0, PRODUCT_PHOTO_LIMITS.maxQueryLength) };
    })()]);
  } catch (error) {
    const code = error?.code || "ocr_failed";
    if (debug) console.warn("card reader:", error?.stack || error);
    if (code === "cancelled") return result("cancelled", code, "Reading stopped. You can type the card name and number below.");
    if (code === "timeout") return result("timeout", code, "Reading took too long. Try a closer photo, or type the card name and number.");
    if (code === "image_dimensions") return result("invalid", code, "This photo is too large to read on a phone. Choose a smaller photo or type the details.");
    if (code === "invalid_image") return result("invalid", code, "This image could not be opened. Choose a JPG, PNG or WebP photo.");
    if (code === "unsupported") return result("unsupported", code, "This device cannot read cards automatically. Type the card name and number below.");
    return result("failed", code, "The card could not be read automatically. Type the card name and number below.");
  } finally {
    prepared?.release?.();
    stopped = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Graded slab (Nov 17 2026): reads the label at the top of the slab for the
 * grading company, grade, cert number and the card's name and number.
 * framed: the photo is the slab-shaped camera frame, so the label is the top
 * part; otherwise the whole photo is read larger.
 */
export async function readSlabPhoto(file, { signal, onProgress, timeoutMs = CARD_PHOTO_READER.timeoutMs, workerUrl, framed = false } = {}) {
  const invalid = validateProductPhotoFile(file);
  if (invalid) return result("invalid", "file_invalid", invalid);
  if (signal?.aborted) return result("cancelled", "cancelled", "Reading stopped. You can type the slab details below.");
  if (typeof window === "undefined" || typeof Worker !== "function" || typeof document === "undefined") return result("unsupported", "unsupported", "This device cannot read slabs automatically. Type the details below.");
  let job, timer, rejectStop;
  const interrupted = new Promise((_, reject) => { rejectStop = reject; });
  const stop = (code) => { job?.cancel(code); rejectStop(fail(code)); };
  const abort = () => stop("cancelled");
  signal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => stop("timeout"), Math.min(180_000, Math.max(1, timeoutMs)));
  try {
    return await Promise.race([interrupted, (async () => {
      onProgress?.({ label: "Finding the slab label…", progress: null });
      const image = await decode(file);
      const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
      if (!width || !height || width * height > 40_000_000) throw fail("image_dimensions");
      const labelHeight = framed ? height * 0.3 : height;
      const label = crop(image, 0, 0, width, labelHeight, 1800, true);
      const whole = crop(image, 0, 0, width, height, Math.min(2400, width), true);
      image.close?.();
      const images = [
        { key: "label6", psm: "6", image: await toPng(label) },
        { key: "label11", psm: "11", image: await toPng(label) },
        { key: "whole", psm: "11", image: await toPng(whole) },
      ];
      label.width = 0; whole.width = 0;
      onProgress?.({ label: "Reading the label…", progress: null });
      job = recognizeImages(images, { workerUrl });
      const response = await job.promise;
      const byKey = Object.fromEntries((response.texts || []).map((entry) => [entry.key, String(entry.text || "")]));
      const slab = parseSlabLabel([byKey.label6, byKey.label11, byKey.whole].filter(Boolean).join("\n"));
      const found = [slab.gradingCompany && "grader", slab.grade && "grade", slab.certificationNumber && "cert number", (slab.name || slab.number) && "card"].filter(Boolean);
      const message = found.length >= 3 ? "Read the " + found.join(", ") + ". Check each one, then review the matches."
        : found.length ? "Read the " + found.join(" and ") + ". Type anything missing from the label."
          : "Could not read this label. Hold the slab straight with the label at the top of the frame, avoid glare, or type the details.";
      const suggestions = [slab.number && { type: "card-number", value: slab.number, label: "Card number" }, slab.name && { type: "text", value: slab.name, label: "Card name" }].filter(Boolean);
      return { ...slab, slab: true, status: found.length ? "complete" : "low_confidence", code: "slab_read", message, suggestions };
    })()]);
  } catch (error) {
    const code = error?.code || "ocr_failed";
    if (code === "cancelled") return result("cancelled", code, "Reading stopped. You can type the slab details below.");
    if (code === "timeout") return result("timeout", code, "Reading took too long. Try a closer photo of the label.");
    return result("failed", code, "The slab label could not be read automatically. Type the details below.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Receipts (Nov 17 2026): reads a receipt photo on this device and returns its
 * lines as text for the receipt review screen. The person checks every line
 * before anything is saved; the photo never leaves the device for reading.
 */
export async function readReceiptPhoto(file, { signal, onProgress, timeoutMs = CARD_PHOTO_READER.timeoutMs, workerUrl } = {}) {
  const invalid = validateProductPhotoFile(file);
  if (invalid) return result("invalid", "file_invalid", invalid);
  if (signal?.aborted) return result("cancelled", "cancelled", "Reading stopped. Type the receipt lines below.");
  if (typeof window === "undefined" || typeof Worker !== "function" || typeof document === "undefined") return result("unsupported", "unsupported", "This device cannot read receipts automatically. Type the lines below.");
  let job, timer, rejectStop;
  const interrupted = new Promise((_, reject) => { rejectStop = reject; });
  const stop = (code) => { job?.cancel(code); rejectStop(fail(code)); };
  const abort = () => stop("cancelled");
  signal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => stop("timeout"), Math.min(180_000, Math.max(1, timeoutMs)));
  try {
    return await Promise.race([interrupted, (async () => {
      onProgress?.({ label: "Preparing the receipt…", progress: null });
      const image = await decode(file);
      const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
      if (!width || !height || width * height > 40_000_000) throw fail("image_dimensions");
      // Long receipts stay tall; the width is what makes the print readable.
      const page = crop(image, 0, 0, width, height, Math.min(1800, Math.max(width, 1200)), true);
      image.close?.();
      const images = [{ key: "receipt", psm: "6", image: await toPng(page) }];
      page.width = 0;
      onProgress?.({ label: "Reading the receipt…", progress: null });
      job = recognizeImages(images, { workerUrl });
      const response = await job.promise;
      const text = String(response.texts?.[0]?.text || "")
        .split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length >= 2).join("\n").slice(0, 20_000);
      const priced = text.split("\n").filter((line) => /\d+[.,]\d{2}\b/.test(line)).length;
      return {
        status: priced ? "complete" : "low_confidence",
        code: "receipt_read",
        text,
        message: priced ? `Read ${priced} priced line${priced === 1 ? "" : "s"}. Check them below before reviewing.` : "Could not find prices on this receipt. Flatten it, fill the frame and avoid shadows, or type the lines.",
      };
    })()]);
  } catch (error) {
    const code = error?.code || "ocr_failed";
    if (code === "cancelled") return result("cancelled", code, "Reading stopped. Type the receipt lines below.");
    if (code === "timeout") return result("timeout", code, "Reading took too long. Try a closer photo, or type the lines.");
    return result("failed", code, "The receipt could not be read automatically. Type the lines below.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
