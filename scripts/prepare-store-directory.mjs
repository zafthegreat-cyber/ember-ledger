import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { STORE_DIRECTORY_STATES } from "../src/data/storeStates.js";

export async function storeDirectoryManifest(root = process.cwd()) {
  const files = new Set(await readdir(resolve(root, "src/data/generated")));
  const directories = {};
  for (const state of STORE_DIRECTORY_STATES) {
    if (!files.has(state.file)) continue;
    const bytes = await readFile(resolve(root, "src/data/generated", state.file));
    const rows = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error(`${state.code}: the cached store directory is invalid. Existing files were not changed.`);
    directories[state.code] = { file: state.file, count: rows.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  return { version: 1, directories };
}

export async function prepareStoreDirectory({ root = process.cwd(), check = false } = {}) {
  const manifest = await storeDirectoryManifest(root);
  const target = resolve(root, "src/data/storeDirectoryCoverage.json");
  const expected = `${JSON.stringify(manifest, null, 2)}\n`;
  const current = await readFile(target, "utf8").catch(error => { if (error.code !== "ENOENT") throw error; return ""; });
  if (check && current !== expected) throw new Error("The directory coverage manifest needs updating. Run node scripts/prepare-store-directory.mjs.");
  if (!check && current !== expected) await writeFile(target, expected);
  return manifest;
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const manifest = await prepareStoreDirectory({ check: process.argv.includes("--check") });
  console.log(`Store coverage checked: ${Object.keys(manifest.directories).length} cached state directories. No prices or owner records changed.`);
}
