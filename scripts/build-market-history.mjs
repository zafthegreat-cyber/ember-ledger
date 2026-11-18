#!/usr/bin/env node
// Pokémon market price history (owner, Nov 17 2026: "the over 2 year market
// pull", then "pull popular products daily and the rest weekly").
//
// TCGCSV publishes one immutable 7z archive of TCGplayer prices per day since
// 2024-02-08. This keeps only Pokémon (category 3) and writes:
//
//   <out>/<groupId>.json        weekly, every product, back to 2024-02-08
//   <out>/index.json
//   <out>/daily/<groupId>.json  daily, popular products, the last --daily-days days
//   <out>/daily/index.json
//
// Each file: { groupId, dates: ["YYYY-MM-DD", ...], series: { "<productId>|<subType>": [cents|null, ...] } }
//
// Popular = products in the newest sets, the highest-value products and this
// week's biggest movers (see popularKeys). Runs are incremental: only days not
// yet in <out> are fetched, archives are cached in --cache, and TCGCSV rate
// limits are respected (wait and retry; if still limited, stop cleanly and keep
// what was built so the next run continues). Needs the `7z` command (p7zip).
//
//   node scripts/build-market-history.mjs --cache .market-cache --out market-history [--weekly] [--daily] [--limit N]
// With neither --weekly nor --daily, both run.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FIRST_DAY = "2024-02-08";
const STEP = 7;
const ARCHIVE = (day) => `https://tcgcsv.com/archive/tcgplayer/prices-${day}.ppmd.7z`;

const isoDay = (date) => date.toISOString().slice(0, 10);
const addDays = (day, count) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return isoDay(d); };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Weekly days from `from` to `to`, every `every` days (the grid never moves). Pure. */
export function historyDays(from, to, every = STEP) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, every)) days.push(day);
  return days;
}

/** The next weekly days after the history's last date. Pure. */
export function nextWeeklyDays(existingDates, to, every = STEP) {
  const last = existingDates[existingDates.length - 1];
  return historyDays(last ? addDays(last, every) : FIRST_DAY, to, every);
}

/**
 * Popular products for daily prices. Pure.
 * latest: Map key -> cents for the newest day; groupOf: Map key -> groupId;
 * weekAgo: Map key -> cents about a week earlier (optional).
 */
export function popularKeys(latest, groupOf, weekAgo = new Map(), { newestSets = 8, topValue = 1500, topMovers = 300, minMoverCents = 500 } = {}) {
  const keys = new Set();
  const groups = [...new Set(groupOf.values())].map(Number).sort((a, b) => b - a).slice(0, newestSets).map(String);
  const newest = new Set(groups);
  for (const [key] of latest) if (newest.has(String(groupOf.get(key)))) keys.add(key);
  [...latest].sort((a, b) => b[1] - a[1]).slice(0, topValue).forEach(([key]) => keys.add(key));
  [...latest]
    .filter(([key, cents]) => cents >= minMoverCents && weekAgo.get(key) > 0)
    .map(([key, cents]) => [key, Math.abs(cents - weekAgo.get(key)) / weekAgo.get(key)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, topMovers)
    .forEach(([key]) => keys.add(key));
  return keys;
}

class RateLimited extends Error {}

function readArgs(argv) {
  return Object.fromEntries(argv.reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : "true"]);
    return pairs;
  }, []));
}

