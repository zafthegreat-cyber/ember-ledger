import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { prepareRestockFeedEntries, filterRestockFeed, orderRestockEntries } from '../src/utils/restockFeedPresentation.mjs';
import { savedVersionPresentation } from '../src/features/persistence/syncUiPresentation.mjs';
import { validNearbyPreference } from '../src/utils/nearbyPreference.mjs';
import { createDeviceTransfer } from '../src/features/backup/deviceTransfer.js';
import { WORKSPACE_BINDING_KEY } from '../src/features/persistence/workspaceOwnerBinding.js';

async function compile(path) {
  const result = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', loader: { '.css': 'empty' }, external: ['react', 'react/jsx-runtime'], define: { 'import.meta.env': '{}' }, logLevel: 'silent', plugins: [{ name: 'isolated-fixtures', setup(builder) {
    builder.onLoad({ filter: /CloudWorkspaceContext\.js$/ }, () => ({ contents: 'export function useCloudWorkspace(){ return globalThis.__fixtureWorkspace; }', loader: 'js' }));
    builder.onLoad({ filter: /socialAuthClient\.js$/ }, () => ({ contents: 'export const availableSocialProviders=async()=>[]; export const accountLinkingEnabled=false; export const socialAuth={};', loader: 'js' }));
    builder.onLoad({ filter: /AccountSessionPanel\.jsx$/ }, () => ({ contents: 'export default function Panel(){return null}', loader: 'jsx' }));
    builder.onLoad({ filter: /PrivateReceipt\.jsx$/ }, () => ({ contents: 'import React from "react"; export function PrivateStorageImage({authorizePrivate,...props}){return <img {...props} data-authorized={String(authorizePrivate)}/>}', loader: 'jsx' }));
  } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports.default;
}
const [Browser, Details, Overflow, Password, Sync, Transfer, Restore, Nearby] = await Promise.all(['src/components/RestockReportBrowser.jsx', 'src/components/RestockReportDetails.jsx', 'src/components/OverflowMenu.jsx', 'src/features/auth/PasswordInput.jsx', 'src/features/persistence/CloudSyncPanel.jsx', 'src/features/backup/DeviceTransferPanel.jsx', 'src/features/backup/WorkspaceRestorePanel.jsx', 'src/components/NationwideLocationPicker.jsx'].map(compile));

async function environment(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid/', pretendToBeVisual: true });
  const saved = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector('button')?.focus(); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const { createRoot } = await import('react-dom/client'); const root = createRoot(document.getElementById('root'));
  const button = name => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === name || node.getAttribute('aria-label') === name);
  const click = async name => { const node = button(name); assert.ok(node, `${name}: ${document.body.textContent}`); await act(async () => node.click()); };
  const change = async (node, value) => { await act(async () => { if (node.type === 'checkbox' || node.type === 'radio') node.click(); else { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value); node.dispatchEvent(new dom.window.Event('change', { bubbles: true })); } }); };
  try { await run({ root, dom, button, click, change }); }
  finally { await act(async () => root.unmount()); dom.window.close(); delete globalThis.__fixtureWorkspace; for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}

test('report ordering and known-time filtering preserve frozen source records', () => {
  const reports = Object.freeze([{ id: 'near', observedAt: '2026-11-01T00:00:00Z', lat: 36.81, lng: -76.28 }, { id: 'new', observedAt: '2026-11-02T00:00:00Z', lat: 36.85, lng: -76.30 }, { id: 'unknown' }].map(Object.freeze));
  const before = JSON.stringify(reports); const entries = prepareRestockFeedEntries(reports);
  assert.deepEqual(orderRestockEntries(entries).map(row => row.report.id), ['new', 'near', 'unknown']);
  assert.deepEqual(orderRestockEntries(entries, 'nearest', { lat: 36.81, lng: -76.28 }).map(row => row.report.id), ['near', 'new', 'unknown']);
  assert.equal(filterRestockFeed(entries, { knownTimeOnly: true }).length, 2);
  assert.equal(JSON.stringify(reports), before);
});

