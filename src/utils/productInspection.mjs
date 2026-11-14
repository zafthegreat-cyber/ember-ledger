import { cardSurfaceProfile } from "./cardSurface.mjs";
import { nonCardProduct, inspectionCardBack } from "./cardBacks.mjs";

const text = value => typeof value === "string" ? value.trim() : "";
const normalize = value => text(value).toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
export const INSPECTION_FACE_NAMES = Object.freeze(["front", "back", "left", "right", "top", "bottom"]);
const identityText = value => normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const languageIdentity = value => ({en:"english",eng:"english",ja:"japanese",jp:"japanese",jpn:"japanese"}[identityText(value)] || identityText(value));
const gameIdentity = value => identityText(value).replace(/\b(trading card game|tcg|card game)\b/g, "").trim();
const packageMarkers = value => {
  const normalized = identityText(value);
  return ["code card", "pokemon center", "dollar general", "costco", "sams club", "sam s club", "case", "display"].filter(marker => (` ${normalized} `).includes(` ${marker} `));
};

// An exact catalog identity is necessary but not sufficient when an owner has edited
// the record's language or packaging. Contradictory metadata must not borrow art.
export function resolveInspectionArtwork(product = {}, registry = {}) {
  const id = String(product.tcgplayerProductId ?? "").trim();
  // A small number of catalog entries have no provider ID. They may only use
  // an explicitly registered internal catalog ID; names never grant artwork.
  // A present provider ID wins, including unknown/invalid IDs: do not quietly
  // replace that identity with an unrelated manual catalog model.
  const manualModels = id ? [] : [...new Set([product.catalogProductId, product.id]
    .map(value => text(value))
    .filter(Boolean)
    .map(value => registry[`catalog:${value}`])
    .filter(Boolean))];
  const model = id ? (/^\d+$/.test(id) ? registry[`tcgplayer:${id}`] : null)
    : manualModels.length === 1 ? manualModels[0] : null;
  if (!model) return null;
  const expected = model.identity || {};
  const expectedLanguage = languageIdentity(expected.language || "English");
  for (const value of [product.language, product.languageCode, product.language_code]) {
    if (text(value) && languageIdentity(value) !== expectedLanguage) return null;
  }
  const expectedGame = gameIdentity(expected.game || "Pokemon");
  for (const value of [product.game, product.tcgGame, product.tcg_game]) {
    if (text(value) && gameIdentity(value) !== expectedGame) return null;
  }
  const expectedNames = [model.name, ...(expected.aliases || [])].map(identityText).filter(Boolean);
  const expectedMarkers = new Set(packageMarkers(model.name + " " + (expected.edition || "") + " " + (expected.packageUnit || "")));
  for (const value of [product.name, product.productName, product.title, product.edition, product.productType, product.variant, product.packageUnit]) {
    if (packageMarkers(value).some(marker => !expectedMarkers.has(marker))) return null;
  }
  const explicitName = identityText(product.name || product.productName || product.title);
  if (explicitName && expectedNames.length && !expectedNames.includes(explicitName)) return null;
  if (text(product.edition) && text(expected.edition) && identityText(product.edition) !== identityText(expected.edition)) return null;
  if (text(product.packageUnit) && text(expected.packageUnit) && identityText(product.packageUnit) !== identityText(expected.packageUnit)) return null;
  const expectedUpc = String(model.upc || expected.upc || "").replace(/^0+/, "");
  // A documented catalog metadata discrepancy is not a second physical barcode.
  // This exception is reached only after exact ID/name/language/edition validation.
  const catalogMetadataUpcs = (model.catalogMetadataUpcs || [])
    .filter(entry => entry.value && entry.sourcePage && entry.reason)
    .map(entry => String(entry.value).replace(/^0+/, ""));
  if (String(product.upc ?? "").trim() && expectedUpc && ![expectedUpc, ...catalogMetadataUpcs].includes(String(product.upc).replace(/^0+/, ""))) return null;
  const expectedModel = identityText(model.model || expected.model);
  const actualModel = identityText(product.model || product.modelNumber || product.model_number);
  if (actualModel && expectedModel && actualModel !== expectedModel) return null;
  return model;
}

export function validInspectionQuad(quad) {
  if (!Array.isArray(quad) || quad.length !== 4 || !quad.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1))) return false;
  return quad.every((a, index) => {
    const b = quad[(index + 1) % 4], c = quad[(index + 2) % 4];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 1e-8;
  });
}

