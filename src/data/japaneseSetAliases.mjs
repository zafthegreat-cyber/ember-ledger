// Japanese ↔ English set aliases (SHOULD 20, board t106; 2026-11-14).
//
// English sets are usually built from one or two Japanese sets, so the
// relation is one-to-many. Each row: the English set name as the catalog
// spells it, the Japanese sets (name, romaji, code) and notes. Codes are the
// printed set codes (sv2a, s12a…). Compiled from memory of the printed sets;
// anything a collector disputes should be corrected here, not worked around.
//
// Used by: catalog search (a Japanese name or code finds the English set and
// vice versa), the Vault set checklist (progress per language) and imports
// ("sv2a" on a Japanese booster box lands in Scarlet & Violet 151).

export const JAPANESE_SET_ALIASES = [
  { english: "Scarlet & Violet Base", japanese: [{ name: "スカーレットex", romaji: "Scarlet ex", code: "sv1s" }, { name: "バイオレットex", romaji: "Violet ex", code: "sv1v" }] },
  { english: "Paldea Evolved", japanese: [{ name: "トリプレットビート", romaji: "Triplet Beat", code: "sv1a" }, { name: "スノーハザード", romaji: "Snow Hazard", code: "sv2p" }, { name: "クレイバースト", romaji: "Clay Burst", code: "sv2d" }] },
  { english: "Obsidian Flames", japanese: [{ name: "黒炎の支配者", romaji: "Ruler of the Black Flame", code: "sv3" }] },
  { english: "Scarlet & Violet 151", japanese: [{ name: "ポケモンカード151", romaji: "Pokemon Card 151", code: "sv2a" }] },
  { english: "Paradox Rift", japanese: [{ name: "レイジングサーフ", romaji: "Raging Surf", code: "sv3a" }, { name: "古代の咆哮", romaji: "Ancient Roar", code: "sv4k" }, { name: "未来の一閃", romaji: "Future Flash", code: "sv4m" }] },
  { english: "Paldean Fates", japanese: [{ name: "シャイニートレジャーex", romaji: "Shiny Treasure ex", code: "sv4a" }] },
  { english: "Temporal Forces", japanese: [{ name: "ワイルドフォース", romaji: "Wild Force", code: "sv5k" }, { name: "サイバージャッジ", romaji: "Cyber Judge", code: "sv5m" }] },
  { english: "Twilight Masquerade", japanese: [{ name: "クリムゾンヘイズ", romaji: "Crimson Haze", code: "sv5a" }, { name: "変幻の仮面", romaji: "Mask of Change", code: "sv6" }] },
  { english: "Shrouded Fable", japanese: [{ name: "ナイトワンダラー", romaji: "Night Wanderer", code: "sv6a" }] },
  { english: "Stellar Crown", japanese: [{ name: "ステラミラクル", romaji: "Stellar Miracle", code: "sv7" }] },
  { english: "Surging Sparks", japanese: [{ name: "超電ブレイカー", romaji: "Super Electric Breaker", code: "sv8" }] },
  { english: "Prismatic Evolutions", japanese: [{ name: "テラスタルフェスex", romaji: "Terastal Festival ex", code: "sv8a" }] },
  { english: "Journey Together", japanese: [{ name: "バトルパートナーズ", romaji: "Battle Partners", code: "sv9" }] },
  { english: "Destined Rivals", japanese: [{ name: "ロケット団の栄光", romaji: "Glory of Team Rocket", code: "sv10" }, { name: "熱風のアリーナ", romaji: "Heat Wave Arena", code: "sv9a" }] },
  { english: "Black Bolt", japanese: [{ name: "ブラックボルト", romaji: "Black Bolt", code: "sv11B" }] },
  { english: "White Flare", japanese: [{ name: "ホワイトフレア", romaji: "White Flare", code: "sv11W" }] },
  { english: "Mega Evolution", japanese: [{ name: "メガブレイブ", romaji: "Mega Brave", code: "M1L" }, { name: "メガシンフォニア", romaji: "Mega Symphonia", code: "M1S" }] },
  { english: "Sword & Shield Base", japanese: [{ name: "ソード", romaji: "Sword", code: "s1W" }, { name: "シールド", romaji: "Shield", code: "s1H" }] },
  { english: "Rebel Clash", japanese: [{ name: "反逆クラッシュ", romaji: "Rebellion Crash", code: "s2" }] },
  { english: "Darkness Ablaze", japanese: [{ name: "ムゲンゾーン", romaji: "Infinity Zone", code: "s3" }] },
  { english: "Champion's Path", japanese: [{ name: "VMAXライジング", romaji: "VMAX Rising", code: "s1a" }] },
  { english: "Vivid Voltage", japanese: [{ name: "仰天のボルテッカー", romaji: "Amazing Volt Tackle", code: "s4" }] },
  { english: "Shining Fates", japanese: [{ name: "シャイニースターV", romaji: "Shiny Star V", code: "s4a" }] },
  { english: "Battle Styles", japanese: [{ name: "一撃マスター", romaji: "Single Strike Master", code: "s5I" }, { name: "連撃マスター", romaji: "Rapid Strike Master", code: "s5R" }] },
  { english: "Chilling Reign", japanese: [{ name: "白銀のランス", romaji: "Silver Lance", code: "s6H" }, { name: "漆黒のガイスト", romaji: "Jet-Black Spirit", code: "s6K" }] },
  { english: "Evolving Skies", japanese: [{ name: "蒼空ストリーム", romaji: "Blue Sky Stream", code: "s7R" }, { name: "摩天パーフェクト", romaji: "Skyscraping Perfection", code: "s7D" }] },
  { english: "Celebrations", japanese: [{ name: "25th ANNIVERSARY COLLECTION", romaji: "25th Anniversary Collection", code: "s8a" }] },
  { english: "Fusion Strike", japanese: [{ name: "フュージョンアーツ", romaji: "Fusion Arts", code: "s8" }] },
  { english: "Brilliant Stars", japanese: [{ name: "スターバース", romaji: "Star Birth", code: "s9" }] },
  { english: "Astral Radiance", japanese: [{ name: "タイムゲイザー", romaji: "Time Gazer", code: "s10D" }, { name: "スペースジャグラー", romaji: "Space Juggler", code: "s10P" }] },
  { english: "Pokemon GO", japanese: [{ name: "Pokémon GO", romaji: "Pokemon GO", code: "s10b" }] },
  { english: "Lost Origin", japanese: [{ name: "ロストアビス", romaji: "Lost Abyss", code: "s11" }] },
  { english: "Silver Tempest", japanese: [{ name: "パラダイムトリガー", romaji: "Paradigm Trigger", code: "s12" }] },
  { english: "Crown Zenith", japanese: [{ name: "VSTARユニバース", romaji: "VSTAR Universe", code: "s12a" }] },
];

