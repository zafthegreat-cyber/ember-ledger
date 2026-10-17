import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Source contracts must follow the active render boundaries. A loose file scan
// would let retired or unmounted fragments satisfy checks for shipped screens.
export function readDeferredAppSource(entry = "src/App.jsx") {
  const file = path.resolve(entry);
  const source = fs.readFileSync(file, "utf8");
  const modules = [...source.matchAll(/const (\w+) = lazy\(\(\) => import\(["'](\.\/features\/deferredViews\/[^"']+)["']\)\);/g)];
  return [source, ...modules.map(([, component, specifier]) => {
    assert.match(source, new RegExp(`<${component}\\b`), `${component} must be mounted by App`);
    const target = path.resolve(path.dirname(file), specifier.endsWith(".jsx") ? specifier : `${specifier}.jsx`);
    const moduleSource = fs.readFileSync(target, "utf8");
    assert.match(moduleSource, new RegExp(`export default function ${component}\\b`), `${component} must export the active renderer`);
    return moduleSource;
  })].join("\n");
}
