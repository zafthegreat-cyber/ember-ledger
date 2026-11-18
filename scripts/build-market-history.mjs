#!/usr/bin/env node
// Two-plus years of Pokémon market prices (Nov 17 2026, owner: "the over 2 year
// market pull"). TCGCSV publishes one immutable 7z archive of TCGplayer prices
// per day since 2024-02-08. This takes one day per week (plus the newest day),
// keeps only Pokémon (category 3), and writes one compact JSON file per set:
//
//   out/<groupId>.json = { groupId, dates: ["2024-02-08", ...],
//                          series: { "<productId>|<subType>": [marketCents|null, ...] } }
//   out/index.json     = { dates, groups: [{ groupId, products }] , builtAt }
//
// Archives are cached in --cache and never downloaded twice (TCGCSV asks for
// this). Needs the `7z` command (p7zip). Usage:
//   node scripts/build-market-history.mjs --cache .market-cache --out market-history [--from 2024-02-08] [--to 2026-11-16] [--step 7] [--limit 3]
// When --out already holds a history (index.json), only newer days are fetched
// and appended, so each archive is downloaded once over the life of the data.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : "true"]);
  return pairs;
}, []));
const CATEGORY = String(args.category || "3");
const FIRST_DAY = "2024-02-08";
const cacheDir = args.cache || ".market-cache";
const outDir = args.out || "market-history";
const step = Math.max(1, Number(args.step || 7));
const limit = Number(args.limit || 0);
const delayMs = Number(args.delay || 750);
const ARCHIVE = (day) => `https://tcgcsv.com/archive/tcgplayer/prices-${day}.ppmd.7z`;

const isoDay = (date) => date.toISOString().slice(0, 10);
const addDays = (day, count) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return isoDay(d); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The days to take: every `step` days from `from`, plus the last day. Pure, for tests. */
export function historyDays(from, to, every = 7) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, every)) days.push(day);
  if (days[days.length - 1] !== to && to >= from) days.push(to);
  return days;
}

async function fetchArchive(day) {
  const file = join(cacheDir, `prices-${day}.ppmd.7z`);
  if (existsSync(file) && statSync(file).size > 0) return file;
  const response = await fetch(ARCHIVE(day), { headers: { "user-agent": "code3-market-history/1.0" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`archive ${day}: HTTP ${response.status}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  await sleep(delayMs);
  return file;
}

/** Pokémon prices for one day: Map groupId -> [{ productId, subType, market }]. */
function readDay(file, day) {
  const work = join(cacheDir, "extract");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  execFileSync("7z", ["x", "-y", `-o${work}`, file, `${day}/${CATEGORY}/*`, "-r"], { stdio: "ignore" });
  const base = join(work, day, CATEGORY);
  const groups = new Map();
  if (!existsSync(base)) return groups;
  for (const groupId of readdirSync(base)) {
    const pricesFile = join(base, groupId, "prices");
    if (!existsSync(pricesFile)) continue;
    let parsed;
    try { parsed = JSON.parse(readFileSync(pricesFile, "utf8")); } catch { continue; }
    const rows = (parsed.results || []).map((row) => ({
      productId: String(row.productId),
      subType: String(row.subTypeName || "Normal"),
      market: Number.isFinite(row.marketPrice) ? row.marketPrice : (Number.isFinite(row.midPrice) ? row.midPrice : null),
    }));
    groups.set(groupId, rows);
  }
  rmSync(work, { recursive: true, force: true });
  return groups;
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const yesterday = isoDay(new Date(Date.now() - 24 * 3600 * 1000));
  const dates = [];
  const perGroup = new Map(); // groupId -> Map(key -> Map(dayIndex -> cents))
  // Existing history: load it and continue after its last date.
  const indexFile = join(outDir, "index.json");
  if (existsSync(indexFile)) {
    const previous = JSON.parse(readFileSync(indexFile, "utf8"));
    dates.push(...(previous.dates || []));
    for (const { groupId } of previous.groups || []) {
      const file = join(outDir, `${groupId}.json`);
      if (!existsSync(file)) continue;
      const saved = JSON.parse(readFileSync(file, "utf8"));
      const offsets = (saved.dates || []).map((day) => dates.indexOf(day));
      const series = new Map();
      for (const [key, values] of Object.entries(saved.series || {})) {
        const points = new Map();
        values.forEach((cents, i) => { if (cents !== null && offsets[i] >= 0) points.set(offsets[i], cents); });
        series.set(key, points);
      }
      perGroup.set(String(groupId), series);
    }
    console.log(`existing history: ${dates.length} dates, last ${dates[dates.length - 1]}`);
  }
  // Weekly days are counted from the first weekly date so new weeks line up.
  const lastWeekly = [...dates].reverse().find((day) => Math.round((Date.parse(day) - Date.parse(dates[0] || FIRST_DAY)) / 86_400_000) % step === 0);
  const start = dates.length ? addDays(lastWeekly || dates[dates.length - 1], step) : (args.from || FIRST_DAY);
  let days = historyDays(start, args.to || yesterday, step);
  // A "newest day" point that is not on the weekly grid is replaced by the next run's newest day.
  if (dates.length && dates[dates.length - 1] !== lastWeekly) {
    const dropped = dates.length - 1;
    dates.pop();
    for (const series of perGroup.values()) for (const points of series.values()) points.delete(dropped);
  }
  if (limit) days = days.slice(-limit);
  if (!days.length) console.log("history is already up to date");
  for (const day of days) {
    let useDay = day;
    let file = await fetchArchive(useDay);
    for (let back = 1; !file && back <= 3 && day === days[days.length - 1]; back += 1) { useDay = addDays(day, -back); file = await fetchArchive(useDay); }
    if (!file) { console.log(`skip ${day}: no archive`); continue; }
    if (dates.includes(useDay)) continue;
    const index = dates.length;
    dates.push(useDay);
    const groups = readDay(file, useDay);
    let count = 0;
    for (const [groupId, rows] of groups) {
      if (!perGroup.has(groupId)) perGroup.set(groupId, new Map());
      const series = perGroup.get(groupId);
      for (const row of rows) {
        if (row.market === null || row.market <= 0) continue;
        const key = `${row.productId}|${row.subType}`;
        if (!series.has(key)) series.set(key, new Map());
        series.get(key).set(index, Math.round(row.market * 100));
        count += 1;
      }
    }
    console.log(`${useDay}: ${groups.size} sets, ${count} prices`);
  }
  const index = [];
  for (const [groupId, series] of perGroup) {
    const out = {};
    for (const [key, points] of series) out[key] = dates.map((_, i) => (points.has(i) ? points.get(i) : null));
    writeFileSync(join(outDir, `${groupId}.json`), JSON.stringify({ groupId: Number(groupId), dates, series: out }));
    index.push({ groupId: Number(groupId), products: series.size });
  }
  index.sort((a, b) => a.groupId - b.groupId);
  writeFileSync(join(outDir, "index.json"), JSON.stringify({ category: Number(CATEGORY), step, dates, groups: index, builtAt: new Date().toISOString(), source: "TCGCSV daily TCGplayer price archives" }, null, 1));
  console.log(`done: ${dates.length} dates (${dates[0]} to ${dates[dates.length - 1]}), ${index.length} sets, ${index.reduce((sum, g) => sum + g.products, 0)} price series`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("build-market-history.mjs")) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
