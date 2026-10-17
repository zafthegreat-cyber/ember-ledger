const assert = require("node:assert/strict");
const fs = require("node:fs");
const espree = require("espree");
const directory = "artifacts/qa/private-beta-candidate/performance";
const baseline = fs.readFileSync(`${directory}/App.before.jsx`, "utf8");
const current = fs.readFileSync("src/App.jsx", "utf8");
const manifest = JSON.parse(fs.readFileSync(`${directory}/extraction-manifest.json`, "utf8"));
function walk(node, action) { if (!node || typeof node !== "object") return; action(node); for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach((entry) => walk(entry, action)); else if (value?.type) walk(value, action); } }
function parse(source) { return espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true }); }
function functions(source) { const result = new Map(); walk(parse(source), (node) => { if (node.type === "FunctionDeclaration") result.set(node.id.name, source.slice(...node.range)); }); return result; }
const beforeFunctions = functions(baseline), afterFunctions = functions(current);
const extractedNames = new Set(manifest.map((entry) => entry.name));
let unchangedFunctions = 0;
for (const [name, body] of beforeFunctions) {
  if (name === "App" || extractedNames.has(name) || !afterFunctions.has(name)) continue;
  assert.equal(afterFunctions.get(name), body, `${name} must retain its original implementation`);
  unchangedFunctions++;
}
for (const entry of manifest) {
  const module = fs.readFileSync(`src/features/deferredViews/${entry.component}.jsx`, "utf8");
  assert.equal(functions(module).get(entry.name), entry.body, `${entry.name}: actual moved renderer is byte-preserved`);
  assert.ok(current.includes(`const ${entry.component} = lazy(() => import("./features/deferredViews/${entry.component}"));`));
  let mounted = 0;
  walk(parse(current), (node) => {
    if (node.type !== "JSXOpeningElement" || node.name.name !== entry.component) return;
    mounted++;
    const scope = node.attributes.find((attribute) => attribute.name?.name === "scope").value.expression;
    assert.equal(scope.type, "ObjectExpression");
    assert.deepEqual(scope.properties.map((property) => property.key.name), entry.bindings);
    assert.ok(scope.properties.every((property) => property.shorthand && property.value.type === "Identifier"), "Scope passes live values/handlers, never evaluates view factories eagerly.");
  });
  assert.equal(mounted, 1);
}
function effects(source) { const result = []; walk(parse(source), (node) => { if (node.type === "CallExpression" && ["useEffect", "useEffectEvent", "useCallback", "useMemo", "useState", "useRef", "useSyncExternalStore"].includes(node.callee.name)) result.push({ hook: node.callee.name, body: source.slice(...node.range), args: node.arguments }); }); return result; }
const oldEffects = effects(baseline), newEffects = effects(current);
assert.equal(newEffects.length, oldEffects.length, "App retains all hooks in their original order.");
let preservedHooks = 0;
for (let index = 0; index < oldEffects.length; index++) {
  const old = oldEffects[index], next = newEffects[index]; assert.equal(next.hook, old.hook);
  if (old.body.includes('const focusScope = flowModalRef.current?.querySelector')) {
    assert.ok(next.body.includes("focusFlowModalContent(flowModalRef.current, activeFlowModal?.type)"));
    assert.equal(current.slice(...next.args[1].range), baseline.slice(...old.args[1].range), "Modal focus reacts to the same identity and step changes.");
  } else { assert.equal(next.body, old.body, `Hook ${index} retains its session/state/effect logic`); preservedHooks++; }
}
const result = { passed: true, movedBodies: manifest.length, unchangedFunctions, preservedHooks, changedFocusEffect: 1, note: "Byte preservation proves extraction scope; browser tests independently exercise delayed loading, interaction and focus." };
fs.writeFileSync(`${directory}/source-preservation.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
