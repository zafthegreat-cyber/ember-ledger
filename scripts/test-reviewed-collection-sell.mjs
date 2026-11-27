import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  OWNED_ITEM_PURPOSES,
  changeOwnedItemPurpose,
} from "../src/features/ownedItems/ownedItemPurpose.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => fs.readFileSync(join(root, path), "utf8");

test("Collection to Sell asks for explicit confirmation before changing the original record", () => {
  const source = read("src/pages/EverydayWorkspaces.jsx");
  const from = source.indexOf("  const changePurpose = async (item, nextPurpose) => {");
  const to = source.indexOf("  const editCollectionRecord =", from);
  assert.ok(from > 0 && to > from, "the actual Collection purpose handler must exist");
  const handler = source.slice(from, to);
  const review = handler.indexOf("await confirmSell(");
  const decline = handler.indexOf("if (!approved) return;");
  const persistence = handler.indexOf('saveRecord("inventory"');
  const legacy = handler.indexOf("onChangePurpose(item, nextPurpose)");
  assert.ok(review >= 0, "the transition must open a review dialog");
  assert.ok(decline > review, "Cancel must exit the handler before a write");
  assert.ok(persistence > decline, "repository writes must happen only after approval");
  assert.ok(legacy > decline, "legacy updates must also happen only after approval");
  assert.match(handler, /nextPurpose === OWNED_ITEM_PURPOSES\.FOR_RESALE/);
  assert.match(handler, /inferOwnedItemPurpose\(item\) !== OWNED_ITEM_PURPOSES\.FOR_RESALE/);
  assert.match(handler, /Nothing is listed or sold automatically/);
  assert.match(source, /\{confirmation\}\{sellConfirmation\}<CollectionItemDetail/);
});

test("the confirmation remains cancel-first and uses non-destructive styling for a Sell handoff", () => {
  const dialog = read("src/components/ConfirmRecordAction.jsx");
  const source = read("src/pages/EverydayWorkspaces.jsx");
  assert.match(dialog, /onClick=\{onCancel\}>Cancel<\/button>/);
  assert.match(dialog, /tone='danger'/);
  assert.match(dialog, /tone === "primary" \? "primary" : "danger"/);
  assert.match(source, /confirmLabel: "Move to Sell",\s*tone: "primary"/);
  assert.match(dialog, /role="alertdialog"/);
});

test("reviewed transition preserves record identity, actual acquisition cost, quantity and condition", () => {
  const original = Object.freeze({
    id: "sample-owned-card",
    name: "Sample collector card",
    catalogProductId: "known-printing-123",
    quantity: 2,
    condition: "Near mint",
    allocatedItemCost: 17.4,
    purchaseDate: "2026-10-01",
    storageLocation: "Binder 3",
    marketPrice: 55.25,
    ownedItemPurpose: OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION,
  });
  const before = JSON.stringify(original);
  const moved = changeOwnedItemPurpose(original, OWNED_ITEM_PURPOSES.FOR_RESALE, {
    at: "2026-11-26T12:00:00.000Z",
    changedBy: "owner",
    reason: "Sell This Item from Collection",
  });
  assert.notStrictEqual(moved, original);
  assert.equal(JSON.stringify(original), before, "original object must remain untouched");
  for (const field of ["id", "name", "catalogProductId", "quantity", "condition", "allocatedItemCost", "purchaseDate", "storageLocation", "marketPrice"]) {
    assert.equal(moved[field], original[field], field + " must stay with the same owned record");
  }
  assert.equal(moved.ownedItemPurpose, OWNED_ITEM_PURPOSES.FOR_RESALE);
  assert.equal(moved.purposeHistory.length, 1);
  assert.equal(moved.purposeHistory[0].from, OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION);
  assert.equal(moved.purposeHistory[0].to, OWNED_ITEM_PURPOSES.FOR_RESALE);
  assert.equal(moved.purposeHistory[0].reason, "Sell This Item from Collection");
  assert.equal(moved.listedAt, undefined, "a purpose change must not invent a listing");
  assert.equal(moved.saleDate, undefined, "a purpose change must not invent a sale");
});

test("Find's matching catalog result still opens its existing review-first Collection flow", () => {
  const market = read("src/pages/Market.jsx");
  assert.match(market, /openMarketProductAddFlow\(product, "market-result", \{ defaultDestination: "vault" \}\)/);
  assert.match(market, />Add to Collection<\/button>/);
  assert.doesNotMatch(market, />Add to Vault<\/button>/);
  assert.match(market, /label: "Collection", title: "Save item"/);
  // The old source/route ID is intentionally retained for data and routing compatibility.
  assert.match(market, /key: "vault", icon: "vault"/);
});
