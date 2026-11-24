// Card reader (Nov 17 2026): reads one card photo on the device.
// 1. Finds the card in the photo (the large bright/dark-edged rectangle) when
//    it can, otherwise uses the whole photo.
// 2. Crops the name strip (top of the card) and the number strip (bottom),
//    enlarges them, turns them grey and stretches the contrast.
// 3. Reads both strips plus the whole card in one load of the local text model.
// 4. Turns the text into a search like "Charizard ex 125/197".
// The photo, crops and text never leave the device; only the reviewed search does.
import { validateProductPhotoFile, PRODUCT_PHOTO_LIMITS } from "./productPhotoLookup.mjs";
import { parseCardPhotoText } from "./cardPhotoText.mjs";
import { parseSlabLabel } from "./slabLabelText.mjs";

export const CARD_PHOTO_READER = Object.freeze({
  timeoutMs: 120_000,
  // A single card should never take this long; a stuck read gives up sooner (Nov 24 2026).
  cardTimeoutMs: 60_000,
  // Fractions of the card's height. Pokémon, Lorcana and Magic print the name at
  // the top and the number at the bottom; One Piece prints its code bottom right.
  nameBand: [0.025, 0.155],
  numberBand: [0.86, 0.985],
  stripWidth: 1500,
  fullMaxSide: 1600,
});

const MODEL_GZIP = import.meta.env?.VITE_NATIVE_BUILD !== "true";
// Characters a printed card number or set code can contain ("SV1 EN 125/198", "TG05/TG30", "OP01-001").
const NUMBER_CHARACTERS = "0123456789/-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
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

/** Pure: stretch contrast on RGBA pixels in place, returning greyscale. Exported for tests. */
export function enhanceForText(pixels) {
  const grey = new Uint8ClampedArray(pixels.length / 4);
  const histogram = new Uint32Array(256);
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const value = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    grey[p] = value;
    histogram[value] += 1;
  }
  // Clip 1% at each end so glare and deep shadows do not flatten the text.
  const clip = Math.max(1, Math.floor(grey.length * 0.01));
  let low = 0, high = 255, seen = 0;
  for (; low < 255; low += 1) { seen += histogram[low]; if (seen > clip) break; }
  seen = 0;
  for (; high > 0; high -= 1) { seen += histogram[high]; if (seen > clip) break; }
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
    enhanceForText(data.data);
    context.putImageData(data, 0, 0);
  }
  return canvas;
}

const toPng = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(fail("invalid_image")), "image/png"))
  .then((blob) => blob.arrayBuffer()).then((buffer) => new Uint8Array(buffer));

// Copies the card out of the photo, turned upright (rotate is 0, 90 or -90 degrees).
function uprightCard(image, card, rotate, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(card.w, card.h));
  const w = Math.max(1, Math.round(card.w * scale)), h = Math.max(1, Math.round(card.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = rotate ? h : w;
  canvas.height = rotate ? w : h;
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
  const found = framed ? null : findCardBounds(grey, thumb.width, thumbHeight);
  // A slightly tilted card has slanted edges; keep a small margin so the name is not cut off.
  const pad = 0.015;
  const box = found ? { x: Math.max(0, found.x - pad), y: Math.max(0, found.y - pad), w: Math.min(1, found.w + pad * 2), h: Math.min(1, found.h + pad * 2) } : { x: 0, y: 0, w: 1, h: 1 };
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
  const entries = [];
  const canvases = [];
  for (const [index, turn] of turns.entries()) {
    const upright = uprightCard(image, card, turn, 2400);
    const cw = upright.width, ch = upright.height;
    const later = found?.sideways ? 1 : 2;
    const name = crop(upright, 0, ch * nameTop, cw, ch * (nameBottom - nameTop), CARD_PHOTO_READER.stripWidth, true);
    // A taller second look at the top of the card, for tilted cards and tall name bars.
    const nameWide = crop(upright, 0, 0, cw, ch * 0.24, CARD_PHOTO_READER.stripWidth, true);
    const number = crop(upright, 0, ch * numTop, cw, ch * (numBottom - numTop), CARD_PHOTO_READER.stripWidth, true);
    entries.push(
      { key: `name${index}`, psm: "6", canvas: name, stage: 1 },
      { key: `nameWide${index}`, psm: "11", canvas: nameWide, stage: later },
      { key: `number${index}`, psm: "11", canvas: number, stage: later },
    );
    if (index === 0) {
      // Nov 23 2026: the number is tiny and sits in a corner (bottom left on Scarlet &
      // Violet and later, bottom right on older cards). Read each corner as one line,
      // enlarged, with only the characters a card number can have.
      const cornerTop = ch * 0.875, cornerHeight = ch * 0.115;
      const numberLeft = crop(upright, 0, cornerTop, cw * 0.5, cornerHeight, 1200, true);
      const numberRight = crop(upright, cw * 0.5, cornerTop, cw * 0.5, cornerHeight, 1200, true);
      entries.push(
        { key: "numberLeft0", psm: "7", whitelist: NUMBER_CHARACTERS, canvas: numberLeft, stage: 1 },
        { key: "numberRight0", psm: "7", whitelist: NUMBER_CHARACTERS, canvas: numberRight, stage: 1 },
      );
      // No clear card edge: the card may be small in a wide shot, so read the whole photo larger.
      const fullSide = found || framed ? CARD_PHOTO_READER.fullMaxSide : 2400;
      const fullScale = Math.min(1, fullSide / Math.max(cw, ch));
      const full = crop(upright, 0, 0, cw, ch, Math.round(cw * fullScale), true);
      entries.push({ key: "full", psm: "11", canvas: full, stage: later });
    }
    canvases.push(upright);
  }
  image.close?.();
  for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; }
  const encode = async (stage) => {
    const images = [];
    for (const entry of entries) {
      if (entry.stage !== stage || !entry.canvas.width) continue;
      images.push({ key: entry.key, psm: entry.psm, ...(entry.whitelist ? { whitelist: entry.whitelist } : {}), image: await toPng(entry.canvas) });
    }
    return images;
  };
  const release = () => { for (const entry of entries) { entry.canvas.width = 0; entry.canvas.height = 0; } };
  const meta = { foundCard: Boolean(found) || framed, sideways: Boolean(found?.sideways) };
  if (!staged) {
    try { return { images: [...await encode(1), ...await encode(2)], ...meta }; } finally { release(); }
  }
  // Staged: stage-2 crops are only encoded if more() is called; release() frees them either way.
  return { images: await encode(1), more: () => encode(2), release, ...meta };
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

export async function readCardPhoto(file, { signal, onProgress, timeoutMs = CARD_PHOTO_READER.cardTimeoutMs, workerUrl, framed = false } = {}) {
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
      await read(prepared.images, "Reading the card", 0, 0.5);
      nameIndex = await namesReady;
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
      const message = parsed.certainty === "name-and-number"
        ? "Found a name and card number. Check them, then review the matches."
        : parsed.certainty === "number-only"
          ? "Found the card number but not the name. Add the name if you can, then review the matches."
          : parsed.certainty === "name-only"
            ? "Found the name but not the card number. Add the number from the bottom of the card for an exact match."
            : "Could not read this card. Try a closer, straight-on photo in good light, or type the name and number.";
      return { ...parsed, status: parsed.certainty === "none" ? "low_confidence" : "complete", code: "card_read", foundCard, message, query: parsed.query.slice(0, PRODUCT_PHOTO_LIMITS.maxQueryLength) };
    })()]);
  } catch (error) {
    const code = error?.code || "ocr_failed";
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
