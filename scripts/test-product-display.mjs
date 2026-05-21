import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeCatalogSearch,
  scoreCatalogSearchRow,
} from "../src/data/catalogSearchAliases.mjs";
import {
  buildCatalogSelectionSnapshot,
  getProductImageFallback,
  getProductImageUrl,
  productHasUsableImage,
} from "../src/utils/productDisplayUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "src", "data");
const sealedProducts = JSON.parse(fs.readFileSync(path.join(dataDir, "generated", "sealedProducts.json"), "utf8"));
const recoveryProducts = JSON.parse(fs.readFileSync(path.join(dataDir, "catalogRecoveryProducts.json"), "utf8"));
const catalog = [...recoveryProducts, ...sealedProducts];

function expectSearch(query, predicate, label = query) {
  const analysis = analyzeCatalogSearch(query);
  const results = catalog
    .map((item) => ({ item, ...scoreCatalogSearchRow(item, analysis, query) }))
    .sort((a, b) => b.score - a.score)
    .filter((result) => result.score > 0)
    .slice(0, 12);
  assert.ok(results.length > 0, `${label}: expected at least one catalog result`);
  const match = results.find((result) => predicate(result.item));
  assert.ok(
    match,
    `${label}: expected matching product in top results, got ${results.map((result) => result.item.productName || result.item.name).join(" | ")}`
  );
  return match.item;
}

function hasText(value, needle) {
  return String(value || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

function isType(product, type) {
  return hasText(product.productType || product.product_type || product.sealedProductType, type);
}

const miniPortfolio = expectSearch("mini portfolio", (product) => isType(product, "Mini Portfolio"));
expectSearch("prismatic mini portfolio", (product) =>
  isType(product, "Mini Portfolio") &&
  (hasText(product.productName, "Prismatic Evolutions") || hasText(product.setName, "Prismatic Evolutions"))
);
expectSearch("collector chest", (product) => isType(product, "Collector"));
expectSearch("collectors chest", (product) => isType(product, "Collector"));
expectSearch("prismatic evolutions etb", (product) =>
  isType(product, "Elite Trainer Box") &&
  (hasText(product.productName, "Prismatic Evolutions") || hasText(product.setName, "Prismatic Evolutions"))
);
expectSearch("prismatic booster bundle", (product) =>
  isType(product, "Booster Bundle") &&
  (hasText(product.productName, "Prismatic Evolutions") || hasText(product.setName, "Prismatic Evolutions"))
);
expectSearch("journey together blister", (product) =>
  isType(product, "Blister") &&
  (hasText(product.productName, "Journey Together") || hasText(product.setName, "Journey Together"))
);
expectSearch("stacking tin", (product) => isType(product, "Stacking Tin"));
expectSearch("ex box", (product) => isType(product, "Ex Box"));

const imageBackedPrismatic = expectSearch("prismatic evolutions etb", (product) =>
  isType(product, "Elite Trainer Box") &&
  productHasUsableImage(product)
);
assert.ok(getProductImageUrl(imageBackedPrismatic), "image-backed catalog products should expose a usable product image URL");

const fallbackOnly = {
  productName: "Prismatic Evolutions 4-Pocket Portfolio",
  setName: "Prismatic Evolutions",
  productType: "Mini Portfolio",
  imageUrl: "",
};
const fallback = getProductImageFallback(fallbackOnly);
assert.equal(fallback.title, "Prismatic Evolutions 4-Pocket Portfolio");
assert.match(fallback.meta, /Prismatic Evolutions/);
assert.match(fallback.meta, /Mini Portfolio/);

const snapshot = buildCatalogSelectionSnapshot(miniPortfolio, { destination: "forge" });
assert.ok(snapshot.itemName, "selection snapshot should preserve product name");
assert.ok(snapshot.productType, "selection snapshot should preserve product type");
assert.ok(snapshot.setName, "selection snapshot should preserve set/expansion");
assert.equal(snapshot.destination, "forge");
assert.equal(snapshot.photoUrl, snapshot.imageUrl, "selection snapshot should keep photoUrl and imageUrl aligned");

const manualRecoveryRows = recoveryProducts.filter((product) => product.source === "manual_catalog_recovery");
for (const product of manualRecoveryRows) {
  assert.ok(!Number(product.marketPrice || product.market_price || 0), `${product.productName}: recovery rows must not invent market price`);
  assert.ok(!Number(product.msrpPrice || product.msrp_price || product.msrp || 0), `${product.productName}: recovery rows must not invent MSRP`);
}

console.log(JSON.stringify({
  ok: true,
  tests: 14,
  catalogRows: catalog.length,
  imageBackedExample: imageBackedPrismatic.productName || imageBackedPrismatic.name,
}, null, 2));
