// Parses App.jsx plus the modules split out of it (Nov 15, 2026) for tests that
// pull real functions out of the source. Each file is parsed on its own (they
// import from each other), and node ranges are shifted so they index into the
// returned combined `source` string.
const fs = require("node:fs");
const path = require("node:path");
const espree = require("espree");

const APP_SOURCE_FILES = ["src/App.jsx", "src/features/vault/VaultPanels.jsx", "src/features/vault/vaultItemHelpers.jsx"];

function shiftRanges(node, offset) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.range)) node.range = [node.range[0] + offset, node.range[1] + offset];
  for (const [key, value] of Object.entries(node)) {
    if (key === "range" || key === "loc") continue;
    if (Array.isArray(value)) value.forEach((child) => shiftRanges(child, offset));
    else if (value && typeof value.type === "string") shiftRanges(value, offset);
  }
}

function parseAppSources(root = path.resolve(__dirname, "../..")) {
  let source = "";
  const asts = [];
  for (const rel of APP_SOURCE_FILES) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const offset = source.length;
    source += `${text}\n`;
    const ast = espree.parse(text, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
    if (offset) shiftRanges(ast, offset);
    asts.push(ast);
  }
  return { source, asts, ast: { type: "Program", body: asts.flatMap((ast) => ast.body) } };
}

module.exports = { APP_SOURCE_FILES, parseAppSources };
