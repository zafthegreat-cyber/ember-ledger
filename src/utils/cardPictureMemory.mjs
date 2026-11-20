// Card picture memory (Nov 19 2026), option B of docs/CARD_IMAGE_RECOGNITION_PLAN.md.
// Only the user's own scans are fingerprinted, and only on this device. Each entry
// holds a 64-bit fingerprint plus the catalog card the user confirmed for it. No
// photo is stored or sent anywhere.
import { ART_BOX, differenceHash, nearestCards } from "./cardImageHash.mjs";
import { detectCardBorders } from "./cardCentering.mjs";

export const CARD_PICTURES_KEY = "code3.scanner.pictures.v1";
export const CARD_PICTURES_LIMIT = 600;
const HASH_PATTERN = /^[0-9a-f]{16}$/;

const validEntry = (entry) => entry && HASH_PATTERN.test(String(entry.hash || "")) && entry.catalogItemId;

export function readCardPictures(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(CARD_PICTURES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(validEntry).slice(0, CARD_PICTURES_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeCardPictures(list, storage = globalThis.localStorage) {
  try { storage?.setItem(CARD_PICTURES_KEY, JSON.stringify((list || []).slice(0, CARD_PICTURES_LIMIT))); } catch { /* Storage is optional. */ }
}

/**
 * Adds a confirmed fingerprint. A near-identical fingerprint for the same card
 * (within 4 bits) is replaced rather than repeated; up to 3 different photos of
 * one card are kept so lighting and angle vary. Newest first.
 */
export function rememberCardPicture(list = [], entry = {}) {
  const current = Array.isArray(list) ? list.filter(validEntry) : [];
  if (!validEntry(entry)) return current;
  const id = String(entry.catalogItemId);
  const next = {
    hash: entry.hash,
    catalogItemId: id,
    name: String(entry.name || "").slice(0, 120),
    setName: String(entry.setName || "").slice(0, 80),
    cardNumber: String(entry.cardNumber || "").slice(0, 24),
    at: entry.at || new Date().toISOString(),
  };
  const sameCard = current.filter((row) => String(row.catalogItemId) === id);
  const nearDuplicate = nearestCards(next.hash, sameCard, { limit: 1, maxDistance: 4 })[0];
  const others = current.filter((row) => !(nearDuplicate && row.hash === nearDuplicate.hash && String(row.catalogItemId) === id));
  const keptForCard = others.filter((row) => String(row.catalogItemId) === id).slice(0, 2);
  const rest = others.filter((row) => String(row.catalogItemId) !== id);
  return [next, ...keptForCard, ...rest].slice(0, CARD_PICTURES_LIMIT);
}

/** Closest remembered cards for a fingerprint, one row per card, closest first. */
export function matchCardPicture(hash, list = [], { limit = 3, maxDistance = 10 } = {}) {
  if (!HASH_PATTERN.test(String(hash || ""))) return [];
  const seen = new Set();
  const out = [];
  for (const row of nearestCards(hash, list, { limit: list.length || 1, maxDistance })) {
    const id = String(row.catalogItemId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fingerprint of a grayscale card photo. The card edge is found first, so a photo
 * with some table around the card still lines the artwork box up.
 */
export function fingerprintCardGray(gray, width, height) {
  if (!gray?.length || width < 16 || height < 16) return "";
  const { outer } = detectCardBorders(gray, width, height);
  const cardW = outer.right - outer.left;
  const cardH = outer.bottom - outer.top;
  const useOuter = cardW > 0.5 && cardH > 0.5;
  const box = useOuter
    ? { left: outer.left + ART_BOX.left * cardW, top: outer.top + ART_BOX.top * cardH, width: ART_BOX.width * cardW, height: ART_BOX.height * cardH }
    : ART_BOX;
  return differenceHash(gray, width, height, box);
}
