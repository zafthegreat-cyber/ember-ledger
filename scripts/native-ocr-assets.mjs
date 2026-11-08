import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

/** Only operates on the generated native web output, never the public source model. */
export function prepareNativeOcrModel(outputRoot) {
  const compressed = resolve(outputRoot, "ocr/tesseract-7.0.0/lang/eng.traineddata.gz");
  const unpacked = resolve(outputRoot, "ocr/tesseract-7.0.0/lang/eng.traineddata");
  const bytes = gunzipSync(readFileSync(compressed));
  if (!bytes.length) throw new Error("The native screenshot reader model is empty. Run prepare:scout-ocr before building.");
  writeFileSync(unpacked, bytes);
  // Keep one canonical filename; Android would otherwise map both to the same asset.
  unlinkSync(compressed);
  return { model: "eng.traineddata", bytes: bytes.length, gzip: false };
}
