export const BRAND_CONFIG = Object.freeze({
  applicationDisplayName: "Private Business Hub",
  shortName: "Business Hub",
  businessDisplayName: "Owner workspace",
  tagline: "Sourcing, inventory, sales, and business records in one calm workspace.",
  monogram: "PB",
  primaryAccent: "#315f55",
  secondaryAccent: "#6f7d73",
  logoReference: "/assets/brand/private-business-hub-mark.svg",
  faviconReference: "/assets/brand/private-business-hub-mark.svg",
  pwaName: "Private Business Hub",
  browserTitleTemplate: "%s · Private Business Hub",
  supportEmailPlaceholder: "support@example.invalid",
});

export function formatBrowserTitle(pageTitle = "") {
  const title = String(pageTitle || "").trim();
  return title
    ? BRAND_CONFIG.browserTitleTemplate.replace("%s", title)
    : BRAND_CONFIG.applicationDisplayName;
}

export function applyBrandDocumentMetadata(pageTitle = "") {
  if (typeof document === "undefined") return;
  document.title = formatBrowserTitle(pageTitle);
  document.documentElement.style.setProperty("--brand-primary", BRAND_CONFIG.primaryAccent);
  document.documentElement.style.setProperty("--brand-secondary", BRAND_CONFIG.secondaryAccent);
  const appName = document.querySelector('meta[name="application-name"]');
  if (appName) appName.setAttribute("content", BRAND_CONFIG.applicationDisplayName);
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute("content", BRAND_CONFIG.shortName);
}