export function inspectionGeometry(profile = {}) {
  if (profile.shape === "card") return "card";
  if (profile.shape === "pack") {
    const front = profile.faces?.front, back = profile.faces?.back;
    const photographed = face => text(face?.src) && !face.reference && (!face.quad || validInspectionQuad(face.quad));
    return profile.wrapperEligible && photographed(front) && photographed(back) && `${front.src}:${JSON.stringify(front.quad)}` !== `${back.src}:${JSON.stringify(back.quad)}` ? "pack" : "photo";
  }
  if (profile.shape !== "box" || profile.cuboidEligible === false) return "photo";
  const dimensions = profile.dimensions;
  const validDimensions = dimensions && ["width", "height", "depth"].every(axis => Number.isFinite(dimensions[axis]) && dimensions[axis] > 0);
  const completeFaces = INSPECTION_FACE_NAMES.every(face => text(profile.faces?.[face]?.src) && !profile.faces[face].reference && validInspectionQuad(profile.faces[face].quad));
  const distinctFaces = new Set(INSPECTION_FACE_NAMES.map(face => `${profile.faces?.[face]?.src}:${JSON.stringify(profile.faces?.[face]?.quad)}`)).size === 6;
  return validDimensions && completeFaces && distinctFaces ? "box" : "photo";
}

// Presentation hints only. Never assign a finish, image or shape to a saved record.
export function productInspectionProfile(product = {}, artwork = null) {
  const type = normalize(product.catalogType || product.productClassification || product.productKind || product.productType);
  const name = text(product.name || product.cardName || product.title || product.productName);
  const sealed = /sealed|booster|trainer box|collection box|tin|bundle/.test(type) || product.isSealed === true || product.is_sealed === true || ["box","wrapper"].includes(artwork?.geometry);
  const card = !nonCardProduct(product) && (/^(card|single|single card|raw card|graded|graded card)$/.test(type) || (!sealed && Boolean(product.cardNumber || product.card_number)));
  const packaging = normalize(`${product.productType || ""} ${name}`);
  const loosePack = /\b(?:booster pack|booster)\b/.test(packaging) && !/\b(?:box|bundle|collection|tin|blister|sleeved|sleeve|case|display|multipack|multi pack|art set|lot)\b|\b\d+\s*(?:-| )?packs?\b/.test(packaging);
  const shape = sealed ? loosePack ? "pack" : "box" : card ? "card" : "photo";
  const explicit = [product.finish, product.priceSubtype, product.cardVariant, product.variant, product.printing].map(normalize).filter(Boolean);
  const rarity = normalize(product.rarity);
  const finish = explicit.find(value => /reverse|non holo|nonholo|non foil|nonfoil|regular|normal|holo|foil/.test(value)) || (/holo|foil/.test(rarity) ? rarity : "");
  const initialFinish = /reverse/.test(finish) ? "reverse" : /non holo|nonholo|non foil|nonfoil|regular|normal/.test(finish) ? "regular" : /holo|foil/.test(finish) ? "holo" : "regular";
  // "Secret rare" alone also describes older artwork-window cards. It cannot
  // justify painting a full-card foil layer over their text and paper border.
  const fullArt = /full art|illustration|special art|hyper rare/.test([...explicit, rarity].join(" "));
  const namedFaces = Object.fromEntries(INSPECTION_FACE_NAMES.map(face=>[face, product.inspectionFaces?.[face] || (text(product[`${face}ImageUrl`] || product[`${face}_image_url`] || product.images?.[face]) ? {src:text(product[`${face}ImageUrl`] || product[`${face}_image_url`] || product.images?.[face])} : artwork?.faces?.[face])]).filter(([,value])=>value?.src));
  if (card && !namedFaces.back) {
    const standard = inspectionCardBack(product);
    if (standard) namedFaces.back = standard;
  }
  return {
    shape, initialFinish, knownFinish: Boolean(finish), fullArt,
    wrapperEligible: shape === "pack" && (artwork?.geometry === "wrapper" || (!artwork && Boolean(namedFaces.front && namedFaces.back))),
    cuboidEligible: !/\b(tin|chest|ball|blister|code card)\b/.test(identityText(product.productType) + " " + identityText(name)),
    surface: cardSurfaceProfile(product, { fullArt }),
    inkMask: String(product.tcgplayerProductId) === "85317" ? "/assets/inspection/espeon-h9-ink-mask.svg" : "",
    faces: namedFaces, dimensions: artwork?.dimensions, surfaceColor: artwork?.surfaceColor,
    back: text(namedFaces.back?.src),
    left: text(product.leftImageUrl || product.left_image_url),
    right: text(product.rightImageUrl || product.right_image_url),
  };
}

export function inspectionPose(yaw = 0, pitch = 0, tiltLimit = 28) {
  return {
    yaw: Number.isFinite(yaw) ? ((yaw + 180) % 360 + 360) % 360 - 180 : 0,
    pitch: Math.max(-tiltLimit, Math.min(tiltLimit, Number.isFinite(pitch) ? pitch : 0)),
  };
}

export function inspectionFace(yaw = 0, pitch = 0) {
  if (Number.isFinite(pitch) && pitch <= -65) return "Top view";
  if (Number.isFinite(pitch) && pitch >= 65) return "Bottom view";
  const angle = Math.abs(inspectionPose(yaw).yaw);
  return angle < 65 ? "Front view" : angle > 115 ? "Back view" : "Side view";
}

export function inspectionDrag(start, dx, dy, width, tiltLimit = 28) {
  const scale = Math.max(120, Number.isFinite(width) ? width : 300);
  return inspectionPose(start.yaw + dx / scale * 210, start.pitch - dy / scale * 65, tiltLimit);
}
