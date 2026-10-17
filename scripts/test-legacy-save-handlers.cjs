const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const espree = require("espree");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "artifacts/qa/release-readiness/legacy-save-handlers");
const source = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const functions = new Map();
let notificationEffect;
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") functions.set(node.id.name, source.slice(...node.range));
  if (node.type === "VariableDeclarator" && node.id?.name === "updatePhase2Status") functions.set(node.id.name, `const ${source.slice(...node.range)};`);
  if (node.type === "CallExpression" && node.callee?.name === "useEffect" && node.arguments[0]?.range) {
    const body = source.slice(...node.arguments[0].range);
    if (body.includes("const preferences = phase2Data.notificationPreferences || {}")) notificationEffect = body;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
  }
}
visit(ast);
const ownedNames = ["logAiAssistEvent", "updateScoutAlertPreference", "persistScannerIntake", "persistCrossListingChannels"];
const names = [...ownedNames, "resolveAiAssistReview", "showAiSuggestion", "runPictureLookupSearch", "confirmScannerDestination", "saveMarketplaceListing", "updatePhase2Status", "toastTypeFromMessage", "normalizeToastPayload"];
const phaseKey = "et-tcg-phase2-data", scoutKey = "et-tcg-beta-scout";
const clone = (value) => JSON.parse(JSON.stringify(value));
const initial = {
  notificationPreferences: { priceDrop: { enabled: false }, budgetWarning: { enabled: true } },
  scannerIntakeSessions: [{ id: "prior-scan" }], aiAssistEvents: [{ id: "prior-ai" }],
  kidCommunityProjects: [{ id: "prior-project" }], kidCommunityProjectItems: [{ id: "prior-item", projectId: "prior-project" }],
  marketplaceListingChannels: [{ id: "prior-channel", sourceInventoryId: "other-item" }],
  receiptRecords: [{ id: "keep-receipt" }], customData: { preserve: [1, 2] },
};
const scoutInitial = { stores: [{ id: "Exact-Store-ID", name: "Synthetic store" }], reports: [{ id: "Exact-Report-ID", storeId: "Exact-Store-ID" }], alertSettings: { priceDrop: false, budgetWarning: true }, customData: { preserve: "Scout metadata" } };
const results = [];
async function check(label, run) { await run(); results.push(label); console.log(`PASS ${label}`); }

