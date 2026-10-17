const ITEM_ICONS = {
  profile: "account",
  account: "account",
  "account-ops": "account",
  collections: "workspace",
  membership: "plan",
  privacySafety: "secure",
  "owner-center": "admin",
  admin: "admin",
  moderation: "admin",
  betaUsers: "community",
  invites: "community",
  parentCenter: "community",
  spark: "spark",
  sparkDonationAdmin: "spark",
  help: "help",
  publicBetaFeedback: "help",
  feedback: "clipboard",
  feedbackInbox: "clipboard",
  reportReview: "clipboard",
  missingCatalog: "search",
  waitlistByState: "map",
  sales: "sell",
  exchange: "sell",
  mileage: "map",
  shopPortal: "storefront",
  storeProductAdmin: "storefront",
};

export default function MenuItemIcon({ item, NavIcon }) {
  const kind = ITEM_ICONS[item.key] || item.icon;
  let drawing;

  if (item.key === "sign-out") {
    drawing = <><path d="M10 4H5v16h5" /><path d="M9 12h11m-4-4 4 4-4 4" /></>;
  } else if (kind === "scan") {
    drawing = <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8v8m4-8v8m4-8v8" /></>;
  } else if (kind === "bell") {
    drawing = <><path d="M18 8a6 6 0 0 0-12 0v5l-2 4h16l-2-4V8M10 21h4" /></>;
  } else if (kind === "settings") {
    drawing = <><path d="M4 7h8m4 0h4M4 17h3m4 0h9" /><circle cx="14" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>;
  } else if (kind === "storefront") {
    drawing = <><path d="M4 10v10h16V10M3 10l2-6h14l2 6" /><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-5h6v5" /></>;
  } else {
    return <NavIcon kind={kind} className="menu-item-icon" />;
  }

  return (
    <svg className="app-nav-icon menu-item-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {drawing}
    </svg>
  );
}
