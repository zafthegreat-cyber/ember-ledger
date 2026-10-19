const assert = require("node:assert/strict");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const origin = process.env.QA_BASE_URL || "http://127.0.0.1:5287";
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/scout-screenshot-ocr");
const productionAssets = process.env.QA_PRODUCTION_ASSETS === "1";
const builtRoot = path.resolve(process.env.QA_PRODUCTION_DIST || "dist");
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const outside = [];
  const writes = [];
  const errors = [];
  const assets = [];
  const assetResponses = [];
  const servedHashes = new Map();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(origin).origin) { outside.push(request.url()); return route.abort(); }
    if (request.method() !== "GET") { writes.push(request.url()); return route.abort(); }
    // The production app intentionally refuses synthetic local beta sign-in.
    // Only this isolated utility module is injected into an empty harness;
    // every worker, WASM engine and language model remains a real built asset.
    if (productionAssets && url.pathname === "/src/utils/scoutScreenshotOcr.mjs") return route.fulfill({ contentType: "text/javascript", body: readFileSync(path.resolve("src/utils/scoutScreenshotOcr.mjs"), "utf8") });
    if (url.pathname.startsWith("/ocr/")) assets.push(url.pathname);
    return route.continue();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  if (productionAssets) page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/ocr/") && response.ok()) assetResponses.push(response.body().then((body) => { servedHashes.set(url.pathname, { sha256: createHash("sha256").update(body).digest("hex"), contentEncoding: response.headers()["content-encoding"] || "identity" }); }).catch(() => {}));
  });
  await page.goto(`${origin}/offline.html`);
  const preservedStorage = await page.evaluate(async () => {
    localStorage.setItem("code3-ocr-test-sentinel", "existing-records-and-prices");
    return { storage: { ...localStorage }, databases: (await indexedDB.databases()).map((database) => database.name).sort() };
  });
  const results = [];
  try {
    for (const theme of ["facebook-light", "discord-dark", "transparent-post"]) {
      const scan = await page.evaluate(async (mode) => {
        const { extractScoutScreenshotText } = await import("/src/utils/scoutScreenshotOcr.mjs");
        const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 700;
        const ctx = canvas.getContext("2d");
        const dark = mode === "discord-dark";
        if (mode !== "transparent-post") { ctx.fillStyle = dark ? "#232428" : "#ffffff"; ctx.fillRect(0, 0, 900, 700); }
        ctx.fillStyle = dark ? "#ffffff" : "#202124";
        ctx.font = "bold 32px Arial"; ctx.fillText(dark ? "Community stock alerts" : "Local collectors group", 38, 70);
        ctx.font = "29px Arial";
        const rows = ["Target - 123 Main Street", "October 19, 2026 at 10:30 AM", "Pokemon Prismatic Evolutions", "Elite Trainer Boxes and booster bundles", "In stock - purchase limit applies", "Review details before sharing"];
        rows.forEach((line, index) => ctx.fillText(line, 38, 160 + index * 70));
        const dataUrl = canvas.toDataURL("image/png");
        const mime = mode === "discord-dark" ? "image/jpeg" : mode === "transparent-post" ? "image/webp" : "image/png";
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
        const file = new File([blob], `${mode}.image`, { type: mime });
        const progress = [];
        const response = await extractScoutScreenshotText(file, { onProgress: (entry) => progress.push(entry), timeoutMs: 90000 });
        return { response, progress, dataUrl };
      }, theme);
      assert.equal(scan.response.status, "complete", JSON.stringify(scan.response));
      for (const expected of ["Target", "123 Main Street", "Prismatic Evolutions", "booster bundles"]) assert.ok(scan.response.text.includes(expected), `${theme}: missing ${expected}: ${scan.response.text}`);
      assert.ok(scan.progress.some((entry) => entry.stage === "reading"));
      writeFileSync(path.join(output, `${theme}.png`), Buffer.from(scan.dataUrl.split(",")[1], "base64"));
      results.push({ theme, response: scan.response, progressEvents: scan.progress.length });
      await expect.poll(() => page.workers().length, { message: "Reader worker should end after a successful OCR job", timeout: 3000 }).toBe(0);
    }
    const cancelled = await page.evaluate(async () => {
      const { extractScoutScreenshotText } = await import("/src/utils/scoutScreenshotOcr.mjs");
      const canvas = document.createElement("canvas"); canvas.width = 100; canvas.height = 100;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve));
      const file = new File([blob], "cancel.png", { type: "image/png" });
      const aborter = new AbortController();
      return extractScoutScreenshotText(file, { signal: aborter.signal, onProgress: (entry) => { if (entry.stage === "loading") setTimeout(() => aborter.abort(), 30); } });
    });
    assert.equal(cancelled.status, "cancelled");
    await expect.poll(() => page.workers().length, { message: "Cancelling during initial loading should end all reader workers", timeout: 3000 }).toBe(0);
    results.push({ guard: "cancel-during-load", status: cancelled.status });
    const timedOut = await page.evaluate(async () => {
      const { extractScoutScreenshotText } = await import("/src/utils/scoutScreenshotOcr.mjs");
      const canvas = document.createElement("canvas"); canvas.width = 100; canvas.height = 100;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve));
      return extractScoutScreenshotText(new File([blob], "timeout.png", { type: "image/png" }), { timeoutMs: 1 });
    });
    assert.equal(timedOut.status, "timeout");
    results.push({ guard: "timeout", status: timedOut.status });
    const invalidCases = await page.evaluate(async () => {
      const { extractScoutScreenshotText } = await import("/src/utils/scoutScreenshotOcr.mjs");
      const corrupted = new Uint8Array(24); corrupted.set([137, 80, 78, 71, 13, 10, 26, 10], 0); corrupted.set([73, 72, 68, 82], 12);
      const view = new DataView(corrupted.buffer); view.setUint32(16, 300); view.setUint32(20, 300);
      const corrupt = await extractScoutScreenshotText(new File([corrupted], "corrupt.png", { type: "image/png" }));
      const tooLarge = await extractScoutScreenshotText(new File([new Uint8Array(12 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
      const unsupported = await extractScoutScreenshotText(new File(["<svg>"], "image.svg", { type: "image/svg+xml" }));
      const canvas = document.createElement("canvas"); canvas.width = 300; canvas.height = 300;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve));
      const blank = await extractScoutScreenshotText(new File([blob], "blank.png", { type: "image/png" }));
      return { corrupt, tooLarge, unsupported, blank };
    });
    assert.equal(invalidCases.corrupt.code, "invalid_image");
    assert.equal(invalidCases.tooLarge.code, "file_size");
    assert.equal(invalidCases.unsupported.code, "file_type");
    assert.equal(invalidCases.blank.status, "low_confidence");
    assert.equal(invalidCases.blank.text, "");
    for (const [guard, response] of Object.entries(invalidCases)) results.push({ guard, status: response.status, code: response.code });
    await expect.poll(() => page.workers().length, { timeout: 3000 }).toBe(0);
    const afterStorage = await page.evaluate(async () => ({ storage: { ...localStorage }, databases: (await indexedDB.databases()).map((database) => database.name).sort() }));
    assert.deepEqual(afterStorage, preservedStorage, "Private OCR must not write records, prices, or cache screenshot data in IndexedDB");
    assert.deepEqual(outside, [], "OCR must not fetch from a CDN or send screenshot bytes outside the app");
    assert.deepEqual(writes, [], "OCR must not POST or upload screenshots");
    assert.deepEqual(errors, []);
    assert.ok(assets.some((asset) => asset.endsWith("eng.traineddata.gz")), "English model should be loaded locally");
    assert.ok(assets.some((asset) => asset.includes("core") && asset.endsWith(".wasm.js")), "WASM core should be loaded locally");
    if (productionAssets) {
      await Promise.all(assetResponses);
      for (const [pathname, served] of servedHashes) {
        const file = path.resolve(builtRoot, `.${pathname}`);
        assert.ok(file.startsWith(`${builtRoot}${path.sep}`), "Built asset comparison must stay in the output folder");
        const expectedBytes = readFileSync(file);
        served.builtFileSha256 = createHash("sha256").update(expectedBytes).digest("hex");
        // Fetch/Playwright expose the decoded response body when the static
        // server declares Content-Encoding:gzip for the .traineddata.gz file.
        const deliveredBytes = pathname.endsWith(".gz") && served.contentEncoding === "gzip" ? gunzipSync(expectedBytes) : expectedBytes;
        assert.equal(served.sha256, createHash("sha256").update(deliveredBytes).digest("hex"), `Untouched built asset ${pathname}`);
      }
      assert.ok([...servedHashes.keys()].some((pathname) => pathname.endsWith("eng.traineddata.gz")));
    }
    writeFileSync(path.join(output, "results.json"), JSON.stringify({ kind: productionAssets ? "production-assets-harness" : "development-utility-harness", authenticatedAppVerified: false, injectedOnlyUtilityModule: productionAssets, passed: true, results, assets: [...new Set(assets)], builtAssetHashes: productionAssets ? Object.fromEntries(servedHashes) : undefined, outsideRequests: outside, writeRequests: writes, errors, physicalDeviceTested: false }, null, 2));
    console.log(`Private screenshot OCR passed: ${results.length} browser cases, ${productionAssets ? "untouched production" : "local"} engine/model, no external requests or uploads.`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
