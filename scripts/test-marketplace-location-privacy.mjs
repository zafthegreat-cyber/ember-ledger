import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

// Exercise actual draft creation/editing handlers with private location fixtures.
// No app storage, provider calls, or real records are involved.
const require = createRequire(import.meta.url);
const ast = require("espree").parse(appSource, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const draftFunctions = new Map();
const needed = ["listingFromSource", "openMarketplaceCreate", "editMarketplaceListing", "updateMarketplaceForm", "buildMarketplaceListing"];
let blankFormSource = "";
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration" && needed.includes(node.id.name)) draftFunctions.set(node.id.name, appSource.slice(...node.range));
  if (node.type === "VariableDeclarator" && node.id.name === "BLANK_MARKETPLACE_FORM") blankFormSource = `const ${appSource.slice(...node.range)};`;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
  }
}
visit(ast);
assert.ok(blankFormSource);
for (const name of needed) assert.ok(draftFunctions.has(name), `Actual handler ${name} must be tested`);
const clone = (value) => JSON.parse(JSON.stringify(value));
let locationChecks = 0;
function draftHarness(privateLocation) {
  const ctx = vm.createContext({
    locationSettings: Object.freeze({ manualLocation: privateLocation, trackingEnabled: true }),
    catalogProducts: [], getTideTradrMarketInfo: () => ({}), catalogTitle: (product) => product.name,
    catalogImage: (product) => product?.imageUrl || "", marketplaceForm: {},
    currentUserProfile: { userId: "synthetic-owner" }, currentPublicUsername: () => "synthetic-collector", publicProfileLabel: () => "Synthetic collector",
    normalizeListingStatus: (status) => status, makeId: () => "synthetic-new-listing",
    getMarketplaceListingQualityReport: () => ({ score: 100, warnings: [], blockers: [], labels: [] }),
    setMarketplaceSourcePicker() {}, setListingReviewOpen() {}, setSelectedListingId() {}, openFlowModal() {}, setVaultToast() {},
  });
  ctx.setMarketplaceForm = (next) => { ctx.marketplaceForm = typeof next === "function" ? next(ctx.marketplaceForm) : next; };
  vm.runInContext(`${blankFormSource}\n${[...draftFunctions.values()].join("\n")}`, ctx);
  return ctx;
}
const sourceItem = Object.freeze({ id: "synthetic-item", name: "Synthetic item", quantity: 2, salePrice: 18, marketPrice: 21, imageUrl: "https://images.example.invalid/item.png", locationCity: "Private source location" });
for (const privateLocation of ["37.1234, -76.5678", "123 Private Lane, Synthetic City", "Private home city"]) {
  for (const sourceType of ["manual", "forge", "vault", "catalog"]) {
    const ctx = draftHarness(privateLocation);
    ctx.openMarketplaceCreate(sourceType, sourceItem);
    assert.equal(ctx.marketplaceForm.locationCity, "", `${sourceType} must not copy private settings or source location`);
    assert.equal(ctx.marketplaceForm.title, sourceItem.name);
    assert.equal(ctx.marketplaceForm.photoUrl, sourceItem.imageUrl);
    assert.equal(ctx.marketplaceForm.askingPrice, sourceItem.salePrice);
    assert.equal(ctx.locationSettings.manualLocation, privateLocation, "Private preferences remain unchanged");
    ctx.updateMarketplaceForm("locationCity", "Chosen public city");
    assert.equal(ctx.buildMarketplaceListing("Draft").locationCity, "Chosen public city", "Save uses the explicit public choice");
    locationChecks++;
  }
  for (const status of ["Draft", "Active"]) {
    const ctx = draftHarness(privateLocation);
    const existing = Object.freeze({ id: "existing-synthetic-listing", title: "Saved item", locationCity: "Previously chosen city", status, photos: [sourceItem.imageUrl], askingPrice: 45 });
    const before = JSON.stringify(existing);
    ctx.editMarketplaceListing(existing);
    assert.equal(ctx.marketplaceForm.locationCity, existing.locationCity, "Reopening an existing listing or draft retains its city");
    assert.equal(ctx.buildMarketplaceListing(status).locationCity, existing.locationCity, "Saving an edit retains its city");
    assert.equal(ctx.marketplaceForm.id, existing.id);
    assert.equal(ctx.marketplaceForm.askingPrice, existing.askingPrice);
    assert.deepEqual(clone(ctx.marketplaceForm.photos), existing.photos);
    assert.equal(JSON.stringify(existing), before, "Existing record bytes were not rewritten");
    locationChecks++;
  }
}

console.log(`PASS ${locationChecks} marketplace private-location and saved-edit regression scenarios; synthetic only.`);
