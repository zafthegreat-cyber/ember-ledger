// Audit 2026-11-14: the app ships no official game logos or Pokémon set logos
// (unlicensed third-party trademarks). Sets and games show text instead.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveGameArtwork, resolveSetArtwork } from "../src/utils/setArtwork.mjs";

let passed = 0;
const test = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };

test("artwork resolvers return nothing for any game or set", () => {
  for (const game of ["pokemon", "magic", "lorcana", "yugioh", "onepiece", "", undefined]) {
    assert.equal(resolveGameArtwork(game), null);
    assert.equal(resolveSetArtwork({ game, name: "Stellar Crown", code: "SCR" }), null);
  }
});

test("no logo files or logo registry are packaged", () => {
  assert.equal(existsSync("public/assets/catalog/game-logos"), false, "official game logos removed");
  assert.equal(existsSync("public/assets/catalog/set-logos"), false, "Pokémon set logos removed");
  assert.equal(existsSync("src/data/setArtwork.json"), false, "logo registry removed");
});

test("no built-in set data points at a packaged or official logo", () => {
  for (const file of ["src/data/pokemonSetCatalog.js", "src/data/pokemonCatalogCoreData.js"]) {
    if (!existsSync(file)) continue;
    assert.doesNotMatch(readFileSync(file, "utf8"), /(?:logoUrl|symbolUrl)\s*:\s*["'`][^"'`]*(?:set-logos|images\.pokemontcg\.io|pokemon\.com)/, file);
  }
});

test("app source does not reference the removed logo folders", () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(jsx?|mjs|css)$/.test(name) ? [full] : [];
  });
  const hits = walk("src").filter((file) => /assets\/catalog\/(?:game|set)-logos/.test(readFileSync(file, "utf8")));
  assert.deepEqual(hits, []);
});

console.log(`Set artwork checks passed: ${passed}`);
