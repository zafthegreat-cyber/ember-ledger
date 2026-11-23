import { NATIVE_BUILD } from "../config/nativeLaunchScope.js";

// Render-time only: never rewrite owner records. SVG masks stay bundled;
// photographs are requested when an inspection image is mounted.
export function inspectionAssetUrl(source, { native = NATIVE_BUILD, sha256 = "" } = {}) {
  if (!native || typeof source !== "string" || !/^\/assets\/inspection\/[a-z0-9_./-]+\.(?:jpe?g|png|webp|avif)$/i.test(source)) return source;
  if (source.split("/").some(segment => segment === "." || segment === "..")) return source;
  const version = /^[a-f0-9]{64}$/i.test(sha256) ? `?v=${sha256}` : "";
  return `https://code3tcg.app${source}${version}`;
}
