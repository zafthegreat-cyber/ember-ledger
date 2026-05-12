const STOP_WORDS = new Set(["the", "and", "of", "pokemon", "tcg"]);

export function normalizeSearchQuery(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pok(?:e|Ã©|é)mon/gi, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[+_:/\\|]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/-/g, " ")
    .replace(/[.,%()[\]{}"!?]/g, " ")
    .toLowerCase()
    .replace(/\bpkmn\b/g, "pokemon")
    .replace(/\bpoke\b/g, "pokemon")
    .replace(/\bswsh\b/g, "sword shield")
    .replace(/\bs and v\b/g, "sv")
    .replace(/\b3\s*pk\b/g, "3 pack")
    .replace(/\bpc\s*etb\b/g, "pc etb")
    .replace(/\bb\s+and\s+b\b/g, "b and b")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function compactSearchKey(value = "") {
  return normalizeSearchQuery(value).replace(/[^a-z0-9]/g, "");
}

function titleCase(value = "") {
  return String(value || "").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function singularize(value = "") {
  return String(value || "").replace(/\b(boosters|tins|blisters|bundles|boxes|packs|cases|displays)\b/g, (word) => {
    const map = {
      boosters: "booster",
      tins: "tin",
      blisters: "blister",
      bundles: "bundle",
      boxes: "box",
      packs: "pack",
      cases: "case",
      displays: "display",
    };
    return map[word] || word;
  });
}

function aliasVariants(value = "") {
  const base = normalizeSearchQuery(value);
  const variants = new Set([base, singularize(base)]);
  if (/\d\.\d/.test(String(value))) variants.add(normalizeSearchQuery(String(value).replace(".", "pt")));
  if (/pt\d/i.test(String(value))) variants.add(normalizeSearchQuery(String(value).replace(/pt(\d)/i, ".$1")));
  if (/\bsv\d+\s+\d\b/.test(base)) variants.add(base.replace(/\bsv(\d+)\s+(\d)\b/g, "sv$1.$2"));
  variants.add(compactSearchKey(value));
  return [...variants].filter(Boolean);
}

function setRow(name, series, setId, ptcgoCode, aliases = [], releaseDate = "") {
  return { name, series, setId, ptcgoCode, releaseDate, aliases };
}

export const POKEMON_SET_ALIAS_ROWS = [
  setRow("Scarlet & Violet", "Scarlet & Violet", "sv1", "SVI", ["sv", "svi", "sv1", "scarlet violet", "scarlet and violet", "base sv", "sv base", "scarlet violet base"]),
  setRow("Paldea Evolved", "Scarlet & Violet", "sv2", "PAL", ["paldea evolved", "pal", "pe", "sv2", "paldea"]),
  setRow("Obsidian Flames", "Scarlet & Violet", "sv3", "OBF", ["obsidian flames", "obs", "of", "obf", "sv3"]),
  setRow("Scarlet & Violet 151", "Scarlet & Violet", "sv3pt5", "MEW", ["151", "pokemon 151", "scarlet violet 151", "scarlet and violet 151", "scarlet & violet 151", "sv151", "sv3.5", "sv3pt5", "mew"]),
  setRow("Paradox Rift", "Scarlet & Violet", "sv4", "PAR", ["paradox rift", "par", "pr", "sv4"]),
  setRow("Paldean Fates", "Scarlet & Violet", "sv4pt5", "PAF", ["paldean fates", "paf", "pf", "sv4.5", "sv4pt5"]),
  setRow("Temporal Forces", "Scarlet & Violet", "sv5", "TEF", ["temporal forces", "tf", "tef", "sv5"]),
  setRow("Twilight Masquerade", "Scarlet & Violet", "sv6", "TWM", ["twilight masquerade", "tm", "twm", "sv6", "sv06", "scarlet violet twilight masquerade", "scarlet and violet twilight masquerade", "scarlet & violet twilight masquerade"]),
  setRow("Shrouded Fable", "Scarlet & Violet", "sv6pt5", "SFA", ["shrouded fable", "sf", "sfa", "sv6.5", "sv6pt5"]),
  setRow("Stellar Crown", "Scarlet & Violet", "sv7", "SCR", ["stellar crown", "scr", "sc", "sv7"]),
  setRow("Surging Sparks", "Scarlet & Violet", "sv8", "SSP", ["surging sparks", "ssp", "ss", "sv8", "sv08", "surg", "scarlet violet surging sparks", "scarlet and violet surging sparks", "scarlet & violet surging sparks"]),
  setRow("Prismatic Evolutions", "Scarlet & Violet", "sv8pt5", "PRE", ["prismatic evolutions", "pr evo", "prism evo", "pre", "pe", "sv8.5", "sv8pt5", "sv8pt5 prismatic", "prismatic", "scarlet violet prismatic evolutions", "scarlet and violet prismatic evolutions", "scarlet & violet prismatic evolutions"]),
  setRow("Journey Together", "Scarlet & Violet", "sv9", "JTG", ["journey together", "jt", "jtt", "jtg", "sv9"]),
  setRow("Destined Rivals", "Scarlet & Violet", "sv10", "DRI", ["destined rivals", "dr", "dri", "sv10"]),
  setRow("Black Bolt", "Scarlet & Violet", "sv10pt5-bkt", "BKT", ["black bolt", "bb", "bkt", "sv10.5 black bolt", "sv10pt5 black bolt"]),
  setRow("White Flare", "Scarlet & Violet", "sv10pt5-wfl", "WFL", ["white flare", "wf", "wfl", "sv10.5 white flare", "sv10pt5 white flare"]),
  setRow("Mega Evolution", "Mega Evolution", "m1", "MEG", ["mega evolution", "mega", "me", "m1", "mega base"]),
  setRow("Ascended Heroes", "Mega Evolution", "me-ascended-heroes", "ASC", ["asc", "ascended", "ascended heroes", "me ascended", "me ascended heroes", "mega ascended", "mega ascended heroes"]),
  setRow("Perfect Order", "Mega Evolution", "me-perfect-order", "POR", ["perfect order", "por", "perfect", "me perfect", "me perfect order", "mega perfect", "mega perfect order"]),
  setRow("Phantasmal Flames", "Mega Evolution", "m2", "PHF", ["phantasmal flames", "pf", "phf", "m2"]),

  setRow("Sword & Shield", "Sword & Shield", "swsh1", "SSH", ["swsh", "sword shield", "sword and shield", "ssh", "swsh1", "sword shield base"]),
  setRow("Rebel Clash", "Sword & Shield", "swsh2", "RCL", ["rebel clash", "rc", "rcl", "swsh2"]),
  setRow("Darkness Ablaze", "Sword & Shield", "swsh3", "DAA", ["darkness ablaze", "daa", "da", "swsh3"]),
  setRow("Champion's Path", "Sword & Shield", "swsh35", "CPA", ["champions path", "champion path", "champions", "cp", "cpa", "swsh3.5", "swsh35"]),
  setRow("Vivid Voltage", "Sword & Shield", "swsh4", "VIV", ["vivid voltage", "vv", "viv", "swsh4"]),
  setRow("Shining Fates", "Sword & Shield", "swsh45", "SHF", ["shining fates", "sf", "shf", "swsh4.5", "swsh45"]),
  setRow("Battle Styles", "Sword & Shield", "swsh5", "BST", ["battle styles", "bs", "bst", "swsh5"]),
  setRow("Chilling Reign", "Sword & Shield", "swsh6", "CRE", ["chilling reign", "cr", "cre", "swsh6"]),
  setRow("Evolving Skies", "Sword & Shield", "swsh7", "EVS", ["evolving skies", "evs", "es", "evo skies", "swsh7"]),
  setRow("Celebrations", "Sword & Shield", "cel25", "CEL", ["cel", "celebrations", "celebration", "cel25"]),
  setRow("Fusion Strike", "Sword & Shield", "swsh8", "FST", ["fusion strike", "fst", "fs", "swsh8"]),
  setRow("Brilliant Stars", "Sword & Shield", "swsh9", "BRS", ["brilliant stars", "brs", "bs", "swsh9"]),
  setRow("Astral Radiance", "Sword & Shield", "swsh10", "ASR", ["astral", "astral radiance", "asr", "swsh10"]),
  setRow("Pokemon GO", "Sword & Shield", "pgo", "PGO", ["pgo", "pokemon go", "pogo"]),
  setRow("Lost Origin", "Sword & Shield", "swsh11", "LOR", ["lost origin", "lor", "lo", "swsh11"]),
  setRow("Silver Tempest", "Sword & Shield", "swsh12", "SIT", ["silver tempest", "sit", "st", "swsh12"]),
  setRow("Crown Zenith", "Sword & Shield", "swsh12pt5", "CRZ", ["crown zenith", "cz", "crz", "swsh12.5", "swsh12pt5"]),

  setRow("Sun & Moon", "Sun & Moon", "sm1", "SUM", ["sun moon", "sun and moon", "sum", "sm", "sm1"]),
  setRow("Guardians Rising", "Sun & Moon", "sm2", "GRI", ["guardians rising", "gri", "sm2"]),
  setRow("Burning Shadows", "Sun & Moon", "sm3", "BUS", ["burning shadows", "bus", "sm3"]),
  setRow("Shining Legends", "Sun & Moon", "sm35", "SLG", ["shining legends", "slg", "sm3.5", "sm35"]),
  setRow("Crimson Invasion", "Sun & Moon", "sm4", "CIN", ["crimson invasion", "cin", "sm4"]),
  setRow("Ultra Prism", "Sun & Moon", "sm5", "UPR", ["ultra prism", "upr", "sm5"]),
  setRow("Forbidden Light", "Sun & Moon", "sm6", "FLI", ["forbidden light", "fli", "sm6"]),
  setRow("Celestial Storm", "Sun & Moon", "sm7", "CES", ["celestial storm", "ces", "sm7"]),
  setRow("Dragon Majesty", "Sun & Moon", "sm75", "DRM", ["dragon majesty", "drm", "sm7.5", "sm75"]),
  setRow("Lost Thunder", "Sun & Moon", "sm8", "LOT", ["lost thunder", "lot", "sm8"]),
  setRow("Team Up", "Sun & Moon", "sm9", "TEU", ["team up", "teu", "sm9"]),
  setRow("Detective Pikachu", "Sun & Moon", "det1", "DET", ["detective pikachu", "det", "det1"]),
  setRow("Unbroken Bonds", "Sun & Moon", "sm10", "UNB", ["unbroken bonds", "unb", "sm10"]),
  setRow("Unified Minds", "Sun & Moon", "sm11", "UNM", ["unified minds", "unm", "sm11"]),
  setRow("Hidden Fates", "Sun & Moon", "sm115", "HIF", ["hidden fates", "hif", "sm11.5", "sm115"]),
  setRow("Cosmic Eclipse", "Sun & Moon", "sm12", "CEC", ["cosmic eclipse", "cec", "sm12"]),
  setRow("SM Promos", "Sun & Moon", "smp", "SMP", ["sm promos", "sun moon promos", "sun and moon promos", "smp"]),

  setRow("XY", "XY", "xy1", "XY", ["xy", "xy base", "xy1"]),
  setRow("Flashfire", "XY", "xy2", "FLF", ["flashfire", "flf", "xy2"]),
  setRow("Furious Fists", "XY", "xy3", "FFI", ["furious fists", "ffi", "xy3"]),
  setRow("Phantom Forces", "XY", "xy4", "PHF", ["phantom forces", "xy phf", "xy4"]),
  setRow("Primal Clash", "XY", "xy5", "PRC", ["primal clash", "prc", "xy5"]),
  setRow("Double Crisis", "XY", "dc1", "DCR", ["double crisis", "dcr", "dc1"]),
  setRow("Roaring Skies", "XY", "xy6", "ROS", ["roaring skies", "ros", "xy6"]),
  setRow("Ancient Origins", "XY", "xy7", "AOR", ["ancient origins", "aor", "xy7"]),
  setRow("BREAKthrough", "XY", "xy8", "BKT", ["breakthrough", "break through", "xy breakthrough", "xy8"]),
  setRow("BREAKpoint", "XY", "xy9", "BKP", ["breakpoint", "break point", "bkp", "xy9"]),
  setRow("Generations", "XY", "g1", "GEN", ["generations", "gen", "g1"]),
  setRow("Fates Collide", "XY", "xy10", "FCO", ["fates collide", "fco", "xy10"]),
  setRow("Steam Siege", "XY", "xy11", "STS", ["steam siege", "sts", "xy11"]),
  setRow("Evolutions", "XY", "xy12", "EVO", ["evolutions", "evo", "xy evolutions", "xy12"]),
  setRow("XY Promos", "XY", "xyp", "XYP", ["xy promos", "xyp"]),

  setRow("Black & White", "Black & White", "bw1", "BLW", ["black white", "black and white", "bw", "blw", "bw1"]),
  setRow("Emerging Powers", "Black & White", "bw2", "EPO", ["emerging powers", "epo", "bw2"]),
  setRow("Noble Victories", "Black & White", "bw3", "NVI", ["noble victories", "nvi", "bw3"]),
  setRow("Next Destinies", "Black & White", "bw4", "NXD", ["next destinies", "nxd", "bw4"]),
  setRow("Dark Explorers", "Black & White", "bw5", "DEX", ["dark explorers", "dex", "bw5"]),
  setRow("Dragons Exalted", "Black & White", "bw6", "DRX", ["dragons exalted", "drx", "bw6"]),
  setRow("Dragon Vault", "Black & White", "dv1", "DRV", ["dragon vault", "drv", "dv1"]),
  setRow("Boundaries Crossed", "Black & White", "bw7", "BCR", ["boundaries crossed", "bcr", "bw7"]),
  setRow("Plasma Storm", "Black & White", "bw8", "PLS", ["plasma storm", "pls", "bw8"]),
  setRow("Plasma Freeze", "Black & White", "bw9", "PLF", ["plasma freeze", "plf", "bw9"]),
  setRow("Plasma Blast", "Black & White", "bw10", "PLB", ["plasma blast", "plb", "bw10"]),
  setRow("Legendary Treasures", "Black & White", "bw11", "LTR", ["legendary treasures", "ltr", "bw11"]),
  setRow("BW Promos", "Black & White", "bwp", "BWP", ["bw promos", "black white promos", "black and white promos", "bwp"]),

  setRow("HeartGold & SoulSilver", "HeartGold & SoulSilver", "hgss1", "HS", ["heartgold soulsilver", "heartgold and soulsilver", "hgss", "hs", "hgss1"]),
  setRow("Unleashed", "HeartGold & SoulSilver", "hgss2", "UL", ["unleashed", "hgss unleashed", "ul", "hgss2"]),
  setRow("Undaunted", "HeartGold & SoulSilver", "hgss3", "UD", ["undaunted", "ud", "hgss3"]),
  setRow("Triumphant", "HeartGold & SoulSilver", "hgss4", "TM", ["triumphant", "hgss triumphant", "hgss4"]),
  setRow("Call of Legends", "HeartGold & SoulSilver", "col1", "CL", ["call of legends", "col", "col1"]),

  setRow("Platinum", "Platinum", "pl1", "PL", ["platinum", "pl", "pl1"]),
  setRow("Rising Rivals", "Platinum", "pl2", "RR", ["rising rivals", "rr", "pl2"]),
  setRow("Supreme Victors", "Platinum", "pl3", "SV", ["supreme victors", "pl sv", "pl3"]),
  setRow("Arceus", "Platinum", "pl4", "AR", ["arceus", "pl arceus", "pl4"]),

  setRow("Diamond & Pearl", "Diamond & Pearl", "dp1", "DP", ["diamond pearl", "diamond and pearl", "dp", "dp1"]),
  setRow("Mysterious Treasures", "Diamond & Pearl", "dp2", "MT", ["mysterious treasures", "mt", "dp2"]),
  setRow("Secret Wonders", "Diamond & Pearl", "dp3", "SW", ["secret wonders", "sw", "dp3"]),
  setRow("Great Encounters", "Diamond & Pearl", "dp4", "GE", ["great encounters", "ge", "dp4"]),
  setRow("Majestic Dawn", "Diamond & Pearl", "dp5", "MD", ["majestic dawn", "md", "dp5"]),
  setRow("Legends Awakened", "Diamond & Pearl", "dp6", "LA", ["legends awakened", "la", "dp6"]),
  setRow("Stormfront", "Diamond & Pearl", "dp7", "SF", ["stormfront", "dp sf", "dp7"]),

  setRow("Ruby & Sapphire", "EX", "ex1", "RS", ["ruby sapphire", "ruby and sapphire", "rs", "ex1"]),
  setRow("Sandstorm", "EX", "ex2", "SS", ["sandstorm", "ex sandstorm", "ex2"]),
  setRow("Dragon", "EX", "ex3", "DR", ["ex dragon", "dragon", "ex3"]),
  setRow("Team Magma vs Team Aqua", "EX", "ex4", "MA", ["team magma aqua", "team magma vs team aqua", "ma", "ex4"]),
  setRow("Hidden Legends", "EX", "ex5", "HL", ["hidden legends", "hl", "ex5"]),
  setRow("FireRed & LeafGreen", "EX", "ex6", "FRLG", ["firered leafgreen", "firered and leafgreen", "frlg", "ex6"]),
  setRow("Team Rocket Returns", "EX", "ex7", "TRR", ["team rocket returns", "trr", "ex7"]),
  setRow("Deoxys", "EX", "ex8", "DX", ["deoxys", "dx", "ex8"]),
  setRow("Emerald", "EX", "ex9", "EM", ["emerald", "em", "ex9"]),
  setRow("Unseen Forces", "EX", "ex10", "UF", ["unseen forces", "uf", "ex10"]),
  setRow("Delta Species", "EX", "ex11", "DS", ["delta species", "ds", "ex11"]),
  setRow("Legend Maker", "EX", "ex12", "LM", ["legend maker", "lm", "ex12"]),
  setRow("Holon Phantoms", "EX", "ex13", "HP", ["holon phantoms", "hp", "ex13"]),
  setRow("Crystal Guardians", "EX", "ex14", "CG", ["crystal guardians", "cg", "ex14"]),
  setRow("Dragon Frontiers", "EX", "ex15", "DF", ["dragon frontiers", "df", "ex15"]),
  setRow("Power Keepers", "EX", "ex16", "PK", ["power keepers", "pk", "ex16"]),

  setRow("Expedition Base Set", "E-Card", "ecard1", "EXP", ["expedition", "expedition base", "exp", "ecard1"]),
  setRow("Aquapolis", "E-Card", "ecard2", "AQ", ["aquapolis", "aq", "ecard2"]),
  setRow("Skyridge", "E-Card", "ecard3", "SK", ["skyridge", "sk", "ecard3"]),

  setRow("Neo Genesis", "Neo", "neo1", "N1", ["neo genesis", "n1", "neo1"]),
  setRow("Neo Discovery", "Neo", "neo2", "N2", ["neo discovery", "n2", "neo2"]),
  setRow("Neo Revelation", "Neo", "neo3", "N3", ["neo revelation", "n3", "neo3"]),
  setRow("Neo Destiny", "Neo", "neo4", "N4", ["neo destiny", "n4", "neo4"]),

  setRow("Base Set", "Base", "base1", "BS", ["base set", "base", "base1"]),
  setRow("Jungle", "Base", "base2", "JU", ["jungle", "ju", "base2"]),
  setRow("Fossil", "Base", "base3", "FO", ["fossil", "fo", "base3"]),
  setRow("Base Set 2", "Base", "base4", "B2", ["base set 2", "base 2", "b2", "base4"]),
  setRow("Team Rocket", "Base", "base5", "TR", ["team rocket", "rocket", "tr", "base5"]),
  setRow("Gym Heroes", "Gym", "gym1", "G1", ["gym heroes", "g1", "gym1"]),
  setRow("Gym Challenge", "Gym", "gym2", "G2", ["gym challenge", "g2", "gym2"]),
  setRow("Wizards Black Star Promos", "Promos", "basep", "PR", ["wotc promo", "wizards promo", "black star promo", "basep"]),
];

function productRule(label, aliases, canonicalType, priority = 100) {
  return { label, aliases, canonicalType, priority };
}

export const PRODUCT_ALIAS_RULES = [
  productRule("Pokemon Center Elite Trainer Box", ["pc etb", "pokemon center etb", "pokemon center elite trainer box", "pc elite trainer box"], "pokemon_center_elite_trainer_box", 130),
  productRule("Elite Trainer Box", ["etb", "elite trainer box"], "elite_trainer_box", 120),
  productRule("Ultra-Premium Collection", ["upc", "ultra premium collection", "ultra-premium collection", "ultra premium"], "ultra_premium_collection", 120),
  productRule("Booster Bundle", ["booster bundle", "bundle", "bndl"], "booster_bundle", 115),
  productRule("Booster Display Box", ["booster box", "display", "display box", "booster display", "booster display box", "bb"], "booster_display_box", 110),
  productRule("Booster Pack", ["booster pack", "pack", "booster", "boosters"], "booster_pack", 90),
  productRule("Sleeved Booster", ["sleeved", "sleeved booster", "sleeved booster pack"], "sleeved_booster_pack", 105),
  productRule("3-Pack Blister", ["3 pack", "3pk", "3 pack blister", "3-pack blister", "three pack blister"], "three_pack_blister", 105),
  productRule("Checklane Blister", ["checklane", "check lane", "checklane blister", "check lane blister"], "checklane_blister", 105),
  productRule("Blister Pack", ["blister", "blister pack", "blisters"], "blister_pack", 95),
  productRule("Mini Tin", ["mini tin", "mini tins"], "mini_tin", 105),
  productRule("Tin", ["tin", "tins"], "tin", 85),
  productRule("Collection Box", ["collection box", "ex box", "v box", "vmax box", "special collection"], "collection_box", 95),
  productRule("Premium Collection", ["premium collection", "premium coll"], "premium_collection", 95),
  productRule("Poster Collection", ["poster collection", "poster box"], "poster_collection", 95),
  productRule("Figure Collection", ["figure collection", "figure box"], "figure_collection", 95),
  productRule("Build & Battle Box", ["build battle", "build and battle", "build & battle", "b and b", "build battle box", "build and battle box"], "build_and_battle_box", 100),
  productRule("Build & Battle Stadium", ["build battle stadium", "build and battle stadium", "b and b stadium"], "build_and_battle_stadium", 100),
  productRule("Battle Deck", ["battle deck", "ex battle deck"], "battle_deck", 85),
  productRule("League Battle Deck", ["league battle deck"], "league_battle_deck", 95),
  productRule("Starter Deck", ["starter deck", "theme deck"], "starter_deck", 85),
  productRule("Case", ["case", "sealed case"], "case", 80),
];

function buildAliasEntries() {
  return POKEMON_SET_ALIAS_ROWS.map((set) => {
    const aliasSet = new Set([set.name, set.setId, set.ptcgoCode, set.series, ...(set.aliases || [])].filter(Boolean));
    for (const alias of [...aliasSet]) {
      for (const variant of aliasVariants(alias)) aliasSet.add(variant);
    }
    const aliases = [...aliasSet].filter(Boolean);
    return {
      ...set,
      canonicalSetName: set.name,
      normalizedName: normalizeSearchQuery(set.name),
      compactName: compactSearchKey(set.name),
      normalizedAliases: aliases.map((alias) => ({
        raw: alias,
        normalized: normalizeSearchQuery(alias),
        compact: compactSearchKey(alias),
      })).filter((alias) => alias.normalized || alias.compact),
    };
  });
}

export const SET_ALIAS_ENTRIES = buildAliasEntries();

const PRODUCT_ALIAS_ENTRIES = PRODUCT_ALIAS_RULES.map((rule) => ({
  ...rule,
  normalizedLabel: normalizeSearchQuery(rule.label),
  normalizedAliases: [...new Set([rule.label, rule.canonicalType, ...(rule.aliases || [])].flatMap(aliasVariants))]
    .map((alias) => ({
      raw: alias,
      normalized: normalizeSearchQuery(alias),
      compact: compactSearchKey(alias),
    }))
    .filter((alias) => alias.normalized || alias.compact),
}));

function queryState(input) {
  const normalized = normalizeSearchQuery(input);
  const compact = compactSearchKey(input);
  const tokens = normalized.split(" ").filter(Boolean);
  return {
    original: String(input || ""),
    normalized,
    compact,
    singular: singularize(normalized),
    tokens,
    tokenSet: new Set(tokens),
  };
}

function isAliasMatch(alias, state) {
  if (!alias.normalized && !alias.compact) return false;
  const aliasTokens = alias.normalized.split(" ").filter(Boolean);
  const shortAlias = alias.compact.length <= 2 || (aliasTokens.length === 1 && alias.normalized.length <= 2);
  const numericAlias = /^\d+$/.test(alias.compact);
  const codeAlias = /^[a-z]{1,5}\d/.test(alias.compact) || /^\d+[a-z]{1,5}$/.test(alias.compact);

  if (alias.normalized && state.normalized === alias.normalized) return true;
  if (alias.compact && state.compact === alias.compact) return true;
  if (shortAlias) return state.tokenSet.has(alias.normalized);
  if (numericAlias) return state.tokenSet.has(alias.normalized) || state.compact.includes(alias.compact);
  if (codeAlias) return state.tokenSet.has(alias.normalized) || state.compact.includes(alias.compact);
  if (alias.normalized && ` ${state.normalized} `.includes(` ${alias.normalized} `)) return true;
  if (alias.normalized && state.singular && ` ${state.singular} `.includes(` ${singularize(alias.normalized)} `)) return true;
  return Boolean(alias.compact && alias.compact.length >= 4 && state.compact.includes(alias.compact));
}

function scoreAlias(alias, state) {
  const aliasTokens = alias.normalized.split(" ").filter(Boolean);
  const shortAlias = alias.compact.length <= 2 || (aliasTokens.length === 1 && alias.normalized.length <= 2);
  if (state.normalized === alias.normalized || state.compact === alias.compact) return 100;
  if (shortAlias && state.tokenSet.has(alias.normalized)) return 72;
  if (alias.normalized && ` ${state.normalized} `.includes(` ${alias.normalized} `)) return 88;
  if (alias.compact && alias.compact.length >= 4 && state.compact.includes(alias.compact)) return 82;
  if (state.tokenSet.has(alias.normalized)) return 75;
  return 50;
}

function uniqueByName(items) {
  const byName = new Map();
  for (const item of items) {
    const key = normalizeSearchQuery(item.canonicalSetName || item.label || item.name);
    const current = byName.get(key);
    if (!current || item.matchScore > current.matchScore) byName.set(key, item);
  }
  return [...byName.values()];
}

export function analyzeCatalogSearch(input = "") {
  const state = queryState(input);
  if (!state.normalized) {
    return {
      ...state,
      setMatches: [],
      productMatches: [],
      ambiguousSetMatches: [],
      didYouMean: [],
      expandedQueries: [],
      hasStructuredAlias: false,
    };
  }

  const rawSetMatches = uniqueByName(SET_ALIAS_ENTRIES.flatMap((set) => {
    const matches = set.normalizedAliases.filter((alias) => isAliasMatch(alias, state));
    return matches.map((alias) => ({
      ...set,
      matchedAlias: alias.raw,
      matchScore: scoreAlias(alias, state) + Math.min(alias.compact.length, 18),
    }));
  })).sort((a, b) => b.matchScore - a.matchScore || a.canonicalSetName.localeCompare(b.canonicalSetName));
  const strongPhraseMatches = rawSetMatches.filter((match) => normalizeSearchQuery(match.matchedAlias).includes(" ") && match.matchScore >= 90);
  const setMatches = strongPhraseMatches.length
    ? rawSetMatches.filter((match) => strongPhraseMatches.some((strong) => strong.canonicalSetName === match.canonicalSetName))
    : rawSetMatches;

  const productMatches = PRODUCT_ALIAS_ENTRIES.flatMap((rule) => {
    const matches = rule.normalizedAliases.filter((alias) => isAliasMatch(alias, state));
    return matches.map((alias) => ({
      ...rule,
      matchedAlias: alias.raw,
      matchScore: scoreAlias(alias, state) + rule.priority,
    }));
  })
    .sort((a, b) => b.matchScore - a.matchScore || a.label.localeCompare(b.label))
    .filter((rule, index, rules) => rules.findIndex((item) => item.label === rule.label) === index);

  const explicitSetPhrase = setMatches.some((match) => match.matchScore >= 88 && match.matchedAlias.length > 2);
  const shortAliasSetMatches = setMatches.filter((match) => normalizeSearchQuery(match.matchedAlias).length <= 2);
  const ambiguousSetMatches = explicitSetPhrase ? [] : shortAliasSetMatches.length > 1 ? shortAliasSetMatches : [];

  const expanded = new Set([state.normalized]);
  for (const set of setMatches.slice(0, 8)) {
    expanded.add(set.canonicalSetName);
    expanded.add(set.setId);
    expanded.add(set.ptcgoCode);
  }
  for (const product of productMatches.slice(0, 6)) {
    expanded.add(product.label);
    expanded.add(product.canonicalType.replace(/_/g, " "));
  }
  for (const set of setMatches.slice(0, 6)) {
    for (const product of productMatches.slice(0, 4)) {
      expanded.add(`${set.canonicalSetName} ${product.label}`);
      expanded.add(`${product.label} ${set.canonicalSetName}`);
    }
  }

  const didYouMean = [...ambiguousSetMatches, ...setMatches.filter((match) => match.matchScore < 90).slice(0, 4)]
    .filter((match, index, matches) => matches.findIndex((item) => item.canonicalSetName === match.canonicalSetName) === index)
    .slice(0, 6)
    .map((match) => ({
      label: match.canonicalSetName,
      searchValue: match.canonicalSetName,
      matchedAlias: match.matchedAlias,
      type: "Set",
    }));

  return {
    ...state,
    setMatches,
    productMatches,
    ambiguousSetMatches,
    didYouMean,
    expandedQueries: [...expanded].map(normalizeSearchQuery).filter(Boolean),
    hasStructuredAlias: setMatches.length > 0 || productMatches.length > 0,
  };
}

function rowValue(row = {}, keys = []) {
  return keys.map((key) => row[key]).filter(Boolean).join(" ");
}

function normalizeRowText(row = {}) {
  const name = rowValue(row, ["product_name", "card_name", "name", "productName", "cardName"]);
  const set = rowValue(row, ["official_expansion_name", "expansion_display_name", "set_name", "setName", "expansion", "product_line", "set_code", "setCode"]);
  const product = rowValue(row, ["sealed_product_type", "product_type", "productType", "catalog_group", "product_kind"]);
  const ids = rowValue(row, ["barcode", "upc", "identifier_search", "external_product_id", "tcgplayer_product_id", "card_number"]);
  return {
    name: normalizeSearchQuery(name),
    nameCompact: compactSearchKey(name),
    set: normalizeSearchQuery(set),
    setCompact: compactSearchKey(set),
    product: normalizeSearchQuery(product.replace(/_/g, " ")),
    productCompact: compactSearchKey(product),
    all: normalizeSearchQuery([name, set, product, ids].join(" ")),
    compact: compactSearchKey([name, set, product, ids].join(" ")),
    ids: normalizeSearchQuery(ids),
  };
}

function textIncludes(text, needle) {
  const normalizedNeedle = normalizeSearchQuery(needle);
  if (!text || !normalizedNeedle) return false;
  return text.includes(normalizedNeedle) || singularize(text).includes(singularize(normalizedNeedle));
}

export function scoreCatalogSearchRow(row = {}, analysis = analyzeCatalogSearch(""), exactTerm = "") {
  const rowText = normalizeRowText(row);
  const exact = normalizeSearchQuery(exactTerm || analysis.normalized);
  let score = 0;
  const reasons = [];

  if (exact) {
    const exactValues = [
      row.barcode,
      row.upc,
      row.external_product_id,
      row.externalProductId,
      row.tcgplayer_product_id,
      row.tcgplayerProductId,
      row.card_number,
      row.cardNumber,
    ].map(normalizeSearchQuery).filter(Boolean);
    if (exactValues.includes(exact)) {
      score += 10000;
      reasons.push("exact identifier");
    }
    if (rowText.name === exact) {
      score += 2500;
      reasons.push("exact product name");
    } else if (textIncludes(rowText.name, exact)) {
      score += 700;
      reasons.push("product phrase");
    }
  }

  let setScore = 0;
  for (const set of analysis.setMatches || []) {
    const setAliases = [set.canonicalSetName, set.setId, set.ptcgoCode, ...(set.aliases || [])].filter(Boolean);
    if (setAliases.some((alias) => textIncludes(rowText.set, alias) || textIncludes(rowText.name, alias) || rowText.compact.includes(compactSearchKey(alias)))) {
      const next = 1200 + Math.min(set.matchScore || 0, 100);
      setScore = Math.max(setScore, next);
      reasons.push(`matched set: ${set.canonicalSetName}`);
    }
  }
  score += setScore;

  let productScore = 0;
  const wantsPokemonCenter = Boolean(
    (analysis.productMatches || []).some((product) => product.label === "Pokemon Center Elite Trainer Box") ||
    analysis.tokenSet?.has("pc") ||
    analysis.normalized.includes("pokemon center")
  );
  for (const product of analysis.productMatches || []) {
    const productAliases = [product.label, product.canonicalType.replace(/_/g, " "), ...(product.aliases || [])].filter(Boolean);
    if (productAliases.some((alias) => textIncludes(rowText.product, alias) || textIncludes(rowText.name, alias) || rowText.compact.includes(compactSearchKey(alias)))) {
      const pokemonCenterPenalty = !wantsPokemonCenter && product.label === "Elite Trainer Box" && rowText.all.includes("pokemon center") ? 220 : 0;
      const next = 900 + Math.min(product.matchScore || 0, 140) - pokemonCenterPenalty;
      productScore = Math.max(productScore, next);
      reasons.push(`matched product type: ${product.label}`);
    }
  }
  score += productScore;

  if (setScore && productScore) {
    score += 1800;
    reasons.push("set + product type");
  }

  const queryTokens = (analysis.tokens || []).filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  const matchedTokens = queryTokens.filter((token) => rowText.all.split(" ").includes(token) || rowText.compact.includes(token));
  score += matchedTokens.length * 60;

  if (analysis.normalized && textIncludes(rowText.all, analysis.normalized)) score += 350;
  if (row.market_price || row.market_value || row.mid_price) score += 8;
  if (row.image_url || row.image_large || row.image_small) score += 4;

  return { score, reasons: [...new Set(reasons)] };
}

export function expandCatalogSearchQueries(input = "", limit = 16) {
  const analysis = analyzeCatalogSearch(input);
  return analysis.expandedQueries
    .filter((term) => term && term !== analysis.normalized)
    .slice(0, limit);
}

export function buildLegacyCatalogSearchAliases() {
  const productAliases = PRODUCT_ALIAS_RULES.flatMap((rule) =>
    rule.aliases.map((alias) => ({
      alias,
      expansions: [rule.label, rule.canonicalType.replace(/_/g, " ")],
      label: rule.label,
      type: "Product Type",
    }))
  );
  const setAliases = SET_ALIAS_ENTRIES.flatMap((set) =>
    [set.setId, set.ptcgoCode, ...(set.aliases || [])].filter(Boolean).map((alias) => ({
      alias,
      expansions: [set.canonicalSetName],
      label: set.canonicalSetName,
      type: "Set",
    }))
  );
  return [...productAliases, ...setAliases];
}

export function buildCatalogAliasSuggestions(input = "", limit = 8) {
  const analysis = analyzeCatalogSearch(input);
  const suggestions = [];

  for (const match of analysis.didYouMean) {
    suggestions.push({
      section: "Did You Mean?",
      type: match.type,
      label: match.label,
      description: `Matched shorthand: ${match.matchedAlias}`,
      badge: "Set",
      searchValue: match.searchValue,
      mode: "set",
    });
  }

  for (const set of analysis.setMatches.slice(0, 5)) {
    suggestions.push({
      section: "Suggested Shorthand",
      type: "Set",
      label: set.canonicalSetName,
      description: `${set.matchedAlias} -> ${set.canonicalSetName}`,
      badge: "Set",
      searchValue: set.canonicalSetName,
      mode: "set",
    });
  }

  for (const product of analysis.productMatches.slice(0, 4)) {
    suggestions.push({
      section: "Suggested Shorthand",
      type: "Product Type",
      label: product.label,
      description: `${product.matchedAlias} -> ${product.label}`,
      badge: "Type",
      searchValue: product.label,
      mode: "productType",
    });
  }

  const byKey = new Map();
  for (const item of suggestions) {
    const key = `${item.section}|${item.type}|${normalizeSearchQuery(item.label)}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()].slice(0, limit);
}

export function explainCatalogSearchMatch(row = {}, input = "") {
  const analysis = analyzeCatalogSearch(input);
  const scored = scoreCatalogSearchRow(row, analysis, input);
  return {
    score: scored.score,
    reasons: scored.reasons,
    setMatches: analysis.setMatches.map((match) => ({
      set: match.canonicalSetName,
      alias: match.matchedAlias,
      confidence: match.matchScore,
    })),
    productMatches: analysis.productMatches.map((match) => ({
      productType: match.label,
      alias: match.matchedAlias,
      confidence: match.matchScore,
    })),
  };
}

export function describeSetAliasCoverage() {
  const eras = new Map();
  for (const row of POKEMON_SET_ALIAS_ROWS) {
    eras.set(row.series, (eras.get(row.series) || 0) + 1);
  }
  return [...eras.entries()].map(([series, count]) => ({ series, count }));
}