async function main() {
  const services = await import(pathToFileURL(path.join(root, "src/services/phase2Persistence.js")));
  const cleanup = await import(pathToFileURL(path.join(root, "src/utils/betaDataCleanup.js")));
  function harness(options = {}, replacements = {}) {
    const bytes = new Map([[phaseKey, JSON.stringify(initial)], [scoutKey, JSON.stringify(scoutInitial)]]);
    if (Object.hasOwn(options, "phaseRaw")) bytes.set(phaseKey, options.phaseRaw);
    if (Object.hasOwn(options, "scoutRaw")) bytes.set(scoutKey, options.scoutRaw);
    const faults = { read: new Set(options.read || []), write: new Set(options.write || []) };
    const writes = [], stateWrites = [], toasts = [], toastTypes = [], statuses = [], handoffs = [], scanMessages = [];
    let sequence = 0;
    const storage = {
      getItem(key) { if (faults.read.has(key)) throw new DOMException("Synthetic read denied", "SecurityError"); return bytes.get(key) ?? null; },
      setItem(key, value) { if (faults.write.has(key)) throw new DOMException("Synthetic quota", "QuotaExceededError"); bytes.set(key, value); writes.push({ key, value }); },
    };
    global.localStorage = storage;
    const ctx = vm.createContext({
      ...services, sanitizeScoutLocalData: cleanup.sanitizeScoutLocalData, safeReadBrowserJson: cleanup.safeReadBrowserJson, localStorage: storage, SCOUT_STORAGE_KEY: scoutKey,
      phase2Context: () => ({}), blockGuestSave: () => false, phase2Data: clone(initial), scoutSnapshot: clone(scoutInitial),
      scoutAlertPreferencePendingRef: { current: new Set() },
      makeId: (prefix) => `${prefix}-Synthetic-${++sequence}`,
      setVaultToast: (value) => { const payload = ctx.normalizeToastPayload(value); toasts.push(payload.title); toastTypes.push(payload.type); }, setPhase2SyncStatus: (value) => statuses.push(value),
      setScanMessage: (value) => scanMessages.push(value),
      scanReview: { scanId: "Exact-Scan-ID", scanType: "barcode", upc: "012345678905", rawValue: "Synthetic card", itemName: "Synthetic card", matchedCatalogItemId: "catalog-1", masterCatalogItemId: "master-1", matchConfidence: 97, possibleMatches: [{ item: { id: "catalog-1", name: "Synthetic card" }, confidencePercent: 97 }] },
      scanInput: "Synthetic card", scanDestination: "vault", scanMatches: ["retain"], showInventoryScanner: true,
      normalizeAddDestinationValue: (value) => value, guestPreviewActive: false,
      catalogProducts: [{ id: "catalog-1", name: "Synthetic card" }], catalogTitle: (product) => product.name,
      destinationDefaults: (value) => value,
      kidProjectForm: { name: "Synthetic pack plan", targetPackCount: 5, budget: 20, eventDate: "2026-09-20", notes: "Preserve draft" },
      kidBuilderItems: [{ id: "Exact-Kid-Item", quantity: 4 }, { quantity: 2 }], packItForwardCost: 15,
      buildCrossListingChannels: (listing) => [{ id: "Exact-Channel-ID", platform: "other", sourceInventoryId: listing.sourceItemId || listing.id, status: "draft" }],
      aiAssistReview: { featureArea: "synthetic", inputSummary: "Keep input", outputSummary: "Before", editableOutput: "Edited draft", confidenceScore: 88 },
      AI_REVIEW_DISCLAIMER: "Review this suggestion.", AI_FEATURE_AREAS: { PHOTO_LOOKUP: "photo_lookup" },
      pictureLookup: { text: "Synthetic card" }, detectPhotoLookupClues: (text) => ({ outputSummary: "Synthetic clues", confidenceScore: 80, searchText: text }),
      marketplaceForm: { title: "Synthetic listing draft", notes: "Keep until primary save" }, marketplaceListings: [],
      normalizeListingStatus: (value) => value, validateMarketplaceListingDraft: () => "",
      publicIdentityForProfile: () => ({ isOfficialAdminIdentity: false }), currentUserProfile: {}, adminToolsVisible: false,
      buildMarketplaceListing: (status) => ({ id: "Exact-Listing-ID", title: "Synthetic listing", status, sourceItemId: "inventory-1" }),
      getMarketplaceListingQualityReport: () => ({ blockers: [], score: 100, warnings: [], labels: [] }),
      BLANK_MARKETPLACE_FORM: { title: "", notes: "" }, activeFlowModal: { type: "createListing" },
    });
    const set = (key) => (value) => { ctx[key] = typeof value === "function" ? value(ctx[key]) : value; };
    ctx.setPhase2Data = (value) => { stateWrites.push(writes.length); set("phase2Data")(value); };
    for (const key of ["scoutSnapshot", "aiAssistReview", "scanReview", "scanMatches", "showInventoryScanner", "pictureLookup", "marketplaceForm", "marketplaceListings"]) ctx[`set${key[0].toUpperCase()}${key.slice(1)}`] = set(key);
    for (const name of ["closeInventoryScanner", "openProductAddFlow", "selectTideTradrProduct", "setActiveTab", "applyCatalogProductToDeal", "openDealFinderModal", "addProductToTideTradrWatchlist", "setTideTradrSubTab", "openScoutSubmitFlow", "setScanMode", "handleCatalogScanMatch", "setScanSearchState", "setListingReviewOpen", "setMarketplaceSourcePicker", "setMarketplaceView", "closeFlowModal"]) ctx[name] = (...args) => handoffs.push({ name, args });
    ctx.saveMarketplaceListingRecord = async (listing) => { storage.setItem("synthetic-primary-listing", JSON.stringify(listing)); return { source: "local", data: listing }; };
    vm.runInContext(names.map((name) => replacements[name] || functions.get(name)).join("\n"), ctx);
    return { ctx, bytes, faults, writes, stateWrites, toasts, toastTypes, statuses, handoffs, scanMessages, storage };
  }
  const calls = {
    logAiAssistEvent: (ctx) => ctx.logAiAssistEvent("synthetic", { inputSummary: "mail@example.test token=private 4111 1111 1111 1111", outputSummary: "Keep output", confidenceScore: 82 }),
    persistScannerIntake: (ctx) => ctx.persistScannerIntake("vault", "confirmed"),
    persistCrossListingChannels: (ctx) => ctx.persistCrossListingChannels({ id: "listing-1", sourceItemId: "inventory-1" }),
  };
  const phaseFaults = [
    ["quota", { write: [phaseKey] }], ["read denial", { read: [phaseKey] }],
    ["malformed JSON", { phaseRaw: "{broken" }], ["empty existing bytes", { phaseRaw: "" }],
    ["null envelope", { phaseRaw: "null" }], ["array envelope", { phaseRaw: "[]" }],
    ["invalid array", { phaseRaw: '{"scannerIntakeSessions":{}}' }],
  ];
  for (const [name, invoke] of Object.entries(calls)) {
    for (const [label, options] of phaseFaults) await check(`${name}: ${label} preserves bytes, state and drafts, then recovers`, async () => {
      const h = harness(options), before = h.bytes.get(phaseKey), state = clone(h.ctx.phase2Data);
      const drafts = clone([h.ctx.kidProjectForm, h.ctx.kidBuilderItems, h.ctx.scanReview, h.ctx.aiAssistReview, h.ctx.marketplaceForm]);
      assert.equal(await invoke(h.ctx), null); assert.equal(h.writes.length, 0); assert.equal(h.bytes.get(phaseKey), before);
      assert.deepEqual(clone(h.ctx.phase2Data), state); assert.equal(h.stateWrites.length, 0);
      assert.deepEqual(clone([h.ctx.kidProjectForm, h.ctx.kidBuilderItems, h.ctx.scanReview, h.ctx.aiAssistReview, h.ctx.marketplaceForm]), drafts);
      assert.equal(h.statuses.at(-1).kind, "storage_error"); assert.match(h.toasts.at(-1), /not saved/); assert.equal(h.toastTypes.at(-1), "error");
      h.faults.read.clear(); h.faults.write.clear(); h.bytes.set(phaseKey, JSON.stringify(initial));
      assert.ok(await invoke(h.ctx)); assert.equal(h.writes.length, 1); assert.deepEqual(h.stateWrites, [1]);
      const saved = JSON.parse(h.bytes.get(phaseKey)); assert.deepEqual(saved.customData, initial.customData); assert.deepEqual(saved.receiptRecords, initial.receiptRecords);
    });
    await check(`${name}: unavailable storage returns a handled failure`, async () => {
      const h = harness(); delete global.localStorage;
      assert.equal(await invoke(h.ctx), null); assert.equal(h.writes.length, 0); assert.equal(h.stateWrites.length, 0);
    });
    await check(`${name}: absent storage safely initializes without losing the draft`, async () => {
      const h = harness({ phaseRaw: null }); assert.ok(await invoke(h.ctx));
      assert.equal(h.writes.length, 1); assert.deepEqual(h.stateWrites, [1]);
    });
  }
  await check("successful payloads retain IDs, relations, scanner mapping, unrelated Kids data and AI redaction", async () => {
    const h = harness();
    for (const invoke of Object.values(calls)) assert.ok(await invoke(h.ctx));
    const saved = JSON.parse(h.bytes.get(phaseKey));
    assert.equal(saved.scannerIntakeSessions[0].id, "Exact-Scan-ID"); assert.equal(saved.scannerIntakeSessions[0].scanType, "upc");
    assert.equal(saved.scannerIntakeSessions[0].destination, "vault"); assert.equal(saved.scannerIntakeSessions[0].matchedCatalogItemId, "master-1");
    assert.deepEqual(saved.kidCommunityProjects, initial.kidCommunityProjects);
    assert.deepEqual(saved.kidCommunityProjectItems, initial.kidCommunityProjectItems);
    assert.equal(saved.marketplaceListingChannels[0].id, "Exact-Channel-ID"); assert.equal(saved.marketplaceListingChannels[0].sourceInventoryId, "inventory-1");
    assert.ok(saved.marketplaceListingChannels.some((channel) => channel.id === "prior-channel"));
    assert.equal(saved.aiAssistEvents[0].inputSummary, "[email redacted] [sensitive redacted] [number redacted]");
    assert.equal(saved.aiAssistEvents[0].confidenceScore, 82); assert.ok(saved.aiAssistEvents.some((event) => event.id === "prior-ai"));
  });
  for (const [label, options] of [
    ["read denial", { read: [scoutKey] }], ["malformed", { scoutRaw: "{bad" }], ["empty", { scoutRaw: "" }],
    ["null", { scoutRaw: "null" }], ["array", { scoutRaw: "[]" }], ["alert shape", { scoutRaw: '{"alertSettings":[]}' }],
    ["known array shape", { scoutRaw: '{"stores":{}}' }], ["null row", { scoutRaw: '{"stores":[null]}' }], ["array row", { scoutRaw: '{"reports":[[]]}' }],
  ]) await check(`Scout preflight ${label} prevents both writes and visible changes`, async () => {
    const h = harness(options), before = [...h.bytes], state = clone(h.ctx.scoutSnapshot);
    assert.equal(await h.ctx.updateScoutAlertPreference("priceDrop", true), null);
    assert.deepEqual([...h.bytes], before); assert.equal(h.writes.length, 0); assert.equal(h.stateWrites.length, 0);
    assert.deepEqual(clone(h.ctx.scoutSnapshot), state); assert.equal(h.ctx.scoutAlertPreferencePendingRef.current.size, 0); assert.equal(h.toastTypes.at(-1), "error");
  });
  for (const [label, options] of phaseFaults) await check(`Scout Phase2 ${label} leaves both stored copies and visible setting unchanged`, async () => {
    const h = harness(options), before = [...h.bytes];
    assert.equal(await h.ctx.updateScoutAlertPreference("priceDrop", true), null);
    assert.deepEqual([...h.bytes], before); assert.equal(h.writes.length, 0); assert.equal(h.ctx.scoutSnapshot.alertSettings.priceDrop, false);
  });
  for (const failure of ["read", "quota", "new malformed bytes", "new invalid row"]) await check(`Scout secondary ${failure} reports durable Phase2 plus unchanged Scout copy`, async () => {
    const h = harness();
    h.ctx.saveNotificationPreference = async (...args) => {
      const result = await services.saveNotificationPreference(...args);
      if (failure === "read") h.faults.read.add(scoutKey);
      if (failure === "quota") h.faults.write.add(scoutKey);
      if (failure === "new malformed bytes") h.bytes.set(scoutKey, "{arrived-during-save");
      if (failure === "new invalid row") h.bytes.set(scoutKey, '{"stores":[null],"keep":"latest"}');
      return result;
    };
    const result = await h.ctx.updateScoutAlertPreference("priceDrop", true);
    assert.equal(result.partial, true); assert.deepEqual(h.writes.map((write) => write.key), [phaseKey]);
    assert.equal(JSON.parse(h.bytes.get(phaseKey)).notificationPreferences.priceDrop.enabled, true);
    assert.equal(h.ctx.phase2Data.notificationPreferences.priceDrop.enabled, true); assert.equal(h.ctx.scoutSnapshot.alertSettings.priceDrop, true);
    assert.equal(h.statuses.at(-1).kind, "partial_save"); assert.match(h.toasts.at(-1), /Scout copy was not updated/); assert.equal(h.toastTypes.at(-1), "warning");
    const expected = failure === "new malformed bytes" ? "{arrived-during-save" : failure === "new invalid row" ? '{"stores":[null],"keep":"latest"}' : JSON.stringify(scoutInitial);
    assert.equal(h.bytes.get(scoutKey), expected);
    h.ctx.phase2Data = JSON.parse(h.bytes.get(phaseKey)); h.ctx.scoutSnapshot = clone(scoutInitial);
    assert.ok(notificationEffect); vm.runInContext(`(${notificationEffect})()`, h.ctx);
    assert.equal(h.ctx.scoutSnapshot.alertSettings.priceDrop, true, "App reload derives visible alert preferences from durable Phase2 data");
  });
  await check("Scout success merges latest stored rows and unrelated alert settings after the await", async () => {
    const h = harness();
    h.ctx.saveNotificationPreference = async (...args) => {
      const result = await services.saveNotificationPreference(...args);
      h.bytes.set(scoutKey, JSON.stringify({ ...scoutInitial, stores: [...scoutInitial.stores, { id: "arrived" }], alertSettings: { ...scoutInitial.alertSettings, localTidepoolPost: false }, latestMetadata: 7 }));
      return result;
    };
    assert.ok(await h.ctx.updateScoutAlertPreference("priceDrop", true));
    const saved = JSON.parse(h.bytes.get(scoutKey)); assert.equal(saved.stores[1].id, "arrived"); assert.equal(saved.latestMetadata, 7);
    assert.deepEqual(saved.reports, scoutInitial.reports); assert.deepEqual(saved.customData, scoutInitial.customData);
    assert.equal(saved.alertSettings.priceDrop, true); assert.equal(saved.alertSettings.localTidepoolPost, false);
    assert.deepEqual(h.writes.map((write) => write.key), [phaseKey, scoutKey]);
  });
  await check("Scout absent envelope and valid sparse legacy arrays remain supported", async () => {
    for (const raw of [null, '{"storeAliases":["legacy-alias"],"customMetadata":9}']) {
      const h = harness({ scoutRaw: raw }); assert.ok(await h.ctx.updateScoutAlertPreference("priceDrop", true));
      const saved = JSON.parse(h.bytes.get(scoutKey)); assert.equal(saved.alertSettings.priceDrop, true);
      if (raw !== null) { assert.deepEqual(saved.storeAliases, ["legacy-alias"]); assert.equal(saved.customMetadata, 9); }
    }
  });
  await check("Scout pending same-key requests cannot reverse durable preference; other keys and later retry work", async () => {
    const h = harness(); let finish;
    h.ctx.saveNotificationPreference = async (...args) => {
      const result = await services.saveNotificationPreference(...args);
      if (args[1].key === "priceDrop") await new Promise((resolve) => { finish = resolve; });
      return result;
    };
    const pending = h.ctx.updateScoutAlertPreference("priceDrop", true); await Promise.resolve();
    assert.equal(await h.ctx.updateScoutAlertPreference("priceDrop", false), null);
    assert.match(h.toasts.at(-1), /still saving/); assert.equal(h.writes.length, 1);
    assert.ok(await h.ctx.updateScoutAlertPreference("budgetWarning", false));
    finish(); assert.ok(await pending);
    assert.equal(h.ctx.scoutSnapshot.alertSettings.priceDrop, true); assert.equal(h.ctx.scoutSnapshot.alertSettings.budgetWarning, false);
    assert.equal(JSON.parse(h.bytes.get(scoutKey)).alertSettings.priceDrop, true);
    h.ctx.saveNotificationPreference = services.saveNotificationPreference;
    assert.ok(await h.ctx.updateScoutAlertPreference("priceDrop", false));
    assert.equal(JSON.parse(h.bytes.get(phaseKey)).notificationPreferences.priceDrop.enabled, false);
    assert.equal(JSON.parse(h.bytes.get(scoutKey)).alertSettings.priceDrop, false);
  });
  for (const destination of ["vault", "forge", "wishlist", "expense_only", "ignore", "tidetradr", "deal_finder", "watchlist", "pinned", "scout_report"]) await check(`scanner ${destination} preserves review on failure and gates its existing handoff on success`, async () => {
    const h = harness({ write: [phaseKey] }), review = clone(h.ctx.scanReview);
    await h.ctx.confirmScannerDestination(destination);
    assert.equal(h.handoffs.length, 0); assert.deepEqual(clone(h.ctx.scanReview), review); assert.deepEqual(clone(h.ctx.scanMatches), ["retain"]); assert.equal(h.ctx.showInventoryScanner, true);
    h.faults.write.clear(); await h.ctx.confirmScannerDestination(destination);
    assert.equal(h.writes.length, 1); assert.ok(h.handoffs.length > 0);
    const session = JSON.parse(h.bytes.get(phaseKey)).scannerIntakeSessions[0];
    assert.equal(session.extractedClues.requestedDestination, destination);
    const expected = { vault: "vault", forge: "forge", wishlist: "wishlist", expense_only: "search_only", ignore: "search_only", tidetradr: "search_only", deal_finder: "deal_finder", watchlist: "wishlist", pinned: "wishlist", scout_report: "store_report" };
    assert.equal(session.destination, expected[destination]);
    assert.equal(session.status, ["vault", "forge", "wishlist", "expense_only"].includes(destination) ? "confirmed" : destination === "ignore" ? "discarded" : ["watchlist", "pinned"].includes(destination) ? "saved" : "review");
    if (["vault", "forge", "wishlist"].includes(destination)) assert.equal(h.handoffs.find((call) => call.name === "openProductAddFlow").args[0].destinations[destination], true);
    else if (!["expense_only", "ignore"].includes(destination)) { assert.equal(h.ctx.scanReview, null); assert.equal(h.ctx.showInventoryScanner, false); }
    const expectedAction = { expense_only: "closeInventoryScanner", ignore: "closeInventoryScanner", tidetradr: "selectTideTradrProduct", deal_finder: "applyCatalogProductToDeal", watchlist: "addProductToTideTradrWatchlist", pinned: "addProductToTideTradrWatchlist", scout_report: "openScoutSubmitFlow" };
    if (expectedAction[destination]) assert.ok(h.handoffs.some((call) => call.name === expectedAction[destination]));
    if (destination === "pinned") assert.equal(h.handoffs.find((call) => call.name === "addProductToTideTradrWatchlist").args[1], true);
  });
  await check("scanner guest catalog handoff preserves existing non-persistent preview behavior", async () => {
    const h = harness({ write: [phaseKey] }); h.ctx.guestPreviewActive = true; h.ctx.blockGuestSave = () => true;
    await h.ctx.confirmScannerDestination("vault"); assert.equal(h.writes.length, 0); assert.ok(h.handoffs.some((call) => call.name === "openProductAddFlow"));
  });
  for (const destination of ["tidetradr", "deal_finder"]) await check(`scanner guest ${destination} retains public lookup without attempting storage`, async () => {
    const h = harness({ write: [phaseKey] }); h.ctx.guestPreviewActive = true; h.ctx.blockGuestSave = () => true;
    await h.ctx.confirmScannerDestination(destination); assert.equal(h.writes.length, 0);
    assert.ok(h.handoffs.some((call) => call.name === "setActiveTab" && call.args[0] === "market"));
    assert.ok(h.handoffs.some((call) => call.name === (destination === "tidetradr" ? "selectTideTradrProduct" : "applyCatalogProductToDeal")));
    assert.equal(h.ctx.scanReview, null);
  });
  await check("scanner no-match Deal Finder opens existing manual lookup while guest write destinations stay blocked", async () => {
    const h = harness(); h.ctx.scanReview.matchedCatalogItemId = "";
    await h.ctx.confirmScannerDestination("deal_finder"); assert.ok(h.handoffs.some((call) => call.name === "openDealFinderModal"));
    for (const destination of ["watchlist", "pinned", "scout_report", "expense_only", "ignore"]) {
      const guest = harness(); guest.ctx.guestPreviewActive = true; guest.ctx.blockGuestSave = () => true;
      await guest.ctx.confirmScannerDestination(destination); assert.equal(guest.writes.length, 0); assert.equal(guest.handoffs.length, 0); assert.ok(guest.ctx.scanReview);
    }
  });
  await check("AI review failure keeps edited review and avoids false reviewed confirmation", async () => {
    const h = harness({ write: [phaseKey] }), review = clone(h.ctx.aiAssistReview);
    await h.ctx.resolveAiAssistReview(); assert.deepEqual(clone(h.ctx.aiAssistReview), review); assert.doesNotMatch(h.toasts.at(-1), /marked reviewed/);
    h.faults.write.clear(); await h.ctx.resolveAiAssistReview(); assert.equal(h.ctx.aiAssistReview, null);
    const event = JSON.parse(h.bytes.get(phaseKey)).aiAssistEvents[0]; assert.equal(event.status, "edited"); assert.equal(event.accepted, true); assert.equal(event.outputSummary, "Edited draft");
  });
  await check("AI dismissal remains open on rejected history save and clears after durable dismissal", async () => {
    const h = harness({ write: [phaseKey] }); await h.ctx.resolveAiAssistReview("dismissed"); assert.ok(h.ctx.aiAssistReview);
    h.faults.write.clear(); await h.ctx.resolveAiAssistReview("dismissed"); assert.equal(h.ctx.aiAssistReview, null);
    const event = JSON.parse(h.bytes.get(phaseKey)).aiAssistEvents[0]; assert.equal(event.status, "dismissed"); assert.equal(event.accepted, false);
  });
  await check("AI suggestion and fire-and-forget photo lookup retain useful drafts without unhandled rejection", async () => {
    const h = harness({ write: [phaseKey] }), unhandled = [];
    const record = (error) => unhandled.push(error); process.on("unhandledRejection", record);
    try {
      assert.equal(await h.ctx.showAiSuggestion("synthetic", { outputSummary: "A useful draft" }), "A useful draft");
      assert.equal(h.ctx.aiAssistReview.editableOutput, "A useful draft");
      h.ctx.runPictureLookupSearch(); await new Promise((resolve) => setImmediate(resolve));
      assert.equal(unhandled.length, 0); assert.ok(h.handoffs.some((call) => call.name === "handleCatalogScanMatch")); assert.equal(h.writes.length, 0);
    } finally { process.off("unhandledRejection", record); }
  });
  await check("listing channel failure honestly preserves the already-durable listing without duplicate-save guidance", async () => {
    const h = harness({ write: [phaseKey] });
    await h.ctx.saveMarketplaceListing(); assert.equal(JSON.parse(h.bytes.get("synthetic-primary-listing")).id, "Exact-Listing-ID");
    assert.equal(h.ctx.marketplaceListings[0].id, "Exact-Listing-ID"); assert.equal(h.ctx.marketplaceForm.title, "");
    assert.deepEqual(clone(h.ctx.phase2Data.marketplaceListingChannels), initial.marketplaceListingChannels);
    assert.match(h.toasts.at(-1), /Listing saved, but its cross-listing channel drafts were not saved/); assert.match(h.toasts.at(-1), /My Listings/);
    assert.equal(h.toastTypes.at(-1), "warning");
    assert.doesNotMatch(h.toasts.at(-1), /try again|retry/i);
    const good = harness(); await good.ctx.saveMarketplaceListing(); assert.equal(good.writes.length, 2); assert.equal(good.toasts.at(-1), "Listing draft saved locally.");
  });
  if (process.argv.includes("--baseline")) {
    const captured = JSON.parse(fs.readFileSync(path.join(root, "artifacts/qa/release-readiness/legacy-save-handler-review/handlers-before.json"), "utf8")).functions;
    const baseline = [];
    for (const [name, invoke] of Object.entries(calls)) {
      const h = harness({ write: [phaseKey] }, captured); let rejected = false;
      try { await invoke(h.ctx); } catch { rejected = true; }
      assert.equal(rejected, true); assert.ok(h.stateWrites.includes(0));
      baseline.push({ name, rejected, updatedBeforeDurableWrite: true });
    }
    const oldScout = harness({ scoutRaw: "{broken-original-data" }, captured);
    oldScout.ctx.updateScoutAlertPreference("priceDrop", true); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(JSON.parse(oldScout.bytes.get(scoutKey)).alertSettings.priceDrop, true);
    assert.ok(oldScout.stateWrites.includes(0));
    baseline.push({ name: "updateScoutAlertPreference", overwroteUnreadableScoutBytes: true, updatedBeforeDurableWrite: true });
    fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "baseline-reproduction.json"), JSON.stringify(baseline, null, 2));
    console.log("REPRODUCED three original optimistic-state failures and Scout corrupt-data overwrite against captured actual handlers");
  }
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ count: results.length, checks: results, source: "actual App handlers and actual Phase2 service; synthetic in-memory storage; no external calls", limits: ["Scout copies are sequential writes, not an atomic transaction.", "Primary marketplace listing is already saved when its channel copy fails.", "Cloud/provider behavior is unchanged and not exercised."] }, null, 2));
  delete global.localStorage;
  console.log(`${results.length}/${results.length} legacy save handler checks passed.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
