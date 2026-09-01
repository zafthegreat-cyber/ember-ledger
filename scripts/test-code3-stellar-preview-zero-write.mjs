import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BACKUP_SOURCE_REGISTRY,
  createVerifiedBackup,
} from "../src/features/backup/index.js";
import {
  BOT_OPS_STORAGE_KEY,
} from "../src/features/botOps/constants.js";
import {
  createBotOpsRepository,
  createEmptyBotOpsState,
} from "../src/features/botOps/repository.js";
import {
  createStellarTaskExportPreviewFromFile,
  previewStellarTaskExportText,
} from "../src/features/botOps/importPreview/index.js";
import { MIGRATION_SOURCE_REGISTRY } from "../src/features/persistence/migrationSourceRegistry.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function excludes(value, pattern, message) { assert.doesNotMatch(value, pattern, message); assertions += 1; }

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
    this.writes = 0;
    this.removes = 0;
    this.clears = 0;
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  removeItem(key) { this.removes += 1; this.values.delete(key); }
  clear() { this.clears += 1; this.values.clear(); }
  snapshot() { return JSON.stringify([...this.values.entries()].sort()); }
}

const NOW = "2026-08-31T12:00:00.000Z";
const botState = createEmptyBotOpsState(() => NOW);
const previewStorageKey = "code3.stellar-export-preview.test-only";
const rawSentinel = "raw-stellar-export-must-never-enter-backup";
const localStorage = new MemoryStorage({
  [BOT_OPS_STORAGE_KEY]: botState,
  [previewStorageKey]: { fileName: "private-owner-file.json", rawText: rawSentinel, tasks: [{ id: "temporary-preview" }] },
});
const sessionStorage = new MemoryStorage();
const repository = createBotOpsRepository(localStorage, { now: () => NOW });
const beforeStorage = localStorage.snapshot();
const beforeRepository = JSON.stringify(repository.load());
const beforeWrites = localStorage.writes;

const safeText = JSON.stringify({ tasks: [{ id: "task.synthetic.test", site: "Target", sku: "SKU.TEST", quantity: 1 }] });
const directPreview = previewStellarTaskExportText({ fileName: "C:\\private\\owner-selected.json", mimeType: "application/json", text: safeText });
equal(directPreview.safeToPreview, true);
equal(directPreview.file.displayName, "owner-selected.json");
equal(localStorage.snapshot(), beforeStorage, "preview parsing must not alter localStorage");
equal(JSON.stringify(repository.load()), beforeRepository, "preview parsing must not alter Bot Operations records");
equal(localStorage.writes, beforeWrites, "preview parsing must perform zero Bot/local writes");
equal(sessionStorage.writes, 0);
equal(sessionStorage.removes, 0);
equal(sessionStorage.clears, 0);

const globals = {
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  indexedDB: globalThis.indexedDB,
  fetch: globalThis.fetch,
  XMLHttpRequest: globalThis.XMLHttpRequest,
  WebSocket: globalThis.WebSocket,
  EventSource: globalThis.EventSource,
};
const throwingSurface = Object.freeze({
  getItem() { throw new Error("storage read prohibited"); },
  setItem() { throw new Error("storage write prohibited"); },
  removeItem() { throw new Error("storage write prohibited"); },
  clear() { throw new Error("storage write prohibited"); },
});
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: throwingSurface });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: throwingSurface });
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: Object.freeze({ open() { throw new Error("IndexedDB prohibited"); }, deleteDatabase() { throw new Error("IndexedDB prohibited"); } }) });
Object.defineProperty(globalThis, "fetch", { configurable: true, value: () => { throw new Error("network prohibited"); } });
Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: class { constructor() { throw new Error("network prohibited"); } } });
Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: class { constructor() { throw new Error("network prohibited"); } } });
Object.defineProperty(globalThis, "EventSource", { configurable: true, value: class { constructor() { throw new Error("network prohibited"); } } });
try {
  const isolated = previewStellarTaskExportText({ fileName: "isolated.json", mimeType: "application/json", text: safeText });
  equal(isolated.safeToPreview, true, "core preview must work with every storage/network surface set to throw");
  const fakeFile = { name: "isolated.json", type: "application/json", size: safeText.length, async text() { return safeText; } };
  const fromFile = await createStellarTaskExportPreviewFromFile(fakeFile);
  equal(fromFile.summary.safeRecognizedTaskCount, 1, "explicit owner-selected file reading needs no storage or network");
} finally {
  for (const [key, value] of Object.entries(globals)) {
    if (value === undefined) delete globalThis[key];
    else Object.defineProperty(globalThis, key, { configurable: true, value });
  }
}

