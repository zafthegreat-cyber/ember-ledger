// Listing screenshots (Nov 17 2026, owner: "scan screenshots i take from ebay or
// marketplace ect"). Reads the text of a screenshot of a listing on eBay,
// Facebook Marketplace, Mercari, TCGplayer, Whatnot, OfferUp and similar, and
// pulls out the site, title, price, shipping, condition, grade and card number.
// Pure. Nothing is saved until the person reviews it; no link is followed.
import { findCardNumbers } from "./cardPhotoText.mjs";
import { parseSlabLabel } from "./slabLabelText.mjs";

const clean = (value = "") => String(value).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 20_000);
const linesOf = (value = "") => clean(value).split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);

export const LISTING_SITES = Object.freeze([
  { key: "ebay", label: "eBay", match: /\be\s?bay\b/i },
  { key: "facebook", label: "Facebook Marketplace", match: /\bfacebook\b|\bmarketplace\b|\bmessenger\b|\bsend seller a message\b/i },
  { key: "mercari", label: "Mercari", match: /\bmercari\b/i },
  { key: "tcgplayer", label: "TCGplayer", match: /\btcg\s?player\b/i },
  { key: "whatnot", label: "Whatnot", match: /\bwhatnot\b/i },
  { key: "offerup", label: "OfferUp", match: /\boffer\s?up\b/i },
  { key: "craigslist", label: "Craigslist", match: /\bcraigslist\b/i },
  { key: "cardmarket", label: "Cardmarket", match: /\bcardmarket\b/i },
  { key: "collectr", label: "Collectr", match: /\bcollectr\b/i },
  { key: "depop", label: "Depop", match: /\bdepop\b/i },
]);

// Lines that are page furniture, not the item title.
const UI_LINE = /\b(shipping|delivery|returns?|seller|feedback|watch(ers|ing|list)?|buy it now|add to cart|make offer|best offer|condition\s*:|listed|ago|message|sponsored|see all|similar|shop on ebay|item specifics|description|located in|estimated|payments?|sold by|followers|reviews?|save|share|report|search|sign in|home|notifications|people are|in \d+ carts?|bids?\b|time left|ends in|free returns|authenticity guarantee|top rated|offers?|details)\b/i;
const CARD_WORDS = /\b(pok[eé]mon|card|holo|reverse|psa|cgc|bgs|sgc|tag|ex|gx|vmax|vstar|v|full art|alt art|illustration rare|sir|secret|promo|1st edition|shadowless|booster|etb|elite trainer|bundle|box|pack|tin|sealed|collection|one piece|lorcana|magic|yu-?gi-?oh|mtg|charizard|pikachu|umbreon|mew|rare|trainer|lot)\b/i;
const CONDITIONS = [
  [/\bnear\s*mint\b|\bNM\b|\bNM[-/]M\b/i, "Near Mint"],
  [/\blightly\s*played\b|\bLP\b/i, "Lightly Played"],
  [/\bmoderately\s*played\b|\bMP\b/i, "Moderately Played"],
  [/\bheavily\s*played\b|\bHP\b(?!\s*\d)/i, "Heavily Played"],
  [/\bdamaged\b|\bDMG\b/i, "Damaged"],
  [/\bfactory\s*sealed\b|\bsealed\b|\bbrand\s*new\b|\bnew\b/i, "Sealed / New"],
  [/\bused\b/i, "Used"],
];

const PRICE = /(?:US\s?)?\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g;
const toNumber = (whole, cents) => Number(`${String(whole).replace(/,/g, "")}.${cents || "00"}`);

/** Every dollar amount on a line, as numbers. */
export function pricesIn(line = "") {
  return [...String(line).matchAll(PRICE)].map((m) => toNumber(m[1], m[2])).filter((value) => Number.isFinite(value) && value > 0 && value < 1_000_000);
}

/** Asking or sold price, and shipping when shown. */
export function findListingPrice(text = "") {
  const lines = linesOf(text);
  let price = null;
  let shipping = null;
  let sold = false;
  for (const line of lines) {
    const values = pricesIn(line);
    if (/\bfree\s*(shipping|delivery|postage)\b/i.test(line) && shipping === null) shipping = 0;
    if (!values.length) continue;
    if (/\b(shipping|delivery|postage)\b/i.test(line)) { if (shipping === null) shipping = values[0]; continue; }
    if (/\b(tax|fee|was|list price|market price|msrp|coupon|save|off|retail|avg|average|est\.?|estimated|bid increment)\b/i.test(line)) continue;
    if (price === null) {
      price = values[0];
      sold = /\bsold\b/i.test(line);
    }
  }
  if (!sold) sold = /\bsold\s+(for|on|\w{3}\s+\d)/i.test(clean(text));
  return { price, shipping, sold };
}

