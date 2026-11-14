import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Source contracts must follow the active render boundaries. A loose file scan
// would let retired or unmounted fragments satisfy checks for shipped screens.
// Pieces moved out of App.jsx unchanged (Nov 15, 2026) are read along with it.
const EXTRACTED_APP_MODULES = ["features/vault/VaultPanels.jsx", "features/vault/vaultItemHelpers.jsx"];

export function readAppSource(entry = "src/App.jsx") {
  const file = path.resolve(entry);
  const source = fs.readFileSync(file, "utf8");
  return [source, ...EXTRACTED_APP_MODULES.map((rel) => path.resolve(path.dirname(file), rel)).filter((target) => fs.existsSync(target)).map((target) => fs.readFileSync(target, "utf8"))].join("\n");
}

export function readDeferredAppSource(entry = "src/App.jsx") {
  const file = path.resolve(entry);
  const source = readAppSource(file);
  const modules = [...source.matchAll(/const (\w+) = lazy\(\(\) => import\(["'](\.\/features\/deferredViews\/[^"']+)["']\)\);/g)];
  return [source, ...modules.map(([, component, specifier]) => {
    assert.match(source, new RegExp(`<${component}\\b`), `${component} must be mounted by App`);
    const target = path.resolve(path.dirname(file), specifier.endsWith(".jsx") ? specifier : `${specifier}.jsx`);
    const moduleSource = fs.readFileSync(target, "utf8");
    assert.match(moduleSource, new RegExp(`export default function ${component}\\b`), `${component} must export the active renderer`);
    return moduleSource;
  })].join("\n");
}