const sourceFiles = [
  "src/features/botOps/importPreview/constants.js",
  "src/features/botOps/importPreview/securityScanner.js",
  "src/features/botOps/importPreview/formatRecognizer.js",
  "src/features/botOps/importPreview/normalizer.js",
  "src/features/botOps/importPreview/preview.js",
  "src/features/botOps/importPreview/StellarTaskExportPreview.jsx",
];
for (const sourceFile of sourceFiles) {
  const source = readFileSync(new URL(`../${sourceFile}`, import.meta.url), "utf8");
  excludes(source, /from\s+["'][^"']*(?:repository|persistence|service|backup|migration)/i, `${sourceFile} must not import a persistence or migration surface`);
  excludes(source, /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|EventSource)\b/, `${sourceFile} must not reference browser persistence or network APIs`);
  excludes(source, /\b(?:createBotOpsService|createBotOpsRepository|createBotOpsPersistence|normalizeBotTask|normalizeBotAttempt|normalizeCheckoutEvidence)\b/, `${sourceFile} must not reach canonical Bot record writers/normalizers`);
  excludes(source, /\b(?:console\.(?:debug|error|info|log|warn)|logger\.|analytics\.|telemetry\.)/, `${sourceFile} must not log raw or normalized preview input`);
}

equal(BACKUP_SOURCE_REGISTRY.length, 25, "Phase 2D-B2 preview remains source-free while Phase 2C-A adds its separately reviewed Purchase/Receiving source");
equal(MIGRATION_SOURCE_REGISTRY.length, BACKUP_SOURCE_REGISTRY.length, "Phase 2D-B2 must not add a migration source");
equal(BACKUP_SOURCE_REGISTRY.some((source) => /stellar.*preview|preview.*stellar/i.test(`${source.sourceId} ${source.storageKey || ""}`)), false);
equal(MIGRATION_SOURCE_REGISTRY.some((source) => /stellar.*preview|preview.*stellar/i.test(`${source.sourceId} ${JSON.stringify(source.paths || [])}`)), false);

const backup = await createVerifiedBackup({ localStorage, sessionStorage, createdAt: NOW });
equal(backup.verified, true);
const backupText = JSON.stringify(backup.backup);
excludes(backupText, new RegExp(rawSentinel), "raw preview data must be outside Backup Format v1");
excludes(backupText, /private-owner-file\.json|temporary-preview|code3\.stellar-export-preview/i, "preview filename, model, and storage key must be excluded from backup");
equal(localStorage.snapshot(), beforeStorage, "backup inspection must not transform or consume preview state");

const serialized = JSON.stringify(directPreview);
excludes(serialized, /C:\\\\private|raw-stellar-export/i, "preview output must not retain a path or raw file content");
equal(Object.hasOwn(directPreview, "sourceFingerprint"), false);
equal(Object.hasOwn(directPreview, "rawFileHash"), false);
equal(directPreview.contract.persistenceAllowed, false);
equal(directPreview.contract.backupAllowed, false);
equal(directPreview.contract.migrationAllowed, false);

console.log(`Code 3 Stellar export preview zero-write contract: ${assertions} assertions passed.`);
