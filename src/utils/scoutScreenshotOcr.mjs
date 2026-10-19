export const SCOUT_SCREENSHOT_LIMITS = Object.freeze({
  maxBytes: 12 * 1024 * 1024,
  maxPixels: 24_000_000,
  maxDimension: 16_000,
  outputPixels: 6_000_000,
  outputDimension: 3_200,
  maxTextLength: 20_000,
  timeoutMs: 90_000,
});

const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const result = (status, code, message, extra = {}) => ({ status, code, message, text: "", confidence: null, engine: "tesseract-english", language: "eng", ...extra });
const failure = (code) => Object.assign(new Error(code), { code });
const u16 = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];
const u24le = (bytes, offset) => bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));

export function validateScoutScreenshotFile(file) {
  if (!file || !TYPES.has(String(file.type || "").toLowerCase())) return result("invalid", "file_type", "Choose a JPG, PNG, or WebP screenshot. HEIC, GIF, SVG, and documents are not supported.");
  if (!Number.isFinite(file.size) || file.size <= 0) return result("invalid", "empty_file", "That image is empty. Choose another screenshot.");
  if (file.size > SCOUT_SCREENSHOT_LIMITS.maxBytes) return result("invalid", "file_size", "Choose an image smaller than 12 MB. Cropping to the stock post also improves text reading.");
  return null;
}

// Check the compressed file's dimensions before handing it to an image decoder.
// No SVG/URL/PDF is accepted; social post content stays plain, untrusted text.
export function readScoutScreenshotDimensions(input, mimeType) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let width = 0;
  let height = 0;
  if (mimeType === "image/png" && bytes.length >= 24 && bytes[0] === 137 && ascii(bytes, 1, 3) === "PNG" && ascii(bytes, 12, 4) === "IHDR") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (mimeType === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset] === 255) offset += 1;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = u16(bytes, offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7) {
        height = u16(bytes, offset + 3); width = u16(bytes, offset + 5); break;
      }
      offset += length;
    }
  } else if (mimeType === "image/webp" && bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const kind = ascii(bytes, 12, 4);
    if (kind === "VP8X") {
      if (bytes[20] & 2) throw failure("animated_image");
      width = u24le(bytes, 24) + 1; height = u24le(bytes, 27) + 1;
    } else if (kind === "VP8 " && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      width = (bytes[26] | (bytes[27] << 8)) & 16383; height = (bytes[28] | (bytes[29] << 8)) & 16383;
    } else if (kind === "VP8L" && bytes[20] === 47) {
      width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
      height = 1 + ((bytes[22] & 192) >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    }
  }
  if (!width || !height) throw failure("invalid_image");
  if (width > SCOUT_SCREENSHOT_LIMITS.maxDimension || height > SCOUT_SCREENSHOT_LIMITS.maxDimension || width * height > SCOUT_SCREENSHOT_LIMITS.maxPixels) throw failure("image_dimensions");
  return { width, height };
}

