/* global importScripts */
// This controller owns the Tesseract worker. Cancelling the controller also
// ends its child while createWorker is still loading, before its promise exists.
let started = false;
self.onmessage = async ({ data }) => {
  if (started || data?.type !== "recognize" || !(data.image instanceof Uint8Array)) return;
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
      gzip: true,
      logger: (entry) => self.postMessage({ type: "progress", status: entry.status, progress: entry.progress }),
      // Errors also reject the current job; do not leak text or throw a second
      // uncaught error containing worker internals into the app's global logger.
      errorHandler: () => {},
    });
    await worker.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" });
    const { data: result } = await worker.recognize(data.image);
    self.postMessage({ type: "result", text: result.text, confidence: result.confidence });
  } catch {
    self.postMessage({ type: "failure" });
  } finally {
    await worker?.terminate();
    self.close();
  }
};
