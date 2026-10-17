const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const espree = require('espree');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/services/shorelineAccessService.js'), 'utf8');
const output = path.join(root, 'artifacts/qa/reliability-returns/admin-activity');
const functions = new Map(), constants = new Map(), callSites = [];
let sessionEffect;
function extract(source) {
  function visit(node, ancestors = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration') functions.set(node.id.name, source.slice(...node.range));
    if (node.type === 'VariableDeclarator' && node.id?.name) constants.set(node.id.name, 'const ' + source.slice(...node.range) + ';');
    if (node.type === 'CallExpression' && node.callee?.name === 'trackCreatedInventoryActivity') callSites.push(ancestors.findLast(parent => parent.type === 'FunctionDeclaration')?.id.name);
    if (node.type === 'CallExpression' && node.callee?.name === 'useEffect') {
      const body = source.slice(...node.arguments[0].range);
      if (body.includes('inventoryCreateActivityRef.current = scope')) sessionEffect = body;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => visit(child, [...ancestors, node]));
      else if (value?.type) visit(value, [...ancestors, node]);
    }
  }
  visit(espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true }));
}
extract(app); extract(service);
assert.ok(sessionEffect, 'Execute the actual App session lifetime effect');
assert.deepEqual(callSites.sort(), ['addItem', 'saveInventoryRecords'], 'Only confirmed creation paths call the activity helper');
const names = ['trackBetaActivity', 'trackCreatedInventoryActivity', 'saveInventoryRecords', 'addItem', 'submitMultiDestinationAdd', 'confirmInventoryImport', 'applyImportedQuantityIncrease', 'recordAppActivityEvent', 'mapAppActivityEvent', 'mapItem', 'inventoryRecordToSupabaseRow', 'sanitizeInventorySupabaseRow', 'uuidOrNull', 'normalizeInventoryDestination', 'itemDestinationScopes', 'normalizeDestinationScopes', 'normalizeVaultStatus', 'isBlankLike'];
const code = ['INVENTORY_ITEMS_SUPABASE_COLUMNS', 'INVENTORY_ITEMS_METADATA_FIELDS'].map(name => constants.get(name)).concat(names.map(name => {
  assert.ok(functions.has(name), name + ' must be a shipped function'); return functions.get(name);
})).join('\n');
const clone = value => JSON.parse(JSON.stringify(value));
const results = [];
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const event = () => ({ preventDefault() {}, nativeEvent: {} });
const submitted = (destination, patch = {}) => ({ id: 'draft-' + destination, name: 'PRIVATE item title', destinationScope: [destination], quantity: 3, unitCost: 123, notes: 'PRIVATE owner notes', receiptImage: 'PRIVATE receipt', status: destination === 'vault' ? 'Personal Collection' : destination === 'wishlist' ? 'Wishlist' : 'In Stock', ...patch });

