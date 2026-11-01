// Offline simulated beta: 100,000 synthetic users (mixed personas) run through
// the app's real domain modules on this machine. Nothing touches production,
// Supabase, Vercel or the network. Usage:
//   node --no-warnings scripts/simulate-beta-100k.mjs [--users=100000] [--workers=2] [--heavy-every=100]
import { Worker } from "node:worker_threads";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import os from "node:os";
import { prepareRestockFeedEntries, filterRestockFeed, restockFeedLocationOptions } from "../src/utils/restockFeedPresentation.mjs";
import { describeExport } from "../src/utils/exportDisclosure.mjs";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, value] = arg.replace(/^--/, "").split("="); return [key, value ?? "true"]; }));
const USERS = Number(args.users || 100000);
const WORKERS = Math.max(1, Number(args.workers || Math.min(2, os.cpus().length)));
const HEAVY_EVERY = Number(args["heavy-every"] || 100);
const HEAVY_POWER_SELLER_CAP = Number(args["heavy-power-cap"] || 150);
const OUT_DIR = resolve("artifacts/qa/beta-simulation-100k");
await mkdir(OUT_DIR, { recursive: true });
// Catalog modules use bundler-style extensionless imports, so bundle them for Node.
const catalogBundle = resolve(OUT_DIR, "catalog-modules.mjs");
await build({ stdin: { resolveDir: resolve("."), contents: `export { searchCatalog } from './src/utils/catalogSearchUtils.js'; export { getBestCatalogMatches } from './src/utils/scanMatchUtils.js';` }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".json": "json" }, outfile: catalogBundle, logLevel: "silent" });
const { searchCatalog, getBestCatalogMatches } = await import(pathToFileURL(catalogBundle).href);

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const quantiles = (values) => { const sorted = values.slice().sort((a, b) => a - b); const at = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0; return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1] || 0 }; };

function mergeTimers(a, b) {
  if (!a) return b;
  // Approximate merge of quantile summaries weighted by count (exact merge would need raw samples).
  const total = a.count + b.count;
  const weighted = (key) => total ? (a[key] * a.count + b[key] * b.count) / total : 0;
  return { count: total, p50: weighted("p50"), p95: Math.max(a.p95, b.p95), p99: Math.max(a.p99, b.p99), max: Math.max(a.max, b.max), total: a.total + b.total };
}
function mergeDeep(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key === "timers") { target.timers = target.timers || {}; for (const [name, timer] of Object.entries(value)) target.timers[name] = mergeTimers(target.timers[name], timer); continue; }
    if (key === "issues") { target.issues = [...(target.issues || []), ...value].slice(0, 120); continue; }
    if (key === "storage") { const t = target.storage || { over4_5MB: 0, over5MB: 0, maxBytes: 0, maxPersona: "", p50: 0, p95: 0, p99: 0, samples: 0 }; t.over4_5MB += value.over4_5MB; t.over5MB += value.over5MB; if (value.maxBytes > t.maxBytes) { t.maxBytes = value.maxBytes; t.maxPersona = value.maxPersona; } t.p50 = Math.max(t.p50, value.p50); t.p95 = Math.max(t.p95, value.p95); t.p99 = Math.max(t.p99, value.p99); target.storage = t; continue; }
    if (Array.isArray(value)) { target[key] = [...new Set([...(target[key] || []), ...value])].slice(0, 16); continue; }
    if (value && typeof value === "object") { target[key] = mergeDeep(target[key] || {}, value); continue; }
    if (typeof value === "number") { target[key] = (target[key] || 0) + value; continue; }
    if (target[key] === undefined) target[key] = value;
  }
  return target;
}

async function runWorkers() {
  const perWorker = Math.ceil(USERS / WORKERS);
  const progress = new Array(WORKERS).fill(0);
  const results = await Promise.all(Array.from({ length: WORKERS }, (_, i) => new Promise((resolvePromise, reject) => {
    const start = i * perWorker; const end = Math.min(USERS, start + perWorker);
    const worker = new Worker(new URL("./lib/beta-simulation-worker.mjs", import.meta.url), { workerData: { start, end, heavyEvery: HEAVY_EVERY, heavyPowerSellerCap: Math.ceil(HEAVY_POWER_SELLER_CAP / WORKERS) } });
    worker.on("message", (message) => {
      if (message.type === "progress") { progress[i] = message.done; const done = progress.reduce((a, b) => a + b, 0); process.stdout.write(`\r  users simulated: ${done.toLocaleString()} / ${USERS.toLocaleString()}   `); }
      if (message.type === "done") resolvePromise(message.metrics);
    });
    worker.on("error", reject);
    worker.on("exit", (code) => { if (code !== 0) reject(new Error(`worker ${i} exited with ${code}`)); });
  })));
  process.stdout.write(`\r  users simulated: ${USERS.toLocaleString()} / ${USERS.toLocaleString()}   \n`);
  const merged = {};
  for (const metrics of results) mergeDeep(merged, metrics);
  merged.onboarding.checklistAvg = merged.onboarding.checklistCount ? merged.onboarding.checklistSum / merged.onboarding.checklistCount : 0;
  return merged;
}

