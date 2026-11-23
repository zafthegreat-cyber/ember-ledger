// Simulated UI beta: synthetic testers walked over REAL measurements.
//   node scripts/simulate-ui-beta.mjs --in=artifacts/qa/ui-beta/before.json [--users=5000] [--seed=19] [--label=before]
//
// Offline only. scripts/measure-ui-beta.cjs records what the real app renders
// on each phone size, theme and text size (small tap targets, tiny text, low
// contrast, sideways scroll, cut-off labels, controls under the bottom bar).
// Here 5,000 synthetic testers, with a spread of phones, ages, eyesight, thumb
// accuracy and reasons for using the app, each walk the screens their kind of
// person would open on THEIR phone setup. Whether they trip on a measured
// problem is a probability that depends on how bad the measurement is and who
// they are. Nothing here is an opinion: a tester can only "complain" about a
// defect that was measured on a screen they visited. The counts rank what to
// fix first; they are not a forecast of real ratings.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const USERS = Number(args.users || 5000);
let seed = Number(args.seed || 19);
const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const weighted = (table) => { let roll = rng() * table.reduce((sum, [, w]) => sum + w, 0); for (const [value, w] of table) { roll -= w; if (roll <= 0) return value; } return table.at(-1)[0]; };
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
// --in takes one file or several comma-separated files (one per phone width).
const inputs = String(args.in || "artifacts/qa/ui-beta/measurements.json").split(",").map((file) => resolve(file));
const input = inputs[0];
const label = args.label || "run";
const parts = inputs.map((file) => JSON.parse(readFileSync(file, "utf8")));
const data = { ...parts[0], results: parts.flatMap((part) => part.results) };
const OUT = dirname(input);
mkdirSync(OUT, { recursive: true });

// ---- who the testers are ----
const KINDS = {
  collector: { share: 40, screens: ["signin", "home", "add", "collection", "sets", "wants", "market", "settings"] },
  restockHunter: { share: 24, screens: ["signin", "home", "restocks", "add", "market", "settings"] },
  player: { share: 12, screens: ["signin", "home", "market", "sets", "collection", "add"] },
  seller: { share: 12, screens: ["signin", "home", "sell", "deals", "market", "collection", "add", "settings"] },
  parent: { share: 12, screens: ["signin", "home", "collection", "wants", "restocks", "settings"] },
};
const AGES = [["8-12", 9], ["13-17", 15], ["18-34", 40], ["35-54", 28], ["55+", 8]];
const WIDTHS = [[320, 4], [360, 36], [390, 30], [412, 24], [768, 6]];
function makeTester(id) {
  const kind = weighted(Object.entries(KINDS).map(([k, v]) => [k, v.share]));
  const age = kind === "parent" ? weighted([["18-34", 30], ["35-54", 60], ["55+", 10]]) : weighted(AGES);
  const older = age === "35-54" || age === "55+";
  return {
    id, kind, age,
    width: weighted(WIDTHS),
    theme: rng() < 0.58 ? "dark" : "light",
    textScale: rng() < (age === "55+" ? 0.6 : older ? 0.34 : 0.16) ? 1.3 : 1,
    lowVision: rng() < (age === "55+" ? 0.3 : older ? 0.12 : 0.05),
    looseThumb: rng() < (age === "8-12" ? 0.4 : age === "55+" ? 0.35 : 0.12),
    newcomer: rng() < 0.62,
    scrollsToEnd: rng() < 0.55,
    outdoors: rng() < (kind === "restockHunter" ? 0.6 : 0.2),
  };
}

