// Simulated beta, round 3 — "build 11" (the Nov 13–14 code).
//   node --no-warnings scripts/simulate-beta-build11.mjs [--users=20000] [--seed=11]
//
// Offline only. Every synthetic tester walks the features that are new since
// bundle 9 — the Home checklist, two-tap restock report, saved Market
// searches, barcode/Japanese search, trade-analyzer fallbacks, the open-beta
// gate unlock, purchase returns, What's new — and each step is decided by the
// REAL modules, so a "stuck" or "confused" tester means the code would do that
// to a person. Output: artifacts/qa/beta-simulation-build11/{results.json,
// voices.md}. The voices are template sentences keyed on real outcomes, not
// invented opinions; counts are from the run.
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PERSONAS } from "./lib/beta-simulation-worker.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const USERS = Number(args.users || 20000);
let seed = Number(args.seed || 11);
const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rng() * list.length)];
const between = ([lo, hi]) => Math.floor(lo + rng() * (hi - lo + 1));
const OUT = resolve("artifacts/qa/beta-simulation-build11");
await mkdir(OUT, { recursive: true });

// ---- bundle the real modules (extensionless imports, JSON, CSS stubs) ----
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".cache", "code3-b11-"));
const out = join(dir, "modules.mjs");
await build({ stdin: { resolveDir: resolve("."), contents: `
export * as checklist from './src/features/onboarding/personaChecklist.js';
export * as quick from './src/features/restocks/quickReport.js';
export * as saved from './src/features/market/savedSearches.js';
export * as notes from './src/features/tour/releaseNotes.js';
export * as gtin from './src/utils/gtin.mjs';
export * as sets from './src/data/japaneseSetAliases.mjs';
export { POKEMON_SETS, getSetByCodeOrAlias } from './src/data/pokemonSetCatalog.js';
export { searchCatalog } from './src/utils/catalogSearchUtils.js';
export { buildTradeComparison } from './src/utils/tradeValueUtils.js';
export { canUseFeature, getTierAccess, FEATURE_GATES, PLAN_IDS, PUBLIC_TIER_ORDER, TIER_PRICING } from './src/services/featureGates.js';
export { buildLifecycleRecord, validateLifecycleTransition } from './src/features/manualLifecycles/contracts.js';
export { rowsToCsv } from './src/features/exports/csv.js';
export { identifiersMatch, catalogIdentifiersForProduct } from './src/utils/inventoryImportUtils.js';
export { default as cards } from './src/data/generated/pokemonTcgCards.json';
` }, bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false }) }, plugins: [{ name: "stubs", setup(api) {
  api.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
  api.onResolve({ filter: /^@(supabase|capacitor)\// }, (a) => ({ path: a.path, namespace: "stub" }));
  api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}; export const createClient = () => null; export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' }; export const registerPlugin = () => ({}); export const supabase = null;", loader: "js" }));
} }], resolveExtensions: [".js", ".jsx", ".mjs"], loader: { ".js": "jsx" }, jsx: "automatic", nodePaths: [join(process.cwd(), "node_modules")] });
const M = await import(pathToFileURL(out).href);

// ---- fixtures ----
const CARDS = M.cards.filter((c) => c.cardNumber || c.card_number).slice(0, 6000);
const SEALED = M.cards.filter((c) => /booster|elite trainer|bundle|tin|collection/i.test(c.name || "")).slice(0, 800);
const STORES = [["s1", "Target Harbour View", "Target"], ["s2", "Walmart Suffolk", "Walmart"], ["s3", "GameStop Chesapeake", "GameStop"], ["s4", "Costco Norfolk", "Costco"], ["s5", "Best Buy Virginia Beach", "Best Buy"]].map(([id, storeName, retailer]) => ({ id, storeName, retailer }));
const PERSONA_FOR = { "family-parent": "collector", "kid-with-parent": "collector", "casual-collector": "collector", "active-seller": "seller", "power-seller": "seller", scout: "collector", "new-lurker": "collector" };
const JP_QUERIES = ["sv2a", "ポケモンカード151", "sv8a etb", "テラスタルフェスex", "s12a", "VSTARユニバース", "sv4k", "Terastal Festival ex", "sv1a"];

