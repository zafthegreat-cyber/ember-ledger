// Listing screenshot reading (eBay, Facebook Marketplace, Mercari, TCGplayer...).
import test from "node:test";
import assert from "node:assert/strict";
import { parseListingScreenshot, findListingPrice, listingQuery } from "../src/utils/listingScreenshotText.mjs";

test("eBay graded listing: site, title, price, shipping, grade, number", () => {
  const text = `9:41 ebay.com
Shop on eBay
Charizard ex 199/165 Special Illustration Rare 151 PSA 10 Gem Mint
US $425.00
or Best Offer
+$5.99 shipping
Condition: Graded - PSA 10: Gem Mint
Free returns
12 watchers`;
  const r = parseListingScreenshot(text);
  assert.equal(r.site, "eBay");
  assert.match(r.title, /Charizard ex 199\/165/);
  assert.equal(r.price, 425);
  assert.equal(r.shipping, 5.99);
  assert.equal(r.graded, true);
  assert.equal(r.gradingCompany, "PSA");
  assert.equal(r.grade, "10");
  assert.equal(r.number, "199/165");
  assert.match(r.query, /^Charizard ex/);
  assert.match(r.query, /199\/165$/);
  assert.doesNotMatch(r.query, /PSA|Gem/i);
});

test("Facebook Marketplace raw card: price before title, condition", () => {
  const text = `Marketplace
$80
Umbreon VMAX 215/203 Alt Art Evolving Skies NM raw
Listed 2 days ago in Norfolk, VA
Condition Used - Like New
Send seller a message`;
  const r = parseListingScreenshot(text);
  assert.equal(r.site, "Facebook Marketplace");
  assert.equal(r.price, 80);
  assert.match(r.title, /^Umbreon VMAX 215\/203/);
  assert.equal(r.graded, false);
  assert.equal(r.condition, "Near Mint");
  assert.equal(r.number, "215/203");
});

test("sold listings and free shipping; market price and was-prices are skipped", () => {
  const p = findListingPrice("Was $60.00\nSold $44.50\nFree shipping\nMarket Price $52.10");
  assert.deepEqual(p, { price: 44.5, shipping: 0, sold: true });
  const t = findListingPrice("TCGplayer\nMarket Price: $12.40\nListed price $10.99\nShipping: $1.31");
  assert.equal(t.price, 10.99);
  assert.equal(t.shipping, 1.31);
});

test("sealed product with comma price and no card number", () => {
  const r = parseListingScreenshot("Mercari\nPokemon Prismatic Evolutions Elite Trainer Box Factory Sealed\n$1,049.99\nShipping $12.00");
  assert.equal(r.site, "Mercari");
  assert.equal(r.price, 1049.99);
  assert.equal(r.condition, "Sealed / New");
  assert.match(r.query, /Prismatic Evolutions Elite Trainer Box/);
});

test("query drops selling noise but keeps the name", () => {
  assert.equal(listingQuery("🔥 Pikachu Illustrator PSA 9 MINT wow look!!", ""), "Pikachu Illustrator");
});

test("nothing readable gives an empty, honest result", () => {
  const r = parseListingScreenshot("12:01\n|||\n~~");
  assert.equal(r.price, null);
  assert.equal(r.title, "");
  assert.equal(r.certainty, "none");
});