/** The line most likely to be the item title. */
export function findListingTitle(text = "") {
  let best = "";
  let bestScore = 0;
  for (const line of linesOf(text)) {
    const plain = line.replace(PRICE, " ").replace(/\s+/g, " ").trim();
    if (plain.length < 8 || plain.length > 160 || UI_LINE.test(plain)) continue;
    const letters = (plain.match(/[A-Za-zÀ-ž]/g) || []).length;
    if (letters / plain.length < 0.5) continue;
    let score = Math.min(plain.length, 80) / 20;
    if (CARD_WORDS.test(plain)) score += 4;
    if (findCardNumbers(plain).length) score += 4;
    if (/\b(PSA|CGC|BGS|SGC|TAG)\s*\d/i.test(plain)) score += 2;
    if (plain.split(" ").length < 3) score -= 2;
    if (score > bestScore) { best = plain; bestScore = score; }
  }
  return bestScore >= 4 ? best : "";
}

export function findListingCondition(text = "") {
  const all = clean(text);
  const labelled = all.match(/condition\s*:?\s*([^\n]{2,60})/i)?.[1] || "";
  // Card grades (NM, LP...) beat a site's generic "Used - Like New".
  const cardGrades = CONDITIONS.slice(0, 5), generic = CONDITIONS.slice(5);
  for (const [pattern, label] of cardGrades) if (pattern.test(all)) return label;
  for (const source of [labelled, all]) for (const [pattern, label] of generic) if (source && pattern.test(source)) return label;
  return "";
}

// Words that help a person read the title but not the catalog search.
const NOISE = /\b(pok[eé]mon|tcg|card|cards|english|eng|nm|near mint|lp|mp|hp|lightly played|moderately played|raw|ungraded|graded|gem\s*mint|gem\s*mt|mint|pristine|black label|slab|slabbed|authentic|official|rare|wow|look|nice|hot|fresh|pack\s*fresh|free\s*shipping|ships?\s*fast|lot|of|the|and|w\/?|with|psa|cgc|bgs|sgc|tag)\b/gi;

/** A catalog search from the title: card name and number, without grader, condition and selling words. */
export function listingQuery(title = "", number = "") {
  const words = String(title)
    .replace(/\b(PSA|CGC|BGS|SGC|TAG|ACE)\s*\d{1,2}(\.5)?\b/gi, " ")
    .replace(/[#]?\b[A-Z]{0,4}\d{1,3}\s*\/\s*[A-Z]{0,4}\d{1,3}\b/gi, " ")
    .replace(NOISE, " ")
    .replace(/[^A-Za-zÀ-ž0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 1 || /\d/.test(word))
    .slice(0, 6);
  return [...words, number].filter(Boolean).join(" ").slice(0, 180);
}

/** Everything a listing screenshot says, for review. */
export function parseListingScreenshot(text = "") {
  const all = clean(text);
  const site = LISTING_SITES.find((item) => item.match.test(all));
  const title = findListingTitle(all);
  const { price, shipping, sold } = findListingPrice(all);
  const condition = findListingCondition(all);
  const number = findCardNumbers(title)[0]?.value || findCardNumbers(all)[0]?.value || "";
  const slab = parseSlabLabel([title, all.match(/condition\s*:?\s*([^\n]{2,80})/i)?.[1] || ""].join("\n"));
  const graded = Boolean(slab.gradingCompany && slab.grade);
  const query = listingQuery(title, number);
  const found = [site, title, price !== null, number].filter(Boolean).length;
  return {
    site: site?.label || "",
    title,
    price,
    shipping,
    sold,
    condition: graded ? "" : condition,
    graded,
    gradingCompany: graded ? slab.gradingCompany : "",
    grade: graded ? slab.grade : "",
    number,
    query,
    certainty: found >= 3 ? "most" : found ? "some" : "none",
    text: all.trim(),
  };
}