function harness(options = {}) {
  const inserts = [], updates = [], activity = [], messages = [], diagnostic = [], completions = [];
  let serial = 0, cleanup;
  const client = {
    from(table) {
      assert.ok(['inventory_items', 'app_activity_events'].includes(table), 'No new table/provider');
      const query = { kind: '', row: null, id: null,
        insert(row) { this.kind = 'insert'; this.row = row; (table === 'inventory_items' ? inserts : activity).push(clone(row)); return this; },
        update(row) { assert.equal(table, 'inventory_items'); this.kind = 'update'; this.row = row; updates.push(clone(row)); return this; },
        eq(key, value) { assert.equal(key, 'id'); this.id = value; return this; },
        select() { return this; },
        async single() {
          if (table === 'app_activity_events') {
            if (options.activityThrow) throw Error('Synthetic telemetry unavailable');
            return { data: { id: 'activity-' + activity.length, ...this.row }, error: options.activityError || null };
          }
          const ordinal = ++serial;
          const response = options.inventoryResponse ? await options.inventoryResponse({ ordinal, kind: this.kind, row: this.row }) : { data: { id: this.id || `Exact-Saved-${ordinal}`, ...this.row }, error: null };
          completions.push(response);
          return response;
        },
      };
      return query;
    },
  };
  const ctx = vm.createContext({
    console: { error() {} }, Date, Set,
    supabase: client, isSupabaseConfigured: true, BETA_LOCAL_MODE: false,
    user: { id: 'owner-a', email: 'PRIVATE@example.invalid' }, signedInWithSupabase: true, guestPreviewActive: false, dataAccessForEffects: true, authSessionVersion: 0,
    activeTab: 'inventory', activeWorkspace: { id: '11111111-1111-4111-8111-111111111111' }, activeForgeWorkspace: { id: '11111111-1111-4111-8111-111111111111' },
    DEFAULT_PERSONAL_WORKSPACE_ID: 'personal', DEFAULT_FORGE_PHYSICAL_LOCATION: 'Shelf',
    inventoryCreateActivityRef: { current: null },
    blockGuestSave: () => false, ensureWorkspaceEditor: () => true,
    forgeWorkspaceUnavailableMessage: 'Unavailable', showAppMessage: message => messages.push(message),
    logAppError: (...args) => diagnostic.push(args), isMissingBetaUsersBackend: error => error?.code === 'MISSING',
    defaultVisibilityForWorkspace: () => 'private', normalizedInventoryProductType: () => 'Single Card',
    makeId: prefix => `Synthetic-${prefix}`, currentWorkspaceUserId: 'owner-a',
    applyWorkspaceToRecord: (record, workspace) => ({ ...record, workspaceId: workspace.id }),
    resolvePurchaser: () => ({ purchaserId: '', purchaserName: 'PRIVATE purchaser' }),
    itemForm: { name: 'PRIVATE item title', quantity: 1, unitCost: 5, status: 'In Stock' },
    items: [], catalogProducts: [], getMatchingItem: () => null, editingItemId: '', blankItem: {},
    activeFlowModal: { type: 'addInventory' }, setFeatureSectionsOpen() {}, closeFlowModal() {}, setActiveTab() {},
    multiDestinationSaving: false, multiDestinationForm: {}, setMultiDestinationValidationAttempted() {},
    getMultiDestinationValidationErrors: () => ['missing destination'], focusMultiDestinationValidationError() {}, setMultiDestinationMessage: value => messages.push(value),
    importRows: [], importOptions: {}, importLastBatchResult: null,
    findImportDuplicate: () => null, defaultImportDestination: () => 'Forge',
    importedRowToItem: (row, destination) => submitted(destination.toLowerCase(), { id: row.importedItemId }),
    setImportBatchMessage: value => messages.push(value), setImportAssistantOpen() {},
    ...options.context,
  });
  for (const key of ['items', 'itemForm', 'importRows', 'importLastBatchResult']) ctx['set' + key[0].toUpperCase() + key.slice(1)] = value => { ctx[key] = typeof value === 'function' ? value(ctx[key]) : value; };
  vm.runInContext(code + '\nglobalThis.activateActivitySession = ' + sessionEffect + ';', ctx);
  const session = (patch = {}) => { cleanup?.(); Object.assign(ctx, patch); cleanup = ctx.activateActivitySession(); };
  session();
  return { ctx, inserts, updates, activity, messages, diagnostic, completions, session, unmount: () => cleanup?.() };
}