// ---------- shared-scale checks (community-wide feeds and catalog) ----------
function globalRestockFeed() {
  const rng = mulberry32(42);
  const STORES = ["Target", "Walmart", "GameStop", "Best Buy", "Card Shop", "Costco"]; const CITIES = [["Suffolk", "VA"], ["Norfolk", "VA"], ["Chesapeake", "VA"], ["Virginia Beach", "VA"], ["Richmond", "VA"], ["Raleigh", "NC"]];
  const reports = Array.from({ length: 250000 }, (_, i) => { const [city, region] = pick(rng, CITIES); return { id: `r${i}`, storeName: pick(rng, STORES), retailer: pick(rng, STORES), city, region, productName: `Set ${i % 40} Booster Bundle`, stockStatus: pick(rng, ["in_stock", "low", "out", "unknown"]), observedAt: new Date(Date.now() - Math.floor(rng() * 30 * 86400000)).toISOString(), reportText: i % 3 ? "" : "Shelf looked restocked" }; });
  const t0 = performance.now();
  const entries = prepareRestockFeedEntries(reports);
  const prepareMs = performance.now() - t0;
  const t1 = performance.now();
  const options = restockFeedLocationOptions(entries);
  const optionsMs = performance.now() - t1;
  const queries = [];
  for (let i = 0; i < 200; i += 1) {
    const q = { search: i % 4 === 0 ? "booster" : "", stock: pick(rng, ["all", "in_stock", "low"]), period: pick(rng, ["all", "24h", "7d"]), retailer: i % 3 === 0 ? pick(rng, options.retailers).value : "", city: i % 5 === 0 ? pick(rng, options.cities).value : "" };
    const s = performance.now(); const result = filterRestockFeed(entries, q); queries.push(performance.now() - s);
    if (!Array.isArray(result)) throw new Error("filterRestockFeed did not return an array");
  }
  return { reports: reports.length, prepareMs, optionsMs, filter: quantiles(queries), retailers: options.retailers.length, cities: options.cities.length };
}

function globalCatalogSearch() {
  const rng = mulberry32(7);
  const NAMES = ["Charizard", "Pikachu", "Umbreon", "Gengar", "Mew", "Eevee", "Lugia", "Rayquaza", "Gardevoir", "Snorlax"]; const SETS = ["Scarlet & Violet", "Paldea Evolved", "Obsidian Flames", "151", "Paradox Rift", "Temporal Forces", "Surging Sparks", "Prismatic Evolutions"];
  const catalog = Array.from({ length: 20000 }, (_, i) => ({ id: `c${i}`, name: i % 4 === 0 ? `${pick(rng, SETS)} Booster Bundle` : `${pick(rng, NAMES)} ${(i % 250) + 1}/${200 + (i % 50)}`, setName: pick(rng, SETS), productType: i % 4 === 0 ? "Sealed" : "Single", cardNumber: String((i % 250) + 1), barcode: `0${String(820650000000 + i)}`, sku: `SKU${100000 + i}` }));
  const queries = ["charizard 4/102", "pikachu", "booster bundle 151", "umbreon vmax", "prismatic evolutions etb", "mew 151", "gengar ex", "paldea evolved booster", "eevee", "obsidian flames charizard"];
  const search = []; const match = [];
  for (let i = 0; i < 2000; i += 1) {
    const q = pick(rng, queries) + (i % 7 === 0 ? " " + String(i % 250) : "");
    const s = performance.now(); searchCatalog(q, catalog, 24); search.push(performance.now() - s);
    if (i % 4 === 0) { const m = performance.now(); getBestCatalogMatches(q, catalog); match.push(performance.now() - m); }
  }
  return { catalogSize: catalog.length, searchCatalog: quantiles(search), bestMatches: quantiles(match) };
}

const startedAt = new Date().toISOString();
const t0 = performance.now();
console.log(`Simulated beta: ${USERS.toLocaleString()} users on ${WORKERS} worker(s); heavy backup path every ${HEAVY_EVERY} users plus up to ${HEAVY_POWER_SELLER_CAP} power sellers.`);
const users = await runWorkers();
console.log("Running community-scale restock feed and catalog search checks…");
const restockFeed = globalRestockFeed();
const catalog = globalCatalogSearch();
const sanity = describeExport({ format: "csv", fields: ["notes", "price"] }).containsPrivateData === true;
const elapsedMs = performance.now() - t0;
const results = { startedAt, finishedAt: new Date().toISOString(), elapsedMs, config: { users: USERS, workers: WORKERS, heavyEvery: HEAVY_EVERY, heavyPowerSellerCap: HEAVY_POWER_SELLER_CAP, node: process.version, cpus: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1e9) }, users, restockFeed, catalog, disclosureSanity: sanity };
await writeFile(resolve(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
console.log(`Done in ${(elapsedMs / 1000).toFixed(1)}s. Results: ${resolve(OUT_DIR, "results.json")}`);
console.log(JSON.stringify({ users: users.users, byPersona: users.byPersona, issueCounts: users.issueCounts || {}, storage: users.storage, backups: users.backups, community: { ...users.community, unsafePassedSamples: undefined, safeBlockedSamples: undefined }, gates: users.gates }, null, 1).slice(0, 4000));
