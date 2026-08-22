import { BETA_LOCAL_STORAGE_KEYS, safeReadBrowserJson } from "./betaDataCleanup.js";

export const APP_ROUTE_STORAGE_KEY = BETA_LOCAL_STORAGE_KEYS.routeState;

export const EXCHANGE_SECTION_TABS = [
  { key: "market", label: "Market", helper: "Research and price memory" },
  { key: "harbor", label: "Harbor", helper: "Listings and offers" },
  { key: "forge", label: "Forge", helper: "Trades and private ledger" },
];

export function normalizeExchangeSection(value = "overview") {
  const key = String(value || "overview").toLowerCase();
  if (key === "overview" || key === "home" || key === "exchange") return "overview";
  if (key === "listings" || key === "selling" || key === "seller" || key === "shop") return "harbor";
  if (key === "inventory" || key === "ledger" || key === "trade" || key === "trades") return "forge";
  return EXCHANGE_SECTION_TABS.some((tab) => tab.key === key) ? key : "overview";
}

export function routeStateFromPath(pathname = "") {
  const segments = String(pathname || "/").split("/").filter(Boolean);
  const state = {};
  const [section, subSection, detailId] = segments;

  if (!section) return { activeTab: "dashboard" };
  if (section === "find") {
    const view = subSection === "deal-feed" || subSection === "deals"
      ? "deals"
      : subSection === "ebay" || subSection === "ebay-search"
        ? "ebay"
        : subSection === "saved-searches" || subSection === "rules"
          ? "rules"
          : subSection === "deal-analysis" || subSection === "analyze"
            ? "appraise"
            : subSection === "auctions"
              ? "auctions"
              : subSection === "restocks"
                ? "restocks"
              : subSection === "sources" || subSection === "integrations"
                ? "sources"
                : "deals";
    return { activeTab: "flipScout", flipScoutView: view };
  }
  if (section === "collection") {
    const view = ["collection", "sets", "wishlist", "grading"].includes(subSection) ? subSection : "collection";
    return { activeTab: "collectionWorkspace", collectionWorkspaceView: view };
  }
  if (section === "purchases") return { activeTab: "businessWorkspace", businessWorkspaceView: "purchases" };
  if (section === "inventory") return { activeTab: "businessWorkspace", businessWorkspaceView: "inventory" };
  if (section === "sell" || section === "sales") return { activeTab: "businessWorkspace", businessWorkspaceView: "sales" };
  if (section === "business") {
    const businessView = ["purchases", "inventory", "sales", "money"].includes(subSection) ? subSection : "overview";
    const moneyView = ["expenses", "mileage", "reports", "reconciliation"].includes(detailId) ? detailId : ["expenses", "mileage", "reports", "reconciliation"].includes(subSection) ? subSection : "expenses";
    return { activeTab: "businessWorkspace", businessWorkspaceView: ["expenses", "mileage", "reports", "reconciliation"].includes(subSection) ? "money" : businessView, businessMoneyView: moneyView };
  }
  if (section === "owner-center") {
    const ownerCenterSection = ["overview", "sourcing", "restocks", "performance", "controls"].includes(subSection) ? subSection : "overview";
    return { activeTab: "ownerCenter", ownerCenterSection, ownerCenterSubview: detailId || "" };
  }
  if (section === "kids-community") {
    if (subSection === "community") return { activeTab: "tidepool", tidepoolPostId: detailId ? decodeURIComponent(detailId) : "" };
    if (subSection === "parent") return { activeTab: "parentCenter" };
    return { activeTab: "kidsProgram", sparkFlowView: subSection === "donate" || subSection === "thank-you" ? subSection : "home" };
  }
  if (section === "assistant") return { activeTab: "help" };
  if (section === "integrations") return { activeTab: "ownerCenter", ownerCenterSection: "controls", ownerCenterSubview: "connections" };
  if (section === "settings") {
    if (subSection === "profile") return { activeTab: detailId === "progress" ? "profileProgress" : "profile" };
    if (subSection === "account") return { activeTab: "account" };
    if (subSection === "workspaces") return { activeTab: "collections" };
    if (subSection === "data-backup") return { activeTab: "ownerCenter", ownerCenterSection: "controls", ownerCenterSubview: "data-backup" };
    if (subSection === "system-map") return { activeTab: "tcgOs" };
    if (subSection === "help" || subSection === "business-assistant") return { activeTab: "help" };
    if (subSection === "plans") return { activeTab: "membership" };
    if (subSection === "trust" || subSection === "privacy" || subSection === "terms") return { activeTab: "trust" };
    if (subSection === "links") return { activeTab: "links" };
    if (subSection === "announcements") return { activeTab: "whatsNew" };
    if (subSection === "known-limitations") return { activeTab: "knownLimitations" };
    if (subSection === "roadmap") return { activeTab: "comingSoon" };
    if (subSection === "partnerships") return { activeTab: "sponsor" };
    return { activeTab: "settings" };
  }
  if (section === "invite" || (section === "beta" && subSection === "invite")) {
    return { activeTab: "invite", inviteToken: decodeURIComponent(section === "invite" ? subSection || "" : detailId || "") };
  }
  if (section === "workspace-invite") {
    return { activeTab: "workspaceInvite", workspaceInviteId: decodeURIComponent(subSection || "") };
  }
  if (section === "reset-password") return { activeTab: "resetPassword" };
  if (section === "onboarding" || section === "welcome" || section === "state-check" || section === "waitlist") {
    const view = section === "onboarding" ? subSection || "welcome" : section;
    return { activeTab: "onboarding", onboardingView: view };
  }
  if (section === "scout") {
    if (subSection === "flip-scout") return { activeTab: "flipScout", flipScoutView: "deals" };
    state.activeTab = "scout";
    state.scoutView = subSection === "stores"
      ? "stores"
      : subSection === "reports"
        ? "reports"
        : subSection === "calendar"
          ? "alerts"
          : subSection === "online"
            ? "online"
            : subSection === "watchlist"
              ? "watchlist"
              : "overview";
    if (subSection === "stores" && detailId) state.scoutStoreId = decodeURIComponent(detailId);
    if (subSection === "reports" && detailId) state.scoutReportId = decodeURIComponent(detailId);
    return state;
  }
  if (section === "tidetradr") {
    state.activeTab = "market";
    state.exchangeSection = "market";
    state.tideTradrSubTab = "overview";
    if ((subSection === "card" || subSection === "product") && detailId) {
      state.selectedCatalogDetailId = decodeURIComponent(detailId);
    }
    return state;
  }
  if (section === "exchange") {
    const exchangeSection = normalizeExchangeSection(subSection || "overview");
    return {
      activeTab: exchangeSection === "market" ? "market" : "exchange",
      exchangeSection,
      ...(exchangeSection === "market" ? { tideTradrSubTab: "overview" } : {}),
    };
  }
  if (section === "market") {
    return { activeTab: "market", exchangeSection: "market", tideTradrSubTab: normalizeExchangeSection(subSection) === "harbor" ? "listings" : "overview" };
  }
  if (section === "harbor") {
    return { activeTab: "exchange", exchangeSection: "harbor", tideTradrSubTab: "listings" };
  }
  if (section === "forge") {
    state.exchangeSection = "forge";
    if (subSection === "ledger") {
      state.activeTab = "inventory";
      state.forgeSubTab = "ledger";
      return state;
    }
    const forgeTabs = new Set(["expenses", "sales", "mileage", "reports"]);
    state.activeTab = forgeTabs.has(subSection) ? subSection : "inventory";
    state.forgeSubTab = subSection === "expenses" ? "expenses" : subSection === "sales" ? "sales" : subSection === "mileage" ? "mileage" : "overview";
    return state;
  }
  if (section === "vault") return { activeTab: "vault", vaultSubTab: subSection === "cards" ? "collection" : subSection || "overview" };
  if (section === "tidepool") return { activeTab: "tidepool", tidepoolPostId: subSection === "post" && detailId ? decodeURIComponent(detailId) : "" };
  if (section === "links") return { activeTab: "links" };
  if (section === "today" || section === "daily-tide") return { activeTab: "dailyTide" };
  if (section === "whats-new" || section === "changelog") return { activeTab: "whatsNew" };
  if (section === "known-limitations") return { activeTab: "knownLimitations" };
  if (section === "coming-soon" || section === "roadmap") return { activeTab: "comingSoon" };
  if (section === "kids-program") {
    return {
      activeTab: "kidsProgram",
      sparkFlowView: subSection === "donate" || subSection === "thank-you" ? subSection : "home",
    };
  }
  if (section === "parent-center" || section === "parent") return { activeTab: "parentCenter" };
  if (section === "profile") return { activeTab: subSection === "progress" ? "profileProgress" : "profile" };
  if (section === "account") return { activeTab: "account" };
  if (section === "collections" || section === "workspaces") return { activeTab: "collections" };
  if (section === "data-backup" || section === "backup") return { activeTab: "ownerCenter", ownerCenterSection: "controls", ownerCenterSubview: "data-backup" };
  if (section === "tcg-os") return { activeTab: "tcgOs" };
  if (section === "help" || section === "support") return { activeTab: "help" };
  if (section === "menu" || section === "more") return { activeTab: "settings" };
  if (section === "moderator" || section === "moderation") return { activeTab: "moderator" };
  if (section === "membership" || section === "tiers" || section === "plans") return { activeTab: "membership" };
  if (section === "reports" || section === "business-reports" || section === "exports") return { activeTab: "reports", forgeSubTab: "overview" };
  if (section === "admin" || section === "admin-review") return { activeTab: "adminReview" };
  if (section === "partner" || section === "sponsor") return { activeTab: "sponsor" };
  if (section === "privacy" || section === "terms" || section === "trust") return { activeTab: "trust" };
  return { activeTab: "dashboard" };
}