test('report shortcuts and pagination show exact counts without mutating reports', async () => environment(async ({ root, click, change }) => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  const reports = Array.from({ length: 45 }, (_, index) => Object.freeze({ id: String(index), storeId: index % 2 ? 'one' : 'two', observedAt: index < 3 ? new Date(now - 3600000).toISOString() : '2026-10-01T12:00:00Z' }));
  reports.push(Object.freeze({ id: 'undated', storeId: 'two' })); Object.freeze(reports); const before = JSON.stringify(reports);
  const props = { reports, now, showLocation: false, getStore: row => ({ id: row.storeId, name: row.storeId }), renderReport: row => React.createElement('article', { key: row.id, 'data-report': row.id }, row.id) };
  await act(async () => root.render(React.createElement(Browser, props)));
  await click('Show next 20 · 26 remaining'); assert.equal(document.querySelectorAll('[data-report]').length, 40);
  await click('Past 24 hours'); assert.equal(document.querySelectorAll('[data-report]').length, 3);
  await click('Past 24 hours'); await change(document.querySelector('input[type="checkbox"]')); assert.match(document.body.textContent, /20 of 45/);
  await act(async () => root.render(React.createElement(Browser, { ...props, initialStoreId: 'one' })));
  assert.ok([...document.querySelectorAll('[data-report]')].every(row => Number(row.dataset.report) % 2 === 1));
  await act(async () => root.render(React.createElement(Browser, { ...props, initialFollowedOnly: true, followedStoreIds: ['two'] })));
  assert.ok([...document.querySelectorAll('[data-report]')].every(row => Number(row.dataset.report) % 2 === 0));
  assert.equal(JSON.stringify(reports), before);
}));

test('five-mile choice passes exact preference through the existing change callback', async () => environment(async ({ root, click }) => {
  let selected; const selection = { mode: 'nearby', radius: 25, area: { id: 'us-1234567', city: 'Norfolk', state: 'VA', label: 'Norfolk, VA', lat: 36.8, lng: -76.28 } };
  await act(async () => root.render(React.createElement(Nearby, { selection, onChange: value => { selected = value; } })));
  await click('5 miles'); assert.deepEqual(selected, { ...selection, radius: 5 }); assert.equal(validNearbyPreference(selected).radius, 5);
}));

test('report summary leads with store and timezone; photo inspector keeps private authorization', async () => environment(async ({ root, click }) => {
  await act(async () => root.render(React.createElement(Details, { report: { timezone: 'America/New_York', observedAt: '2026-11-13T15:00:00Z' }, store: { name: 'Target Norfolk', address: '100 Test Street', city: 'Norfolk', state: 'VA' }, observedLabel: 'Observed today at 10:00 AM', photos: ['/fixture.png'] })));
  const summary = document.querySelector('[aria-label="Report summary"]'); assert.match(summary.textContent, /Target Norfolk.*100 Test Street/); assert.match(summary.textContent, /America\/New_York/); assert.match(summary.textContent, /10:00/);
  await click('Enlarge photo'); const dialog = document.querySelector('dialog'); assert.equal(dialog.open, true); assert.equal(dialog.querySelector('img').dataset.authorized, 'true');
  await click('Close photo'); assert.equal(dialog.open, false); assert.equal(document.activeElement.textContent, 'Enlarge photo');
}));

test('overflow keyboard skips unavailable actions, wraps, and returns focus on Escape', async () => environment(async ({ root, dom, click }) => {
  await act(async () => root.render(React.createElement(Overflow, { onEdit: () => {}, onDelete: () => {}, actions: [{ label: 'Unavailable', disabled: true }, { label: 'Share', onClick: () => {} }] })));
  await click('More actions'); assert.equal(document.activeElement.textContent, 'Edit');
  const key = async value => act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true })));
  await key('ArrowDown'); assert.equal(document.activeElement.textContent.trim(), 'Share'); await key('End'); assert.equal(document.activeElement.textContent.trim(), 'Delete');
  await key('ArrowDown'); assert.equal(document.activeElement.textContent.trim(), 'Edit'); await key('Escape'); assert.equal(document.querySelector('[role="menu"]'), null); assert.equal(document.activeElement.getAttribute('aria-label'), 'More actions');
}));

test('password visibility preserves controlled value and required label', async () => environment(async ({ root, click }) => {
  await act(async () => root.render(React.createElement(Password, { value: 'fixture-only', onChange: () => {}, required: true })));
  const input = document.querySelector('input'); assert.equal(input.type, 'password'); assert.equal(document.querySelector('label').htmlFor, input.id); await click('Show password'); assert.equal(input.type, 'text'); assert.equal(input.value, 'fixture-only'); await click('Hide password'); assert.equal(input.type, 'password');
}));

