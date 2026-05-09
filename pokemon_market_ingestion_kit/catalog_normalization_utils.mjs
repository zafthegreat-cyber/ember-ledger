export function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/pokémon/gi, 'pokemon')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export function inferExpansionKind(set = {}) {
  const text = normalizeText(`${set.name || ''} ${set.series || ''}`);
  if (text.includes('world championship')) return 'world_championship';
  if (text.includes('mcdonald')) return 'mcdonalds';
  if (text.includes('black star promo') || text.includes('promo')) return 'promo';
  if (text.includes('trainer gallery') || text.includes('subset')) return 'subset';
  if (
    text.includes('special') ||
    text.includes('holiday') ||
    text.includes('shining fates') ||
    text.includes('hidden fates') ||
    text.includes('champions path') ||
    text.includes('crown zenith') ||
    text.includes('pokemon go') ||
    text.includes('151') ||
    text.includes('prismatic evolutions')
  ) {
    return 'special';
  }
  return 'main';
}

export function formatPriceSubtype(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return 'Default';
  const known = {
    normal: 'Normal',
    holofoil: 'Holofoil',
    reverseholofoil: 'Reverse Holofoil',
    reverse_holofoil: 'Reverse Holofoil',
    'reverse holofoil': 'Reverse Holofoil',
    '1steditionnormal': '1st Edition Normal',
    '1st edition normal': '1st Edition Normal',
    '1steditionholofoil': '1st Edition Holofoil',
    '1st edition holofoil': '1st Edition Holofoil',
    unlimited: 'Unlimited',
    unlimitedholofoil: 'Unlimited Holofoil',
    'unlimited holofoil': 'Unlimited Holofoil',
    sealed: 'Sealed',
    unopened: 'Unopened',
  };
  const key = raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
  const compact = key.replace(/\s+/g, '');
  if (known[key]) return known[key];
  if (known[compact]) return known[compact];
  return key.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function variantMetaFromName(variantName = '') {
  const name = formatPriceSubtype(variantName);
  const text = normalizeText(name);
  let printing = null;
  if (text.includes('1st edition')) printing = '1st Edition';
  if (text.includes('unlimited')) printing = 'Unlimited';

  let finish = null;
  if (text.includes('reverse')) finish = 'Reverse Holofoil';
  else if (text.includes('cosmos')) finish = 'Cosmos Holofoil';
  else if (text.includes('cracked ice')) finish = 'Cracked Ice Holofoil';
  else if (text.includes('holo')) finish = 'Holofoil';
  else if (text.includes('normal')) finish = 'Normal';
  else if (text.includes('sealed') || text.includes('unopened')) finish = 'Sealed';

  return { variantName: name, printing, finish };
}

export function classifyIdentifierType(value = '', preferredType = '') {
  if (preferredType) return preferredType;
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length === 12) return 'UPC';
  if (digits.length === 13) return 'EAN';
  if (digits.length === 14) return 'GTIN';
  return 'OTHER';
}

export function classifySealedProduct(product = {}, extendedData = {}) {
  const name = String(product.name || product.cleanName || product.productName || '');
  const type = String(extendedData.product_type || extendedData.producttype || extendedData.type || product.productType || '');
  const text = normalizeText(`${name} ${type}`);

  const explicitSealed =
    /sealed|booster|box|pack|tin|collection|bundle|case|blister|deck|trainer kit|premium|portfolio|binder|sleeves/.test(text);
  const explicitCard = /\b(card|single)\b/.test(text) && !/code card/.test(text);
  const isSealed =
    explicitSealed ||
    (!explicitCard &&
      /booster|elite trainer|\betb\b|box|pack|tin|collection|bundle|case|blister|deck|build battle|theme deck|trainer kit|premium collection|ultra premium|checklane|sleeved|portfolio|binder|playmat|sleeves/.test(text));

  let sealedProductType = null;
  if (isSealed) {
    if (/pokemon center.*elite trainer box|elite trainer box.*pokemon center/.test(text)) sealedProductType = 'pokemon_center_elite_trainer_box';
    else if (/elite trainer box|\betb\b/.test(text)) sealedProductType = 'elite_trainer_box';
    else if (/sleeved booster/.test(text)) sealedProductType = 'sleeved_booster_pack';
    else if (/booster bundle/.test(text)) sealedProductType = 'booster_bundle';
    else if (/booster display|display box|booster box/.test(text)) sealedProductType = 'booster_display_box';
    else if (/booster pack/.test(text)) sealedProductType = 'booster_pack';
    else if (/build battle stadium|build and battle stadium/.test(text)) sealedProductType = 'build_and_battle_stadium';
    else if (/build battle box|build and battle box/.test(text)) sealedProductType = 'build_and_battle_box';
    else if (/premium collection|ultra premium collection|ultra premium/.test(text)) sealedProductType = 'premium_collection';
    else if (/poster collection/.test(text)) sealedProductType = 'poster_collection';
    else if (/mini tin/.test(text)) sealedProductType = 'mini_tin';
    else if (/\btin\b/.test(text)) sealedProductType = 'tin';
    else if (/blister|checklane/.test(text)) sealedProductType = 'blister_pack';
    else if (/league battle deck/.test(text)) sealedProductType = 'league_battle_deck';
    else if (/battle deck/.test(text)) sealedProductType = 'battle_deck';
    else if (/starter deck|theme deck/.test(text)) sealedProductType = 'starter_deck';
    else if (/collection/.test(text)) sealedProductType = 'collection_box';
    else sealedProductType = 'other';
  }

  return {
    isSealed,
    productKind: isSealed ? 'sealed_product' : /code card/.test(text) ? 'code_card' : 'single_card',
    sealedProductType,
    isPokemonCenterExclusive: sealedProductType === 'pokemon_center_elite_trainer_box',
  };
}

