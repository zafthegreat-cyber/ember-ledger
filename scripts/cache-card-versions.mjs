import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One-time additive bootstrap. Regular refreshes retain every quote afterward.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "src/data/generated");
const headers = { "User-Agent": "Code3TCG/1.0 (+https://code3tcg.app)", Accept: "application/json" };
const cards = JSON.parse(await fs.readFile(path.join(generated, "pokemonTcgCards.json"), "utf8"));
const cacheFile = path.join(generated, "cardVersionQuotes.json");
const previous = await fs.readFile(cacheFile, "utf8").then(JSON.parse).catch(error => { if (error.code === "ENOENT") return null; throw error; });
const buildResponse = await fetch("https://tcgcsv.com/last-updated.txt", { headers, signal: AbortSignal.timeout(20000) });
if (!buildResponse.ok) throw Error(`Build timestamp failed: ${buildResponse.status}`);
const providerBuild = (await buildResponse.text()).trim();
if (previous?.providerBuild === providerBuild) { console.log("Card versions already cached for this provider build."); process.exit(0); }
const groups = Map.groupBy(cards.filter(card => /^\d+$/.test(String(card.groupId || ""))), card => String(card.groupId));
const rows = new Map((previous?.quotes || []).map(row => [`${row.tcgplayerProductId}:${row.variant}`, row]));
const failedGroups = [];
for (const [groupId, products] of groups) {
  try {
    const response = await fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/prices`, { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`status ${response.status}`);
    const body = await response.json(); if (!body.success || !Array.isArray(body.results)) throw Error("Invalid provider response");
    const ids = new Set(products.map(card => String(card.tcgplayerProductId)));
    const checkedAt = new Date().toISOString();
    for (const quote of body.results) {
      const id = String(quote.productId), variant = String(quote.subTypeName || "").trim();
      if (!ids.has(id) || !variant) continue;
      const row = { tcgplayerProductId: id, sourceGroupId: groupId, catalogType: "card", variant, marketPrice: typeof quote.marketPrice === "number" && Number.isFinite(quote.marketPrice) && quote.marketPrice >= 0 ? quote.marketPrice : null, currency: "USD", source: "TCGCSV", priceCheckedAt: checkedAt, sourceUpdatedAt: providerBuild };
      const key = `${id}:${variant}`, old = rows.get(key);
      if (row.marketPrice !== null || !old || old.marketPrice === null) rows.set(key, row);
    }
  } catch (error) { failedGroups.push(groupId); console.warn(`Retained previous variants for group ${groupId}: ${error.message}`); }
  await new Promise(resolve => setTimeout(resolve, 120));
}
if (!rows.size) throw Error("No card versions were cached; existing files were not changed.");
await fs.writeFile(cacheFile, JSON.stringify({ schemaVersion: 1, providerBuild, checkedAt: new Date().toISOString(), failedGroups, quotes: [...rows.values()] }));
console.log(JSON.stringify({ groups: groups.size, failedGroups, versions: rows.size, file: "src/data/generated/cardVersionQuotes.json", existingPricesChanged: false }));
