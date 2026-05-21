import assert from "node:assert/strict";
import {
  MIN_SCOUT_POINTS_FOR_GUESS,
  applyDropRadarReset,
  buildDropRadarPredictions,
  canSubmitScoutGuess,
  dropRadarRecordKind,
  dropRadarRecordLabel,
  isDropRadarConfirmedTrainingEntry,
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
    { storeId: "redmill-target", date: "2026-05-12", time: "15:24", productCategory: "ETBs", sourceType: "manual_training_restock", confidence: "confirmed", shouldTrainPredictions: true },
  ],
});
assert.equal(weakPrediction[0].confidenceKey, "needs-data");
assert.match(weakPrediction[0].dataNeededMessage, /needs 1 more confirmed restock/i);

const strongPrediction = buildDropRadarPredictions({
  stores,
  trainingRestocks: [
    { storeId: "redmill-target", date: "2026-05-05", time: "15:10", productCategory: "ETBs", sourceType: "manual_training_restock", confidence: "confirmed", shouldTrainPredictions: true },
    { storeId: "redmill-target", date: "2026-05-12", time: "15:24", productCategory: "ETBs", sourceType: "manual_training_restock", confidence: "confirmed", shouldTrainPredictions: true },
    { storeId: "redmill-target", date: "2026-05-19", time: "15:40", productCategory: "ETBs", sourceType: "manual_training_restock", confidence: "confirmed", shouldTrainPredictions: true },
    { storeId: "redmill-target", date: "2026-05-26", time: "15:05", productCategory: "ETBs", sourceType: "manual_training_restock", confidence: "confirmed", shouldTrainPredictions: true },
    { storeId: "redmill-target", date: "2026-06-02", time: "15:20", productCategory: "ETBs", sourceType: "manual_training_restock", confidence: "confirmed", shouldTrainPredictions: true },
  ],
});
assert.equal(strongPrediction[0].patternStrength, "strong");
assert.equal(strongPrediction[0].confidenceKey, "high");
assert.match(strongPrediction[0].nextLikelyWindow, /Tuesday|3 PM - 6 PM/);
assert.equal(strongPrediction[0].recordKind, "predicted_window");
assert.match(strongPrediction[0].reason, /Based on 5 confirmed restocks/);

const mixedPrediction = buildDropRadarPredictions({
  stores,
  reports: [
    { id: "report-confirmed-1", storeId: "redmill-target", reportDate: "2026-05-05", reportTime: "15:10", stockStatus: "in_stock", sourceType: "user_report", confidence: "possible", productName: "ETB" },
    { id: "guess-1", recordType: "guess", storeId: "redmill-target", date: "2026-05-06", time: "15:30", sourceType: "manual_prediction", confidence: "guess", stockStatus: "unknown", productCategory: "Guess" },
    { id: "rejected-1", storeId: "redmill-target", reportDate: "2026-05-07", reportTime: "15:00", stockStatus: "in_stock", sourceType: "user_report", confidence: "likely", status: "rejected" },
    { id: "placeholder-forecast-1", storeId: "redmill-target", date: "2026-05-08", time: "15:00", sourceType: "demo_forecast", confidence: "confirmed", stockStatus: "in_stock" },
  ],
  trainingRestocks: [
    { storeId: "redmill-target", date: "2026-05-12", time: "15:24", productCategory: "ETBs", sourceType: "manual_training_restock", confidence: "confirmed", shouldTrainPredictions: true },
  ],
});
assert.equal(mixedPrediction.length, 1);
assert.equal(mixedPrediction[0].trainingCount, 2);
assert.equal(mixedPrediction[0].entries.some((entry) => entry.recordType === "guess"), false);
assert.equal(isDropRadarConfirmedTrainingEntry({ recordType: "guess", sourceType: "manual_prediction", confidence: "guess", storeId: "redmill-target", date: "2026-05-12" }), false);
assert.equal(dropRadarRecordKind({ recordType: "guess", sourceType: "manual_prediction" }), "community_guess");
assert.equal(dropRadarRecordLabel({ recordType: "guess", sourceType: "manual_prediction" }), "Community Guess");
assert.equal(dropRadarRecordKind(strongPrediction[0]), "predicted_window");

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
assert.equal(shouldUseDropRadarSeed({}), false);
assert.equal(shouldUseDropRadarSeed({ useDemoDropRadarSeed: true }), true);
assert.equal(canSubmitScoutGuess({ rewardPoints: MIN_SCOUT_POINTS_FOR_GUESS - 1 }), false);
assert.equal(canSubmitScoutGuess({ rewardPoints: MIN_SCOUT_POINTS_FOR_GUESS }), true);
assert.equal(canSubmitScoutGuess({ rewardPoints: 0 }, { admin: true }), true);

console.log("Drop Radar utility tests passed.");