export function inferPackCount(name = '', sealedProductType = '') {
  const text = normalizeText(name);
  const explicit = text.match(/(\d+)\s*(pack|packs|booster packs)/i);
  if (explicit) return { packCount: Number(explicit[1]), source: 'name', confidence: 'imported' };
  if (sealedProductType === 'pokemon_center_elite_trainer_box') return { packCount: 11, source: 'sealed_product_type_default', confidence: 'unverified_default' };
  if (sealedProductType === 'elite_trainer_box') return { packCount: 9, source: 'sealed_product_type_default', confidence: 'unverified_default' };
  if (sealedProductType === 'booster_bundle') return { packCount: 6, source: 'sealed_product_type_default', confidence: 'unverified_default' };
  if (sealedProductType === 'booster_display_box') return { packCount: 36, source: 'sealed_product_type_default', confidence: 'unverified_default' };
  if (sealedProductType === 'build_and_battle_box') return { packCount: 4, source: 'sealed_product_type_default', confidence: 'unverified_default' };
  if (sealedProductType === 'booster_pack' || sealedProductType === 'sleeved_booster_pack') return { packCount: 1, source: 'sealed_product_type_default', confidence: 'unverified_default' };
  return { packCount: null, source: 'unknown', confidence: 'unverified' };
}

export function buildContents({ product = {}, sealedProductType = '', packCountInfo = {}, existing = {} } = {}) {
  return {
    ...(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}),
    sealedProductType: sealedProductType || null,
    packCount: packCountInfo.packCount ?? null,
    packCountSource: packCountInfo.source || 'unknown',
    packCountConfidence: packCountInfo.confidence || 'unverified',
    sourceProductName: product.name || product.cleanName || product.productName || '',
  };
}

export function explicitMsrpFromExtendedData(extendedData = {}) {
  const value =
    extendedData.msrp ||
    extendedData.manufacturer_suggested_retail_price ||
    extendedData.suggested_retail_price ||
    extendedData.retail_price;
  return toNumberOrNull(String(value || '').replace(/[^0-9.]/g, ''));
}

export function buildCardDetailsRow(catalogProductId, card = {}) {
  const subtypes = Array.isArray(card.subtypes) ? card.subtypes : null;
  const stage = subtypes?.find((entry) => ['Basic', 'Stage 1', 'Stage 2', 'VSTAR', 'VMAX', 'Mega', 'Restored'].includes(entry)) || null;
  return {
    catalog_product_id: catalogProductId,
    card_name: card.name || 'Unknown card',
    supertype: card.supertype || null,
    subtypes,
    stage,
    evolves_from: card.evolvesFrom || null,
    hp: toNumberOrNull(card.hp),
    types: Array.isArray(card.types) ? card.types : null,
    abilities: Array.isArray(card.abilities) ? card.abilities : [],
    attacks: Array.isArray(card.attacks) ? card.attacks : [],
    weaknesses: Array.isArray(card.weaknesses) ? card.weaknesses : [],
    resistances: Array.isArray(card.resistances) ? card.resistances : [],
    retreat_cost: Array.isArray(card.retreatCost) ? card.retreatCost : null,
    converted_retreat_cost: toNumberOrNull(card.convertedRetreatCost),
    card_number: card.number || null,
    printed_total: toNumberOrNull(card.set?.printedTotal ?? card.set?.total),
    rarity: card.rarity || null,
    artist: card.artist || null,
    flavor_text: card.flavorText || null,
    regulation_mark: card.regulationMark || null,
    legalities: card.legalities || {},
    national_pokedex_numbers: Array.isArray(card.nationalPokedexNumbers) ? card.nationalPokedexNumbers : null,
    raw_source: card,
    updated_at: new Date().toISOString(),
  };
}
