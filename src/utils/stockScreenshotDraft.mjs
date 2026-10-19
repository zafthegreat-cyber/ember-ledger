import { COLLECTIBLE_GAMES } from "./collectibleGames.mjs";

// Screenshot/OCR content is untrusted third-party text. This module only proposes
// bounded draft fields; it never fetches links, executes text, or submits reports.
const MAX_TEXT_LENGTH = 24_000;
const MAX_ITEMS = 8;
const MAX_PRODUCT_NAME_LENGTH = 1_200;
const REPORT_TYPES = new Set(["stock_on_shelf", "low_stock", "no_stock", "restock_happening_now"]);
const PLATFORMS = new Set(["facebook", "discord", "other"]);
// The report form retains its existing Pokemon TCG label; all other choices come
// from the shared game registry rather than promising unsupported catalogs.
const CATEGORIES = new Set([...COLLECTIBLE_GAMES.map((game) => game.id === "pokemon" ? "Pokemon TCG" : game.name), "Other"]);

function text(value, limit = 200) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}

function normalize(value) {
  return text(value, MAX_TEXT_LENGTH).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function hasPhrase(haystack, phrase) {
  const needle = normalize(phrase);
  return needle.length >= 3 && (` ${haystack} `).includes(` ${needle} `);
}

function canonicalStore(store) {
  if (!store || typeof store !== "object") return null;
  const id = text(store.id ?? store.storeId ?? store.store_id, 120);
  if (!id) return null;
  return {
    id,
    name: text(store.name || store.storeName || store.store_name || store.nickname, 160),
    retailer: text(store.retailer || store.chain || store.storeGroup || store.store_group, 100),
    city: text(store.city, 100),
    address: text(store.address || store.streetAddress || store.street_address, 180),
  };
}

function storeMatches(content, store, canonical) {
  const aliases = [store.nickname, ...(Array.isArray(store.aliases) ? store.aliases : []),
    ...(Array.isArray(store.searchAliases) ? store.searchAliases : []),
    ...(Array.isArray(store.search_aliases) ? store.search_aliases : [])];
  if ([canonical.name, canonical.address, ...aliases].some((value) => hasPhrase(content, value))) return true;
  const retailerAliases = {
    walmart: ["walmart", "walmart supercenter", "wally world"],
    target: ["target", "tgt"],
    "best buy": ["best buy", "bbuy"],
    gamestop: ["gamestop", "game stop"],
    "barnes and noble": ["barnes and noble", "barnes noble", "b and n"],
  };
  const retailer = normalize(canonical.retailer);
  const retailerPresent = [canonical.retailer, ...(retailerAliases[retailer] || [])]
    .some((value) => hasPhrase(content, value));
  return retailerPresent;
}

function findStores(content, stores) {
  const matches = [];
  const seen = new Set();
  for (const store of Array.isArray(stores) ? stores : []) {
    const canonical = canonicalStore(store);
    if (!canonical || seen.has(canonical.id) || !storeMatches(content, store, canonical)) continue;
    seen.add(canonical.id);
    matches.push({ store, canonical });
  }
  // A named branch/address/city narrows a chain mention, but never selects it.
  const specific = matches.filter(({ store, canonical }) => [canonical.address, canonical.city, store.nickname,
    ...(Array.isArray(store.aliases) ? store.aliases : []),
    ...(Array.isArray(store.searchAliases) ? store.searchAliases : []),
    ...(Array.isArray(store.search_aliases) ? store.search_aliases : [])]
    .some((value) => normalize(value) !== normalize(canonical.retailer) && hasPhrase(content, value))
    || (normalize(canonical.name) !== normalize(canonical.retailer) && hasPhrase(content, canonical.name)));
  return (specific.length ? specific : matches).slice(0, 50).map(({ canonical }) => canonical);
}

const GAME_PATTERNS = [
  ["Pokemon TCG", /\b(?:pok[eé]mon|pkmn|poke mon)\b/i],
  ["Magic: The Gathering", /\b(?:magic(?:\s*:?\s*the gathering)?|mtg)\b/i],
  ["Yu-Gi-Oh!", /\byu[\s-]?gi[\s-]?oh!?\b/i],
  ["One Piece", /\bone\s+piece\b/i],
  ["Disney Lorcana", /\b(?:disney\s+)?lorcana\b/i],
];

// Only recognized product/set fragments become suggestions. Authors, prose,
// usernames, prices, quantities, links, and reaction labels are never copied.
const KNOWN_SETS = [
  ["Pokemon TCG", "Prismatic Evolutions", /\bprismatic(?:\s+evolutions)?\b/i],
  ["Pokemon TCG", "Surging Sparks", /\bsurging\s+sparks\b/i],
  ["Pokemon TCG", "Destined Rivals", /\bdestined\s+rivals\b/i],
  ["Pokemon TCG", "Journey Together", /\bjourney\s+together\b/i],
  ["Pokemon TCG", "White Flare", /\bwhite\s+flare\b/i],
  ["Pokemon TCG", "Black Bolt", /\bblack\s+bolt\b/i],
  ["Pokemon TCG", "Ascended Heroes", /\bascended\s+heroes\b/i],
  ["Pokemon TCG", "Perfect Order", /\bperfect\s+order\b/i],
  ["Pokemon TCG", "Mega Evolution", /\bmega\s+evolution\b/i],
  ["Pokemon TCG", "Phantasmal Flames", /\bphantasmal\s+flames\b/i],
  ["Pokemon TCG", "Fusion Strike", /\bfusion\s+strike\b/i],
  ["Pokemon TCG", "Evolving Skies", /\bevolving\s+skies\b/i],
  ["Pokemon TCG", "Celebrations", /\bcelebrations\b/i],
  ["Pokemon TCG", "Crown Zenith", /\bcrown\s+zenith\b/i],
  ["Pokemon TCG", "Paldean Fates", /\bpaldean\s+fates\b/i],
  ["Pokemon TCG", "Twilight Masquerade", /\btwilight\s+masquerade\b/i],
  ["Pokemon TCG", "Stellar Crown", /\bstellar\s+crown\b/i],
  ["Pokemon TCG", "Scarlet & Violet", /\bscarlet\s*(?:&|and)\s*violet\b/i],
  ["Pokemon TCG", "151", /\b(?:pok[eé]mon\s+)?151\b/i],
  ["Magic: The Gathering", "Final Fantasy", /\bfinal\s+fantasy\b/i],
  ["Magic: The Gathering", "Tarkir: Dragonstorm", /\btarkir(?:\s*:?\s*dragonstorm)?\b/i],
  ["Disney Lorcana", "The First Chapter", /\bthe\s+first\s+chapter\b/i],
  ["Disney Lorcana", "Into the Inklands", /\binto\s+the\s+inklands\b/i],
  ["Disney Lorcana", "Shimmering Skies", /\bshimmering\s+skies\b/i],
];

const PRODUCT_TYPES = [
  ["Elite Trainer Box", /\b(?:etbs?|elite\s+trainer\s+box(?:es)?)\b/i],
  ["Booster Box", /\b(?:booster\s+box(?:es)?|booster\s+displays?)\b/i],
  ["Booster Bundle", /\b(?:booster\s+bundles?|bundles?)\b/i],
  ["Booster Pack", /\b(?:booster\s+packs?|sleeved\s+packs?|blister\s+packs?)\b/i],
  ["Collection Box", /\b(?:collection\s+box(?:es)?|premium\s+collection)\b/i],
  ["Tin", /\b(?:mini\s+)?tins?\b/i],
  ["Starter Deck", /\b(?:starter|structure)\s+decks?\b/i],
  ["Commander Deck", /\bcommander\s+decks?\b/i],
  ["Gift Set", /\bgift\s+sets?\b/i],
];

function unsafeLine(line) {
  return /(?:https?:\/\/|www\.|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b|(?:^|\s)@[\w.-]+|<@!?\d+>|\b(?:system|assistant|developer)\s*:|\btoken\s*[:=]|\b(?:ignore\s+(?:all|previous|prior|the)|execute|run\s+(?:this|command)|api\s*key|password|secret)\b)/i.test(line)
    || /\b(?:\d[\s().-]*){10,}\b/.test(line);
}

function sourceClaim(line) {
  return /\?/.test(line) || /\b(?:maybe|might|could|should|probably|possibly|guess(?:ing)?|predict(?:ion|ed|ing)?|hop(?:e|ing)|expect(?:ed|ing)?|tomorrow|next\s+(?:week|day|month)|will|would|rumou?r|unconfirmed|reportedly|heard|hearsay|(?:employee|worker|staff|manager|someone|friend)\s+(?:said|says|told|claims?))\b/i.test(line);
}

function statusFor(line) {
  let value = normalize(line);
  const statuses = new Set();
  if (/\b(?:not out of stock|not sold out)\b/.test(value)) {
    statuses.add("stock_on_shelf");
    value = value.replace(/\b(?:not out of stock|not sold out)\b/g, " ");
  }
  if (/\b(?:not in stock|isnt in stock|arent in stock|no longer in stock|sold out|out of stock|no stock|empty shelves|shelves are empty|nothing left)\b/.test(value)) {
    statuses.add("no_stock");
    value = value.replace(/\b(?:not in stock|isnt in stock|arent in stock|no longer in stock)\b/g, " ");
  }
  value = value.replace(/\b(?:not|isnt|arent|no longer)\s+(?:currently\s+)?(?:restocking|stocking|low stock|available|on shelves|on the shelf)\b/g, " ");
  if (/\b(?:restocking now|stocking now|restock happening(?: right)? now|currently (?:being )?(?:re)?stocking|vendor (?:is )?stocking|being stocked(?: right)? now)\b/.test(value)) statuses.add("restock_happening_now");
  if (/\b(?:low stock|few left|limited stock|almost sold out)\b/.test(value)) statuses.add("low_stock");
  // "Almost sold out" is low stock, not an empty shelf.
  if (/\balmost sold out\b/.test(value)) statuses.delete("no_stock");
  if (/\b(?:in stock|on (?:the )?shel(?:f|ves)|available now|just restocked|freshly restocked)\b/.test(value)) statuses.add("stock_on_shelf");
  return statuses;
}

function productSuggestions(line, hasStatus) {
  const games = GAME_PATTERNS.flatMap(([category, pattern]) => {
    const match = pattern.exec(line);
    return match ? [{ category, name: category === "Pokemon TCG" ? "Pokémon TCG" : category, index: match.index, end: match.index + match[0].length, isSet: false }] : [];
  });
  const types = PRODUCT_TYPES.flatMap(([name, pattern]) => {
    const match = pattern.exec(line);
    return match ? [{ name, index: match.index, end: match.index + match[0].length }] : [];
  });
  const sets = KNOWN_SETS.flatMap(([category, name, pattern]) => {
    const match = pattern.exec(line);
    return match ? [{ category, name, index: match.index, end: match.index + match[0].length, isSet: true }] : [];
  });
  if (!games.length && !sets.length) {
    const etb = types.find((type) => type.name === "Elite Trainer Box");
    if (etb) games.push({ category: "Pokemon TCG", name: "Pokémon TCG", index: etb.index, end: etb.end, isSet: false });
  }
  const proposals = [];
  if (types.length) {
    // Associate each type with the nearest recognized set/game. A cross product
    // would invent "151 ETBs" from "Prismatic ETBs and 151 bundles".
    for (const type of types) {
      const distance = (anchor) => Math.max(0, type.index - anchor.end, anchor.index - type.end);
      const anchor = [...sets, ...games].sort((a, b) => distance(a) - distance(b) || Number(b.isSet) - Number(a.isSet))[0];
      if (anchor) proposals.push({ category: anchor.category, name: `${anchor.name} ${type.name}` });
    }
  } else if (hasStatus) {
    for (const { category, name } of sets.length ? sets : games) proposals.push({ category, name });
  }
  return proposals;
}

export function parseStockScreenshotText(input, { stores = [] } = {}) {
  const flags = new Set(["observed_time_required"]);
  const raw = typeof input === "string" ? input : "";
  if (raw.length > MAX_TEXT_LENGTH) flags.add("screenshot_text_truncated");
  const bounded = raw.slice(0, MAX_TEXT_LENGTH).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ");
  if (/\b\d{1,2}:\d{2}\b|\b\d+\s*(?:m|mins?|minutes?|h|hrs?|hours?|days?)\s*(?:ago)?\b|\b(?:yesterday|today|just now|tomorrow)\b/i.test(bounded)) flags.add("source_time_not_observed_time");
  const lines = bounded.split(/\r?\n|;+|\.(?:\s|$)/).map((line) => line.trim()).filter(Boolean);
  const safeLines = lines.filter((line) => !unsafeLine(line));
  if (safeLines.length !== lines.length) flags.add("text_needs_review");
  const storeCandidates = findStores(normalize(safeLines.join(" ")), stores);
  flags.add(storeCandidates.length ? "store_choice_required" : "store_not_identified");
  const statuses = new Set();
  const suggestions = new Map();
  const categories = new Set();
  for (const line of safeLines) {
    const claim = sourceClaim(line);
    const lineStatuses = claim ? new Set() : statusFor(line);
    if (claim) flags.add("indirect_or_future_claim");
    for (const status of lineStatuses) statuses.add(status);
    for (const item of productSuggestions(line, lineStatuses.size > 0)) {
      categories.add(item.category);
      if (suggestions.size < MAX_ITEMS) suggestions.set(item.name, item.name);
    }
  }
  // A generic grocery/phone post saying "in stock" is not a TCG stock report.
  const hasProductSignal = suggestions.size > 0;
  if (statuses.size !== 1 || !hasProductSignal) flags.add(statuses.size > 1 ? "status_conflict" : "status_needs_review");
  if (categories.size > 1) flags.add("multiple_product_categories");
  return {
    items: [...suggestions.values()],
    productCategory: categories.size > 1 ? "Other" : [...categories][0] || "",
    reportType: statuses.size === 1 && hasProductSignal ? [...statuses][0] : "",
    storeCandidates,
    flags: [...flags],
  };
}

function validateLocalTime(date, time, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (year < 1970 || hour > 23 || minute > 59) return false;
  const observed = new Date(year, month - 1, day, hour, minute);
  if (observed.getFullYear() !== year || observed.getMonth() !== month - 1 || observed.getDate() !== day
    || observed.getHours() !== hour || observed.getMinutes() !== minute) return false;
  return observed.getTime() <= now + 15 * 60_000;
}

function failure(error) {
  return { ok: false, patch: {}, error, preservedFields: [], appliedFields: [] };
}

function blank(value) {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

export function createStockScreenshotPatch(draft = {}, choices = {}, { stores = [], now = Date.now() } = {}) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return failure("Open a stock-report draft before applying screenshot details.");
  if (!choices || typeof choices !== "object") return failure("Review the screenshot details before applying them.");
  if (choices.observedTimeConfirmed !== true) return failure("Confirm when the stock was actually observed. A post time or screenshot clock is not the observed time.");
  const reportDate = text(choices.reportDate, 40);
  const reportTime = text(choices.reportTime, 40);
  if (!validateLocalTime(reportDate, reportTime, Number(now))) return failure("Enter a valid observed date and time, no more than 15 minutes in the future.");
  const platform = text(choices.platform, 20).toLowerCase();
  if (!PLATFORMS.has(platform)) return failure("Choose Facebook, Discord, or another screenshot source.");
  const replace = choices.replaceEnteredFields === true;
  const existingStoreId = text(draft.storeId, 120);
  const keepManualStore = !replace && blank(existingStoreId) && draft.storeConfirmed === true && Boolean(text(draft.manualLocation, 200));
  const selectedStoreId = keepManualStore ? "" : !replace && existingStoreId ? existingStoreId : text(choices.storeId, 120) || existingStoreId;
  const knownStore = (Array.isArray(stores) ? stores : []).map(canonicalStore).find((store) => store?.id === selectedStoreId);
  if (!knownStore && !keepManualStore) return failure("Choose and confirm the exact store, or keep your confirmed manual location.");
  const patch = {};
  const preservedFields = [];
  if (knownStore && (replace || blank(draft.storeId))) patch.storeId = knownStore.id;
  if (!replace && existingStoreId && text(choices.storeId, 120) && text(choices.storeId, 120) !== existingStoreId) preservedFields.push("storeId");
  if (keepManualStore && text(choices.storeId, 120)) preservedFields.push("storeId");
  // Keep every reviewed name supported by the form. Read one extra character
  // only to reject an oversized value rather than silently save a partial item.
  const productName = text(choices.productName, MAX_PRODUCT_NAME_LENGTH + 1);
  if (productName.length > MAX_PRODUCT_NAME_LENGTH) return failure("Keep Products mentioned to 1,200 characters or fewer. Review and shorten the names before applying; your entered text has been kept.");
  const productCategory = text(choices.productCategory, 60);
  const reportType = text(choices.reportType, 40);
  if (productName && unsafeLine(productName)) return failure("Keep the product field to product names. Remove links, contact details, or instructions.");
  if (productCategory && !CATEGORIES.has(productCategory)) return failure("Choose a supported product category or Other.");
  if (!REPORT_TYPES.has(reportType)) return failure("Choose a stock status after reviewing the screenshot.");
  for (const [field, value] of Object.entries({ productName, productCategory, reportType })) {
    const untouchedStatusDefault = field === "reportType" && draft.reportTypeTouched === false;
    if (value && (replace || blank(draft[field]) || untouchedStatusDefault)) patch[field] = value;
    else if (value && !blank(draft[field]) && value !== draft[field]) preservedFields.push(field);
  }
  if (replace && productName && normalize(productName) !== normalize(draft.productName)) {
    // Changing a reviewed name must never retain another item's catalog identity,
    // set or artwork. User-supplied shelf/proof photos remain untouched.
    for (const [field, empty] of Object.entries({ catalogProductId: "", catalog_product_id: "", productId: "", product_id: "",
      catalogProductName: "", catalog_product_name: "", productType: "", product_type: "", productSetName: "", product_set_name: "", productImageUrl: "", product_image_url: "",
      catalogProductSnapshot: null, catalog_product_snapshot: null, productSnapshot: null, product_snapshot: null })) {
      if (["catalogProductId", "catalogProductName", "productType", "productSetName", "productImageUrl", "catalogProductSnapshot"].includes(field) || Object.hasOwn(draft, field)) patch[field] = empty;
    }
    patch.manualItemEntry = true;
  }
  Object.assign(patch, {
    dateMode: "pick_date",
    reportDate,
    reportTime,
    reportTimeManuallyEdited: true,
    screenshotObservedTimeConfirmed: true,
    reportTypeTouched: true,
    screenshotImportReviewed: true,
    screenshotSourcePlatform: platform,
    sourceType: "text_screenshot",
    proofType: "text_screenshot",
    visibility: "private_from_map",
    verified: false,
    needsReview: true,
  });
  return { ok: true, patch, error: "", preservedFields, appliedFields: Object.keys(patch).filter((field) => ["storeId", "productName", "productCategory", "reportType"].includes(field)) };
}
