export const BRAND_CONFIG = Object.freeze({
  applicationDisplayName: "Code 3 TCG",
  shortName: "Code 3 TCG",
  businessDisplayName: "",
  legalBusinessDisplayName: "",
  tagline: "",
  monogram: "C3",
  primaryAccent: "#0F766E",
  secondaryAccent: "#6f7d73",
  logoReference: "/assets/brand/code-3-mark.svg",
  faviconReference: "/assets/brand/code-3-mark.svg",
  appleTouchIconReference: "/assets/brand/code-3-apple-touch-icon.png",
  pwaIcon192Reference: "/assets/brand/code-3-icon-192.png",
  pwaIcon512Reference: "/assets/brand/code-3-icon-512.png",
  pwaMaskableIconReference: "/assets/brand/code-3-maskable-512.png",
  pwaBackgroundColor: "#F7F8F5",
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