export function pathFromActiveTab(activeTab = "dashboard", state = {}) {
  if (activeTab === "membership") return "/settings/plans";
  if (activeTab === "flipScout") {
    const routeByView = {
      deals: "/find/deals",
      restocks: "/find/restocks",
      auctions: "/find/auctions",
      rules: "/find/saved-searches",
      ebay: "/find/ebay",
      appraise: "/find/deal-analysis",
      sources: "/find/sources",
    };
    return routeByView[state.flipScoutView] || "/find/deals";
  }
  if (activeTab === "collectionWorkspace") return state.collectionWorkspaceView && state.collectionWorkspaceView !== "collection" ? `/collection/${encodeURIComponent(state.collectionWorkspaceView)}` : "/collection";
  if (activeTab === "businessWorkspace") {
    if (state.businessWorkspaceView === "money") return `/business/money/${encodeURIComponent(state.businessMoneyView || "expenses")}`;
    return state.businessWorkspaceView && state.businessWorkspaceView !== "overview" ? `/business/${encodeURIComponent(state.businessWorkspaceView)}` : "/business";
  }
  if (activeTab === "ownerCenter") {
    const section = state.ownerCenterSection || "overview";
    return state.ownerCenterSubview ? `/owner-center/${encodeURIComponent(section)}/${encodeURIComponent(state.ownerCenterSubview)}` : `/owner-center/${encodeURIComponent(section)}`;
  }
  if (activeTab === "scout") return state.scoutView ? `/scout/${encodeURIComponent(state.scoutView)}` : "/scout";
  if (activeTab === "vault") return state.vaultSubTab ? `/vault/${encodeURIComponent(state.vaultSubTab)}` : "/vault";
  if (activeTab === "exchange") {
    const exchangeSection = normalizeExchangeSection(state.exchangeSection || "overview");
    return exchangeSection === "overview" ? "/exchange" : `/exchange/${encodeURIComponent(exchangeSection)}`;
  }
  if (activeTab === "market") return "/exchange/market";
  if (activeTab === "kidsProgram") return state.sparkFlowView && state.sparkFlowView !== "home" ? `/kids-community/${encodeURIComponent(state.sparkFlowView)}` : "/kids-community";
  if (activeTab === "parentCenter") return "/kids-community/parent";
  if (activeTab === "profileProgress") return "/settings/profile/progress";
  if (activeTab === "profile") return "/settings/profile";
  if (activeTab === "account") return "/settings/account";
  if (activeTab === "settings" || activeTab === "menu") return "/settings";
  if (activeTab === "help") return "/settings/help";
  if (activeTab === "dataBackup") return "/owner-center/controls/data-backup";
  if (activeTab === "collections") return "/settings/workspaces";
  if (activeTab === "tcgOs") return "/settings/system-map";
  if (activeTab === "comingSoon") return "/settings/roadmap";
  if (activeTab === "whatsNew") return "/settings/announcements";
  if (activeTab === "knownLimitations") return "/settings/known-limitations";
  if (activeTab === "links") return "/settings/links";
  if (activeTab === "adminReview") return "/admin";
  if (activeTab === "moderator") return "/moderator";
  if (activeTab === "tidepool") return state.tidepoolPostId ? `/kids-community/community/${encodeURIComponent(state.tidepoolPostId)}` : "/kids-community/community";
  if (activeTab === "trust") return "/settings/trust";
  if (activeTab === "sponsor") return "/settings/partnerships";
  return "/";
}

