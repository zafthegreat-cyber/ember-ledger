import { cardSurfaceProfile } from "./cardSurface.mjs";
import { standardCardBack } from "./cardBacks.mjs";

const text = value => typeof value === "string" ? value.trim() : "";
const normalize = value => text(value).toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");

// Presentation hints only. Never assign a finish, image or shape to a saved record.
export function productInspectionProfile(product = {}, artwork = null) {
  const type = normalize(product.catalogType || product.productClassification || product.productKind || product.productType);
  const name = text(product.name || product.cardName || product.title || product.productName);
  const sealed = /sealed|booster|trainer box|collection box|tin|bundle/.test(type) || product.isSealed === true || product.is_sealed === true;
  const card = /^(card|single|single card|raw card|graded|graded card)$/.test(type) || (!sealed && Boolean(product.cardNumber || product.card_number));
  const shape = sealed ? /pack|sleeve|blister/.test(normalize(product.productType || name)) && !/box|bundle|collection|tin/.test(normalize(product.productType || name)) ? "pack" : "box" : card ? "card" : "photo";
  const explicit = [product.finish, product.priceSubtype, product.cardVariant, product.variant, product.printing].map(normalize).filter(Boolean);
  const rarity = normalize(product.rarity);
  const finish = explicit.find(value => /reverse|non holo|nonholo|non foil|nonfoil|regular|normal|holo|foil/.test(value)) || (/holo|foil/.test(rarity) ? rarity : "");
  const initialFinish = /reverse/.test(finish) ? "reverse" : /non holo|nonholo|non foil|nonfoil|regular|normal/.test(finish) ? "regular" : /holo|foil/.test(finish) ? "holo" : "regular";
  // "Secret rare" alone also describes older artwork-window cards. It cannot
  // justify painting a full-card foil layer over their text and paper border.
  const fullArt = /full art|illustration|special art|hyper rare/.test([...explicit, rarity].join(" "));
  const namedFaces = Object.fromEntries(["front","back","left","right","top","bottom"].map(face=>[face, product.inspectionFaces?.[face] || (text(product[`${face}ImageUrl`] || product[`${face}_image_url`] || product.images?.[face]) ? {src:text(product[`${face}ImageUrl`] || product[`${face}_image_url`] || product.images?.[face])} : artwork?.faces?.[face])]).filter(([,value])=>value?.src));
  if (card && !namedFaces.back) {
    const standard = standardCardBack(product);
    if (standard) namedFaces.back = standard;
  }
  return {
    shape, initialFinish, knownFinish: Boolean(finish), fullArt,
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
