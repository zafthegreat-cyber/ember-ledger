const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const espree = require('espree');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const ast = espree.parse(source, {ecmaVersion:'latest', sourceType:'module', ecmaFeatures:{jsx:true}, range:true});
const effects = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee.name === 'useEffect') effects.push(node.arguments[0]);
  Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(visit) : value?.type && visit(value));
}
visit(ast);
const markers = ['emberTideFlowModal', 'emberTideScanner', 'emberTideReceiptScan'];
const callbacks = new Map(markers.map(marker => {
  const matches = effects.map(node => source.slice(...node.range)).filter(text => text.includes(`delete rest.${marker};`));
  assert.equal(matches.length, 1, `${marker} must exercise its actual App effect`);
  return [marker, matches[0]];
}));
const results = [];
function check(name, run) { run(); results.push({name, passed:true}); console.log(`PASS ${name}`); }

function fixture(marker, options = {}) {
  const original = Object.freeze({route:'collection', custom:{saved:'keep'}, emberTideCatalogDetail:'card-1', ...options.state});
  const calls = [], listeners = new Map();
  const window = {
    location: {href:'http://127.0.0.1:5217/vault/cards', pathname:'/vault/cards'},
    history: {
      state: original,
      pushState(next) { calls.push(['push', next]); this.state = next; },
      replaceState(next) { calls.push(['replace', next]); this.state = next; },
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { assert.equal(listeners.get(type), listener); listeners.delete(type); },
  };
  const env = {
    window,
    activeFlowModal: options.inactive ? null : {id:'flow-1', type:'scoutSubmit'},
    flowModalOpen: !options.inactive,
    showInventoryScanner: !options.inactive,
    receiptScanOpen: !options.inactive,
    scoutStoreReportReturnRef: {current:options.reportReturn || null},
    routeStateFromPath: () => ({scoutStoreId:options.storeId || ''}),
    closeFlowModal: value => calls.push(['closeFlow', value]),
    onEffectCloseFlow: value => calls.push(['closeFlow', value]),
    closeInventoryScanner: () => calls.push(['closeScanner']),
    closeReceiptScanWorkflow: () => calls.push(['closeReceipt']),
    setActiveFlowModal: value => calls.push(['setFlow', value]),
  };
  const cleanup = new Function(...Object.keys(env), `return (${callbacks.get(marker)})();`)(...Object.values(env));
  return {window, calls, listeners, cleanup, original, env};
}

for (const marker of markers) {
  check(`${marker}: inactive overlay creates no history entry or listener`, () => {
    const f = fixture(marker, {inactive:true});
    assert.equal(f.cleanup, undefined); assert.equal(f.calls.length, 0); assert.equal(f.listeners.size, 0);
  });
  check(`${marker}: opening preserves unrelated state and installs Back handler`, () => {
    const f = fixture(marker);
    assert.equal(f.calls[0][0], 'push'); assert.ok(f.window.history.state[marker]);
    assert.deepEqual(f.window.history.state.custom, {saved:'keep'});
    assert.equal(f.window.history.state.emberTideCatalogDetail, 'card-1');
    assert.equal(f.listeners.size, 1); assert.equal(f.original[marker], undefined);
  });
  check(`${marker}: cleanup removes only its marker and does not mutate the prior state`, () => {
    const other = Object.fromEntries(markers.filter(key => key !== marker).map(key => [key, `${key}-keep`]));
    const f = fixture(marker, {state:other});
    const previous = Object.freeze(f.window.history.state);
    const expected = {...previous}; delete expected[marker];
    f.cleanup();
    assert.deepEqual(f.window.history.state, expected); assert.notEqual(f.window.history.state, previous);
    assert.ok(previous[marker]); assert.equal(f.calls.at(-1)[0], 'replace'); assert.equal(f.listeners.size, 0);
  });
  check(`${marker}: cleanup leaves a newer overlay history entry untouched`, () => {
    const f = fixture(marker); const replacement = Object.freeze({...f.window.history.state, [marker]:'newer-overlay'});
    f.window.history.state = replacement; const callCount = f.calls.length;
    f.cleanup(); assert.equal(f.window.history.state, replacement); assert.equal(f.calls.length, callCount);
    assert.equal(f.listeners.size, 0);
  });
  check(`${marker}: Back invokes the existing close action`, () => {
    const f = fixture(marker); f.listeners.get('popstate')();
    const expected = marker === 'emberTideFlowModal' ? ['closeFlow', {force:true}] : marker === 'emberTideScanner' ? ['closeScanner'] : ['closeReceipt'];
    assert.deepEqual(f.calls.at(-1), expected);
  });
}
check('restoring a Scout report reuses its history entry and retains the draft return record', () => {
  const reportReturn = {restoring:true, modal:{id:'flow-1'}, storeId:'store-1', draft:{note:'unsaved note'}};
  const f = fixture('emberTideFlowModal', {reportReturn});
  assert.equal(f.calls[0][0], 'replace'); assert.equal(reportReturn.restoring, false);
  assert.deepEqual(reportReturn.draft, {note:'unsaved note'});
});
check('suspended Scout report Back clears only the modal while its store route remains active', () => {
  const reportReturn = {modal:{id:'flow-1'}, storeId:'store-1', draft:{note:'unsaved note'}};
  const f = fixture('emberTideFlowModal', {reportReturn, storeId:'store-1'});
  f.listeners.get('popstate')(); assert.deepEqual(f.calls.at(-1), ['setFlow', null]);
  assert.equal(f.calls.some(call => call[0] === 'closeFlow'), false);
  assert.deepEqual(reportReturn.draft, {note:'unsaved note'});
});
const output = process.env.QA_OUTPUT_DIR ? path.resolve(root, process.env.QA_OUTPUT_DIR) : path.join(root, 'artifacts/qa/release-readiness/app-modal-history');
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({passed:results.length, results}, null, 2));
console.log(`${results.length}/${results.length} actual App modal history checks passed.`);