const fold = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/pok[eé]mon/g, "pokemon").replace(/[\s\-_・:：]+/g, " ").trim();

const byKey = new Map();
for (const row of JAPANESE_SET_ALIASES) {
  byKey.set(fold(row.english), row);
  for (const ja of row.japanese) {
    byKey.set(fold(ja.name), row);
    byKey.set(fold(ja.romaji), row);
    byKey.set(fold(ja.code), row);
  }
}

/** The English set + its Japanese sets for any English name, Japanese name, romaji or code. */
export function resolveSetAcrossLanguages(query) {
  const row = byKey.get(fold(query));
  if (!row) return null;
  const matchedJapanese = row.japanese.find((ja) => [ja.name, ja.romaji, ja.code].some((v) => fold(v) === fold(query))) || null;
  return { english: row.english, japanese: row.japanese, matched: matchedJapanese ? { language: "ja", ...matchedJapanese } : { language: "en", name: row.english } };
}

/** Search tokens to add to an English set so Japanese spellings find it. */
export function japaneseAliasesFor(englishName) {
  const row = byKey.get(fold(englishName));
  if (!row) return [];
  return row.japanese.flatMap((ja) => [ja.name, ja.romaji, ja.code]);
}

/** "sv2a" → "Scarlet & Violet 151"; "Scarlet & Violet 151" → itself; unknown → "". */
export function englishSetNameFor(value) {
  return byKey.get(fold(value))?.english || "";
}

function itemLanguage(item = {}) {
  const raw = fold(item.language || item.cardLanguage || item.card_language || item.printLanguage || item.print_language || "");
  if (/^(ja|jp|jpn|japanese|日本語)$/.test(raw)) return "ja";
  if (/^(en|eng|english)$/.test(raw)) return "en";
  // A Japanese set name or code on the item is as good as a language field.
  const setValue = item.setName || item.set_name || item.setCode || item.set_code || item.expansion || "";
  const resolved = resolveSetAcrossLanguages(setValue);
  if (resolved?.matched?.language === "ja") return "ja";
  return raw ? "other" : "en";
}

/**
 * Per-language progress for one English set. Items whose set is the English
 * name or any of its Japanese sets count; each language gets its own owned /
 * total so a collector finishing the Japanese printing is not shown "150/165
 * English".
 */
export function setProgressByLanguage(items = [], englishName, { englishTotal = 0, japaneseTotals = {} } = {}) {
  const row = byKey.get(fold(englishName));
  const englishKey = fold(row ? row.english : englishName);
  const japaneseKeys = new Set((row?.japanese || []).flatMap((ja) => [fold(ja.name), fold(ja.code), fold(ja.romaji)]));
  const owned = { en: new Set(), ja: new Set(), other: new Set() };
  for (const item of items) {
    const setValue = fold(item.setName || item.set_name || item.setCode || item.set_code || item.expansion || "");
    const inSet = setValue === englishKey || japaneseKeys.has(setValue) || englishSetNameFor(setValue) === (row ? row.english : "");
    if (!inSet) continue;
    const number = fold(item.cardNumber || item.card_number || item.collectorNumber || "").split("/")[0].replace(/^0+(?=\d)/, "");
    owned[itemLanguage(item)].add(number || `id:${item.id || item.name}`);
  }
  const jaTotal = Object.values(japaneseTotals).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const pct = (n, total) => (total > 0 ? Math.min(100, Math.round((n / total) * 100)) : null);
  return {
    english: row ? row.english : englishName,
    languages: {
      en: { owned: owned.en.size, total: englishTotal || null, percent: pct(owned.en.size, englishTotal) },
      ja: { owned: owned.ja.size, total: jaTotal || null, percent: pct(owned.ja.size, jaTotal), sets: row?.japanese || [] },
      other: { owned: owned.other.size },
    },
    mixed: owned.en.size > 0 && owned.ja.size > 0,
  };
}
