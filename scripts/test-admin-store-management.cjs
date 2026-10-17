const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const espree = require("espree");
const { transformSync } = require("esbuild");
const React = require("react");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const declarations = new Map();
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") declarations.set(node.id.name, node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value?.type) visit(value);
  }
}
visit(ast);
const names = [
  "updateAdminStoreDraft", "resetAdminStoreDraft", "startAdminStoreDraft",
  "persistAdminStoreManagementDraft", "saveAdminStoreManagementDraft", "quickPatchAdminStore",
  "readAdminStoreManagementData", "isAdminStoreDirectoryRecord",
  "saveSharedScoutData", "getStoreMapStoreId", "renderAdminStoreManagementSection",
];
const code = names.map((name) => {
  assert.ok(declarations.has(name), `Missing actual App function ${name}`);
  return source.slice(...declarations.get(name).range);
}).join("\n");
const compiled = transformSync(code, { loader: "jsx", jsx: "transform" }).code;
const key = "et-tcg-beta-scout";
const copy = (value) => JSON.parse(JSON.stringify(value));
const specimen = {
  id: "Store-Exact-ID", storeId: "Store-Exact-ID", store_id: "Store-Exact-ID",
  displayName: "Audit North Shop", name: "Audit North Shop", nickname: "Audit North",
  chain: "Audit Collector Shops", storeType: "Local Card Shop", city: "Norfolk", state: "Virginia",
  active: true, reportable: true, reviewStatus: "Approved", publicNotes: "Original note",
  customMetadata: { source: "preserve this", nested: [1, 2] }, favorite: true, latitude: 36.85,
};
const envelope = {
  stores: [specimen, { ...specimen, id: "Other-Store", storeId: "Other-Store", store_id: "Other-Store", displayName: "Audit South Shop", name: "Audit South Shop", nickname: "Audit South" }],
  reports: [{ id: "audit-report", storeId: specimen.id }], items: [{ id: "audit-item", storeId: specimen.id }],
  routes: [{ id: "audit-route", storeIds: [specimen.id] }], preferences: { retain: true }, customEnvelopeField: ["untouched"],
};
function allElements(node) {
  if (Array.isArray(node)) return node.flatMap(allElements);
  return React.isValidElement(node) ? [node, ...allElements(node.props.children)] : [];
}

