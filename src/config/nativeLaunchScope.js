// What the Android/iOS apps leave out at launch (Nov 14 2026 store audit).
// The website keeps these. App Store guideline 2.2 rejects demo, mock and
// "coming soon" screens, so the phone apps hide them until they are finished.
// Community posts are shared through a moderated server queue since Nov 15
// (website); bring Community to the phone apps after store review of moderation.
export const NATIVE_BUILD = import.meta.env?.VITE_NATIVE_BUILD === "true";

export const NATIVE_HIDDEN_TABS = Object.freeze(new Set([
  "tidepool", // Community: server-moderated on the website; phone apps add it later
  "parentCenter", // mock-only safety shell
  "kidsProgram", // Little Sparks collects children's details
  "comingSoon",
  "knownLimitations",
  "sponsor",
]));

export function isHiddenInNativeApp(tab, native = NATIVE_BUILD) {
  return Boolean(native) && NATIVE_HIDDEN_TABS.has(String(tab || ""));
}

// Allow existing catalog providers, hosted inspection images and owner uploads.
export function nativeAllowsRemoteProductImage(url, native = NATIVE_BUILD) {
  if (!native || !url) return true;
  const value = String(url).trim();
  if (/^(data|blob|capacitor):/i.test(value) || value.startsWith("/") || !/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
  return /^https:\/\/(localhost|[a-z0-9]{20}\.supabase\.co|code3tcg\.app|tcgplayer-cdn\.tcgplayer\.com|images\.pokemontcg\.io)(\/|$)/i.test(value);
}