export function canonicalPathForPath(pathname = "") {
  const segments = String(pathname || "/").split("/").filter(Boolean);
  const [section, subSection, ...rest] = segments;
  const suffix = rest.length ? `/${rest.map(encodeURIComponent).join("/")}` : "";
  if (section === "spark") return "/kids-community";
  if (section === "scout" && subSection === "flip-scout") return "/find/deals";
  if (section === "purchases") return "/business/purchases";
  if (section === "inventory") return "/business/inventory";
  if (section === "sell" || section === "sales") return "/business/sales";
  if (section === "integrations") return "/owner-center/controls/connections";
  if (section === "assistant") return "/settings/help";
  if (section === "kids-program") return `/kids-community${subSection ? `/${encodeURIComponent(subSection)}` : ""}${suffix}`;
  if (section === "tidepool") return `/kids-community/community${subSection === "post" ? suffix : subSection ? `/${encodeURIComponent(subSection)}${suffix}` : ""}`;
  if (section === "parent-center" || section === "parent") return "/kids-community/parent";
  if (section === "profile") return `/settings/profile${subSection ? `/${encodeURIComponent(subSection)}` : ""}${suffix}`;
  if (section === "account") return "/settings/account";
  if (section === "collections" || section === "workspaces") return "/settings/workspaces";
  if ((section === "settings" && subSection === "data-backup") || section === "data-backup" || section === "backup") {
    return "/owner-center/controls/data-backup";
  }
  if (section === "tcg-os") return "/settings/system-map";
  if (section === "help" || section === "support") return "/settings/help";
  if (section === "menu" || section === "more") return "/settings";
  if (section === "membership" || section === "tiers" || section === "plans") return "/settings/plans";
  if (section === "privacy" || section === "terms" || section === "trust") return `/settings/${section === "trust" ? "trust" : section}`;
  if (section === "links") return "/settings/links";
  if (section === "whats-new" || section === "changelog") return "/settings/announcements";
  if (section === "known-limitations") return "/settings/known-limitations";
  if (section === "coming-soon" || section === "roadmap") return "/settings/roadmap";
  if (section === "partner" || section === "sponsor") return "/settings/partnerships";
  if (section === "market") return "/exchange/market";
  if (section === "harbor") return "/exchange/harbor";
  if (section === "tidetradr" && (!subSection || subSection === "catalog" || subSection === "overview")) return "/exchange/market";
  return String(pathname || "/") || "/";
}