async function check(name, run) { await run(); results.push({ name, passed: true }); console.log('PASS ' + name); }
(async () => {
  await check('mixed destination inserts emit only confirmed collection and resale creates, after persistence', async () => {
    const gate = deferred(); const h = harness({ inventoryResponse: async ({ ordinal, row }) => { if (ordinal === 1) await gate.promise; return ordinal === 3 ? { data: null, error: { message: 'Synthetic denied row' } } : { data: { id: 'Saved-' + ordinal, ...row }, error: null }; } });
    const pending = h.ctx.saveInventoryRecords([submitted('vault'), submitted('forge'), submitted('forge'), submitted('wishlist')]);
    assert.equal(h.activity.length, 0); gate.resolve(); const result = await pending; await nextTurn();
    assert.equal(result.saved.length, 3); assert.equal(result.failures.length, 1);
    assert.deepEqual(h.activity.map(row => [row.event_type, row.entity_id]), [['added_vault_item', 'Saved-1'], ['added_forge_item', 'Saved-2']]);
    for (const row of h.activity) {
      assert.deepEqual(Object.keys(row).sort(), ['entity_id', 'entity_type', 'event_context', 'event_type', 'metadata', 'user_id']);
      assert.deepEqual(row.metadata, { activeTab: 'inventory', workspaceId: h.ctx.activeWorkspace.id });
      assert.equal(row.entity_type, 'inventory_item'); assert.equal(row.user_id, 'owner-a');
      assert.ok(!JSON.stringify(row).includes('PRIVATE'));
    }
  });
  await check('submitted destination survives response mapping without scope columns', async () => {
    const h = harness({ inventoryResponse: () => ({ data: { id: 'Exact-Collection', status: 'In Stock' }, error: null }) });
    await h.ctx.saveInventoryRecords([submitted('vault')]); await nextTurn();
    assert.equal(h.activity[0].event_type, 'added_vault_item'); assert.equal(h.activity[0].entity_id, 'Exact-Collection');
  });
  await check('returned record IDs deduplicate repeats and ambiguous response retries', async () => {
    const h = harness({ inventoryResponse: ({ row }) => ({ data: { ...row, id: 'Same-Exact-ID' }, error: null }) });
    await h.ctx.saveInventoryRecords([submitted('vault'), submitted('forge')]);
    await h.ctx.saveInventoryRecords([submitted('vault')]); await nextTurn();
    assert.equal(h.activity.length, 1);
  });
  await check('distinct successful records with equal product text remain separate events', async () => {
    const h = harness(); await h.ctx.saveInventoryRecords([submitted('forge'), submitted('forge')]); await nextTurn(); assert.equal(h.activity.length, 2);
  });
  await check('concurrent repeated saved IDs produce one activity attempt', async () => {
    const gate = deferred(); const h = harness({ inventoryResponse: () => gate.promise });
    const first = h.ctx.saveInventoryRecords([submitted('forge')]), second = h.ctx.saveInventoryRecords([submitted('forge')]);
    gate.resolve({ data: { id: 'Concurrent-ID' }, error: null }); await Promise.all([first, second]); await nextTurn(); assert.equal(h.activity.length, 1);
  });
  for (const context of [{ BETA_LOCAL_MODE: true }, { user: null, signedInWithSupabase: false }, { guestPreviewActive: true, blockGuestSave: () => true }, { user: { id: 'local-beta' }, signedInWithSupabase: false }, { dataAccessForEffects: false }, { signedInWithSupabase: false }]) {
    await check('ineligible save does not emit activity: ' + Object.keys(context).join(','), async () => {
      const h = harness({ context }); await h.ctx.saveInventoryRecords([submitted('vault')]); await nextTurn(); assert.equal(h.activity.length, 0);
    });
  }
  await check('failed inserts, rejected requests and missing returned IDs emit nothing', async () => {
    for (const inventoryResponse of [() => ({ data: null, error: { message: 'Synthetic write failed' } }), () => { throw Error('Synthetic network failure'); }, () => ({ data: {}, error: null })]) {
      const h = harness({ inventoryResponse }); try { await h.ctx.saveInventoryRecords([submitted('vault')]); } catch (error) { assert.match(error.message, /Synthetic network failure/); } await nextTurn(); assert.equal(h.activity.length, 0);
    }
  });
  for (const destination of ['wishlist', 'expense_only', 'market']) await check(destination + ' creation is not collection/resale activity', async () => {
    const h = harness(); await h.ctx.saveInventoryRecords([submitted(destination)]); await nextTurn(); assert.equal(h.activity.length, 0);
  });
  for (const [label, patch] of [['logout', { user: null, signedInWithSupabase: false }], ['identity change', { user: { id: 'owner-b' } }], ['access revoked', { dataAccessForEffects: false }], ['session changed', { authSessionVersion: 1 }], ['unmount', null]]) {
    await check('pending inventory completion is silent after ' + label, async () => {
      const gate = deferred(); const h = harness({ inventoryResponse: () => gate.promise }); const pending = h.ctx.saveInventoryRecords([submitted('vault')]);
      if (patch) h.session(patch); else h.unmount(); gate.resolve({ data: { id: 'Late-ID' }, error: null }); await pending; await nextTurn(); assert.equal(h.activity.length, 0);
    });
  }
  await check('new eligible session can record its own successful create', async () => {
    const h = harness(); h.session({ user: { id: 'owner-b' } }); await h.ctx.saveInventoryRecords([submitted('vault')]); await nextTurn(); assert.equal(h.activity[0].user_id, 'owner-b');
  });
  for (const activityError of [{ code: 'MISSING', message: 'Synthetic missing optional table' }, { code: '42501', message: 'Synthetic activity denied' }]) await check('activity failure preserves successful primary save: ' + activityError.code, async () => {
    const h = harness({ activityError }); const result = await h.ctx.saveInventoryRecords([submitted('vault')]); await nextTurn(); assert.equal(result.saved.length, 1); assert.equal(result.failures.length, 0);
    h.ctx.trackCreatedInventoryActivity(result.saved[0], submitted('vault'), h.ctx.inventoryCreateActivityRef.current); await nextTurn(); assert.equal(h.activity.length, 1); assert.equal(h.diagnostic.length, activityError.code === 'MISSING' ? 0 : 1);
  });
  await check('thrown activity rejection cannot reject the primary save', async () => {
    const h = harness({ activityThrow: true }); const result = await h.ctx.saveInventoryRecords([submitted('forge')]); await nextTurn(); assert.equal(result.saved.length, 1); assert.equal(h.diagnostic.length, 1);
  });
  await check('legacy manual resale insert emits after the saved ID is returned', async () => {
    const gate = deferred(); const h = harness({ inventoryResponse: () => gate.promise }); const pending = h.ctx.addItem(event()); assert.equal(h.activity.length, 0);
    gate.resolve({ data: { id: 'Manual-Exact-ID', status: 'In Stock' }, error: null }); await pending; await nextTurn(); assert.equal(h.ctx.items[0].id, 'Manual-Exact-ID'); assert.equal(h.activity[0].event_type, 'added_forge_item'); assert.equal(h.activity[0].entity_id, 'Manual-Exact-ID');
  });
  await check('legacy restock merge updates the existing record without a create event', async () => {
    const existing = { id: 'Existing-ID', name: 'Synthetic stock', quantity: 2, unitCost: 3 }; const h = harness({ context: { getMatchingItem: () => existing, items: [existing] } }); await h.ctx.addItem(event()); await nextTurn(); assert.equal(h.updates.length, 1); assert.equal(h.inserts.length, 0); assert.equal(h.activity.length, 0);
  });
  await check('legacy local beta add remains local and emits no activity', async () => {
    const h = harness({ context: { BETA_LOCAL_MODE: true, user: { id: 'local-beta' }, signedInWithSupabase: false } });
    await h.ctx.addItem(event()); await nextTurn(); assert.equal(h.ctx.items.length, 1); assert.equal(h.inserts.length, 0); assert.equal(h.activity.length, 0);
  });
  await check('legacy failed primary insert cannot produce create activity', async () => {
    const h = harness({ inventoryResponse: () => ({ data: null, error: { message: 'Synthetic insert rejected' } }) });
    await h.ctx.addItem(event()); await nextTurn(); assert.equal(h.activity.length, 0); assert.equal(h.ctx.items.length, 0); assert.equal(h.ctx.itemForm.name, 'PRIVATE item title');
  });
  await check('legacy insert completing after session cleanup cannot emit activity', async () => {
    const gate = deferred(); const h = harness({ inventoryResponse: () => gate.promise }); const pending = h.ctx.addItem(event());
    h.unmount(); gate.resolve({ data: { id: 'Legacy-Late-ID' }, error: null }); await pending; await nextTurn(); assert.equal(h.activity.length, 0);
  });
  for (const [label, context] of [['guest', { blockGuestSave: () => true }], ['workspace denied', { ensureWorkspaceEditor: () => false }], ['no workspace', { activeForgeWorkspace: null }], ['validation', { itemForm: { name: '' } }]]) await check('legacy rejected add remains silent: ' + label, async () => {
    const h = harness({ context }); await h.ctx.addItem(event()); await nextTurn(); assert.equal(h.inserts.length, 0); assert.equal(h.activity.length, 0);
  });
  await check('multi-destination busy/invalid drafts do not emit create events', async () => {
    for (const multiDestinationSaving of [true, false]) { const h = harness({ context: { multiDestinationSaving } }); await h.ctx.submitMultiDestinationAdd(event()); assert.equal(h.inserts.length, 0); assert.equal(h.activity.length, 0); }
  });
  for (const duplicateAction of ['skip_duplicate', 'increase_quantity']) await check('import ' + duplicateAction + ' does not emit a create event', async () => {
    const existing = { id: 'Duplicate-ID', quantity: 2 }; const h = harness({ context: { items: [existing], importRows: [{ importedItemId: 'Import-A', importStatus: 'reviewed', destination: 'Vault', quantity: 3, originalText: 'Synthetic row', duplicateAction }], findImportDuplicate: () => existing } });
    await h.ctx.confirmInventoryImport(); await nextTurn(); assert.equal(h.inserts.length, 0); assert.equal(h.activity.length, 0); if (duplicateAction === 'increase_quantity') assert.equal(h.ctx.items[0].quantity, 5);
  });
  await check('unreviewed import rows are not successful additions', async () => {
    const h = harness({ context: { importRows: [{ needsReview: true, importStatus: 'pending', destination: 'Vault' }] } }); await h.ctx.confirmInventoryImport(); assert.equal(h.inserts.length, 0); assert.equal(h.activity.length, 0);
  });
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'behavior-results.json'), JSON.stringify({ passed: results.length, results, noRemoteRequests: true }, null, 2) + '\n');
  console.log(`${results.length}/${results.length} actual-handler inventory activity checks passed; no remote requests.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
