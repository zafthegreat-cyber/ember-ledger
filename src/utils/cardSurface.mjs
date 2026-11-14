import { getRecordGame } from "./collectibleGames.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const text = value => typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";

// Layout and material hints affect only the inspector, never a saved variant or value.
export function cardSurfaceProfile(product = {}, { fullArt = false } = {}) {
  const set = text(product.setName || product.expansion || product.setCode);
  const eReader = /^(aquapolis|skyridge|expedition|expedition base set|aq|sk|ex)$/.test(set);
  const modern = /scarlet|violet|sword|shield|sun|moon|mega evolution/.test(set);
  const pokemon = getRecordGame(product) === "pokemon";
  const layout = fullArt ? "full" : pokemon ? eReader ? "e-reader" : modern ? "modern" : "classic" : "unknown";
  return { layout, pattern: eReader ? "cosmos" : "smooth" };
}

// A fixed studio light reflected into the card's local plane. Pointer motion moves
// the light a little; spinning/tilting the card does most of the work. No timers.
export function surfaceLighting(yaw = 0, pitch = 0, pointer = { x: 42, y: 38 }) {
  const safe = value => Number.isFinite(value) ? value : 0;
  const y = safe(yaw) * Math.PI / 180, p = safe(pitch) * Math.PI / 180;
  const px = clamp(safe(pointer?.x), 0, 100) / 100;
  const py = clamp(safe(pointer?.y), 0, 100) / 100;
  const hx = -.22 + (px - .5) * .34, hy = -.24 + (py - .5) * .28;
  const hz = Math.sqrt(1 - hx * hx - hy * hy);
  const localX = Math.cos(y) * hx - Math.sin(y) * hz;
  const localY = Math.sin(p) * (Math.sin(y) * hx + Math.cos(y) * hz) + Math.cos(p) * hy;
  const visible = Math.max(0, Math.cos(y) * Math.cos(p));
  const reflected = Math.exp(-(localX * localX / .18 + localY * localY / .28)) * visible;
  return {
    x: clamp(50 + localX * 105, -65, 165),
    y: clamp(50 + localY * 110, -65, 165),
    strength: clamp(.07 + reflected * .48, .07, .55) * visible,
    sheen: .025 + reflected * .075,
    shade: (1 - reflected) * .085 * visible,
    angle: 122 + safe(yaw) * .38 - safe(pitch) * .45,
    shift: safe(yaw) * .85 + safe(pitch) * .65,
  };
}