// ---- measured problems, keyed so the same defect on many screens counts once ----
const byConfig = new Map();
for (const row of data.results) {
  if (row.failed || row.skipped) continue;
  byConfig.set(`${row.screen}|${row.width}|${row.theme}|${row.textScale}`, row);
}
const WEIGHT = { broken: 10, overflow: 8, obscured: 7, contrast: 5, target: 4, clipped: 4, tinyText: 3, long: 2, crowded: 2 };
function problemsFor(row) {
  const list = [];
  for (const e of row.errors || []) list.push({ type: "broken", key: `broken|${e.slice(0, 60)}`, text: e, p: () => 1 });
  if (row.overflowX > 1) list.push({ type: "overflow", key: `overflow|${row.screen}|${(row.offscreen?.[0]?.where) || "page"}`, text: `${row.screen}: page scrolls sideways by ${row.overflowX}px`, p: () => 0.8 });
  for (const o of row.obscured || []) list.push({ type: "obscured", key: `obscured|${row.screen}|${o.label}`, text: `${row.screen}: "${o.label}" sits under the ${o.by.includes("fab") ? "feedback bubble" : "bottom bar"} at the end of the page`, p: (t) => (t.scrollsToEnd ? 0.55 : 0.08) });
  for (const c of row.lowContrast || []) list.push({ type: "contrast", key: `contrast|${row.theme}|${c.where}`, text: `${c.where} (${row.theme}): "${c.text}" contrast ${c.ratio}:1, needs ${c.need}:1`, p: (t) => clamp(((c.need - c.ratio) / c.need) * 0.9 * (t.lowVision ? 3 : 1) * (t.outdoors ? 1.6 : 1)) });
  for (const s of row.smallTargets || []) { const short = Math.min(s.w, s.h); list.push({ type: "target", key: `target|${s.where}|${s.label}`, text: `${s.where}: "${s.label}" is ${s.w}x${s.h}px (needs 44)`, p: (t) => clamp(((44 - short) / 44) * 0.5 * (t.looseThumb ? 2.4 : 1)) }); }
  for (const c of row.clipped || []) list.push({ type: "clipped", key: `clipped|${c.where}`, text: `${c.where}: "${c.text}" is cut off`, p: () => 0.3 });
  for (const s of row.smallText || []) list.push({ type: "tinyText", key: `tinyText|${s.where}`, text: `${s.where}: "${s.text}" is ${s.size}px`, p: (t) => clamp(((12 - s.size) / 12) * 1.6 * (t.lowVision ? 3 : 1) * (t.age === "35-54" || t.age === "55+" ? 1.5 : 1)) });
  if (row.screens > 6) list.push({ type: "long", key: `long|${row.screen}`, text: `${row.screen}: ${row.screens} screens of scrolling`, p: (t) => clamp((row.screens - 6) * 0.04 * (t.newcomer ? 1.5 : 1)) });
  if (row.firstScreenControls > 14) list.push({ type: "crowded", key: `crowded|${row.screen}`, text: `${row.screen}: ${row.firstScreenControls} controls on the first screen`, p: (t) => clamp((row.firstScreenControls - 14) * 0.03 * (t.newcomer ? 1.6 : 0.7)) });
  return list;
}
const problemCache = new Map();
const problems = (key) => { if (!problemCache.has(key)) problemCache.set(key, byConfig.has(key) ? problemsFor(byConfig.get(key)) : []); return problemCache.get(key); };

