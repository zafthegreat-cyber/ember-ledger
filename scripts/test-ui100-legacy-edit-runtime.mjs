import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { reconcileLegacyQuoteEdit } from '../src/utils/legacyQuoteEdit.mjs';
import { buildLegacyCatalogIdentityUpdate, readLegacyCatalogIdentity } from '../src/utils/legacyCatalogIdentity.mjs';
import { readImportSavedDetails } from '../src/utils/importReviewSafety.mjs';

// Execute the actual App handlers and mapper, including its database whitelist.
// Only authority checks, React setters and the storage transport are fixtures.
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const names = new Set(['startEditingItem', 'saveEditedItem', 'mapItem', 'sanitizeInventorySupabaseRow', 'normalizeDestinationScopes', 'isNumericDraft', 'isBlankLike', 'blankToNull']);
const constants = new Set(['INVENTORY_ITEMS_SUPABASE_COLUMNS', 'INVENTORY_ITEMS_METADATA_FIELDS']);
const snippets = [], pending = [ast.program];
while (pending.length) {
  const node = pending.pop(); if (!node || typeof node.type !== 'string') continue;
  if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) snippets.push(source.slice(node.start, node.end));
  if (node.type === 'VariableDeclarator' && constants.has(node.id?.name)) snippets.push(`const ${source.slice(node.start, node.end)};`);
  for (const value of Object.values(node)) if (Array.isArray(value)) pending.push(...value); else if (value && typeof value === 'object' && value.type) pending.push(value);
}
assert.equal(snippets.length, names.size + constants.size);
const factory = new Function('scope', `with(scope) { ${snippets.join('\n')} return {startEditingItem,saveEditedItem,mapItem}; }`);
const original = Object.freeze({ id: 'original-record', name: 'Original card', quantity: 2, unitCost: 17.5, salePrice: 0, category: 'Pokemon', productType: 'Individual Card', workspaceId: 'workspace-one', ownerUserId: 'owner-one', purchaseDate: '2026-10-03', marketPrice: 10, marketValue: 10, lowPrice: 8, midPrice: 9, highPrice: 12, msrpPrice: 5, marketValueSource: 'provider', lastPriceChecked: '2026-11-12T12:00:00Z', actionNotes: 'Receipt #42\nKeep this exact note.  ', language: 'English', finish: '', printing: '' });
function setup(local, previousCatalogId = '') {
  let payload = null, writes = 0; const messages = [];
  let server = { id: original.id, name: original.name, quantity: original.quantity, unit_cost: original.unitCost, sale_price: 0, workspace_id: original.workspaceId, owner_user_id: original.ownerUserId, purchase_date: original.purchaseDate, action_notes: original.actionNotes, catalog_product_id: previousCatalogId || null, market_price: 10, market_value: 10, low_price: 8, mid_price: 9, high_price: 12, msrp_price: 5, market_value_source: 'provider', last_price_checked: original.lastPriceChecked };
  const scope = { BETA_LOCAL_MODE: local, items: [{ ...original, catalogProductId: previousCatalogId }], editingItemId: null, itemForm: {}, blankItem: {}, activeWorkspace: { id: original.workspaceId }, activeFlowModal: null, editingItemBaselineRef: { current: null }, reviewedCatalogIdentityRef: { current: { id: 'old-edit', identity: { name: 'stale' } } }, DEFAULT_PERSONAL_WORKSPACE_ID: 'personal', reconcileLegacyQuoteEdit, buildLegacyCatalogIdentityUpdate, readLegacyCatalogIdentity, readImportSavedDetails,
    blockGuestSave: () => false, ensureWorkspaceEditor: () => true, isEditingVaultItem: () => false,
    showAppMessage: message => messages.push(message), setVaultToast: message => messages.push(message), setActiveTab: () => {}, itemPurchaserName: item => item.buyer || '',
    resolvePurchaser: form => ({ purchaserName: form.buyer || '', purchaserId: form.purchaserId || '' }), normalizedInventoryProductType: form => form.productType || '', normalizeInventoryDestination: () => 'forge',
  };
  scope.setEditingItemId = value => { scope.editingItemId = value; };
  scope.setItemForm = value => { scope.itemForm = value; };
  scope.setItems = value => { scope.items = value; if (local) writes++; };
  scope.supabase = { from(table) { assert.equal(table, 'inventory_items'); return { update(value) { payload = structuredClone(value); return { eq(key, id) { assert.equal(key, 'id'); assert.equal(id, original.id); return { select() { return { single: async () => { writes++; server = { ...server, ...payload }; return { data: server, error: null }; } }; } }; } }; } }; } };
  const handlers = factory(scope);
  return { scope, handlers, messages, get payload() { return payload; }, get writes() { return writes; }, refreshQuote() { const update = { marketPrice: 83.15, marketValue: 83.15, lowPrice: 70, midPrice: 80, highPrice: 100, lastPriceChecked: '2026-11-13T22:00:00Z' }; scope.items = scope.items.map(item => ({ ...item, ...update })); server = { ...server, market_price: 83.15, market_value: 83.15, low_price: 70, mid_price: 80, high_price: 100, last_price_checked: update.lastPriceChecked }; } };
}

