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

export const CARD_PHOTO_READER = Object.freeze({
  timeoutMs: 120_000,
  // Fractions of the card's height. Pokémon, Lorcana and Magic print the name at
  // the top and the number at the bottom; One Piece prints its code bottom right.
  nameBand: [0.025, 0.155],
  numberBand: [0.86, 0.985],
  stripWidth: 1500,
  fullMaxSide: 1600,
});

const MODEL_GZIP = import.meta.env?.VITE_NATIVE_BUILD !== "true";
const fail = (code) => Object.assign(new Error(code), { code });
const result = (status, code, message, extra = {}) => ({ status, code, message, text: "", suggestions: [], query: "", ...extra });

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
export function findCardBounds(grey, width, height) {
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
  // Trading cards are about 63 x 88 mm (0.716). Accept upright cards only.
  if (aspect < 0.55 || aspect > 0.9 || box.w < 0.35 || box.h < 0.35) return null;
  if (box.x < 0.03 && box.y < 0.03 && box.w > 0.94 && box.h > 0.94) return null;
  return box;
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

/** Locate the card, then return the three crops to read. Exported for the evaluation script. */
export async function prepareCardCrops(file) {
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
  const found = findCardBounds(grey, thumb.width, thumbHeight);
  // A slightly tilted card has slanted edges; keep a small margin so the name is not cut off.
  const pad = 0.015;
  const box = found ? { x: Math.max(0, found.x - pad), y: Math.max(0, found.y - pad), w: Math.min(1, found.w + pad * 2), h: Math.min(1, found.h + pad * 2) } : { x: 0, y: 0, w: 1, h: 1 };
  thumb.width = 0;
  const card = { x: box.x * width, y: box.y * height, w: box.w * width, h: box.h * height };
  const [nameTop, nameBottom] = CARD_PHOTO_READER.nameBand;
  const [numTop, numBottom] = CARD_PHOTO_READER.numberBand;
  const name = crop(image, card.x, card.y + card.h * nameTop, card.w, card.h * (nameBottom - nameTop), CARD_PHOTO_READER.stripWidth, true);
  // A taller second look at the top of the card, for tilted cards and tall name bars.
  const nameWide = crop(image, card.x, card.y, card.w, card.h * 0.24, CARD_PHOTO_READER.stripWidth, true);
  const number = crop(image, card.x, card.y + card.h * numTop, card.w, card.h * (numBottom - numTop), CARD_PHOTO_READER.stripWidth, true);
  const fullScale = Math.min(1, CARD_PHOTO_READER.fullMaxSide / Math.max(card.w, card.h));
  const full = crop(image, card.x, card.y, card.w, card.h, Math.round(card.w * fullScale), true);
  image.close?.();
  const images = [
    { key: "name", psm: "6", image: await toPng(name) },
    { key: "nameWide", psm: "11", image: await toPng(nameWide) },
    { key: "number", psm: "11", image: await toPng(number) },
    { key: "full", psm: "11", image: await toPng(full) },
  ];
  for (const canvas of [name, nameWide, number, full]) { canvas.width = 0; canvas.height = 0; }
  return { images, foundCard: Boolean(found) };
}

export async function readCardPhoto(file, { signal, onProgress, timeoutMs = CARD_PHOTO_READER.timeoutMs, workerUrl } = {}) {
  const invalid = validateProductPhotoFile(file);
  if (invalid) return result("invalid", "file_invalid", invalid);
  if (signal?.aborted) return result("cancelled", "cancelled", "Reading stopped. You can type the card name and number below.");
  if (typeof window === "undefined" || typeof Worker !== "function" || typeof document === "undefined" || typeof WebAssembly !== "object") {
    return result("unsupported", "unsupported", "This device cannot read cards automatically. Type the card name and number below.");
  }
  let worker, timer, stopped = false, rejectStop;
  const interrupted = new Promise((_, reject) => { rejectStop = reject; });
  const stop = (code) => { stopped = true; worker?.terminate(); rejectStop(fail(code)); };
  const abort = () => stop("cancelled");
  const progress = (label, value = null) => { if (!stopped) try { onProgress?.({ label, progress: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null }); } catch { /* presentation only */ } };
  signal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => stop("timeout"), Math.min(180_000, Math.max(1, timeoutMs)));
  try {
    return await Promise.race([interrupted, (async () => {
      progress("Finding the card in your photo…");
      const { images, foundCard } = await prepareCardCrops(file);
      if (stopped) throw fail("cancelled");
      progress("Loading the private card reader…");
      worker = new Worker(workerUrl || new URL("/ocr/card-photo-v1.worker.js", window.location.href), { name: "Code 3 card reader" });
      let readsDone = 0;
      const response = await new Promise((resolve, reject) => {
        worker.onerror = (event) => { event.preventDefault(); reject(fail("ocr_failed")); };
        worker.onmessageerror = () => reject(fail("ocr_failed"));
        worker.onmessage = ({ data }) => {
          if (stopped) return;
          if (data?.type === "progress" && data.status === "recognizing text") {
            if (data.progress >= 1) readsDone += 1;
            progress(`Reading the card (${Math.min(4, readsDone + 1)} of 4)…`, (readsDone + Number(data.progress || 0)) / 4);
          } else if (data?.type === "result") resolve(data);
          else if (data?.type === "failure") reject(fail("ocr_failed"));
        };
        worker.postMessage({ type: "recognize-many", images, gzip: MODEL_GZIP }, images.map((entry) => entry.image.buffer));
      });
      const byKey = Object.fromEntries((response.texts || []).map((entry) => [entry.key, String(entry.text || "")]));
      const parsed = parseCardPhotoText({ nameText: [byKey.name, byKey.nameWide].filter(Boolean).join("\n"), numberText: byKey.number, fullText: byKey.full });
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
    stopped = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    worker?.terminate();
  }
}
