import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

async function compile(path) {
  const result = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', loader: { '.css': 'empty' }, external: ['react', 'react/jsx-runtime', 'virtual:code3-set-catalog'], define: { 'import.meta.env': '{}' }, logLevel: 'silent' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports.default;
}
const [Catalog, ProductDetail] = await Promise.all([compile('src/components/CollectionSetCatalog.jsx'), compile('src/components/CollectionProductDetail.jsx')]);
async function environment(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid/', pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const click = async name => {
    const button = [...document.querySelectorAll('button')].find(element => (element.getAttribute('aria-label') || element.textContent.trim()) === name);
    assert.ok(button, name);
    await act(async () => button.click());
  };
  try { await run({ root, click }); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}

test('catalog counts reflect visible pages and filters reset without changing records', async () => environment(async ({ root, click }) => {
  const products = Object.freeze(Array.from({ length: 51 }, (_, index) => Object.freeze({ id: `card-${index}`, tcgplayerProductId: `${1000 + index}`, tcgGame: 'pokemon', name: `Card ${index}`, setName: 'Aquapolis', catalogType: 'card', cardNumber: `${index}`, marketPrice: 12.5 })));
  const row = Object.freeze({ key: 'pokemon:aquapolis', name: 'Aquapolis', catalogRecords: [], ownedItems: [] });
  const before = JSON.stringify({ row, products });
  await act(async () => root.render(React.createElement(Catalog, { row, loadCatalog: async () => ({ available: true, products }) })));
  assert.equal(document.querySelector('.set-catalog-result-count').textContent, '24 of 51 items shown');
  await click('Show more (27 remaining)');
  assert.equal(document.querySelector('.set-catalog-result-count').textContent, '48 of 51 items shown');
  await click('Owned only');
  assert.equal(document.querySelector('.set-catalog-result-count').textContent, '0 items you own');
  await click('Clear filters');
  assert.equal(document.querySelector('.set-catalog-result-count').textContent, '24 of 51 items shown');
  assert.equal(document.querySelectorAll('.set-catalog-product').length, 24);
  assert.equal(JSON.stringify({ row, products }), before);
}));

test('saved copies expose exact finish and record context without rewriting values or callbacks', async () => environment(async ({ root, click }) => {
  const card = Object.freeze({ id: 'card', name: 'Saved card', tcgplayerProductId: '101', tcgGame: 'pokemon', catalogType: 'card', imageUrl: '/card.jpg', marketPrice: 30 });
  const record = Object.freeze({ ...card, id: 'original-copy', quantity: 2, ownedItemPurpose: 'PERSONAL_COLLECTION', variant: 'Reverse Holofoil', edition: '1st Edition', language: 'English', condition: 'Near Mint', allocatedItemCost: 8 });
  const row = Object.freeze({ key: 'pokemon:aquapolis', name: 'Aquapolis', catalogRecords: [], ownedItems: [record] });
  const before = JSON.stringify(record); let opened;
  await act(async () => root.render(React.createElement(Catalog, { row, loadCatalog: async () => ({ available: true, products: [card] }), onOpenItem: value => { opened = value; } })));
  await act(async () => document.querySelector('.set-catalog-product').click());
  const link = document.querySelector('.set-catalog-copy-link');
  const description = document.getElementById(link.getAttribute('aria-describedby'));
  assert.match(description.textContent, /Personal collection · Qty 2 · Reverse Holo · Near Mint/);
  await act(async () => document.querySelector('.set-catalog-copy-link').click());
  assert.equal(opened, record);
  const group = { item: record, records: [record], quantity: 2, purposeCounts: [{ purpose: 'PERSONAL_COLLECTION', shortLabel: 'PC', label: 'Personal collection', quantity: 2 }], valuation: { value: 60, knownCount: 1 } };
  const props = { group, activeTab: 'copies', onTabChange: () => {}, onOpenRecord: value => { opened = value; } };
  await act(async () => root.render(React.createElement(ProductDetail, props)));
  const values = Object.fromEntries([...document.querySelectorAll('.collection-product-copy dt')].map(term => [term.textContent, term.nextElementSibling.textContent]));
  assert.equal(values.Finish, 'Reverse Holo'); assert.equal(values.Edition, '1st Edition'); assert.equal(values.Language, 'English'); assert.equal(values['Recorded cost'], '$8.00');
  await click('Open copy record 1: Personal collection, quantity 2'); assert.equal(opened, record);
  await act(async () => root.render(React.createElement(ProductDetail, { ...props, hiddenValues: true })));
  assert.match(document.querySelector('.collection-product-copy').textContent, /Cost hidden/);
  assert.equal(document.querySelector('.collection-product-copy').textContent.includes('$8.00'), false);
  assert.equal(JSON.stringify(record), before);
}));