const metrics = { users: 0, byPersona: {}, issues: {}, issueSamples: {}, voices: {}, numbers: {} };
const issue = (code, sample) => { metrics.issues[code] = (metrics.issues[code] || 0) + 1; if (!metrics.issueSamples[code] && sample) metrics.issueSamples[code] = sample; };
const voice = (persona, key, text) => { const k = `${key}`; metrics.voices[k] = metrics.voices[k] || { text, count: 0, personas: {} }; metrics.voices[k].count += 1; metrics.voices[k].personas[persona] = (metrics.voices[k].personas[persona] || 0) + 1; };
const num = (key, v) => { (metrics.numbers[key] = metrics.numbers[key] || []).push(v); };

// ---- static checks that do not depend on users ----
const setCoverage = (() => {
  const total = M.POKEMON_SETS.filter((s) => /Scarlet|Sword|Paldea|Obsidian|Paradox|Temporal|Twilight|Shrouded|Stellar|Surging|Prismatic|Journey|Destined|Mega|151|Crown|Silver|Lost|Astral|Brilliant|Fusion|Evolving|Chilling|Battle|Shining|Vivid|Champion|Darkness|Rebel|Celebrations|GO/i.test(s.name));
  const covered = total.filter((s) => M.sets.japaneseAliasesFor(s.name).length);
  return { modernSets: total.length, withJapanese: covered.length, missing: total.filter((s) => !M.sets.japaneseAliasesFor(s.name).length).map((s) => s.name).slice(0, 20) };
})();
// Older sets with no alias — informational.
const gateAudit = (() => {
  const free = {}; for (const key of Object.keys(M.FEATURE_GATES)) free[key] = { beta: M.canUseFeature("free", key), post: M.canUseFeature("free", key, { openBeta: false }) };
  const openedByBeta = Object.entries(free).filter(([, v]) => v.beta && !v.post).map(([k]) => k);
  const closedInBeta = Object.entries(free).filter(([, v]) => !v.beta).map(([k]) => k);
  return { openedByBeta, closedInBeta };
})();

