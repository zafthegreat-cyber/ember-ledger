export const BRAND_CONFIG = Object.freeze({
  applicationDisplayName: "Code 3 TCG",
  shortName: "Code 3 TCG",
  businessDisplayName: "",
  legalBusinessDisplayName: "",
  tagline: "",
  monogram: "",
  primaryAccent: "#7A0F1E",
  secondaryAccent: "#4B1B6B",
  logoReference: "/assets/brand-system/artwork/code3-emblem-icon.png",
  wordmarkReference: "/assets/brand-system/artwork/code3-wordmark.png",
  wordmarkOnDarkReference: "/assets/brand-system/artwork/code3-wordmark-on-dark.png",
  bannerReference: "/assets/brand-system/artwork/code3-banner.png",
  faviconReference: "/assets/brand-system/artwork/code3-emblem-icon.png",
  appleTouchIconReference: "/assets/brand-system/artwork/code3-emblem-icon.png",
  // Legacy field names remain compatible; the supplied source is 1254px, not resized exports.
  pwaIcon192Reference: "/assets/brand-system/artwork/code3-emblem-icon.png",
  pwaIcon512Reference: "/assets/brand-system/artwork/code3-emblem-icon.png",
  pwaMaskableIconReference: "/assets/brand-system/artwork/code3-emblem-icon.png",
  iconSize: 1254,
  pwaBackgroundColor: "#FBF4E6",
  accessibleLogoText: "Code 3 TCG",
  pwaName: "Code 3 TCG",
  pwaShortName: "Code 3 TCG",
  browserTitleTemplate: "Code 3 TCG — {pageTitle}",
  supportEmailPlaceholder: "support@example.invalid",
  defaultSocialHandle: "",
  defaultCurrency: "USD",
  defaultTimeZone: "America/New_York",
});

export function formatBrandText(value = "") {
  return String(value ?? "").replace(/\b(?:ember\s*(?:&(?:amp;)?|and|\/)\s*tide|E\s*&(?:amp;)?\s*T)(?:\s+TCG)?\b/gi, BRAND_CONFIG.applicationDisplayName);
}

export function formatBrowserTitle(pageTitle = "") {
  const title = String(pageTitle || "").trim();
  if (!title) return BRAND_CONFIG.applicationDisplayName;
  if (BRAND_CONFIG.browserTitleTemplate.includes("{pageTitle}")) {
    return BRAND_CONFIG.browserTitleTemplate.replaceAll("{pageTitle}", title);
  }
  return BRAND_CONFIG.browserTitleTemplate.replace("%s", title);
}

export function applyBrandDocumentMetadata(pageTitle = "") {
  if (typeof document === "undefined") return;
  document.title = formatBrowserTitle(pageTitle);
  document.documentElement.style.setProperty("--brand-primary", BRAND_CONFIG.primaryAccent);
  document.documentElement.style.setProperty("--brand-secondary", BRAND_CONFIG.secondaryAccent);
  const appName = document.querySelector('meta[name="application-name"]');
  if (appName) appName.setAttribute("content", BRAND_CONFIG.applicationDisplayName);
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute("content", BRAND_CONFIG.pwaShortName || BRAND_CONFIG.shortName);
}
