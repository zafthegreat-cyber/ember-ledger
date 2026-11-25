/* global importScripts */
// Card reader, kept loaded (Nov 23 2026). Same local Tesseract assets and the same
// crops as card-photo-v1, but the text model loads once and stays ready, so the
// second and later scans skip the 2-4 s model load. Requests carry an id and are
// read one at a time in arrival order. Text and confidence only; nothing leaves
// the device. The page ends this worker when the scanner has been idle a while.
let reader = null;
let queue = Promise.resolve();

function load(gzip) {
  if (!reader) {
    reader = (async () => {
      const base = new URL("./tesseract-7.0.0/", self.location.href);
      importScripts(new URL("tesseract.min.js", base).href);
      return self.Tesseract.createWorker("eng", 1, {
        workerPath: new URL("worker.min.js", base).href,
        corePath: new URL("core/", base).href,
        langPath: new URL("lang", base).href,
        workerBlobURL: false,
        cacheMethod: "none",
        gzip: gzip !== false,
        logger: (entry) => self.postMessage({ type: "progress", id: self.currentId, status: entry.status, progress: entry.progress }),
        errorHandler: () => {},
      });
    })();
    reader.catch(() => { reader = null; });
  }
  return reader;
}

const validImages = (images) => Array.isArray(images) && images.length > 0 && images.length <= 12
  && images.every((entry) => entry?.image instanceof Uint8Array);

self.onmessage = ({ data }) => {
  if (data?.type === "warm") {
    load(data.gzip).then(() => self.postMessage({ type: "ready" }), () => self.postMessage({ type: "warm-failed" }));
    return;
  }
  if (data?.type !== "recognize-many") return;
  const id = String(data.id || "");
  if (!id || !validImages(data.images)) { self.postMessage({ type: "failure", id }); return; }
  queue = queue.then(async () => {
    try {
      const worker = await load(data.gzip);
      self.currentId = id;
      const texts = [];
      for (const entry of data.images) {
        await worker.setParameters({
          tessedit_pageseg_mode: String(entry.psm || "11"),
          preserve_interword_spaces: "1",
          // Number strips only hold digits, letters, "/" and "-"; a whitelist stops
          // the model from guessing symbols. Empty string means no whitelist.
          tessedit_char_whitelist: String(entry.whitelist || ""),
          // Nov 25 2026: "2" (Sauvola) adapts the black-and-white cut to each patch; "0" is the default single cut.
          // Always set, so one crop's setting does not carry over to the next.
          thresholding_method: ["0", "1", "2"].includes(String(entry.threshold)) ? String(entry.threshold) : "0",
        });
        const { data: result } = await worker.recognize(entry.image);
        texts.push({ key: String(entry.key || ""), text: result.text || "", confidence: result.confidence });
      }
      self.postMessage({ type: "result", id, texts });
    } catch {
      self.postMessage({ type: "failure", id });
    } finally {
      self.currentId = "";
    }
  });
};