test('sync exposes progress, distinguishable failure, and guarded retry', async () => environment(async ({ root, click }) => {
  let attempts = 0, reject;
  globalThis.__fixtureWorkspace = { user: { id: 'fixture' }, enabled: true, status: { status: 'IDLE', message: 'Ready' }, syncNow: () => { attempts++; return attempts === 1 ? new Promise((resolve, no) => { reject = no; }) : Promise.resolve({ status: 'SYNCED' }); } };
  await act(async () => root.render(React.createElement(Sync))); await click('Sync now'); assert.match(document.body.textContent, /Checking saved changes…/);
  await act(async () => reject(new Error('Connection unavailable'))); assert.match(document.querySelector('[role="alert"]').textContent, /Connection unavailable/); await click('Retry'); assert.equal(attempts, 2); assert.equal(document.querySelector('[role="alert"]'), null);
}));

test('conflict progress jumps to next group without applying choices', async () => environment(async ({ root, click }) => {
  let writes = 0; const conflicts = ['Settings', 'Progress'].map((displayName, n) => ({ sourceId: `group-${n}`, displayName, deviceRecordCount: 1, cloudRecordCount: 2, device: { data: { value: 1 } }, cloud: { data: { value: 2 } } }));
  globalThis.__fixtureWorkspace = { user: { id: 'fixture' }, enabled: true, status: { status: 'CONFLICT' }, reviewConflicts: async () => ({ conflicts, reviewId: 'review-1' }), resolveConflicts: () => { writes++; } };
  await act(async () => root.render(React.createElement(Sync))); await click('Review both saved versions'); assert.match(document.body.textContent, /0 of 2 groups reviewed/);
  await act(async () => document.querySelector('input[type="radio"]').click()); await click('Review next undecided group'); assert.equal(document.activeElement.name, 'group-1'); assert.match(document.body.textContent, /1 of 2 groups reviewed/); assert.equal(writes, 0);
}));

test('saved version dates and scope do not invent missing metadata', () => {
  const result = savedVersionPresentation({ updatedAt: '2026-11-12T12:00:00Z', recordCount: 0 }, Date.parse('2026-11-13T12:00:00Z'));
  assert.equal(result.age, 'Saved yesterday'); assert.equal(result.scope, '0 records'); assert.equal(savedVersionPresentation({}).scope, ''); assert.equal(savedVersionPresentation({}).exact, '');
  assert.equal(savedVersionPresentation({ updatedAt: new Date(2026, 10, 12, 23, 50).toISOString() }, new Date(2026, 10, 13, 0, 5).getTime()).age, 'Saved yesterday');
});

test('checked transfer reuses same file; recovery rechecks owner and never restores without confirmation', async () => environment(async ({ root, dom, click }) => {
  const owner = '00000000-0000-4000-8000-000000000001'; localStorage.setItem(WORKSPACE_BINDING_KEY, JSON.stringify({ version: 1, ownerId: owner }));
  localStorage.setItem('et-tcg-beta-data', JSON.stringify({ items: [{ id: 'existing', name: 'Fixture card', quantity: 2 }] }));
  const before = JSON.stringify({ ...localStorage });
  const exported = await createDeviceTransfer({ storage: localStorage, sessionStorage, userId: owner });
  const file = { name: exported.fileName, size: Buffer.byteLength(exported.json), text: async () => exported.json }; let handed, writes = 0;
  globalThis.__fixtureWorkspace = { user: { id: owner }, openRecovery: value => { handed = value; } };
  await act(async () => root.render(React.createElement(Transfer))); await click('New device'); await act(async () => document.querySelector('input[type="checkbox"]').click());
  await act(async () => { const input = document.querySelector('input[type="file"]'); Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  for (let attempt = 0; attempt < 100 && document.querySelector('.device-transfer').getAttribute('aria-busy') !== 'false' && !document.body.textContent.includes('Review recovery options'); attempt++) await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  await click('Review recovery options'); assert.equal(handed, file);
  await act(async () => root.render(React.createElement(Restore, { initialFile: handed, userId: owner, onRestore: () => { writes++; } })));
  await click('Review checked transfer file'); for (let attempt = 0; attempt < 100 && !document.querySelector('button[type="submit"]'); attempt++) await act(async () => new Promise(resolve => setTimeout(resolve, 10))); assert.match(document.body.textContent, /current records have not been changed/); assert.equal(document.querySelector('button[type="submit"]').disabled, true); assert.equal(writes, 0); assert.equal(JSON.stringify({ ...localStorage }), before);
  await act(async () => root.render(React.createElement(Restore, { key: 'other-owner', initialFile: handed, userId: '00000000-0000-4000-8000-000000000002', onRestore: () => { writes++; } })));
  await click('Review checked transfer file'); assert.equal(document.querySelector('button[type="submit"]'), null); assert.equal(writes, 0); assert.equal(JSON.stringify({ ...localStorage }), before);
}));
