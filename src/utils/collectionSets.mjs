import { POKEMON_SET_ALIAS_ROWS } from "../data/catalogSearchAliases.mjs";
import { inferOwnedItemPurpose, OWNED_ITEM_PURPOSES } from "../features/ownedItems/ownedItemPurpose.js";
import { getPortfolioItemValuation, summarizePortfolio } from "./collectionPortfolio.mjs";
import { getItemImageUrl } from "./productDisplayUtils.js";
import { getRecordGame, getRecordGameLabel, normalizeCollectibleGame } from "./collectibleGames.mjs";

// Read-only collection presentation. Product release dates, catalog prices and
// card-number denominators are never promoted into official set metadata.
function text(value) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function first(source, fields) { return fields.map((field) => text(source?.[field])).find(Boolean) || ""; }
function normalized(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function nameKey(value, game = "pokemon") {
  return normalized(game === "pokemon" ? text(value).replace(/^(?:sv\d*(?:\.\d+)?|swsh\d*|sm\d*|xy\d*|bw\d*|me\d*)\s*[:–—-]\s*/i, "") : value);
}
const aliasTargets = new Map();
for (const row of POKEMON_SET_ALIAS_ROWS) {
  const target = nameKey(row.name);
  for (const alias of [row.name, row.setId, row.ptcgoCode, ...(row.aliases || [])]) {
    const key = nameKey(alias);
    if (!key) continue;
    if (!aliasTargets.has(key)) aliasTargets.set(key, new Set());
    aliasTargets.get(key).add(target);
  }
}
function canonicalKey(value, game = "pokemon") {
  const key = nameKey(value, game);
  if (game !== "pokemon") return key;
  const matches = aliasTargets.get(key);
  return matches?.size === 1 ? [...matches][0] : key;
}
function setName(record) { return first(record, ["setName", "set_name", "expansionOfficialName", "expansion_official_name", "expansionDisplayName", "expansion_display_name", "expansion"]); }
function metadataName(record) { return first(record, ["name", "setName", "set_name", "expansionOfficialName", "expansion_official_name"]); }
function aliases(record, game) {
  return [metadataName(record), first(record, ["setId", "set_id", "id"]), first(record, ["code", "setCode", "set_code", "ptcgoCode"]), ...(Array.isArray(record.aliases) ? record.aliases : []), ...(Array.isArray(record.setAliases) ? record.setAliases : [])].map((value) => nameKey(value, game)).filter(Boolean);
}
function validDate(value) {
  const candidate = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(candidate);
  if (!match) return "";
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && (!candidate.includes("T") || Number.isFinite(Date.parse(candidate))) ? date : "";
}
function positiveInteger(value) {
  const candidate = text(value);
  if (!/^\d+$/.test(candidate)) return null;
  const number = Number(candidate);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function totalFor(record) {
  for (const key of ["total", "totalCards", "total_cards", "printedTotal", "printed_total"]) { const total = positiveInteger(record[key]); if (total !== null) return total; }
  return null;
}
function binder(record) {
  const classification = normalized(first(record, ["productClassification", "product_classification"]));
  return classification === "binder or collection" || classification === "binder" || [record.recordType, record.type].some((value) => normalized(value) === "binder");
}
function singleOrSealed(record) {
  const classification = normalized(first(record, ["productClassification", "product_classification"]));
  const type = normalized(first(record, ["catalogType", "catalog_type", "catalogItemType", "catalog_item_type", "productKind", "product_kind"]));
  const description = normalized([record.productType, record.product_type, record.sealedProductType, record.sealed_product_type].filter(Boolean).join(" "));
  if (classification === "sealed product" || record.isSealed === true || record.is_sealed === true || type === "sealed" || type === "sealed product") return "sealed";
  if (["binder or collection", "bulk", "topps or vintage non tcg", "pokemon merchandise", "accessory", "mixed lot"].includes(classification)) return "other";
  if (["raw card", "graded card", "single", "single card"].includes(classification) || ["card", "single", "single card"].includes(type)) return "single";
  if (/\bsingle card\b|\bindividual card\b|\bgraded card\b|\bpromo card\b/.test(description)) return "single";
  if (/\bsealed\b|\bbooster\b|\belite trainer\b|\bbox\b|\btin\b|\bbundle\b|\bpack\b|\bblister\b/.test(description)) return "sealed";
  return cardNumber(record) ? "single" : "other";
}
function cardNumber(record) {
  const detail = record.cardDetails || record.card_details || record.tcgCardDetails || record.tcg_card_details || {};
  return first(record, ["cardNumber", "card_number", "setNumber", "set_number", "number"]) || first(detail, ["cardNumber", "card_number", "number"]);
}
function numberKey(value) {
  const numerator = text(value).split("/")[0].replace(/\s+/g, "").toLowerCase();
  // Only normalize plain zero-padding; TG/GG/promo prefixes remain distinct.
  return /^\d+[a-z]?$/.test(numerator) ? numerator.replace(/^0+(?=\d)/, "") : normalized(numerator).replace(/ /g, "");
}
function language(record) {
  const candidate = first(record, ["language", "languageName", "language_name", "languageCode", "language_code", "cardLanguage", "card_language"]);
  const key = normalized(candidate);
  const names = { en: "English", eng: "English", english: "English", "en us": "English", "en gb": "English", ja: "Japanese", jp: "Japanese", jpn: "Japanese", japanese: "Japanese", zh: "Chinese", chinese: "Chinese", "zh cn": "Chinese (Simplified)", "zh hans": "Chinese (Simplified)", "simplified chinese": "Chinese (Simplified)", "chinese simplified": "Chinese (Simplified)", "zh tw": "Chinese (Traditional)", "zh hant": "Chinese (Traditional)", "traditional chinese": "Chinese (Traditional)", "chinese traditional": "Chinese (Traditional)", ko: "Korean", korean: "Korean", fr: "French", french: "French", de: "German", german: "German", it: "Italian", italian: "Italian", es: "Spanish", spanish: "Spanish", pt: "Portuguese", portuguese: "Portuguese" };
  return key ? names[key] || candidate : "";
}
function isOwnedCollectionItem(record) {
  // Callers pass their already scoped personal collection. If a record carries
  // purpose/workspace clues, enforce them; an entirely unannotated fixture is
  // not silently reclassified or written back to the original record.
  const inferred = inferOwnedItemPurpose(record);
  const explicit = first(record, ["ownedItemPurpose", "itemPurpose"]);
  return inferred === OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION || (!explicit && inferred === OWNED_ITEM_PURPOSES.UNASSIGNED);
}
function recordLanguageKey(record) { return language(record) || "language-not-recorded"; }
function cardIdentity(record) {
  const number = numberKey(cardNumber(record));
  if (number) return `${recordLanguageKey(record)}:number:${number}`;
  // A product identifier can distinguish cards without a number. The record ID
  // is not a catalog identity: two physical records might be the same card.
  const productId = first(record, ["catalogProductId", "catalog_product_id", "sourceProductId", "source_product_id", "tcgplayerProductId", "tcgplayer_product_id", "externalCardId", "external_card_id"]);
  return productId ? `${recordLanguageKey(record)}:product:${productId}` : "";
}
function hasArtwork(record) { return Boolean(getItemImageUrl(record)); }
function uniqueMetadataValue(records, reader) {
  const values = [...new Set(records.map(reader).filter((value) => value !== null && value !== ""))];
  return values.length === 1 ? values[0] : null;
}

export function buildCollectionSetRows({ items = [], knownSets = [], catalogProducts = [] } = {}) {
  const groups = new Map();
  const aliasGroups = new Map();
  const identity = (record) => {
    const gameId = getRecordGame(record);
    const gameName = getRecordGameLabel(record);
    // Unsupported explicit games stay separate from both unrecorded games and
    // each other without inventing support for another catalog.
    const namespace = gameId === "unspecified" && gameName !== "Game not recorded" ? `${gameId}:${normalized(gameName)}` : gameId;
    return { gameId, gameName, namespace };
  };
  const ensure = (key, name, game) => {
    if (!groups.has(key)) groups.set(key, { key, name, ...game, metadata: [], ownedItems: [], catalogRecords: [] });
    return groups.get(key);
  };
  for (const metadata of knownSets) {
    const name = metadataName(metadata);
    if (!name) continue;
    const game = identity({ ...metadata, setName: name });
    const key = `${game.namespace}:${canonicalKey(name, game.gameId)}`;
    const group = ensure(key, name, game);
    group.metadata.push(metadata);
    for (const alias of aliases(metadata, game.gameId)) {
      const aliasKey = `${game.namespace}:${alias}`;
      if (!aliasGroups.has(aliasKey)) aliasGroups.set(aliasKey, new Set());
      aliasGroups.get(aliasKey).add(key);
    }
  }
  const resolve = (record) => {
    const game = identity(record);
    const name = setName(record);
    if (name) {
      const canonical = `${game.namespace}:${canonicalKey(name, game.gameId)}`;
      const matches = aliasGroups.get(`${game.namespace}:${nameKey(name, game.gameId)}`);
      // An ambiguous short code never moves a named custom set into an
      // unrelated group. A full explicit name takes priority over setCode.
      const globallyAmbiguous = game.gameId === "pokemon" && (aliasTargets.get(nameKey(name))?.size || 0) > 1;
      const key = matches?.size === 1 && !globallyAmbiguous ? [...matches][0] : canonical;
      return ensure(key, name, game);
    }
    const code = first(record, ["setCode", "set_code", "expansionCode", "expansion_code", "setId", "set_id", "expansionId", "expansion_id"]);
    if (!code) return null;
    const matches = aliasGroups.get(`${game.namespace}:${nameKey(code, game.gameId)}`);
    const globallyAmbiguous = game.gameId === "pokemon" && (aliasTargets.get(nameKey(code))?.size || 0) > 1;
    if (matches?.size === 1 && !globallyAmbiguous) return groups.get([...matches][0]);
    const canonical = `${game.namespace}:${canonicalKey(code, game.gameId)}`;
    return game.gameId === "pokemon" && aliasTargets.get(nameKey(code))?.size === 1 ? groups.get(canonical) || null : null;
  };
  for (const item of items) { if (item && !binder(item) && isOwnedCollectionItem(item)) resolve(item)?.ownedItems.push(item); }
  for (const product of catalogProducts) { if (product && !binder(product) && setName(product)) resolve(product)?.catalogRecords.push(product); }
  return [...groups.values()].map((group) => {
    const ownedCards = group.ownedItems.filter((item) => singleOrSealed(item) === "single" && getPortfolioItemValuation(item).quantity > 0);
    const identities = new Set(ownedCards.map(cardIdentity).filter(Boolean));
    const languages = [...new Set([...group.ownedItems, ...group.catalogRecords].map(language).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const ownedLanguages = [...new Set(ownedCards.map(language).filter(Boolean))];
    const hasUnknownCardLanguage = ownedCards.some((item) => !language(item));
    const languageProgressAvailable = ownedLanguages.length <= 1 && !(ownedLanguages.length && hasUnknownCardLanguage);
    const totalCards = uniqueMetadataValue(group.metadata, totalFor);
    const uniqueCardCount = identities.size;
    const unknownCardIdentityCount = ownedCards.filter((item) => !cardIdentity(item)).length;
    const progressPercent = totalCards !== null && languageProgressAvailable ? Math.min(100, Math.round(uniqueCardCount / totalCards * 100)) : null;
    const valuation = summarizePortfolio(group.ownedItems);
    const artworkRecord = group.ownedItems.find(hasArtwork) || group.catalogRecords.find(hasArtwork) || group.ownedItems[0] || group.catalogRecords[0] || null;
    const artworkSource = artworkRecord && hasArtwork(artworkRecord) ? group.ownedItems.includes(artworkRecord) ? "owned" : "catalog" : "";
    const sealedItems = group.ownedItems.filter((item) => singleOrSealed(item) === "sealed");
    return {
      id: `set:${encodeURIComponent(group.key)}`, key: group.key, name: group.name, gameId: group.gameId, gameName: group.gameName,
      code: uniqueMetadataValue(group.metadata, (record) => first(record, ["code", "setCode", "set_code", "ptcgoCode"])) || "",
      series: uniqueMetadataValue(group.metadata, (record) => first(record, ["series"])) || "",
      releaseDate: uniqueMetadataValue(group.metadata, (record) => validDate(first(record, ["releaseDate", "release_date"]))) || "",
      logoUrl: uniqueMetadataValue(group.metadata, (record) => first(record, ["logoUrl", "logo_url"])) || "",
      symbolUrl: uniqueMetadataValue(group.metadata, (record) => first(record, ["symbolUrl", "symbol_url"])) || "",
      ownedItems: group.ownedItems, artworkRecord, artworkSource,
      totalValue: valuation.total, knownValueCount: valuation.knownCount, itemCount: group.ownedItems.length,
      unknownValueCount: valuation.unknownCount, valuationLabel: valuation.valuationLabel, isValueValid: valuation.isValid,
      uniqueCardCount, unknownCardIdentityCount,
      ownedCardQuantity: ownedCards.reduce((sum, item) => sum + getPortfolioItemValuation(item).quantity, 0),
      sealedCount: sealedItems.length, sealedQuantity: summarizePortfolio(sealedItems).quantity,
      catalogCardCount: new Set(group.catalogRecords.filter((item) => singleOrSealed(item) === "single").map(cardIdentity).filter(Boolean)).size,
      totalCards, progressPercent,
      progressLabel: !languageProgressAvailable ? `${uniqueCardCount} recorded card identities · Mixed or unrecorded languages` : totalCards !== null ? `${uniqueCardCount}/${totalCards} unique cards recorded` : `${uniqueCardCount} unique cards · Checklist unavailable`,
      languages, hasUnknownLanguage: [...group.ownedItems, ...group.catalogRecords].some((item) => !language(item)), languageProgressAvailable,
    };
  }).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }) || left.key.localeCompare(right.key));
}

export function filterCollectionSetRows(rows = [], { query = "", scope = "all", sort = "name", language: selectedLanguage = "all", game = "all" } = {}) {
  const needle = normalized(query);
  const wantedLanguage = selectedLanguage === "all" ? "" : normalized(language({ language: selectedLanguage }));
  return rows.filter((row) => {
    if (game !== "all" && (game === "unspecified" ? row.gameId !== "unspecified" : normalizeCollectibleGame(game) === "unspecified" || row.gameId !== normalizeCollectibleGame(game))) return false;
    if (scope === "owned" && !row.itemCount) return false;
    if (scope === "in-progress" && !(row.uniqueCardCount > 0 && row.totalCards !== null && row.progressPercent !== null && row.uniqueCardCount < row.totalCards)) return false;
    if (scope === "complete" && !(row.totalCards !== null && row.progressPercent === 100 && !row.unknownCardIdentityCount)) return false;
    if (wantedLanguage === "language not recorded" ? !row.hasUnknownLanguage : wantedLanguage && !row.languages.some((entry) => normalized(entry) === wantedLanguage)) return false;
    return !needle || normalized([row.name, row.code, row.series, row.gameName].filter(Boolean).join(" ")).includes(needle) || (row.gameId === "pokemon" && aliasTargets.get(nameKey(query))?.size === 1 && aliasTargets.get(nameKey(query)).has(row.key.slice("pokemon:".length)));
  }).sort((left, right) => {
    if (sort === "newest") { const dated = (right.releaseDate || "").localeCompare(left.releaseDate || ""); if (dated) return dated; }
    if (sort === "value") { const value = (right.knownValueCount && right.totalValue !== null ? right.totalValue : -1) - (left.knownValueCount && left.totalValue !== null ? left.totalValue : -1); if (value) return value; }
    if (sort === "progress") { const progress = (right.progressPercent ?? -1) - (left.progressPercent ?? -1); if (progress) return progress; }
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }) || left.key.localeCompare(right.key);
  });
}