async function main() {
  const tools = await import(pathToFileURL(path.join(root, "src/utils/adminStoreTools.js")));
  const cleanup = await import(pathToFileURL(path.join(root, "src/utils/betaDataCleanup.js")));
  const { buildStoreProfileSummary, STORE_LOCATION_TYPES } = await import(pathToFileURL(path.join(root, "src/utils/storeProfileUtils.js")));
  let count = 0;
  const results = [];
  function check(label, run) { run(); count += 1; results.push(label); console.log(`PASS ${label}`); }
  function harness({ saved = envelope, raw, access = {}, readError = false, writeError = false, seeds = [] } = {}) {
    const bytes = new Map(raw === undefined ? (saved === null ? [] : [[key, JSON.stringify(saved)]]) : [[key, raw]]);
    let writes = 0;
    let sequence = 0;
    const toasts = [];
    const faults = { read: readError, write: writeError };
    const context = vm.createContext({
      React, ...tools, ...cleanup, STORE_LOCATION_TYPES,
      SCOUT_STORAGE_KEY: key, adminToolsVisible: true, betaAdminVisible: true, adminEditModeActive: true,
      adminReviewFilter: "Store Management", adminStoreDraft: { ...tools.ADMIN_STORE_DRAFT_DEFAULTS }, adminStoreEditingId: "",
      adminStoreEditingSourceRef: { current: null }, virginiaStoreSeed: seeds, SCOUT_KNOWN_LOCAL_STORE_SEED: [],
      scoutSnapshot: copy(envelope), suggestions: [], ...access,
      localStorage: {
        getItem: () => { if (faults.read) throw new DOMException("Read denied", "SecurityError"); return bytes.get(key) ?? null; },
        setItem: (name, value) => { if (faults.write) throw new DOMException("Synthetic quota reached", "QuotaExceededError"); writes += 1; bytes.set(name, String(value)); },
      },
      adminReviewerName: () => "Synthetic authorized reviewer",
      makeId: () => `audit-new-${++sequence}`,
      setVaultToast: (message) => toasts.push(message),
      getScoutQuickRetailer: (store) => store.chain || "",
      getScoutQuickStoreName: (store) => store.name || store.displayName || "",
      setActiveTab() {}, setScoutView() {}, setScoutStoresMode() {}, openStoreProfile() {},
    });
    for (const [setter, field] of [["setAdminStoreDraft", "adminStoreDraft"], ["setAdminStoreEditingId", "adminStoreEditingId"], ["setScoutSnapshot", "scoutSnapshot"]]) {
      context[setter] = (value) => { context[field] = typeof value === "function" ? value(context[field]) : value; };
    }
    context.getScoutQuickStores = () => [...context.scoutSnapshot.stores, ...seeds];
    context.buildStoreMapRows = () => context.getScoutQuickStores().map((store) => ({
      id: store.id, store, name: store.displayName, retailer: store.chain, status: "Needs report", confidence: "Unknown",
      profile: buildStoreProfileSummary(store, { admin: true }),
    }));
    vm.runInContext(compiled, context);
    return {
      context, toasts, bytes, faults, writes: () => writes,
      saved: () => JSON.parse(bytes.get(key)),
      submit: () => context.saveAdminStoreManagementDraft({ preventDefault() {} }),
      newDraft: () => { context.adminStoreDraft = { ...tools.ADMIN_STORE_DRAFT_DEFAULTS, displayName: "Audit New Shop", chain: "Audit New", city: "Richmond", publicNotes: "Synthetic local note" }; },
    };
  }

  check("active Store Management renders real handlers and row status/badges", () => {
    const h = harness();
    const tree = h.context.renderAdminStoreManagementSection();
    const elements = allElements(tree);
    assert.ok(elements.find((node) => node.type === "form" && node.props.onSubmit === h.context.saveAdminStoreManagementDraft));
    assert.ok(elements.some((node) => node.props.children === "Needs report"));
    const edit = elements.find((node) => node.type === "button" && node.props.children === "Edit");
    edit.props.onClick();
    assert.equal(h.context.adminStoreEditingId, specimen.id.toLowerCase());
    assert.equal(h.context.adminStoreDraft.id, specimen.id);
    h.context.updateAdminStoreDraft("city", "Suffolk");
    assert.equal(h.context.adminStoreDraft.city, "Suffolk");
    h.context.updateAdminStoreDraft("id", "wrong-id");
    h.context.updateAdminStoreDraft("__proto__", {});
    assert.equal(h.context.adminStoreDraft.id, specimen.id);
    h.context.resetAdminStoreDraft();
    assert.deepEqual(copy(h.context.adminStoreDraft), tools.ADMIN_STORE_DRAFT_DEFAULTS);
    assert.equal(h.context.adminStoreEditingId, "");
  });

  for (const [label, access] of [
    ["regular user", { adminToolsVisible: false, betaAdminVisible: false }],
    ["limited moderator", { betaAdminVisible: false }],
    ["admin view mode", { adminEditModeActive: false }],
  ]) check(`${label} cannot save or quick-patch even when handlers are invoked directly`, () => {
    const h = harness({ access }); h.newDraft();
    const beforeDraft = copy(h.context.adminStoreDraft), beforeSnapshot = copy(h.context.scoutSnapshot), beforeBytes = h.bytes.get(key);
    h.submit();
    h.context.quickPatchAdminStore({ store: specimen }, { active: false });
    h.context.startAdminStoreDraft({ store: specimen });
    assert.equal(h.writes(), 0);
    assert.equal(h.bytes.get(key), beforeBytes);
    assert.deepEqual(copy(h.context.adminStoreDraft), beforeDraft);
    assert.deepEqual(copy(h.context.scoutSnapshot), beforeSnapshot);
    const tree = h.context.renderAdminStoreManagementSection();
    if (access.adminEditModeActive === false) {
      const buttons = allElements(tree).filter((node) => node.type === "button");
      for (const label of ["Edit", "Approve Family", "Mark Inactive"]) assert.equal(buttons.find((node) => node.props.children === label).props.disabled, true);
      assert.equal(buttons.find((node) => node.props.type === "submit").props.disabled, true);
    } else assert.equal(tree, null);
  });

  check("valid create persists once, survives reload, preserves unrelated data, then resets draft", () => {
    const h = harness(); h.newDraft(); h.submit();
    assert.equal(h.writes(), 1);
    const saved = h.saved();
    assert.equal(saved.stores.length, 3);
    assert.equal(saved.stores[0].displayName, "Audit New Shop");
    assert.equal(saved.stores[0].adminReviewedBy, "Synthetic authorized reviewer");
    assert.deepEqual(saved.stores.slice(1), envelope.stores);
    for (const field of Object.keys(envelope).filter((name) => name !== "stores")) assert.deepEqual(saved[field], envelope[field]);
    assert.equal(harness({ raw: h.bytes.get(key) }).saved().stores[0].id, saved.stores[0].id);
    assert.deepEqual(copy(h.context.adminStoreDraft), tools.ADMIN_STORE_DRAFT_DEFAULTS);
    assert.match(h.toasts.at(-1), /added to this device's local Scout directory/);
  });

  check("exact-ID edit preserves ID aliases, latest unrelated metadata and another same-name row", () => {
    const h = harness();
    h.context.startAdminStoreDraft({ store: specimen });
    h.context.updateAdminStoreDraft("displayName", "Audit South Shop");
    h.context.updateAdminStoreDraft("publicNotes", "Updated local note");
    const latest = h.saved(); latest.stores[0].customMetadata.changedElsewhere = true; latest.stores[0].reviewStatus = "Needs Review";
    h.bytes.set(key, JSON.stringify(latest)); h.submit();
    assert.equal(h.writes(), 1);
    const saved = h.saved();
    assert.equal(saved.stores[0].id, specimen.id);
    assert.equal(saved.stores[0].storeId, specimen.storeId);
    assert.equal(saved.stores[0].store_id, specimen.store_id);
    assert.equal(saved.stores[0].publicNotes, "Updated local note");
    assert.equal(saved.stores[0].reviewStatus, "Needs Review");
    assert.equal(saved.stores[0].customMetadata.changedElsewhere, true);
    assert.deepEqual(saved.stores[1], envelope.stores[1]);
    assert.deepEqual(saved.reports, envelope.reports);
  });

  check("approve/inactivate actions preserve metadata and use existing status normalization", () => {
    const h = harness();
    h.context.quickPatchAdminStore({ store: specimen }, { familyFriendlyApproved: true, supportsKidsAccess: true, reviewStatus: "Approved" });
    assert.equal(h.saved().stores[0].familyFriendlyApproved, true);
    assert.ok(buildStoreProfileSummary(h.saved().stores[0]).badges.some((badge) => badge.label === "Family-Friendly"));
    h.context.quickPatchAdminStore({ store: specimen }, { active: false, reportable: false, reviewStatus: "Inactive" });
    assert.equal(h.saved().stores[0].active, false);
    assert.equal(h.saved().stores[0].reportable, false);
    assert.equal(h.saved().stores[0].reviewStatus, "Inactive");
    assert.deepEqual(h.saved().stores[0].customMetadata, specimen.customMetadata);
    assert.deepEqual(buildStoreProfileSummary(h.saved().stores[0]).badges, []);
    h.context.startAdminStoreDraft({ store: h.saved().stores[0] });
    h.context.updateAdminStoreDraft("active", true); h.submit();
    assert.equal(h.saved().stores[0].active, true);
    assert.equal(h.saved().stores[0].reviewStatus, "Needs Review");
  });

  check("seed record gets one explicit local override with its exact original ID", () => {
    const seed = { ...specimen, id: "Seed-UPPER-ID", storeId: "Seed-UPPER-ID", store_id: "Seed-UPPER-ID", displayName: "Audit Seed Shop" };
    const h = harness({ seeds: [seed] });
    h.context.startAdminStoreDraft({ store: seed }); h.context.updateAdminStoreDraft("publicNotes", "Seed override"); h.submit();
    assert.equal(h.saved().stores[0].id, seed.id);
    assert.equal(h.saved().stores[0].publicNotes, "Seed override");
    assert.deepEqual(h.saved().stores.slice(1), envelope.stores);
  });

  check("clearing optional notes and nickname clears canonical and legacy aliases after reload", () => {
    const normalized = tools.normalizeAdminStoreDraft({ ...specimen, nickname: "Alias Nickname", public_notes: "Snake-case public note", publicNotes: "", kids_fair_access_notes: "Snake-case kids note", partner_notes: "Snake-case partner note" });
    const h = harness({ saved: { ...envelope, stores: [normalized] } });
    h.context.startAdminStoreDraft({ store: normalized });
    for (const field of ["nickname", "publicNotes", "kidsFairAccessNotes", "partnerNotes"]) h.context.updateAdminStoreDraft(field, "");
    h.submit();
    const store = h.saved().stores[0];
    for (const field of ["nickname", "storeNickname", "store_nickname", "publicNotes", "public_notes", "description", "notes", "kidsFairAccessNotes", "kids_fair_access_notes", "fairAccessNotes", "fair_access_notes", "partnerNotes", "partner_notes"]) assert.equal(store[field], "", field);
    h.context.startAdminStoreDraft({ store });
    for (const field of ["nickname", "publicNotes", "kidsFairAccessNotes", "partnerNotes"]) assert.equal(h.context.adminStoreDraft[field], "", field);
    assert.deepEqual(store.customMetadata, specimen.customMetadata);
  });

  check("clearing only partner notes does not copy still-present kids notes into them", () => {
    const store = tools.normalizeAdminStoreDraft({ ...specimen, kidsFairAccessNotes: "Keep kids note", partnerNotes: "Clear partner note" });
    const h = harness({ saved: { ...envelope, stores: [store] } });
    h.context.startAdminStoreDraft({ store }); h.context.updateAdminStoreDraft("partnerNotes", ""); h.submit();
    assert.equal(h.saved().stores[0].partnerNotes, "");
    assert.equal(h.saved().stores[0].partner_notes, "");
    assert.equal(h.saved().stores[0].kidsFairAccessNotes, "Keep kids note");
  });

  for (const field of ["displayName", "chain", "city", "state"]) check(`cleared required ${field} cannot fall back to existing aliases`, () => {
    const store = tools.normalizeAdminStoreDraft(specimen);
    const h = harness({ saved: { ...envelope, stores: [store] } });
    h.context.startAdminStoreDraft({ store }); h.context.updateAdminStoreDraft(field, "");
    const before = h.bytes.get(key); h.submit();
    assert.equal(h.writes(), 0); assert.equal(h.bytes.get(key), before);
    assert.equal(h.context.adminStoreDraft[field], ""); assert.match(h.toasts.at(-1), /required/);
  });

  for (const action of ["draft save", "quick patch"]) check(`deleted saved record is not recreated by ${action}, even when it is also a seed`, () => {
    const h = harness({ seeds: [specimen] });
    h.context.startAdminStoreDraft({ store: specimen }); h.context.updateAdminStoreDraft("publicNotes", "Unsaved change");
    const saved = h.saved(); saved.stores = saved.stores.filter((store) => store.id !== specimen.id); h.bytes.set(key, JSON.stringify(saved));
    const before = h.bytes.get(key), draft = copy(h.context.adminStoreDraft), snapshot = copy(h.context.scoutSnapshot);
    if (action === "draft save") h.submit(); else h.context.quickPatchAdminStore({ store: specimen }, { active: false });
    assert.equal(h.writes(), 0); assert.equal(h.bytes.get(key), before);
    assert.deepEqual(copy(h.context.adminStoreDraft), draft); assert.deepEqual(copy(h.context.scoutSnapshot), snapshot);
    assert.match(h.toasts.at(-1), /no longer available/);
  });

  check("unknown row cannot become a local override", () => {
    const h = harness();
    h.context.quickPatchAdminStore({ store: { ...specimen, id: "Unknown-ID" } }, { active: false });
    assert.equal(h.writes(), 0); assert.match(h.toasts.at(-1), /no longer available/);
  });

  for (const [label, setup] of [
    ["invalid draft", (h) => { h.context.adminStoreDraft.city = ""; }],
    ["duplicate create", (h) => { h.context.adminStoreDraft = { ...specimen }; }],
    ["ambiguous saved ID", (h) => { const value = h.saved(); value.stores.push({ ...specimen }); h.bytes.set(key, JSON.stringify(value)); h.context.startAdminStoreDraft({ store: specimen }); }],
  ]) check(`${label} rejects without any write or false success`, () => {
    const h = harness(); h.newDraft(); setup(h);
    const beforeDraft = copy(h.context.adminStoreDraft), beforeBytes = h.bytes.get(key), beforeSnapshot = copy(h.context.scoutSnapshot);
    h.submit(); assert.equal(h.writes(), 0);
    assert.equal(h.bytes.get(key), beforeBytes);
    assert.deepEqual(copy(h.context.adminStoreDraft), beforeDraft);
    assert.deepEqual(copy(h.context.scoutSnapshot), beforeSnapshot);
    assert.ok(!h.toasts.some((toast) => /saved to|added to/.test(toast)));
  });

  for (const [label, options] of [
    ["read denied", { readError: true }], ["quota write failure", { writeError: true }],
    ["malformed JSON", { raw: "{not-json" }], ["non-object envelope", { raw: "[]" }],
    ["null envelope", { raw: "null" }], ["invalid stores list", { raw: '{"stores":{}}' }],
    ["invalid store record", { raw: '{"stores":[null]}' }],
  ]) for (const action of ["create", "edit", "quick patch"]) check(`${label}: ${action} preserves bytes, state and draft`, () => {
    const h = harness(action === "create" ? options : {});
    if (action === "create") h.newDraft();
    else {
      h.context.startAdminStoreDraft({ store: specimen }); h.context.updateAdminStoreDraft("publicNotes", "Unsaved edit");
      assert.equal(h.context.adminStoreEditingId, specimen.id.toLowerCase(), "Failure starts after the real edit has opened");
      if (options.raw !== undefined) h.bytes.set(key, options.raw);
      h.faults.read = Boolean(options.readError); h.faults.write = Boolean(options.writeError);
    }
    const beforeDraft = copy(h.context.adminStoreDraft), beforeSnapshot = copy(h.context.scoutSnapshot), beforeBytes = h.bytes.get(key), beforeId = h.context.adminStoreEditingId;
    if (action === "quick patch") h.context.quickPatchAdminStore({ store: specimen }, { active: false, reportable: false });
    else h.submit();
    assert.equal(h.writes(), 0); assert.equal(h.bytes.get(key), beforeBytes);
    assert.deepEqual(copy(h.context.scoutSnapshot), beforeSnapshot);
    assert.deepEqual(copy(h.context.adminStoreDraft), beforeDraft);
    assert.equal(h.context.adminStoreEditingId, beforeId);
    assert.match(h.toasts.at(-1), /was not saved/);
    assert.ok(!h.toasts.some((toast) => /saved to|added to/.test(toast)));
  });

  check("absent local storage creates a fresh envelope without pretending cloud persistence", () => {
    const h = harness({ saved: null }); h.newDraft(); h.submit();
    assert.equal(h.saved().stores.length, 1);
    assert.match(h.toasts.at(-1), /this device's local Scout directory/);
  });
  const output = path.join(root, "artifacts/qa/release-readiness/admin-store-management");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ count, checks: results, scope: "Actual extracted App handlers and renderer with real validators; isolated synthetic storage, no authentication bypass or hosted writes." }, null, 2));
  console.log(`Admin Store Management: ${count} focused checks passed.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
