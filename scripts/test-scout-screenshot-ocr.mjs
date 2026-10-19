import assert from "node:assert/strict";
import { extractScoutScreenshotText, normalizeScoutScreenshotText, readScoutScreenshotDimensions, scoutScreenshotOutputDimensions, SCOUT_SCREENSHOT_LIMITS, validateScoutScreenshotFile } from "../src/utils/scoutScreenshotOcr.mjs";

let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`PASS ${name}`); }
function png(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
function webp(kind, size = 30) { const bytes = new Uint8Array(size); for (const [text, offset] of [["RIFF", 0], ["WEBP", 8], [kind, 12]]) bytes.set([...text].map((letter) => letter.charCodeAt(0)), offset); return bytes; }

check("rejects non-images, SVG, GIF, HEIC, URL strings, and mismatched input", () => {
  for (const file of [undefined, "https://example.org/picture.png", { type: "image/svg+xml", size: 100 }, { type: "image/gif", size: 100 }, { type: "image/heic", size: 100 }, { type: "application/pdf", size: 100 }]) assert.equal(validateScoutScreenshotFile(file).code, "file_type");
});
check("rejects empty and oversized images without decoding", () => {
  assert.equal(validateScoutScreenshotFile({ type: "image/png", size: 0 }).code, "empty_file");
  assert.equal(validateScoutScreenshotFile({ type: "image/png", size: SCOUT_SCREENSHOT_LIMITS.maxBytes + 1 }).code, "file_size");
  assert.equal(validateScoutScreenshotFile({ type: "image/png", size: SCOUT_SCREENSHOT_LIMITS.maxBytes }), null);
});
check("accepts still image formats only", () => { for (const type of ["image/png", "image/jpeg", "image/webp"]) assert.equal(validateScoutScreenshotFile({ type, size: 1000 }), null); });
check("reads PNG dimensions including a sliced typed array", () => {
  const bytes = new Uint8Array(40); bytes.set(png(591, 1280), 8);
  assert.deepEqual(readScoutScreenshotDimensions(bytes.subarray(8, 32), "image/png"), { width: 591, height: 1280 });
});
check("reads baseline and progressive JPEG after application metadata", () => {
  for (const marker of [192, 194]) {
    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0, 255, marker, 0, 8, 8, 5, 0, 2, 79, 0, 255, 217]);
    assert.deepEqual(readScoutScreenshotDimensions(jpeg, "image/jpeg"), { width: 591, height: 1280 });
  }
});
check("rejects truncated or malformed JPEG segments", () => {
  for (const bytes of [[255, 216, 255, 224, 0, 0], [255, 216, 255, 192, 0, 255, 8, 0, 4], [0, 0, 0, 0]]) assert.throws(() => readScoutScreenshotDimensions(Uint8Array.from(bytes), "image/jpeg"), { code: "invalid_image" });
});
check("reads extended, lossy, and lossless WebP dimensions", () => {
  const extended = webp("VP8X"); extended[24] = 99; extended[27] = 199;
  assert.deepEqual(readScoutScreenshotDimensions(extended, "image/webp"), { width: 100, height: 200 });
  const lossy = webp("VP8 "); lossy.set([157, 1, 42, 100, 0, 200, 0], 23);
  assert.deepEqual(readScoutScreenshotDimensions(lossy, "image/webp"), { width: 100, height: 200 });
  const lossless = webp("VP8L"); lossless.set([47, 99, 192, 49, 0], 20);
  assert.deepEqual(readScoutScreenshotDimensions(lossless, "image/webp"), { width: 100, height: 200 });
});
check("rejects animated WebP rather than misrepresenting frames", () => { const animated = webp("VP8X"); animated[20] = 2; assert.throws(() => readScoutScreenshotDimensions(animated, "image/webp"), { code: "animated_image" }); });
check("checks compressed image dimensions before image decoding", () => {
  for (const dimensions of [[0, 20], [20, 0], [16001, 1], [6000, 6000], [0xffffffff, 0xffffffff]]) assert.throws(() => readScoutScreenshotDimensions(png(...dimensions), "image/png"));
  assert.deepEqual(readScoutScreenshotDimensions(png(4000, 6000), "image/png"), { width: 4000, height: 6000 });
});
check("declared MIME must match the compressed image header", () => { assert.throws(() => readScoutScreenshotDimensions(png(300, 300), "image/jpeg"), { code: "invalid_image" }); });
check("phone-sized screenshots retain their readable resolution", () => { assert.deepEqual(scoutScreenshotOutputDimensions(591, 1280), { width: 591, height: 1280 }); });
check("large photos are bounded by both area and dimension", () => {
  for (const [width, height] of [[4000, 6000], [16000, 1000], [4000, 4000]]) {
    const next = scoutScreenshotOutputDimensions(width, height);
    assert.ok(Math.max(next.width, next.height) <= 3200);
    assert.ok(next.width * next.height <= 6_002_000);
    assert.ok(Math.abs(next.width / next.height - width / height) < 0.03);
  }
});
check("OCR text stays plain untrusted text, strips control characters, and is bounded", () => {
  assert.equal(normalizeScoutScreenshotText(" \u0000Target\r\n<script>run()</script>\u0007 "), "Target\n<script>run()</script>");
  assert.equal(normalizeScoutScreenshotText("a".repeat(25_000)).length, 20_000);
});
const controller = new AbortController(); controller.abort();
assert.equal((await extractScoutScreenshotText({ type: "image/png", size: 25 }, { signal: controller.signal })).status, "cancelled"); checks += 1; console.log("PASS already-cancelled work never creates a reader");
assert.equal((await extractScoutScreenshotText({ type: "image/png", size: 25 })).status, "unsupported"); checks += 1; console.log("PASS unsupported runtime offers manual fallback");
console.log(`Screenshot OCR safety: ${checks} checks passed.`);