// ---- walk ----
const issues = new Map();
const perScreen = {}, perKind = {}, perType = {};
let smooth = 0, gaveUp = 0, totalHits = 0;
for (let id = 0; id < USERS; id += 1) {
  const t = makeTester(id);
  let pain = 0;
  const seen = new Set();
  for (const screen of KINDS[t.kind].screens) {
    let screenPain = 0;
    for (const problem of problems(`${screen}|${t.width}|${t.theme}|${t.textScale}`)) {
      if (seen.has(problem.key) || rng() >= problem.p(t)) continue;
      seen.add(problem.key);
      const w = WEIGHT[problem.type];
      screenPain += w; totalHits += 1;
      const issue = issues.get(problem.key) || { key: problem.key, type: problem.type, text: problem.text, testers: 0, pain: 0, screens: new Set(), setups: new Set() };
      issue.testers += 1; issue.pain += w; issue.screens.add(screen); issue.setups.add(`${t.width}px ${t.theme}${t.textScale > 1 ? " large text" : ""}`);
      issues.set(problem.key, issue);
      perType[problem.type] = (perType[problem.type] || 0) + 1;
    }
    perScreen[screen] = perScreen[screen] || { visits: 0, pain: 0, hit: 0 };
    perScreen[screen].visits += 1; perScreen[screen].pain += screenPain; if (screenPain) perScreen[screen].hit += 1;
    pain += screenPain;
  }
  perKind[t.kind] = perKind[t.kind] || { testers: 0, pain: 0, smooth: 0 };
  perKind[t.kind].testers += 1; perKind[t.kind].pain += pain;
  if (pain === 0) { smooth += 1; perKind[t.kind].smooth += 1; }
  if (pain >= 30) gaveUp += 1;
}

const ranked = [...issues.values()].map((i) => ({ ...i, screens: [...i.screens], setups: [...i.setups].slice(0, 6), share: Math.round((i.testers / USERS) * 1000) / 10 })).sort((a, b) => b.pain - a.pain);
const pct = (n, d) => `${Math.round((n / d) * 1000) / 10}%`;
const summary = {
  label, users: USERS, seed: Number(args.seed || 19), measuredAt: data.measuredAt, measurements: data.results.length,
  smoothSessions: pct(smooth, USERS), heavyFriction: pct(gaveUp, USERS), problemsPerTester: Math.round((totalHits / USERS) * 100) / 100,
  distinctProblems: ranked.length, byType: perType,
  byScreen: Object.fromEntries(Object.entries(perScreen).map(([k, v]) => [k, { testersWithAProblem: pct(v.hit, v.visits), painPerVisit: Math.round((v.pain / v.visits) * 100) / 100 }])),
  byKind: Object.fromEntries(Object.entries(perKind).map(([k, v]) => [k, { testers: v.testers, smooth: pct(v.smooth, v.testers), painPerTester: Math.round((v.pain / v.testers) * 100) / 100 }])),
  top: ranked.slice(0, 40),
};
writeFileSync(resolve(OUT, `results-${label}.json`), JSON.stringify(summary, null, 1));

const lines = [`# Simulated UI beta (${label})`, "", `${USERS.toLocaleString("en-US")} synthetic testers over ${data.results.length} real screen measurements (5 phone sizes x 2 themes x 2 text sizes x ${data.screens.length} screens).`, "",
  `- Sessions with no UI problem: **${summary.smoothSessions}**`, `- Sessions with heavy friction: **${summary.heavyFriction}**`, `- Problems hit per tester: **${summary.problemsPerTester}**`, `- Distinct problems: **${summary.distinctProblems}**`, "",
  "## By screen", "", "| Screen | Testers who hit a problem | Pain per visit |", "|---|---|---|",
  ...Object.entries(summary.byScreen).sort((a, b) => b[1].painPerVisit - a[1].painPerVisit).map(([k, v]) => `| ${k} | ${v.testersWithAProblem} | ${v.painPerVisit} |`), "",
  "## Top problems", "", "| # | Testers | Type | What was measured | Screens |", "|---|---|---|---|---|",
  ...ranked.slice(0, 25).map((i, n) => `| ${n + 1} | ${i.share}% | ${i.type} | ${i.text.replace(/\|/g, "/")} | ${i.screens.join(", ")} |`), ""];
writeFileSync(resolve(OUT, `report-${label}.md`), lines.join("\n"));
console.log(lines.slice(0, 10).join("\n"));
console.log(ranked.slice(0, 25).map((i, n) => `${String(n + 1).padStart(2)}. ${String(i.share).padStart(5)}%  ${i.type.padEnd(9)} ${i.text.slice(0, 130)}  [${i.screens.join(",")}]`).join("\n"));