export function canonicalLocationForPath(pathname = "", search = "", hash = "") {
  return `${canonicalPathForPath(pathname)}${String(search || "")}${String(hash || "")}`;
}

export function loadInitialRouteState(win = typeof window !== "undefined" ? window : undefined) {
  if (!win?.location) return { activeTab: "dashboard" };
  const saved = safeReadBrowserJson(win.localStorage, APP_ROUTE_STORAGE_KEY, {});
  const route = routeStateFromPath(win.location.pathname);
  const params = new URLSearchParams(win.location.search || "");
  const marketQuery = String(params.get("q") || "").trim().slice(0, 140);
  const vaultQuery = String(params.get("vaultQ") || "").trim().slice(0, 140);
  const vaultFilter = String(params.get("filter") || "").trim();
  return {
    ...saved,
    ...route,
    ...((route.activeTab === "market" || route.activeTab === "catalog" || (route.activeTab === "exchange" && normalizeExchangeSection(route.exchangeSection) === "market")) && marketQuery
      ? { catalogSearch: marketQuery, submittedCatalogSearch: marketQuery }
      : {}),
    ...(route.activeTab === "vault" && vaultQuery ? { vaultSearch: vaultQuery } : {}),
    ...(route.activeTab === "vault" && vaultFilter ? { vaultFilter } : {}),
  };
}
