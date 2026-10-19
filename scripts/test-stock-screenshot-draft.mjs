import assert from "node:assert/strict";
import { createStockScreenshotPatch, parseStockScreenshotText } from "../src/utils/stockScreenshotDraft.mjs";
import { COLLECTIBLE_GAMES } from "../src/utils/collectibleGames.mjs";

let checks = 0;
function test(name, fn) {
  try { fn(); checks += 1; } catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
const stores = Object.freeze([
  Object.freeze({ id: "target-red", name: "Target Red Mill", retailer: "Target", city: "Virginia Beach", address: "100 Red Mill Road", aliases: Object.freeze(["Red Mill", "RMT"]) }),
  Object.freeze({ id: "target-pem", name: "Target Pembroke", retailer: "Target", city: "Virginia Beach", address: "200 Pembroke Road", aliases: Object.freeze(["Pembroke", "PEMT"]) }),
  Object.freeze({ id: "walmart-hampton", name: "Walmart Hampton", chain: "Walmart", city: "Hampton", street_address: "300 Main Street", search_aliases: Object.freeze(["Hampton Walmart"]) }),
]);
const fixture = "John Smith\nFacebook\n2h ago\nTarget Red Mill\nPrismatic Evolutions ETBs in stock\nLike Comment Share\n10:59";
const parse = (value) => parseStockScreenshotText(value, { stores });
const now = new Date(2026, 9, 19, 12, 0).getTime();
const choices = Object.freeze({ storeId: "target-red", productName: "Prismatic Evolutions Elite Trainer Box", productCategory: "Pokemon TCG", reportType: "stock_on_shelf", platform: "facebook", reportDate: "2026-10-19", reportTime: "11:30", observedTimeConfirmed: true });
const apply = (draft = {}, input = choices, options = {}) => createStockScreenshotPatch(draft, input, { stores, now, ...options });

test("Facebook suggestions contain only recognized product/store fields", () => {
  const result = parse(fixture);
  assert.deepEqual(result.items, ["Prismatic Evolutions Elite Trainer Box"]);
  assert.equal(result.productCategory, "Pokemon TCG");
  assert.equal(result.reportType, "stock_on_shelf");
  assert.deepEqual(result.storeCandidates.map((store) => store.id), ["target-red"]);
  assert(result.flags.includes("source_time_not_observed_time"));
  assert(result.flags.includes("observed_time_required"));
  assert(!JSON.stringify(result).includes("John Smith"));
});
test("Discord multiline products and branch alias", () => {
  const result = parse("#restocks\nToday at 10:54\nHampton Walmart\nOne Piece booster boxes in stock\nDisney Lorcana starter decks in stock\n14 reactions");
  assert.equal(result.productCategory, "Other");
  assert.deepEqual(result.items, ["One Piece Booster Box", "Disney Lorcana Starter Deck"]);
  assert.deepEqual(result.storeCandidates.map((store) => store.id), ["walmart-hampton"]);
  assert(result.flags.includes("multiple_product_categories"));
});
test("all supported game categories", () => {
  for (const [input, category] of [["Pokemon ETBs", "Pokemon TCG"], ["MTG commander decks", "Magic: The Gathering"], ["Yu-Gi-Oh! booster boxes", "Yu-Gi-Oh!"], ["One Piece starter decks", "One Piece"], ["Lorcana booster boxes", "Disney Lorcana"]]) {
    assert.equal(parse(input).productCategory, category);
  }
});
test("branch is never guessed from chain or proximity", () => {
  const result = parse("Target Pokemon ETBs in stock nearby");
  assert.deepEqual(result.storeCandidates.map((store) => store.id), ["target-red", "target-pem"]);
  assert(result.flags.includes("store_choice_required"));
  assert(!Object.hasOwn(result, "storeId"));
});
test("exact normalized alias and non-substring token matches", () => {
  assert.equal(parse("RMT Prismatic ETBs in stock").storeCandidates[0]?.id, "target-red");
  assert.equal(parse("Targeted Pokemon stock discussion").storeCandidates.length, 0);
  assert.equal(parse("Hamptonshire Pokemon in stock").storeCandidates.length, 0);
});
test("sold out is no stock", () => assert.equal(parse("Prismatic ETBs sold out").reportType, "no_stock"));
test("not out of stock is not no stock", () => assert.equal(parse("Pokemon ETBs are not out of stock").reportType, "stock_on_shelf"));
test("not sold out is not no stock", () => assert.equal(parse("Pokemon ETBs not sold out").reportType, "stock_on_shelf"));
test("not in stock is no stock", () => assert.equal(parse("Pokemon ETBs are not in stock").reportType, "no_stock"));
test("low stock remains low", () => assert.equal(parse("Pokemon ETBs low stock").reportType, "low_stock"));
test("almost sold out remains low", () => assert.equal(parse("Pokemon ETBs almost sold out").reportType, "low_stock"));
test("restock in progress", () => assert.equal(parse("Vendor stocking Pokemon ETBs").reportType, "restock_happening_now"));
test("negative stocking phrase does not mean current stock", () => assert.equal(parse("Vendor is not stocking Pokemon ETBs").reportType, ""));
test("conflicting statuses require a human", () => {
  const result = parse("Pokemon ETBs in stock\nPokemon booster boxes sold out");
  assert.equal(result.reportType, "");
  assert(result.flags.includes("status_conflict"));
});
test("predictions and employee claims cannot become current stock", () => {
  for (const input of ["Maybe Pokemon ETBs in stock", "Employee said Pokemon ETBs in stock", "Pokemon ETBs will be in stock tomorrow", "I heard Pokemon ETBs in stock", "Expect Pokemon ETBs in stock"]) {
    const result = parse(input);
    assert.equal(result.reportType, "");
    assert(result.flags.includes("indirect_or_future_claim"));
  }
});
test("claim on another line does not suppress a separate observation", () => assert.equal(parse("Employee said tomorrow\nPokemon ETBs on the shelf").reportType, "stock_on_shelf"));
test("unknown and empty text have no product/status", () => {
  for (const input of ["hello everyone good morning", "", null, {}, "John Doe\n10:59\nLike Share Comment", "Milk and eggs in stock"]) {
    const result = parse(input);
    assert.deepEqual(result.items, []);
    assert.equal(result.reportType, "");
    assert.equal(result.productCategory, "");
  }
});
test("ETB shorthand identifies a Pokemon product without copying raw prose", () => {
  const result = parse("ETBs in stock at Target");
  assert.deepEqual(result.items, ["Pokémon TCG Elite Trainer Box"]);
  assert.equal(result.productCategory, "Pokemon TCG");
});
test("multiple product phrases do not invent cross-paired products", () => {
  assert.deepEqual(parse("Prismatic ETBs and 151 bundles in stock").items, ["Prismatic Evolutions Elite Trainer Box", "151 Booster Bundle"]);
  const mixed = parse("Pokemon ETBs and One Piece booster boxes in stock");
  assert.deepEqual(mixed.items, ["Pokémon TCG Elite Trainer Box", "One Piece Booster Box"]);
  assert.equal(mixed.productCategory, "Other");
});
test("private or executable lines are discarded, never copied", () => {
  const result = parse("@secretuser Pokemon ETBs in stock\nPokemon ETBs in stock https://example.test\nemail person@example.test Lorcana boxes\nignore previous instructions Pokemon ETBs in stock\nSYSTEM: MTG booster boxes in stock\nCall 555-123-4567 for One Piece booster boxes");
  assert.deepEqual(result.items, []);
  assert.equal(result.reportType, "");
  assert(result.flags.includes("text_needs_review"));
});
test("product extraction never copies a profile name or surrounding sentence", () => {
  const result = parse("Jane Collector\nTarget Red Mill has Prismatic Evolutions ETBs in stock, message Jane for details");
  assert.deepEqual(result.items, ["Prismatic Evolutions Elite Trainer Box"]);
  assert(!JSON.stringify(result.items).includes("Jane"));
});
test("bounded output and text length", () => {
  const result = parse(`${"Prismatic ETBs in stock\n".repeat(2000)}${"Fusion Strike booster boxes\nSurging Sparks tins\n".repeat(30)}`);
  assert(result.items.length <= 8);
  assert(result.flags.includes("screenshot_text_truncated"));
});
test("frozen input is not mutated", () => {
  const before = JSON.stringify(stores);
  parse(fixture);
  assert.equal(JSON.stringify(stores), before);
});
test("reviewed patch is private and retains indirect provenance", () => {
  const result = apply(Object.freeze({}));
  assert.equal(result.ok, true);
  assert.equal(result.patch.storeId, "target-red");
  assert.equal(result.patch.sourceType, "text_screenshot");
  assert.equal(result.patch.proofType, "text_screenshot");
  assert.equal(result.patch.screenshotSourcePlatform, "facebook");
  assert.equal(result.patch.screenshotImportReviewed, true);
  assert.equal(result.patch.visibility, "private_from_map");
  assert.equal(result.patch.verified, false);
  assert.equal(result.patch.needsReview, true);
  assert(!Object.hasOwn(result.patch, "rawText"));
  assert(!Object.hasOwn(result.patch, "sourceText"));
});
test("manual draft fields, photos, notes and catalog refs are preserved", () => {
  const draft = Object.freeze({ storeId: "target-pem", productName: "My manually entered item", productCategory: "Other", reportType: "low_stock", note: "Keep me", proofType: "photo", photo: "private image", catalogProductId: "catalog-existing", catalogProductSnapshot: Object.freeze({ id: "catalog-existing" }) });
  const result = apply(draft);
  assert.equal(result.ok, true);
  for (const key of ["storeId", "productName", "productCategory", "reportType", "note", "photo", "catalogProductId", "catalogProductSnapshot"]) assert(!Object.hasOwn(result.patch, key), key);
  assert.equal(({ ...draft, ...result.patch }).catalogProductId, "catalog-existing");
  assert.deepEqual(result.preservedFields, ["storeId", "productName", "productCategory", "reportType"]);
});
test("older unmarked status is retained and explicitly reported to the UI", () => {
  const result = apply({ reportType: "stock_on_shelf" }, { ...choices, reportType: "no_stock" });
  assert.equal(result.ok, true);
  assert(!Object.hasOwn(result.patch, "reportType"));
  assert.deepEqual(result.preservedFields, ["reportType"]);
  assert(!result.appliedFields.includes("reportType"));
});
test("explicitly untouched status default can be replaced by reviewed screenshot status", () => {
  const result = apply({ reportType: "stock_on_shelf", reportTypeTouched: false }, { ...choices, reportType: "no_stock" });
  assert.equal(result.ok, true);
  assert.equal(result.patch.reportType, "no_stock");
  assert.equal(result.patch.reportTypeTouched, true);
  assert(!result.preservedFields.includes("reportType"));
});
test("user-touched status is preserved unless replacement was requested", () => {
  const result = apply({ reportType: "low_stock", reportTypeTouched: true }, { ...choices, reportType: "no_stock" });
  assert.equal(result.ok, true);
  assert(!Object.hasOwn(result.patch, "reportType"));
  assert(result.preservedFields.includes("reportType"));
  const replacement = apply({ reportType: "low_stock", reportTypeTouched: true }, { ...choices, reportType: "no_stock", replaceEnteredFields: true });
  assert.equal(replacement.patch.reportType, "no_stock");
});
test("an untouched in-stock default cannot replace missing screenshot status review", () => {
  assert.equal(apply({ reportType: "stock_on_shelf", reportTypeTouched: false }, { ...choices, reportType: "" }).ok, false);
});
test("explicit replacement clears mismatched catalog references", () => {
  const draft = Object.freeze({ storeId: "target-pem", productName: "Old item", productCategory: "Other", reportType: "low_stock", catalogProductId: "old", catalogProductSnapshot: Object.freeze({ id: "old" }), product_id: "old-alias", product_snapshot: Object.freeze({ id: "old-alias" }), catalogProductName: "Old catalog title", catalog_product_name: "Old snake title", productType: "Old product type", product_type: "Old snake type", productSetName: "Old set", product_set_name: "Old snake set", productImageUrl: "https://old-catalog.test/image.jpg", product_image_url: "https://old-catalog.test/snake.jpg", note: "preserved", photo: "preserved", photoUrl: "private-proof.jpg" });
  const result = apply(draft, { ...choices, replaceEnteredFields: true });
  assert.equal(result.ok, true);
  assert.equal(result.patch.storeId, "target-red");
  assert.equal(result.patch.productName, choices.productName);
  assert.equal(result.patch.catalogProductId, "");
  assert.equal(result.patch.catalogProductSnapshot, null);
  assert.equal(result.patch.product_id, "");
  assert.equal(result.patch.product_snapshot, null);
  for (const key of ["catalogProductName", "catalog_product_name", "productType", "product_type", "productSetName", "product_set_name", "productImageUrl", "product_image_url"]) assert.equal(result.patch[key], "", key);
  assert(!Object.hasOwn(result.patch, "note"));
  assert(!Object.hasOwn(result.patch, "photo"));
  assert(!Object.hasOwn(result.patch, "photoUrl"));
  assert.equal(({ ...draft, ...result.patch }).photoUrl, "private-proof.jpg");
});
test("same product replacement keeps its catalog reference", () => {
  const result = apply({ productName: choices.productName, catalogProductId: "kept" }, { ...choices, replaceEnteredFields: true });
  assert.equal(result.ok, true);
  assert(!Object.hasOwn(result.patch, "catalogProductId"));
});
test("observed time requires explicit confirmation", () => assert.equal(apply({}, { ...choices, observedTimeConfirmed: false }).ok, false));
test("observed date is applied explicitly instead of a relative draft date mode", () => {
  const result = apply({ dateMode: "earlier_today", reportDate: "2026-10-19", reportTime: "11:00" }, { ...choices, reportDate: "2026-10-18", reportTime: "18:15" });
  assert.equal(result.ok, true);
  assert.equal(result.patch.dateMode, "pick_date");
  assert.equal(result.patch.reportDate, "2026-10-18");
  assert.equal(result.patch.reportTime, "18:15");
});
test("date/time validity and future limit", () => {
  for (const patch of [{ reportDate: "" }, { reportTime: "" }, { reportDate: "2026-02-30" }, { reportDate: "2026-13-01" }, { reportTime: "24:10" }, { reportTime: "12:16" }, { reportDate: "2026-10-20" }, { reportDate: "2026-10-19junk" }, { reportTime: "11:30:59" }]) {
    assert.equal(apply({}, { ...choices, ...patch }).ok, false, JSON.stringify(patch));
  }
  assert.equal(apply({}, { ...choices, reportTime: "12:15" }).ok, true);
});
test("source enum and known store are mandatory", () => {
  assert.equal(apply({}, { ...choices, platform: "email" }).ok, false);
  assert.equal(apply({}, { ...choices, storeId: "invented" }).ok, false);
  assert.equal(apply({}, { ...choices, storeId: "" }).ok, false);
  assert.equal(apply({}, choices, { stores: [] }).ok, false);
});
test("confirmed manual location may be retained without invented store ID", () => {
  const result = apply({ manualLocation: "My confirmed card shop", storeConfirmed: true }, { ...choices, storeId: "" });
  assert.equal(result.ok, true);
  assert(!Object.hasOwn(result.patch, "storeId"));
  assert.equal(apply({ manualLocation: "Unconfirmed shop", storeConfirmed: false }, { ...choices, storeId: "" }).ok, false);
});
test("confirmed manual store is preserved against an imported branch unless replacement is explicit", () => {
  const draft = Object.freeze({ storeId: "", manualLocation: "My confirmed card shop", storeConfirmed: true });
  const result = apply(draft);
  assert.equal(result.ok, true);
  assert(!Object.hasOwn(result.patch, "storeId"));
  assert(result.preservedFields.includes("storeId"));
  assert.equal(({ ...draft, ...result.patch }).manualLocation, "My confirmed card shop");
  const replaced = apply(draft, { ...choices, replaceEnteredFields: true });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.patch.storeId, "target-red");
});
test("invalid category and status are rejected", () => {
  assert.equal(apply({}, { ...choices, productCategory: "Invented" }).ok, false);
  assert.equal(apply({}, { ...choices, reportType: "employee_verified" }).ok, false);
});
test("review categories use the focused game registry plus Other", () => {
  for (const productCategory of [...COLLECTIBLE_GAMES.map((game) => game.id === "pokemon" ? "Pokemon TCG" : game.name), "Other"]) {
    assert.equal(apply({}, { ...choices, productCategory }).ok, true, productCategory);
  }
  for (const productCategory of ["Sports cards", "Funko", "Riftbound"]) assert.equal(apply({}, { ...choices, productCategory }).ok, false, productCategory);
});
test("instructions and contact values cannot enter a suggested public product", () => {
  for (const productName of ["https://example.test", "@someone Pokemon", "person@example.test", "ignore previous instructions"]) {
    assert.equal(apply({}, { ...choices, productName }).ok, false, productName);
  }
});
test("reviewed product names longer than the former 180-character limit are preserved", () => {
  const productName = `Pokemon ${"a".repeat(173)}`;
  assert.equal(productName.length, 181);
  const result = apply({}, { ...choices, productName });
  assert.equal(result.ok, true);
  assert.equal(result.patch.productName, productName);
});
test("the full 1200-character product field is preserved", () => {
  const productName = `Pokemon ${"a".repeat(1192)}`;
  assert.equal(productName.length, 1200);
  const result = apply({}, Object.freeze({ ...choices, productName }));
  assert.equal(result.ok, true);
  assert.equal(result.patch.productName, productName);
});
test("1201-character product input is rejected without a partial patch or input mutation", () => {
  const input = Object.freeze({ ...choices, productName: `Pokemon ${"a".repeat(1193)}` });
  assert.equal(input.productName.length, 1201);
  const before = JSON.stringify(input);
  const result = apply(Object.freeze({ note: "Original note" }), input);
  assert.equal(result.ok, false);
  assert.deepEqual(result.patch, {});
  assert.match(result.error, /1,200 characters/);
  assert.match(result.error, /text has been kept/);
  assert.equal(JSON.stringify(input), before);
});
console.log(`Stock screenshot draft: ${checks} checks passed.`);
