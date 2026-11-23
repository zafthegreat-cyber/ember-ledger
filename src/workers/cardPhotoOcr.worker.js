/* global importScripts */
// Card reader (Nov 17 2026). Same local Tesseract assets as the screenshot
// reader, but one model load reads several crops of the same card: the name
// strip, the number strip and the whole card. Each crop can ask for its own
// page-segmentation mode. Text and confidence only; nothing leaves the device.
let started = false;
self.onmessage = async ({ data }) => {
  if (started || data?.type !== "recognize-many" || !Array.isArray(data.images)) return;
  if (!data.images.length || data.images.length > 8 || !data.images.every((entry) => entry?.image instanceof Uint8Array)) return;
  started = true;
  let worker;
  try {
    const base = new URL("./tesseract-7.0.0/", self.location.href);
    importScripts(new URL("tesseract.min.js", base).href);
    worker = await self.Tesseract.createWorker("eng", 1, {
      workerPath: new URL("worker.min.js", base).href,
      corePath: new URL("core/", base).href,
      langPath: new URL("lang", base).href,
      workerBlobURL: false,
      cacheMethod: "none",
      gzip: data.gzip !== false,
      logger: (entry) => self.postMessage({ type: "progress", status: entry.status, progress: entry.progress }),
      errorHandler: () => {},
    });
    const texts = [];
    for (const entry of data.images) {
      await worker.setParameters({ tessedit_pageseg_mode: String(entry.psm || "11"), preserve_interword_spaces: "1" });
      const { data: result } = await worker.recognize(entry.image);
      texts.push({ key: String(entry.key || ""), text: result.text || "", confidence: result.confidence });
    }
    self.postMessage({ type: "result", texts });
  } catch {
    self.postMessage({ type: "failure" });
  } finally {
    await worker?.terminate();
    self.close();
  }
};
