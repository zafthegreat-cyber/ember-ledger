import test from "node:test";
import assert from "node:assert/strict";
import { hasRecordedAmount, savedListingPrice } from "../src/features/flipScout/savedListingPresentation.mjs";

test("missing and malformed saved amounts are distinct from an explicit zero", () => {
  for (const value of ["", "  ", null, undefined, "unknown", Infinity, false]) assert.equal(hasRecordedAmount(value), false);
  for (const value of [0, "0", "0.00", 12.95, "12.95"]) assert.equal(hasRecordedAmount(value), true);
});
test("a recorded zero bid is retained; absent bids use the asking price", () => {
  assert.deepEqual(savedListingPrice({currentBid:0,askingPrice:45}), {label:"Saved bid",value:0});
  assert.deepEqual(savedListingPrice({currentBid:"",askingPrice:45}), {label:"Saved price",value:45});
});
