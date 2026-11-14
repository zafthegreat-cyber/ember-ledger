import assert from "node:assert/strict";
import { plainLanguageText } from "../src/config/plainLanguage.js";

assert.equal(plainLanguageText("Ember & Tide"), "Code 3 TCG");
assert.equal(plainLanguageText("Ember and Tide navigation"), "Code 3 TCG navigation");
assert.equal(plainLanguageText("E&T TCG account"), "Code 3 TCG account");
assert.equal(plainLanguageText("E&amp;T account"), "Code 3 TCG account");
assert.equal(plainLanguageText("Private Business Hub"), "Code 3 TCG");
assert.equal(plainLanguageText("Open Vault"), "Open Collection");
assert.equal(plainLanguageText("Move to Forge"), "Move to Resale Inventory");
assert.equal(plainLanguageText("Ask Ember"), "Business Assistant");
assert.equal(plainLanguageText("Ask Ember Assist"), "Business Assistant", "assistant label must not repeat Assist after rebranding");
assert.equal(plainLanguageText("Open Ask Ember Assist for help"), "Open Business Assistant for help");
assert.equal(plainLanguageText("Flip Scout"), "Deal Finder");
assert.equal(plainLanguageText("Dragon Vault Elite Trainer Box"), "Dragon Vault Elite Trainer Box", "product names are not rebranded");
assert.equal(plainLanguageText("Smoke Personal Vault Item"), "Smoke Personal Vault Item", "owner-entered record titles are not rebranded");
assert.equal(plainLanguageText("Focused Forge Inventory Box"), "Focused Forge Inventory Box", "inventory titles are not rebranded");
assert.equal(plainLanguageText("Obsidian Flames booster"), "Obsidian Flames booster", "Pokémon set names are preserved");

// Audit 2026-11-14: developer notes must not ship as user-facing copy.
{
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const DEV_PHRASES = [/not fully wired/i, /beta\/placeholder/i, /Dynamic release notes/i, /pretend unsupported backends/i, /\bin Phase 1\b/i, /Open Beacon/, /Edit supported/, /UI polish checkpoint/i, /TCGPLAYER_PRODUCT_ID:/];
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "data" ? [] : walk(full);
    return /\.(jsx|js)$/.test(name) ? [full] : [];
  });
  const hits = [];
  for (const file of walk("src")) {
    const text = readFileSync(file, "utf8");
    for (const phrase of DEV_PHRASES) if (phrase.test(text)) hits.push(`${file}: ${phrase}`);
  }
  assert.deepEqual(hits, [], "developer notes found in user-facing source");
}

console.log("Plain-language display-copy checks passed.");

// Nov 14: Collect / Find / Sell naming — Wishlist reads as Wants everywhere.
assert.equal(plainLanguageText("Wishlist"), "Wants");
assert.equal(plainLanguageText("Add to Wishlist"), "Add to Wants");
assert.equal(plainLanguageText("Your wishlist is empty"), "Your wants list is empty");
assert.equal(plainLanguageText("Wishlist alerts and saved Market searches"), "Wants alerts and saved Market searches");
assert.equal(plainLanguageText("Open Vault"), "Open Collection");
assert.equal(plainLanguageText("Watchlist"), "Watchlist", "watched stores/products keep their own name");
console.log("Collect / Find / Sell naming checks passed.");
