import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const sealedProducts = JSON.parse(fs.readFileSync(path.join(rootDir, "src", "data", "generated", "sealedProducts.json"), "utf8"));
const recoveryProducts = JSON.parse(fs.readFileSync(path.join(rootDir, "src", "data", "catalogRecoveryProducts.json"), "utf8"));
const productAliases = fs.readFileSync(path.join(rootDir, "src", "data", "productAliases.js"), "utf8");

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[e\u00e9]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function rowText(row = {}) {
  return normalize([
    row.productName || row.name,
    row.cleanName,
    row.searchName,
    row.setName,
    row.productType,
  ].filter(Boolean).join(" "));
}

function hasImage(row = {}) {
  return Boolean(row.imageUrl || row.photoUrl || row.imageLarge || row.imageSmall || row.productImage);
}

function rankSearchRows(query = "", rows = []) {
  const normalized = normalize(query);
  const tokens = normalized.split(" ").filter(Boolean);
  return rows
    .map((row) => {
      const text = rowText(row);
      const allTokensMatch = tokens.length > 0 && tokens.every((token) => text.includes(token));
      const score =
        (text.includes(normalized) ? 700 : 0) +
        (allTokensMatch ? 420 : 0) +
        tokens.filter((token) => text.includes(token)).length * 35;
      return { row, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

const allRows = [...recoveryProducts, ...sealedProducts];

const requiredQueries = [
  "Mini Portfolio",
  "Prismatic Evolutions Mini Portfolio",
  "Prismatic Evolutions Binder Collection",
  "Prismatic Evolutions Poster Collection",
  "Prismatic Evolutions Surprise Box",
  "Prismatic Evolutions Elite Trainer Box",
  "Prismatic Evolutions Booster Bundle",
  "Prismatic Evolutions Tech Sticker Collection",
  "Prismatic Evolutions Accessory Pouch Special Collection",
  "Prismatic Evolutions Super Premium Collection",
  "Collector Chest",
  "Pokemon TCG Collector Chest",
  "Back to School Mini Portfolio",
  "Back to School Pencil Case",
  "Booster Bundle",
  "Elite Trainer Box",
  "Build & Battle Box",
  "Build & Battle Stadium",
  "Booster Box",
  "3 Pack Blister",
  "Checklane Blister",
  "Sleeved Booster Pack",
  "Collection Box",
  "Premium Collection",
  "Tin",
  "Mini Tin",
  "Booster Tin",
  "Knock Out Collection",
  "Battle Deck",
  "ex Battle Deck",
  "Deluxe Battle Deck",
  "League Battle Deck",
  "Trainer Toolkit",
  "Mega Evolution Chaos Rising Booster Bundle",
  "Mega Zygarde ex Premium Collection",
  "Mega Moonlit Tin",
];

for (const query of requiredQueries) {
  const normalized = normalize(query);
  const hits = allRows.filter((row) => rowText(row).includes(normalized));
  assert.ok(hits.length > 0, `${query}: expected at least one catalog/recovery row`);
}

const imageCriticalQueries = [
  "Prismatic Evolutions Elite Trainer Box",
  "Prismatic Evolutions Booster Bundle",
  "Prismatic Evolutions Binder Collection",
  "Prismatic Evolutions Poster Collection",
  "Prismatic Evolutions Accessory Pouch Special Collection",
  "Prismatic Evolutions Super Premium Collection",
  "Mega Zygarde ex Premium Collection",
  "Mega Moonlit Tin",
];

for (const query of imageCriticalQueries) {
  const normalized = normalize(query);
  const hits = allRows.filter((row) => rowText(row).includes(normalized));
  assert.ok(hits.some(hasImage), `${query}: expected at least one image-backed catalog row`);
}

const chaosResults = rankSearchRows("Chaos Rising Booster Bundle", allRows).slice(0, 5);
assert.ok(chaosResults.length > 0, "Chaos Rising Booster Bundle: expected search results");
assert.match(
  `${chaosResults[0].row.productName || chaosResults[0].row.name || ""} ${chaosResults[0].row.searchName || ""}`,
  /chaos rising/i,
  "Chaos Rising Booster Bundle: expected exact recovery row to rank before generic booster bundles"
);

[
  "Booster Tin",
  "Trainer Toolkit",
  "ex Battle Deck",
  "Deluxe Battle Deck",
  "Knock Out Collection",
].forEach((label) => {
  assert.ok(productAliases.includes(label), `${label}: expected alias coverage`);
});

console.log(JSON.stringify({
  ok: true,
  requiredQueries: requiredQueries.length,
  imageCriticalQueries: imageCriticalQueries.length,
  recoveryProducts: recoveryProducts.length,
}, null, 2));
