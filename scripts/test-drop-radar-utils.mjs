import assert from "node:assert/strict";
import {
  applyDropRadarReset,
  buildDropRadarPredictions,
  parseDropRadarShorthand,
  shouldUseDropRadarSeed,
} from "../src/utils/dropRadarUtils.mjs";

const stores = [
  { id: "redmill-target", nickname: "Redmill Target", name: "Target Red Mill", retailer: "Target", chain: "Target", city: "Virginia Beach" },
  { id: "greenbrier-bn", nickname: "Greenbrier Barnes & Noble", name: "Barnes & Noble Greenbrier", retailer: "Barnes & Noble", chain: "Barnes & Noble", city: "Chesapeake" },
];

const parsed = parseDropRadarShorthand("RM T 5/12 15:24 Pokemon restock", stores, { year: 2026 });
assert.equal(parsed.ok, true);
assert.equal(parsed.storeName, "Redmill Target");
assert.equal(parsed.date, "2026-05-12");
assert.equal(parsed.time, "15:24");
assert.equal(parsed.productCategory, "Pokemon restock");

const parsedBarnes = parseDropRadarShorthand("GB B&N 4/23 12:00 stocked", stores, { year: 2026 });
assert.equal(parsedBarnes.ok, true);
assert.equal(parsedBarnes.storeName, "Greenbrier Barnes & Noble");
assert.equal(parsedBarnes.retailer, "Barnes & Noble");

const weakPrediction = buildDropRadarPredictions({
  stores,
  trainingRestocks: [
    { storeId: "redmill-target", date: "2026-05-12", time: "15:24", productCategory: "ETBs", shouldTrainPredictions: true },
  ],
});
assert.equal(weakPrediction[0].confidenceKey, "needs-data");
assert.match(weakPrediction[0].dataNeededMessage, /Needs 1 more confirmed restock/);

const strongPrediction = buildDropRadarPredictions({
  stores,
  trainingRestocks: [
    { storeId: "redmill-target", date: "2026-05-05", time: "15:10", productCategory: "ETBs", shouldTrainPredictions: true },
    { storeId: "redmill-target", date: "2026-05-12", time: "15:24", productCategory: "ETBs", shouldTrainPredictions: true },
    { storeId: "redmill-target", date: "2026-05-19", time: "15:40", productCategory: "ETBs", shouldTrainPredictions: true },
    { storeId: "redmill-target", date: "2026-05-26", time: "15:05", productCategory: "ETBs", shouldTrainPredictions: true },
    { storeId: "redmill-target", date: "2026-06-02", time: "15:20", productCategory: "ETBs", shouldTrainPredictions: true },
  ],
});
assert.equal(strongPrediction[0].patternStrength, "strong");
assert.equal(strongPrediction[0].confidenceKey, "high");
assert.match(strongPrediction[0].nextLikelyWindow, /Tuesday|3 PM - 6 PM/);

const reset = applyDropRadarReset({
  stores,
  reports: [{ id: "raw-report-1" }],
  restockIntel: [
    { id: "seed-intel-1", sourceType: "text_screenshot" },
    { id: "manual-1", sourceType: "manual_training_restock", shouldTrainPredictions: true },
    { id: "user-report-intel", sourceType: "user_report" },
  ],
  restockPatterns: [{ id: "pattern-1" }],
  manualRestockTraining: [{ id: "training-1" }],
  forecastWindows: [{ id: "forecast-1" }],
}, {
  historicalBackfill: true,
  manualTraining: true,
  generatedPredictions: true,
});
assert.equal(reset.reports.length, 1);
assert.equal(reset.stores.length, 2);
assert.equal(reset.manualRestockTraining.length, 0);
assert.deepEqual(reset.restockPatterns, []);
assert.equal(reset.restockIntel.length, 1);
assert.equal(reset.restockIntel[0].id, "user-report-intel");
assert.equal(shouldUseDropRadarSeed(reset), false);
assert.equal(reset.dropRadarBackups.length, 1);

console.log("Drop Radar utility tests passed.");
