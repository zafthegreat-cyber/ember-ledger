import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BUY_OFFER_AVAILABILITY, BUY_OFFER_DEMAND, BUY_OFFER_PRODUCT_TYPES,
  calculateBuyOffer, defaultBuyOffer,
} from "../src/features/flipScout/buyOffer.js";

const results = [];
function test(name, run) {
  try { run(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}
const quote = (overrides = {}) => calculateBuyOffer({
  ...defaultBuyOffer(), marketPrice: "100", productType: "single", availability: "limited", demand: "steady", ...overrides,
});

test("default policy is mode-specific, conservative about unknowns and returns fresh drafts", () => {
  const resale = defaultBuyOffer(); const collection = defaultBuyOffer("collection");
  assert.equal(resale.mode, "resale"); assert.equal(resale.basePercent, "70");
  assert.equal(collection.mode, "collection"); assert.equal(collection.basePercent, "85");
  assert.equal(resale.availability, "unknown"); assert.equal(resale.demand, "unknown");
  assert.equal(resale.marketPrice, ""); resale.basePercent = "99"; assert.equal(defaultBuyOffer().basePercent, "70");
});
test("a $100 neutral product has a $66.50 opening, $70 target and $75 maximum", () => {
  const result = quote(); assert.equal(result.valid, true);
  assert.equal(result.openingMinor, 6650); assert.equal(result.targetMinor, 7000); assert.equal(result.maximumMinor, 7500);
  assert.equal(result.marketPercentBps, 7000); assert.equal(result.adjustedPercent, 70);
  assert.equal(result.projectedProfitMinor, 3000); assert.equal(result.currency, "USD");
  assert.equal(result.askingPercentBps, null); assert.equal(result.askingMinor, null);
});
test("every product adjustment changes the offer by its documented percentage points", () => {
  const expected = { sealed: 75, single: 70, graded: 65, lot: 55, supplies: 60 };
  assert.equal(BUY_OFFER_PRODUCT_TYPES.length, 5);
  for (const { value } of BUY_OFFER_PRODUCT_TYPES) {
    const result = quote({ productType: value }); assert.equal(result.adjustedPercent, expected[value]);
    assert.equal(result.targetMinor, expected[value] * 100);
  }
});
test("every availability adjustment is applied and retail requires eligible MSRP", () => {
  const expected = { retail: 70, plentiful: 70, limited: 75, scarce: 78, unknown: 70 };
  assert.equal(BUY_OFFER_AVAILABILITY.length, 5);
  for (const { value } of BUY_OFFER_AVAILABILITY) {
    const result = quote({ productType: "sealed", msrp: "120", availability: value });
    assert.equal(result.valid, true); assert.equal(result.adjustedPercent, expected[value]);
  }
});
test("every demand adjustment is applied without treating user labels as observed evidence", () => {
  const expected = { low: 60, steady: 70, high: 75, unknown: 65 };
  assert.equal(BUY_OFFER_DEMAND.length, 4);
  for (const { value } of BUY_OFFER_DEMAND) assert.equal(quote({ demand: value }).adjustedPercent, expected[value]);
  const result = quote({ demand: "unknown", availability: "unknown" });
  assert.equal(result.adjustedPercent, 60); assert.equal(result.warnings.length, 4);
  assert.match(result.warnings[0], /assumptions.*not verified/);
  assert.ok(result.warnings.some((warning) => /Availability is unknown/.test(warning)));
  assert.ok(result.warnings.some((warning) => /Demand is unknown/.test(warning)));
  assert.ok(result.warnings.some((warning) => /No fee or cost allowance is entered/.test(warning)));
});
test("exact cents round offers down and fractional fees up", () => {
  const result = quote({ marketPrice: "19.99", basePercent: "70.25", sellingFeePercent: "12.35" });
  assert.equal(result.targetMinor, 1404); assert.equal(result.openingMinor, 1333); assert.equal(result.maximumMinor, 1504);
  assert.equal(result.projectedProfitMinor, 348); // 1999 - 1404 - ceil(246.8765)
  assert.equal(result.marketPercentBps, 7023); assert.equal(result.adjustedPercent, 70.25);
});
test("retail reference is the lower of market and MSRP, only for sealed and supplies", () => {
  for (const productType of ["sealed", "supplies"]) {
    const lowMsrp = quote({ productType, availability: "retail", msrp: "60" });
    assert.equal(lowMsrp.referenceMinor, 6000); assert.equal(lowMsrp.msrpMinor, 6000);
    const highMsrp = quote({ productType, availability: "retail", msrp: "140" }); assert.equal(highMsrp.referenceMinor, 10000);
    for (const availability of ["plentiful", "limited", "scarce", "unknown"]) {
      const contextOnly = quote({ productType, availability, msrp: "60" });
      assert.equal(contextOnly.referenceMinor, 10000); assert.ok(contextOnly.warnings.some((warning) => /context only/.test(warning)));
    }
  }
});
test("retail choices reject missing or invalid MSRP and card/lot misuse", () => {
  for (const msrp of ["", "0", "-1", "NaN", "1e3", "100.001"]) {
    const result = quote({ productType: "sealed", availability: "retail", msrp });
    assert.equal(result.valid, false); assert.ok(result.errors.msrp);
  }
  for (const productType of ["single", "graded", "lot"]) {
    const result = quote({ productType, availability: "retail", msrp: "50" });
    assert.equal(result.valid, false); assert.ok(result.errors.availability);
  }
});
test("hidden MSRP drafts on cards and lots do not affect calculations", () => {
  for (const productType of ["single", "graded", "lot"]) {
    const clean = quote({ productType });
    for (const msrp of ["-10", "NaN", "1e30", { unexpected: "value" }]) {
      const result = quote({ productType, msrp }); assert.deepEqual(result, clean); assert.equal(result.msrpMinor, null);
    }
  }
});
test("asking price is an upper cap, not evidence that raises a fair offer", () => {
  const low = quote({ askingPrice: "60" }); assert.equal(low.maximumMinor, 6000); assert.equal(low.targetMinor, 6000);
  assert.equal(low.openingMinor, 5700); assert.equal(low.askingPercentBps, 10000);
  const high = quote({ askingPrice: "200" }); assert.equal(high.targetMinor, 7000); assert.equal(high.maximumMinor, 7500); assert.equal(high.askingPercentBps, 3500);
});
test("resale ceiling reserves fees, selling costs, acquisition costs and minimum profit", () => {
  const result = quote({ sellingFeePercent: "12", sellingCosts: "5", acquisitionCosts: "8", minimumProfit: "20" });
  assert.equal(result.maximumMinor, 5500); assert.equal(result.targetMinor, 5500); assert.equal(result.openingMinor, 5225);
  assert.equal(result.projectedProfitMinor, 2000); assert.equal(result.limits[0].amountMinor, 5500);
  assert.ok(!result.warnings.some((warning) => /No fee or cost allowance/.test(warning)));
});
test("a zero or negative spending ceiling produces no positive offer", () => {
  for (const minimumProfit of ["100", "101", "2000"]) {
    const result = quote({ minimumProfit }); assert.equal(result.valid, true); assert.equal(result.blocked, true);
    assert.equal(result.targetMinor, 0); assert.equal(result.openingMinor, 0); assert.equal(result.maximumMinor, 0);
    assert.match(result.blockedReason, /No positive target offer/);
  }
  const fullFee = quote({ sellingFeePercent: "100" }); assert.equal(fullFee.maximumMinor, 0);
});
test("collection uses acquisition costs while ignoring retained invalid resale-only fields", () => {
  const values = { ...defaultBuyOffer("collection"), marketPrice: "100", productType: "single", availability: "limited", demand: "steady", acquisitionCosts: "20" };
  const baseline = calculateBuyOffer(values); assert.equal(baseline.targetMinor, 8000); assert.equal(baseline.maximumMinor, 8000);
  assert.equal(baseline.projectedProfitMinor, null);
  assert.ok(!baseline.warnings.some((warning) => /No fee or cost allowance/.test(warning)));
  const ignored = calculateBuyOffer({ ...values, sellingFeePercent: "NaN", sellingCosts: "-12", minimumProfit: { malformed: true } });
  assert.deepEqual(ignored, baseline);
  assert.equal(calculateBuyOffer({ ...values, mode: "resale", sellingFeePercent: "NaN" }).valid, false);
});
test("collection retail reference also respects acquisition costs and the MSRP cap", () => {
  const result = calculateBuyOffer({ ...defaultBuyOffer("collection"), marketPrice: "100", msrp: "60", availability: "retail", demand: "steady", acquisitionCosts: "20" });
  assert.equal(result.referenceMinor, 6000); assert.equal(result.maximumMinor, 4000); assert.equal(result.targetMinor, 4000);
});
test("adjusted policy percentage stays within mode bounds and documents clamping", () => {
  const low = quote({ productType: "lot", basePercent: "0", availability: "unknown", demand: "low" });
  assert.equal(low.adjustedPercent, 10); assert.ok(low.warnings.some((warning) => /limited to/.test(warning)));
  const resale = quote({ productType: "sealed", basePercent: "100", availability: "scarce", demand: "high" });
  assert.equal(resale.adjustedPercent, 95); assert.equal(resale.maximumMinor, 10000);
  const collection = quote({ mode: "collection", productType: "sealed", basePercent: "100", availability: "scarce", demand: "high" });
  assert.equal(collection.adjustedPercent, 100); assert.equal(collection.targetMinor, 10000); assert.equal(collection.maximumMinor, 10000);
});
test("all entered money rejects negative, exponent, nonfinite, excess precision and unsafe forms", () => {
  const invalid = ["-1", "+1", "1e3", "NaN", "Infinity", "0.001", "1,000", "$10", "01", "90071992547409.92", "9".repeat(5000), 100, NaN, Infinity, {}, []];
  for (const field of ["marketPrice", "askingPrice", "acquisitionCosts", "sellingCosts", "minimumProfit", "msrp"]) {
    for (const value of invalid) {
      const result = quote({ productType: "sealed", [field]: value });
      assert.equal(result.valid, false, `${field}: ${String(value).slice(0, 40)}`); assert.ok(result.errors[field]);
    }
  }
});
test("percentages reject out-of-range or malformed values independently", () => {
  for (const field of ["basePercent", "sellingFeePercent"]) {
    for (const value of ["-1", "100.01", "101", "1e2", "NaN", "Infinity", "5.555", "", 70, {}, []]) {
      const result = quote({ [field]: value }); assert.equal(result.valid, false); assert.ok(result.errors[field]);
    }
  }
  assert.equal(quote({ basePercent: "0", sellingFeePercent: "0" }).valid, true);
});
test("missing required values and unknown categories yield field-specific errors", () => {
  assert.equal(calculateBuyOffer().valid, false); assert.ok(calculateBuyOffer().errors.marketPrice);
  for (const value of ["", "0", "0.00", null, undefined]) assert.ok(quote({ marketPrice: value }).errors.marketPrice);
  for (const field of ["mode", "productType", "availability", "demand"]) assert.ok(quote({ [field]: "unsupported" }).errors[field]);
  for (const value of [null, [], "data", 4]) assert.equal(calculateBuyOffer(value).valid, false);
});
test("maximum safe cents are parsed exactly, while unsafe aggregate costs are rejected", () => {
  const result = quote({ marketPrice: "90071992547409.91", basePercent: "100" }); assert.equal(result.valid, true);
  assert.equal(result.marketMinor, Number.MAX_SAFE_INTEGER); assert.equal(result.maximumMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(result.targetMinor, Number(BigInt(Number.MAX_SAFE_INTEGER) * 9500n / 10000n));
  const unsafe = quote({ acquisitionCosts: "90071992547409.91", sellingCosts: "0.01" });
  assert.equal(unsafe.valid, false); assert.ok(unsafe.errors.acquisitionCosts);
});
test("one-cent values never invent fractional cents or a positive rounded-up offer", () => {
  const result = quote({ marketPrice: "0.01", sellingFeePercent: "0.01" });
  assert.equal(result.valid, true); assert.equal(result.targetMinor, 0); assert.equal(result.maximumMinor, 0); assert.equal(result.projectedProfitMinor, 0);
});
test("raising any reserve or fee cannot raise target or maximum; a lower asking cap cannot raise either", () => {
  for (const field of ["sellingCosts", "acquisitionCosts", "minimumProfit", "sellingFeePercent"]) {
    let prior = quote();
    for (let value = 0; value <= 100; value += 2) {
      const next = quote({ [field]: String(value) }); assert.equal(next.valid, true);
      assert.ok(next.targetMinor <= prior.targetMinor); assert.ok(next.maximumMinor <= prior.maximumMinor); prior = next;
    }
  }
  let prior = quote();
  for (let value = 100; value >= 1; value--) {
    const next = quote({ askingPrice: String(value) }); assert.ok(next.targetMinor <= prior.targetMinor); assert.ok(next.maximumMinor <= prior.maximumMinor); prior = next;
  }
});
test("offers conserve limits across both modes, every factor and representative cent values", () => {
  for (const mode of ["resale", "collection"]) for (const { value: productType } of BUY_OFFER_PRODUCT_TYPES) {
    for (const { value: availability } of BUY_OFFER_AVAILABILITY) for (const { value: demand } of BUY_OFFER_DEMAND) {
      if (availability === "retail" && !["sealed", "supplies"].includes(productType)) continue;
      for (const marketPrice of ["0.01", "0.99", "19.99", "137.73", "90071992547409.91"]) {
        const result = quote({ mode, productType, availability, demand, marketPrice, msrp: "49.99", askingPrice: "100", acquisitionCosts: "0.13", sellingFeePercent: "12.35", sellingCosts: "0.17", minimumProfit: "0.29" });
        assert.equal(result.valid, true); assert.ok(result.openingMinor <= result.targetMinor); assert.ok(result.targetMinor <= result.maximumMinor);
        assert.ok(result.maximumMinor <= result.referenceMinor); assert.ok(result.maximumMinor <= result.askingMinor);
        for (const limit of result.limits) assert.ok(result.maximumMinor <= limit.amountMinor);
        for (const field of ["openingMinor", "targetMinor", "maximumMinor", "marketMinor", "referenceMinor", "marketPercentBps", "askingPercentBps"]) {
          assert.ok(Number.isSafeInteger(result[field]), field); assert.ok(result[field] >= 0, field);
        }
        if (result.projectedProfitMinor !== null) assert.ok(Number.isSafeInteger(result.projectedProfitMinor));
        assert.ok(result.marketPercentBps <= 10000); assert.ok(result.askingPercentBps <= 10000);
      }
    }
  }
});
test("calculation never mutates the input draft or retains it in the result", () => {
  const values = Object.freeze({ ...defaultBuyOffer(), title: "Synthetic specimen", marketPrice: "100" });
  const before = JSON.stringify(values); const result = calculateBuyOffer(values);
  assert.equal(JSON.stringify(values), before); assert.equal(result.valid, true); assert.ok(!Object.values(result).includes(values));
  assert.equal(JSON.stringify(result).includes("Synthetic specimen"), false);
});

const output = process.env.QA_OUTPUT_DIR || "artifacts/qa/buy-offer/domain";
fs.mkdirSync(output, { recursive: true });
const passed = results.filter((result) => result.passed).length;
fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed, failed: results.length - passed, total: results.length, results }, null, 2));
for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
console.log(`Buy offer: ${passed}/${results.length} checks passed.`);
if (passed !== results.length) process.exitCode = 1;