function makeFetcher(cacheDir, delayMs) {
  return async function fetchArchive(day) {
    const file = join(cacheDir, `prices-${day}.ppmd.7z`);
    if (existsSync(file) && statSync(file).size > 0) return file;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(ARCHIVE(day), { headers: { "user-agent": "code3-market-history/1.1" } });
      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        const wait = Math.min(600, Number(response.headers.get("retry-after")) || 60 * 2 ** attempt);
        console.log(`archive ${day}: HTTP ${response.status}, waiting ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }
      if (!response.ok) throw new Error(`archive ${day}: HTTP ${response.status}`);
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      await sleep(delayMs);
      return file;
    }
    throw new RateLimited(`archive ${day}: still rate limited`);
  };
}

/** Pokémon prices for one day: Map "productId|subType" -> { cents, groupId }. */
function readDay(file, day, cacheDir, category) {
  const work = join(cacheDir, "extract");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  execFileSync("7z", ["x", "-y", `-o${work}`, file, `${day}/${category}/*`, "-r"], { stdio: "ignore" });
  const base = join(work, day, category);
  const prices = new Map();
  if (existsSync(base)) {
    for (const groupId of readdirSync(base)) {
      const pricesFile = join(base, groupId, "prices");
      if (!existsSync(pricesFile)) continue;
      let parsed;
      try { parsed = JSON.parse(readFileSync(pricesFile, "utf8")); } catch { continue; }
      for (const row of parsed.results || []) {
        const value = Number.isFinite(row.marketPrice) ? row.marketPrice : (Number.isFinite(row.midPrice) ? row.midPrice : null);
        if (value === null || value <= 0) continue;
        prices.set(`${row.productId}|${row.subTypeName || "Normal"}`, { cents: Math.round(value * 100), groupId: String(groupId) });
      }
    }
  }
  rmSync(work, { recursive: true, force: true });
  return prices;
}

/** Load a history folder into { dates, groups: Map groupId -> Map key -> Map dayIndex -> cents }. */
function loadHistory(dir) {
  const dates = [];
  const groups = new Map();
  const indexFile = join(dir, "index.json");
  if (!existsSync(indexFile)) return { dates, groups };
  const index = JSON.parse(readFileSync(indexFile, "utf8"));
  dates.push(...(index.dates || []));
  for (const { groupId } of index.groups || []) {
    const file = join(dir, `${groupId}.json`);
    if (!existsSync(file)) continue;
    const saved = JSON.parse(readFileSync(file, "utf8"));
    const offsets = (saved.dates || []).map((day) => dates.indexOf(day));
    const series = new Map();
    for (const [key, values] of Object.entries(saved.series || {})) {
      const points = new Map();
      values.forEach((cents, i) => { if (cents !== null && offsets[i] >= 0) points.set(offsets[i], cents); });
      if (points.size) series.set(key, points);
    }
    groups.set(String(groupId), series);
  }
  return { dates, groups };
}

function addDay(history, day, prices, keep = null) {
  const index = history.dates.length;
  history.dates.push(day);
  for (const [key, { cents, groupId }] of prices) {
    if (keep && !keep.has(key)) continue;
    if (!history.groups.has(groupId)) history.groups.set(groupId, new Map());
    const series = history.groups.get(groupId);
    if (!series.has(key)) series.set(key, new Map());
    series.get(key).set(index, cents);
  }
}

/** Keep only the last `days` days (daily history). */
function trimHistory(history, newest, days) {
  const cut = history.dates.findIndex((day) => daysBetween(day, newest) < days);
  if (cut <= 0) return;
  history.dates = history.dates.slice(cut);
  for (const series of history.groups.values()) {
    for (const [key, points] of series) {
      const moved = new Map();
      for (const [i, cents] of points) if (i >= cut) moved.set(i - cut, cents);
      if (moved.size) series.set(key, moved); else series.delete(key);
    }
  }
}

function writeHistory(dir, history, meta) {
  mkdirSync(dir, { recursive: true });
  const index = [];
  for (const [groupId, series] of history.groups) {
    if (!series.size) continue;
    const out = {};
    for (const [key, points] of series) out[key] = history.dates.map((_, i) => (points.has(i) ? points.get(i) : null));
    writeFileSync(join(dir, `${groupId}.json`), JSON.stringify({ groupId: Number(groupId), dates: history.dates, series: out }));
    index.push({ groupId: Number(groupId), products: series.size });
  }
  for (const file of readdirSync(dir)) {
    const id = file.match(/^(\d+)\.json$/)?.[1];
    if (id && !history.groups.get(id)?.size) rmSync(join(dir, file));
  }
  index.sort((a, b) => a.groupId - b.groupId);
  writeFileSync(join(dir, "index.json"), JSON.stringify({ ...meta, dates: history.dates, groups: index, builtAt: new Date().toISOString(), source: "TCGCSV daily TCGplayer price archives" }, null, 1));
  return index.reduce((sum, g) => sum + g.products, 0);
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const category = String(args.category || "3");
  const cacheDir = args.cache || ".market-cache";
  const outDir = args.out || "market-history";
  const dailyDir = join(outDir, "daily");
  const limit = Number(args.limit || 0);
  const dailyDays = Number(args["daily-days"] || 120);
  const both = !args.weekly && !args.daily;
  const fetchArchive = makeFetcher(cacheDir, Number(args.delay || 3000));
  mkdirSync(cacheDir, { recursive: true });
  const yesterday = isoDay(new Date(Date.now() - 24 * 3600 * 1000));
  const today = isoDay(new Date());
  let limited = false;

  // Weekly: every product, one day a week back to the first archive.
  const weekly = loadHistory(outDir);
  if (args.weekly || both) {
    let days = nextWeeklyDays(weekly.dates, args.to || yesterday);
    if (limit) days = days.slice(0, limit);
    console.log(`weekly: ${weekly.dates.length} dates saved, ${days.length} to add`);
    for (const day of days) {
      let file;
      try { file = await fetchArchive(day); } catch (error) { if (error instanceof RateLimited) { console.log(`::warning::${error.message}; keeping progress, the next run continues`); limited = true; break; } throw error; }
      if (!file) { console.log(`weekly ${day}: no archive yet`); break; }
      const prices = readDay(file, day, cacheDir, category);
      addDay(weekly, day, prices);
      console.log(`weekly ${day}: ${prices.size} prices`);
    }
    const series = writeHistory(outDir, weekly, { category: Number(category), kind: "weekly", step: STEP });
    console.log(`weekly done: ${weekly.dates.length} dates (${weekly.dates[0]} to ${weekly.dates[weekly.dates.length - 1]}), ${series} series`);
  }

  // Daily: popular products, the last `dailyDays` days.
  if ((args.daily || both) && !limited) {
    const daily = loadHistory(dailyDir);
    const last = daily.dates[daily.dates.length - 1];
    const start = last ? addDays(last, 1) : addDays(today, -Math.min(dailyDays, 14) + 1);
    const days = historyDays(start, today, 1);
    console.log(`daily: ${daily.dates.length} dates saved, checking ${days.length}`);
    for (const day of days) {
      let file;
      try { file = await fetchArchive(day); } catch (error) { if (error instanceof RateLimited) { console.log(`::warning::${error.message}`); break; } throw error; }
      if (!file) { console.log(`daily ${day}: no archive yet`); continue; }
      const prices = readDay(file, day, cacheDir, category);
      const latest = new Map([...prices].map(([key, value]) => [key, value.cents]));
      const groupOf = new Map([...prices].map(([key, value]) => [key, value.groupId]));
      // A week earlier: from the daily history, else the newest weekly point.
      const weekAgo = new Map();
      for (const series of weekly.groups.values()) for (const [key, points] of series) { const value = [...points.values()].pop(); if (value) weekAgo.set(key, value); }
      let backIndex = -1;
      for (let i = daily.dates.length - 1; i >= 0; i -= 1) if (daysBetween(daily.dates[i], day) >= 7) { backIndex = i; break; }
      if (backIndex >= 0) for (const series of daily.groups.values()) for (const [key, points] of series) { const value = points.get(backIndex); if (value) weekAgo.set(key, value); }
      const keep = popularKeys(latest, groupOf, weekAgo);
      addDay(daily, day, prices, keep);
      console.log(`daily ${day}: ${keep.size} popular products`);
    }
    if (daily.dates.length) trimHistory(daily, daily.dates[daily.dates.length - 1], dailyDays);
    const series = writeHistory(dailyDir, daily, { category: Number(category), kind: "daily", days: dailyDays });
    console.log(`daily done: ${daily.dates.length} dates, ${series} series`);
  }
  // Keep the cache small: daily archives older than two weeks are not needed again.
  for (const file of readdirSync(cacheDir)) {
    const day = file.match(/^prices-(\d{4}-\d{2}-\d{2})\.ppmd\.7z$/)?.[1];
    if (day && daysBetween(day, today) > 14 && !weekly.dates.includes(day)) rmSync(join(cacheDir, file));
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/build-market-history.mjs")) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