for (const local of [true, false]) test(`actual ${local ? 'local' : 'cloud'} edit preserves latest quotes, original cost/ID and reviewed catalog identity`, async () => {
  const harness = setup(local), { scope, handlers } = harness;
  handlers.startEditingItem(scope.items[0]); assert.equal(scope.reviewedCatalogIdentityRef.current, null); assert.equal(scope.editingItemBaselineRef.current.id, original.id); assert.equal(scope.itemForm.marketPrice, 10);
  harness.refreshQuote();
  scope.itemForm = { ...scope.itemForm, name: 'Reviewed card', expansion: 'Fixture set', finish: 'Reverse Holofoil' };
  scope.reviewedCatalogIdentityRef.current = { id: original.id, identity: { catalogProductId: 'local:123', tcgplayerProductId: '123', name: 'Reviewed card', setName: 'Fixture set', cardNumber: '004/100', variant: 'Reverse Holofoil', edition: 'Unlimited', tcgGame: 'pokemon', language: 'English', imageUrl: '/fixture-card.jpg' } };
  await handlers.saveEditedItem({ preventDefault() {} });
  assert.equal(harness.writes, 1); const saved = scope.items[0];
  assert.equal(saved.id, original.id); assert.equal(saved.quantity, 2); assert.equal(saved.unitCost, 17.5); assert.equal(saved.ownerUserId, original.ownerUserId); assert.equal(saved.purchaseDate, original.purchaseDate);
  assert.equal(saved.marketPrice, 83.15); assert.equal(saved.lowPrice, 70); assert.equal(saved.highPrice, 100); assert.equal(saved.lastPriceChecked, '2026-11-13T22:00:00Z');
  assert.equal(saved.name, 'Reviewed card'); assert.equal(saved.catalogProductId, 'local:123'); assert.equal(saved.cardNumber, '004/100'); assert.equal(saved.edition, 'Unlimited'); assert.equal(saved.variant, 'Reverse Holofoil'); assert.equal(saved.imageUrl, '/fixture-card.jpg'); assert.ok(saved.actionNotes.startsWith(original.actionNotes));
  if (!local) for (const key of ['id', 'user_id', 'workspace_id', 'market_price', 'market_value', 'low_price', 'mid_price', 'high_price', 'msrp_price', 'last_price_checked']) assert.equal(Object.hasOwn(harness.payload, key), false, `${key} is not rewritten`);
  handlers.startEditingItem(saved); scope.itemForm = { ...scope.itemForm, name: 'Corrected personal label' }; await handlers.saveEditedItem({ preventDefault() {} }); assert.equal(scope.items[0].name, 'Corrected personal label'); assert.equal(scope.items[0].marketPrice, 83.15); assert.equal(scope.items[0].cardNumber, '004/100');
});

test('actual cloud manual estimate edit changes only explicit quote fields and never advances provider time', async () => {
  const h = setup(false); h.handlers.startEditingItem(h.scope.items[0]); h.refreshQuote(); h.scope.itemForm = { ...h.scope.itemForm, marketPrice: '90' }; await h.handlers.saveEditedItem({ preventDefault() {} });
  assert.equal(h.payload.market_price, 90); assert.equal(h.payload.market_value, 90); assert.equal(h.payload.market_value_source, 'manual'); assert.equal(h.payload.low_price, undefined); assert.equal(h.payload.last_price_checked, undefined); assert.equal(h.scope.items[0].lastPriceChecked, '2026-11-13T22:00:00Z'); assert.equal(h.scope.items[0].unitCost, 17.5);
});

test('actual cloud clear and explicit zero remain different through save and mapItem', async () => {
  for (const draftValue of ['', '0']) {
    const h = setup(false); h.handlers.startEditingItem(h.scope.items[0]); h.refreshQuote();
    h.scope.itemForm = { ...h.scope.itemForm, marketPrice: draftValue, lowPrice: draftValue, midPrice: draftValue, highPrice: draftValue, msrpPrice: draftValue };
    await h.handlers.saveEditedItem({ preventDefault() {} });
    const expected = draftValue === '' ? null : 0;
    for (const field of ['marketPrice', 'marketValue', 'lowPrice', 'midPrice', 'highPrice', 'msrpPrice', 'msrp']) assert.equal(h.scope.items[0][field], expected, field);
    assert.equal(h.payload.market_price, expected); assert.equal(h.scope.items[0].unitCost, 17.5); assert.equal(h.scope.items[0].lastPriceChecked, '2026-11-13T22:00:00Z');
  }
});

test('explicit local-catalog rematch clears an old database UUID while preserving quotes and record identity', async () => {
  const h = setup(false, 'f2510775-20cc-487e-95ae-f261761d994e'); h.handlers.startEditingItem(h.scope.items[0]); h.refreshQuote();
  h.scope.itemForm = { ...h.scope.itemForm, catalogProductId: 'local:456' };
  h.scope.reviewedCatalogIdentityRef.current = { id: original.id, identity: { catalogProductId: 'local:456', tcgplayerProductId: '456', name: 'Reviewed local product' } };
  await h.handlers.saveEditedItem({ preventDefault() {} });
  assert.equal(h.payload.catalog_product_id, null); assert.equal(h.payload.tcgplayer_product_id, '456'); assert.equal(h.scope.items[0].catalogProductId, 'local:456'); assert.equal(h.scope.items[0].id, original.id); assert.equal(h.scope.items[0].marketPrice, 83.15); assert.equal(h.scope.items[0].unitCost, 17.5);
});

test('actual edit rejects guest/workspace denial and invalid amount before any storage call', async () => {
  for (const kind of ['guest', 'workspace', 'amount']) { const h = setup(false); h.handlers.startEditingItem(h.scope.items[0]); if (kind === 'guest') h.scope.blockGuestSave = () => true; if (kind === 'workspace') h.scope.ensureWorkspaceEditor = () => false; if (kind === 'amount') h.scope.itemForm = { ...h.scope.itemForm, marketPrice: '-1' }; await h.handlers.saveEditedItem({ preventDefault() {} }); assert.equal(h.writes, 0); assert.equal(h.payload, null); }
});
