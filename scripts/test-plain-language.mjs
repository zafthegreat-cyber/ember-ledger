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

console.log("Plain-language display-copy checks passed.");
