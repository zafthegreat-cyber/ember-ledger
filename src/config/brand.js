export const BRAND_CONFIG = Object.freeze({
  applicationDisplayName: "Code 3",
  shortName: "Code 3",
  businessDisplayName: "",
  legalBusinessDisplayName: "",
  tagline: "",
  monogram: "C3",
  primaryAccent: "#315f55",
  secondaryAccent: "#6f7d73",
  logoReference: "/assets/brand/code-3-mark.svg",
  faviconReference: "/assets/brand/code-3-mark.svg",
  accessibleLogoText: "Code 3",
  pwaName: "Code 3",
  pwaShortName: "Code 3",
  browserTitleTemplate: "Code 3 — {pageTitle}",
  supportEmailPlaceholder: "support@example.invalid",
  defaultSocialHandle: "",
  defaultCurrency: "USD",
  defaultTimeZone: "America/New_York",
});

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
