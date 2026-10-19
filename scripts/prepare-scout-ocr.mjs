import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "public/ocr");
const vendor = resolve(target, "tesseract-7.0.0");
const expected = { "tesseract.js": "7.0.0", "tesseract.js-core": "7.0.0", "@tesseract.js-data/eng": "1.0.0" };
for (const [name, version] of Object.entries(expected)) {
  const actual = JSON.parse(readFileSync(resolve(root, "node_modules", name, "package.json"), "utf8")).version;
  if (actual !== version) throw new Error(`OCR asset preparation requires ${name}@${version}; found ${actual}. Review the worker and asset contract before upgrading.`);
}
const copies = [
  ["src/workers/scoutScreenshotOcr.worker.js", "scout-screenshot-v1.worker.js"],
  ["node_modules/tesseract.js/dist/tesseract.min.js", "tesseract-7.0.0/tesseract.min.js"],
  ["node_modules/tesseract.js/dist/tesseract.min.js.LICENSE.txt", "tesseract-7.0.0/tesseract.min.js.LICENSE.txt"],
  ["node_modules/tesseract.js/dist/worker.min.js", "tesseract-7.0.0/worker.min.js"],
  ["node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt", "tesseract-7.0.0/worker.min.js.LICENSE.txt"],
  ["node_modules/tesseract.js/LICENSE.md", "tesseract-7.0.0/LICENSE-tesseract.txt"],
  ["node_modules/tesseract.js-core/LICENSE", "tesseract-7.0.0/LICENSE-core-and-language.txt"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "tesseract-7.0.0/lang/eng.traineddata.gz"],
];
// OEM.LSTM_ONLY never requests a legacy engine. Include every CPU variant so
// Safari/older phones can select the non-SIMD build instead of failing.
for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  copies.push([`node_modules/tesseract.js-core/tesseract-core-${variant}.wasm.js`, `tesseract-7.0.0/core/tesseract-core-${variant}.wasm.js`]);
}
for (const [source, destination] of copies) {
  const from = resolve(root, source);
  if (!existsSync(from)) throw new Error(`Missing OCR asset: ${source}. Run npm ci first.`);
  const to = resolve(target, destination);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
writeFileSync(resolve(vendor, "NOTICE.txt"), [
  "Code 3 TCG screenshot text extraction uses local open-source assets only.",
  "Tesseract.js 7.0.0: https://github.com/naptha/tesseract.js (Apache-2.0)",
  "Tesseract.js-core 7.0.0: https://github.com/naptha/tesseract.js-core (Apache-2.0)",
  "English integerized-best model: @tesseract.js-data/eng 1.0.0 / 4.0.0_best_int",
  "Model source: https://github.com/naptha/tessdata (Apache-2.0); npm package metadata declares MIT.",
  "The engine/model are loaded from this app's origin. Screenshot bytes are processed on the device, never sent to an OCR service.",
  "These files are generated from pinned dependencies by scripts/prepare-scout-ocr.mjs.",
  "",
].join("\n"));
console.log(`Prepared ${copies.length} private OCR assets under public/ocr (English, LSTM-only).`);