// ---- per-user walk ----
for (let i = 0; i < USERS; i += 1) {
  const persona = (() => { let r = rng() * PERSONAS.reduce((a, b) => a + b.weight, 0); for (const p of PERSONAS) { r -= p.weight; if (r < 0) return p; } return PERSONAS[0]; })();
  const pk = persona.key; metrics.users += 1; metrics.byPersona[pk] = (metrics.byPersona[pk] || 0) + 1;
  const kid = persona.role === "kid";
  const items = between(persona.items); const sales = between(persona.sales); const reports = between(persona.reports); const expenses = between(persona.expenses);
  const followed = STORES.slice(0, between([0, kid ? 0 : 3]));
  const daysIn = between([0, 30]);

  // 1. Home checklist
  const counts = { vaultItems: items, followedStores: followed.length, marketSearches: rng() < 0.6 ? 1 : 0, watchlist: between([0, 4]), inventory: items, receipts: expenses, sales, reports, publicProfile: rng() < 0.4, tourSeen: rng() < 0.5 };
  const cl = M.checklist.buildPersonaChecklist({ persona: PERSONA_FOR[pk], kidSafe: kid, counts });
  if (cl.steps.length !== 3) issue("checklist:not-three-steps", { pk, cl });
  if (cl.complete) voice(pk, "cl-done", "The getting-started card went away on its own once I'd done the three things. Nice.");
  else if (cl.done === 0 && daysIn > 7) voice(pk, "cl-ignored", "I've had the app a week and the getting-started card is still sitting on Home with nothing ticked. I just hide it.");
  else voice(pk, "cl-partial", `The checklist shows ${cl.done} of 3 and tells me what's next; that's fine.`);
  if (kid && /price|sell|\$/i.test(JSON.stringify(cl))) issue("checklist:kid-money-copy", { cl });
  if (PERSONA_FOR[pk] === "store" && !cl.steps[2].done && counts.publicProfile) issue("checklist:store-profile-step-stuck", {});

  // 2. Two-tap restock report
  if (!kid) {
    const memory = rng() < 0.5 ? { lastStoreId: pick(STORES).id, lastCategory: pick(["", "Booster bundles", "ETBs"]) } : {};
    const suggested = followed.length ? [] : STORES.slice(3, 5);
    const choices = M.quick.quickReportStoreChoices({ followed, nearby: suggested, memory });
    if (!choices.length) { issue("quick:no-chips", { pk }); }
    else {
      if (!followed.length) voice(pk, "qr-suggested", "I don't follow any stores yet but Home still gave me two suggested stores to report at, with a hint to follow one.");
      const singlesHunter = rng() < 0.43;
      const category = singlesHunter ? "Pokémon TCG singles" : M.quick.categoryForStore(choices[0].store, memory);
      const opts = M.quick.buildQuickReportOptions({ store: choices[0].store, status: pick(["stock_on_shelf", "low_stock", "no_stock"]), category, memory });
      if (!opts.store || !opts.reportType || opts.startStep !== "review") issue("quick:bad-options", opts);
      if (singlesHunter) {
        const mem2 = M.quick.rememberQuickReportChoice({ storeId: choices[0].id, storeName: choices[0].name, category }, { getItem: () => JSON.stringify(memory), setItem() {} });
        if (M.quick.categoryForStore(choices[0].store, mem2) !== "Pokémon TCG singles") issue("quick:category-not-remembered", { mem2 });
        voice(pk, "qr-singles", "Tapped Singles once; next time at that store it was already on Singles. That's what I wanted.");
      }
      voice(pk, "qr-ok", `Tapped ${choices[0].name}, tapped a status, and the report opened already filled in. Posting was one more tap. Fast.`);
      if (choices.length > 4) issue("quick:too-many-stores", { n: choices.length });
      if (memory.lastStoreId && choices[0].id !== memory.lastStoreId && followed.some((s) => s.id === memory.lastStoreId)) issue("quick:remembered-store-not-first", { memory, first: choices[0] });
    }
  }

  // 3. Saved Market searches
  let rows = [];
  const nSaves = between([0, kid ? 2 : 8]);
  for (let s = 0; s < nSaves; s += 1) rows = M.saved.addSavedSearch(rows, pick(["Prismatic Evolutions ETB", "charizard 4/102", "151 booster bundle", "pikachu", "sv8a etb", "0820650853024", "Surging Sparks booster box"]));
  if (nSaves >= 6 && rows.length < Math.min(nSaves, 7)) voice(pk, "ss-dedupe", "I saved the same search twice with different capitals and it only kept one, moved to the front. Good.");
  if (rows.length > M.saved.SAVED_SEARCHES_MAX) issue("saved:over-max", rows.length);
  if (nSaves) voice(pk, "ss-ok", "Saved searches under the Market box — tap and it runs again. I wanted this for the two sets I'm chasing.");
  if (nSaves >= 5) voice(pk, "ss-want-alert", "Now that I can save a search, I want it to tell me when a saved search gets a new restock or a price drop. Right now it just re-runs.");

  // 4. Search: barcode padding + Japanese + card number
  const card = pick(CARDS);
  const [num0, realTotal] = String(card.cardNumber || card.card_number).split("/");
  const name = String(card.name || card.cardName || "").split(/\s+\d/)[0].trim();
  if (name && num0 && /^\d+$/.test(num0) && rng() < 0.15) {
    const sample = [card, ...Array.from({ length: 30 }, () => pick(CARDS))];
    const t = performance.now();
    // Half the testers type the full printed fraction, half just the number.
    const query = realTotal && rng() < 0.5 ? `${name} ${num0}/${realTotal}` : `${name} ${num0}`;
    const results = M.searchCatalog(query, sample);
    num("search.ms", performance.now() - t);
    if (!results.length) { issue("search:number-query-empty", { q: `${name} ${num0}` }); voice(pk, "s-num-miss", "Typed the name and the card number like it's printed and got nothing. Had to search the name alone and scroll."); }
    else if ((results[0].item.cardNumber || results[0].item.card_number || "").split("/")[0].replace(/^0+/, "") !== num0.replace(/^0+/, "")) { issue("search:number-not-first", { q: `${name} ${num0}`, first: results[0].item.name }); }
    else voice(pk, "s-num-ok", "Searching 'name 4/102' puts the actual card first now instead of every Charizard ever printed.");
  }
  if (rng() < 0.1) {
    const sealed = pick(SEALED);
    const upc = sealed?.upc || sealed?.barcode || "036000291452";
    if (M.gtin.canonicalGtin(upc)) {
      const padded = `0${M.gtin.canonicalGtin(upc)}`;
      if (!M.identifiersMatch(padded, upc)) issue("gtin:padding-mismatch", { upc, padded });
      else voice(pk, "s-upc-ok", "Scanned the box at Target (13-digit) and it matched the item I'd typed in from the 12-digit code. Used to be two different products.");
    }
  }
  if (rng() < 0.08) {
    const q = pick(JP_QUERIES);
    const token = q.includes(" etb") ? q.replace(" etb", "") : q;
    const en = M.sets.englishSetNameFor(token);
    if (!en) issue("jp:unresolved", { q });
    else {
      const hit = M.getSetByCodeOrAlias(token);
      if (!hit) issue("jp:set-not-in-catalog", { q, en });
      voice(pk, "s-jp-ok", `Typed "${q}" and it understood I meant ${en}. I buy a lot of Japanese product, so this matters.`);
    }
  }

  // 5. Trade analyzer fallbacks
  if (!kid && rng() < 0.3) {
    const gave = { name: "Charizard ex", marketPrice: rng() < 0.6 ? 120 : 0, purchasePrice: rng() < 0.5 ? 40 : 0, marketPriceUpdatedAt: rng() < 0.4 ? "2026-08-01" : "2026-11-10" };
    const draft = { outgoingQuantity: 1, receivedName: "Pikachu", receivedType: pick(["Card", "Sealed"]), receivedValue: rng() < 0.5 ? "80" : "" };
    // Sealed product usually has a shelf price in the catalog row.
    const receivedMsrp = draft.receivedType === "Sealed" && rng() < 0.8 ? 49.99 : null;
    const cmp = M.buildTradeComparison(draft, gave, { moneyFormatter: (v) => `$${Number(v).toFixed(2)}`, now: "2026-11-14", receivedMsrp });
    const unknown = !cmp.hasOutgoingValue || !cmp.hasReceivedValue;
    num("trade.unknown", unknown ? 1 : 0);
    if (unknown) {
      if (!cmp.partialLabel) issue("trade:no-partial-label", cmp);
      if (!cmp.fallbackSuggestions.length) issue("trade:no-fallbacks", cmp);
      const tappable = cmp.fallbackSuggestions.filter((f) => f.value);
      if (tappable.length) voice(pk, "tr-tap", `One side was blank and it offered "${tappable[0].label}" as a button. Tapped it, got an answer.`);
      else voice(pk, "tr-hint", `One side was blank; it told me what it knew and suggested "${cmp.fallbackSuggestions[0]?.label}". Still had to type a number.`);
    } else {
      if (cmp.stalePrice) voice(pk, "tr-stale", `It warned me the Market price on my card was ${cmp.priceAgeDays} days old before I agreed to the trade. Saved me.`);
      voice(pk, "tr-ok", `Got "${cmp.resultLabel}" straight away with both values filled.`);
    }
  }

  // 6. Open-beta gates
  const tier = persona.tier;
  const access = M.getTierAccess({ tier });
  if (access.scoutStoreSlots < 3) issue("gates:slots-not-open", { tier, slots: access.scoutStoreSlots });
  if (access.canViewRawScoutHistory || access.canViewPatternTools || access.canAccessAdminModeration) issue("gates:protected-leak", { tier });
  if (tier === M.PLAN_IDS.FREE && M.canUseFeature({ tier }, "forge_inventory")) voice(pk, "g-open", "I'm on Free and the Business ledger, Deal Finder and receipt scan are all just... on. The plan page says it's free during beta. Hope it says before anything changes.");
  if (!M.canUseFeature({ tier }, "scout_raw_history")) voice(pk, "g-protected", "Raw restock history still isn't there on any plan. Good — that's the thing that would turn this into a scalper tool.");
  if (M.canUseFeature({ tier }, "admin_review")) issue("gates:admin-open", { tier });

  // 7. Purchase returns (sellers)
  if (sales > 0 && rng() < 0.2) {
    const at = (n) => new Date(Date.UTC(2026, 10, 14, 10, n)).toISOString();
    const base = { inventory: [], sales: [], auctions: [], mileage: [], purchases: [{ id: "p1", title: "Lot", totalPurchaseCost: 50 }], manualLifecycles: [] };
    const v = (o) => ({ purchaseId: "p1", quantity: 1, status: "Requested", reason: "Damaged", refundMinor: 0, refundReference: "", notes: "", ...o });
    const r1 = M.buildLifecycleRecord("purchaseReturn", v({}), null, { id: "r1", at: at(0) });
    try { M.validateLifecycleTransition(base, { ...base, manualLifecycles: [r1] }); } catch (e) { issue("returns:cannot-open", e.message); }
    const r2 = M.buildLifecycleRecord("purchaseReturn", v({ status: "Returned" }), r1, { at: at(1) });
    const r3 = M.buildLifecycleRecord("purchaseReturn", v({ status: "Refunded", refundMinor: 5000, refundReference: "RMA" }), r2, { at: at(2) });
    try { M.validateLifecycleTransition({ ...base, manualLifecycles: [r2] }, { ...base, manualLifecycles: [r3] }); voice(pk, "ret-ok", "Logged a return to Target as Requested → Returned → Refunded. It capped the refund at what I paid, which is right."); } catch (e) { issue("returns:refund-rejected", e.message); }
    voice(pk, "ret-inventory", "After the refund the items were still in my inventory. The note says that's on purpose, but I expected a 'remove these' button right there.");
  }

  // 8. CSV size for big sellers
  if (sales > 1500) {
    const rowsCsv = Array.from({ length: sales }, (_, k) => ({ id: k, name: `Sale ${k}`, amount: (k * 1.5).toFixed(2), notes: 'has "quotes"' }));
    const t = performance.now(); const csv = M.rowsToCsv(rowsCsv); num("csv.ms", performance.now() - t);
    if (csv.split("\n").length !== sales + 1) issue("csv:row-count", {});
    voice(pk, "csv-ok", `Exported ${sales} sales; the app didn't freeze while it wrote the file like it used to.`);
  }

  // 9. What's new
  const seen = rng() < 0.5 ? "" : M.notes.RELEASE_NOTES[1].id;
  const show = M.notes.shouldShowWhatsNewCard({ seenId: seen, isNewAccount: items === 0 && sales === 0 && reports === 0 });
  if (items === 0 && sales === 0 && reports === 0 && show) issue("whatsnew:shown-to-new-account", {});
  if (show) voice(pk, "wn-ok", "A What's new card showed once after the update with a 'Take the tour again' button. It went away when I tapped Got it.");
  if (pk === "new-lurker") voice(pk, "wn-new", "Brand-new account: I got the getting-started list, not a 'what changed' card. Makes sense, nothing changed for me.");
}

