import fs from "node:fs";
import path from "node:path";

// Follow the stylesheet entry's actual local import graph. Unimported legacy
// files must not accidentally satisfy an active presentation contract.
export function readLocalCss(entry, visited = new Set()) {
  const file = path.resolve(entry);
  if (visited.has(file)) return "";
  visited.add(file);
  const source = fs.readFileSync(file, "utf8");
  return source.replace(/@import\s+["']([^"']+)["']\s*;/g, (statement, specifier) => {
    if (!specifier.startsWith(".")) return statement;
    return readLocalCss(path.resolve(path.dirname(file), specifier), visited);
  });
}