export function scoutScreenshotOutputDimensions(width, height) {
  const scale = Math.min(1, SCOUT_SCREENSHOT_LIMITS.outputDimension / Math.max(width, height), Math.sqrt(SCOUT_SCREENSHOT_LIMITS.outputPixels / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function normalizeScoutScreenshotText(rawText) {
  return String(rawText || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, SCOUT_SCREENSHOT_LIMITS.maxTextLength);
}

export async function extractScoutScreenshotText(file, { signal, onProgress, timeoutMs = SCOUT_SCREENSHOT_LIMITS.timeoutMs } = {}) {
  const invalid = validateScoutScreenshotFile(file);
  if (invalid) return invalid;
  if (signal?.aborted) return result("cancelled", "cancelled", "Text reading stopped. You can enter or paste details instead.");
  if (typeof window === "undefined" || typeof Worker !== "function" || typeof Image !== "function" || typeof document === "undefined" || typeof WebAssembly !== "object") return result("unsupported", "unsupported", "This device cannot read the screenshot automatically. Paste the post text or enter the details instead.");
  let worker;
  let image;
  let previewUrl;
  let canvas;
  let timer;
  let stopped = false;
  let rejectInterrupt;
  const interrupted = new Promise((_, reject) => { rejectInterrupt = reject; });
  const stop = (code) => { stopped = true; worker?.terminate(); rejectInterrupt(failure(code)); };
  const abort = () => stop("cancelled");
  const ensureActive = () => { if (stopped || signal?.aborted) throw failure("cancelled"); };
  const progress = (stage, label, value = null) => {
    if (!stopped && typeof onProgress === "function") {
      // Progress is presentation only; a consumer callback must not interrupt OCR.
      try { onProgress({ stage, label, progress: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null }); } catch { /* no source text in logs */ }
    }
  };
  signal?.addEventListener("abort", abort, { once: true });
  const duration = Number.isFinite(timeoutMs) ? Math.min(180_000, Math.max(1, timeoutMs)) : SCOUT_SCREENSHOT_LIMITS.timeoutMs;
  timer = setTimeout(() => stop("timeout"), duration);
  try {
    return await Promise.race([interrupted, (async () => {
      progress("preparing", "Preparing screenshot on this device…");
      const bytes = await file.arrayBuffer();
      ensureActive();
      readScoutScreenshotDimensions(bytes, String(file.type).toLowerCase());
      image = new Image();
      previewUrl = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(failure("invalid_image"));
        image.src = previewUrl;
      });
      ensureActive();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || width * height > SCOUT_SCREENSHOT_LIMITS.maxPixels || Math.max(width, height) > SCOUT_SCREENSHOT_LIMITS.maxDimension) throw failure("image_dimensions");
      const outputSize = scoutScreenshotOutputDimensions(width, height);
      canvas = document.createElement("canvas");
      Object.assign(canvas, outputSize);
      const context = canvas.getContext("2d");
      if (!context) throw failure("unsupported");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const cleanBlob = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(failure("invalid_image")), "image/png"));
      ensureActive();
      const cleanBytes = new Uint8Array(await cleanBlob.arrayBuffer());
      ensureActive();
      progress("loading", "Loading private text reader…");
      ensureActive();
      // A classic controller uses the public Tesseract API and owns its child
      // worker, so cancellation can terminate loading as well as recognition.
      worker = new Worker(new URL("/ocr/scout-screenshot-v1.worker.js", window.location.href), { name: "Code 3 screenshot text reader" });
      const response = await new Promise((resolve, reject) => {
        worker.onerror = (event) => { event.preventDefault(); reject(failure("ocr_failed")); };
        worker.onmessageerror = () => reject(failure("ocr_failed"));
        worker.onmessage = ({ data }) => {
          if (stopped) return;
          if (data?.type === "progress") {
            const reading = data.status === "recognizing text";
            progress(reading ? "reading" : "loading", reading ? "Reading screenshot on this device…" : "Loading private text reader…", reading ? Number(data.progress) : null);
          } else if (data?.type === "result") resolve(data);
          else if (data?.type === "failure") reject(failure("ocr_failed"));
        };
        worker.postMessage({ type: "recognize", image: cleanBytes }, [cleanBytes.buffer]);
      });
      ensureActive();
      const text = normalizeScoutScreenshotText(response.text);
      const confidence = Number.isFinite(response.confidence) ? Math.min(100, Math.max(0, response.confidence)) : null;
      return result(text && (confidence === null || confidence >= 50) ? "complete" : "low_confidence", text ? "text_read" : "no_text", text ? "Text read. Review every detail before saving the stock report." : "No readable text was found. Crop closer to the post or paste its text instead.", { text, confidence });
    })()]);
  } catch (error) {
    const code = error?.code || "ocr_failed";
    if (code === "cancelled") return result("cancelled", code, "Text reading stopped. You can enter or paste details instead.");
    if (code === "timeout") return result("timeout", code, "Text reading took too long. Crop closer to the stock post, try again, or paste the text instead.");
    if (code === "image_dimensions") return result("invalid", code, "That image is too large to read safely on a phone. Crop to the stock post and try again.");
    if (code === "invalid_image" || code === "animated_image") return result("invalid", code, "That file could not be read as a still image. Choose a JPG, PNG, or WebP screenshot.");
    if (code === "unsupported") return result("unsupported", code, "This device cannot read the screenshot automatically. Paste the post text or enter the details instead.");
    return result("failed", code, "The screenshot could not be read automatically. You can still paste the post text or enter the report details.");
  } finally {
    stopped = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    worker?.terminate();
    if (image) { image.onload = null; image.onerror = null; image.src = ""; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