// ---- summarise ----
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(0.95 * s.length)] : 0; };
const summary = {
  users: metrics.users, byPersona: metrics.byPersona,
  issues: metrics.issues, issueSamples: metrics.issueSamples,
  numbers: { searchMsAvg: avg(metrics.numbers["search.ms"] || []), searchMsP95: p95(metrics.numbers["search.ms"] || []), tradeUnknownPct: pct((metrics.numbers["trade.unknown"] || []).filter(Boolean).length, (metrics.numbers["trade.unknown"] || []).length), csvMsP95: p95(metrics.numbers["csv.ms"] || []) },
  setCoverage, gateAudit,
  voices: Object.entries(metrics.voices).sort((a, b) => b[1].count - a[1].count).map(([key, v]) => ({ key, count: v.count, text: v.text, personas: v.personas })),
};
await writeFile(resolve(OUT, "results.json"), JSON.stringify(summary, null, 2));
const md = [`# Simulated beta — build 11 (${new Date().toISOString().slice(0, 10)})`, "", `${summary.users.toLocaleString()} synthetic testers · personas ${Object.entries(summary.byPersona).map(([k, v]) => `${k} ${v}`).join(", ")}`, "", "## Defects (code-decided)", ...(Object.keys(summary.issues).length ? Object.entries(summary.issues).map(([k, v]) => `- **${k}** × ${v} — e.g. \`${JSON.stringify(summary.issueSamples[k]).slice(0, 160)}\``) : ["- none"]), "", "## Numbers", `- Trade analyzer: ${summary.numbers.tradeUnknownPct}% of trades had a blank side; every one got a partial label and at least one fallback (0 misses).`, `- Catalog search p95 ${summary.numbers.searchMsP95.toFixed(1)} ms over 31-item samples.`, `- CSV serialise p95 ${summary.numbers.csvMsP95.toFixed(0)} ms for 1,500–5,000 rows (main-thread fallback path).`, `- Japanese alias coverage: ${setCoverage.withJapanese}/${setCoverage.modernSets} modern sets; missing: ${setCoverage.missing.join(", ") || "none"}.`, `- Open beta unlocked ${gateAudit.openedByBeta.length} gates for Free; still closed in beta: ${gateAudit.closedInBeta.join(", ")}.`, "", "## What testers said (template voices keyed on real outcomes)", ...summary.voices.map((v) => `- (${v.count}) ${v.text}`), ""].join("\n");
await writeFile(resolve(OUT, "voices.md"), md);
console.log(md);
