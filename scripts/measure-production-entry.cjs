const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");
const { chromium, expect } = require("@playwright/test");

const root = path.resolve(process.argv[2] || "dist");
const output = path.resolve(process.argv[3] || "artifacts/qa/private-beta-candidate/performance/measurement");
assert.ok(fs.existsSync(path.join(root, "index.html")), "Measure a completed production build.");
const mime = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const served = new Map();
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`) && file !== root) { response.writeHead(403); response.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  const source = fs.readFileSync(file);
  const compressed = zlib.gzipSync(source);
  served.set(pathname, { pathname, decodedBytes: source.length, gzipBytes: compressed.length });
  response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Content-Encoding": "gzip", "Content-Length": compressed.length, "Cache-Control": "no-store" });
  response.end(compressed);
});
const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const runs = [];
  try {
    for (let index = 0; index < 5; index++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      await context.route("**/*", (route) => new URL(route.request().url()).origin === origin && route.request().method() === "GET" ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 1500000, uploadThroughput: 750000 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Performance.enable");
      const trace = [];
      cdp.on("Tracing.dataCollected", (event) => trace.push(...event.value));
      await cdp.send("Tracing.start", { categories: "v8,devtools.timeline,disabled-by-default-v8.compile", transferMode: "ReportEvents" });
      await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".app-signed-out #account-access input[type=email]")).toBeVisible({ timeout: 60000 });
      const readyMs = await page.evaluate(() => performance.now());
      await page.waitForTimeout(400);
      const resources = await page.evaluate(() => performance.getEntriesByType("resource").filter((resource) => resource.name.includes("/assets/") && resource.name.split("?")[0].endsWith(".js")).map((resource) => ({ pathname: new URL(resource.name).pathname, transferBytes: resource.transferSize, encodedBytes: resource.encodedBodySize, decodedBytes: resource.decodedBodySize })));
      const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]));
      const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
      await cdp.send("Tracing.end");
      await complete;
      const compileEvents = trace.filter((event) => event.ph === "X" && /parse|compile/i.test(event.name));
      const compileByName = {};
      for (const event of compileEvents) compileByName[event.name] = (compileByName[event.name] || 0) + (event.dur || 0) / 1000;
      assert.deepEqual(errors, []);
      const app = resources.find((entry) => /\/App-[^/]+\.js$/.test(entry.pathname));
      assert.ok(app, "The actual production App chunk was requested.");
      runs.push({ index, readyMs, app, javascriptResources: resources, totalJsEncodedBytes: resources.reduce((total, resource) => total + resource.encodedBytes, 0), totalJsDecodedBytes: resources.reduce((total, resource) => total + resource.decodedBytes, 0), scriptDurationMs: metrics.ScriptDuration * 1000, taskDurationMs: metrics.TaskDuration * 1000, compileByName, errors });
      if (index === 0) fs.writeFileSync(path.join(output, "compile-trace.json"), JSON.stringify(compileEvents, null, 2));
      await context.close();
    }
    const names = [...new Set(runs.flatMap((run) => Object.keys(run.compileByName)))];
    const summary = { productionDirectory: root, browser: browser.version(), coldRuns: runs.length, viewport: "390x844", cpuSlowdown: 4, network: { latencyMs: 40, downloadBytesPerSecond: 1500000 }, median: { readyMs: median(runs.map((run) => run.readyMs)), totalJsEncodedBytes: median(runs.map((run) => run.totalJsEncodedBytes)), totalJsDecodedBytes: median(runs.map((run) => run.totalJsDecodedBytes)), scriptDurationMs: median(runs.map((run) => run.scriptDurationMs)), taskDurationMs: median(runs.map((run) => run.taskDurationMs)), compileByName: Object.fromEntries(names.map((name) => [name, median(runs.map((run) => run.compileByName[name] || 0))])) }, runs, note: "Actual local gzip HTTP transfers and Chromium trace events. Trace categories can overlap; compile event totals must not be added together. CPU/network emulation is synthetic, not physical-phone evidence." };
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ coldRuns: runs.length, median: summary.median, app: runs[0].app }, null, 2));
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; server.close(); });
