import { lazy, Suspense, useEffect, useRef, useState, useCallback } from "react";
import { AppNavIcon } from "../components/command-system/AppNavIcon.jsx";
import { PageHeader, SecondaryButton } from "../components/operations/OperationsUI.jsx";
// Audit 2026-11-14: loaded when Settings opens, not with the first page (it pulls in backup/restore code).
const CloudSyncPanel = lazy(() => import("../features/persistence/CloudSyncPanel.jsx"));
import BlockedUsersPanel from "../components/BlockedUsersPanel.jsx";
import { useCloudWorkspace } from "../features/persistence/CloudWorkspaceContext.js";
import { resolveExperiencePresentation } from "../utils/experiencePresentation.js";
import { SETTINGS_CATEGORIES, matchesSetting } from "../utils/settingsNavigation.js";
import "./settings-layout.css";

function SettingsArrow() {
  return <svg className="settings-layout__arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SettingsRow({ icon, title, description, status, onClick }) {
  return (
    <button type="button" className="settings-layout__row" onClick={onClick}>
      <span className="settings-layout__row-icon" aria-hidden="true"><AppNavIcon kind={icon} /></span>
      <span className="settings-layout__row-copy"><strong>{title}</strong><span>{description}</span></span>
      {status ? <span className="settings-layout__row-status">{status}</span> : null}
      <SettingsArrow />
    </button>
  );
}

function SettingsDisclosure({ icon, title, description, children, reviewRequested = false, onReviewShown }) {
  const disclosureRef = useRef(null);
  const [wasOpened, setWasOpened] = useState(reviewRequested);
  useEffect(() => {
    if (!reviewRequested) return undefined;
    const disclosure = disclosureRef.current;
    disclosure.open = true;
    // Wait until route-level focus has settled, including a lazy Settings mount.
    let focusFrame;
    const routeFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        setWasOpened(true);
        const summary = disclosure.querySelector("summary");
        summary?.focus({ preventScroll: true });
        summary?.scrollIntoView({ block: "center", behavior: "auto" });
        onReviewShown?.();
      });
    });
    return () => { cancelAnimationFrame(routeFrame); cancelAnimationFrame(focusFrame); };
  }, [reviewRequested, onReviewShown]);
  return (
    <details ref={disclosureRef} className="settings-layout__disclosure" onToggle={event => { if (event.currentTarget.open) setWasOpened(true); }}>
      <summary>
        <span className="settings-layout__row-icon" aria-hidden="true"><AppNavIcon kind={icon} /></span>
        <span className="settings-layout__row-copy"><strong>{title}</strong><span>{description}</span></span>
        <SettingsArrow />
      </summary>
      <div className="settings-layout__detail-content">{wasOpened || reviewRequested ? children : null}</div>
    </details>
  );
}

function SettingsGroup({ id, title, children }) {
  return (
    <section className="settings-layout__group" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="settings-layout__group-body">{children}</div>
    </section>
  );
}

export default function MenuPage(props) {
  const cloudWorkspace = useCloudWorkspace();
  const {
    activeWorkspaceName = "",
    betaReadinessData = {},
    betaAccessAllowed,
    commandDeskSellerAccess = false,
    cloudSyncReviewRequested = false,
    onCloudSyncReviewShown,
    experiencePresentation,
    guestPreviewActive = false,
    notificationUnreadCount = 0,
    openBeaconCenter,
    openCompassSearch,
    openUtilityPage,
    PUBLIC_APP_VERSION_LABEL,
    renderAppBuildDetails,
    renderSettingsPreferencesCard,
    renderSettingsPrivacySafetyCard,
    renderSettingsWorkspaceCard,
    renderUtilityPageShell,
    scoutGuessPoints = 0,
    settingsFamilyStatusLabel = "Protected",
    showFamilyExperience,
    showCommunityExperience,
    signedInWithSupabase,
    signOut,
    startAppTour,
    userEmail = "",
  } = props;
  const presentation = experiencePresentation || resolveExperiencePresentation();
  const showFamily = presentation.showAdminTools || (typeof showFamilyExperience === "boolean" ? showFamilyExperience : presentation.showFamilyTools);
  const showCommunity = presentation.showAdminTools || showCommunityExperience === true;
  const accountLabel = signedInWithSupabase ? "Signed in" : guestPreviewActive ? "Guest preview" : "On this device";
  const [category, setCategory] = useState("Everyday");
  const [query, setQuery] = useState("");
  const handleCloudReviewShown = useCallback(() => {
    setCategory("Everyday");
    setQuery("");
    onCloudSyncReviewShown?.();
  }, [onCloudSyncReviewShown]);
  const familyProtectionLabel = /no kids program request/i.test(String(settingsFamilyStatusLabel || ""))
    ? "Parent guard ready"
    : settingsFamilyStatusLabel || "Protected";
  const kidApplicationCount = Array.isArray(betaReadinessData.kidsApplications)
    ? betaReadinessData.kidsApplications.length
    : 0;
  const openBeacon = typeof openBeaconCenter === "function" ? openBeaconCenter : () => openUtilityPage("settings");

  const preference = (id, title, description, keywords) => ({
    id, category: "Everyday", icon: ({ location: "map", notifications: "bell", experience: "workspace" })[id] || "settings", title, description, keywords,
    content: () => renderSettingsPreferencesCard(id),
  });
  const entries = [
    ...(typeof renderSettingsPreferencesCard === "function" ? [
      preference("appearance", "Appearance", "Theme & card spacing", "dark light density compact comfortable display"),
      preference("location", "Area & stores", "Location & followed stores", "zip city state restocks gps device tracking favorite nearby"),
      preference("notifications", "Alert preferences", "Choose which alerts you receive", "notifications reminders push"),
      preference("experience", "Experience & tools", "Collecting, selling & optional tools", "persona family community business layout"),
    ] : []),
    ...(cloudWorkspace ? [{ id: "sync", category: "Everyday", icon: "data", title: "Cloud saving & recovery", description: "Sync, backups & devices", keywords: "conflict review changes saved restore account", content: () => <Suspense fallback={<p className="compact-subtitle">Loading cloud saving…</p>}><CloudSyncPanel /></Suspense> }] : []),
    { id: "backup", category: "Everyday", icon: "data", title: "Archive & backups", description: "Export records & keep a copy", keywords: "receipts proof attachments import restore recover download seller", onClick: () => openUtilityPage("dataBackup"), status: commandDeskSellerAccess ? "Seller records" : undefined },
    { id: "account", category: "Account", icon: "account", title: "Account & security", description: "Sign-in & account details", keywords: "email password login delete authentication", onClick: () => openUtilityPage("account") },
    { id: "profile", category: "Account", icon: "account", title: "Profile", description: "Your public profile", onClick: () => openUtilityPage("profile") },
    ...(typeof renderSettingsWorkspaceCard === "function" ? [{ id: "workspace", category: "Account", icon: "workspace", title: "Your workspace", description: "Manage your spaces", keywords: "business collection rename", content: renderSettingsWorkspaceCard }] : []),
    { id: "plan", category: "Account", icon: "plan", title: "Plans & access", description: "Your plan & support options", keywords: "membership limits billing subscription family pricing", onClick: () => openUtilityPage("membership") },
    { id: "inbox", category: "Account", icon: "bell", title: "Notification inbox", description: "Read alerts & reminders", status: notificationUnreadCount ? notificationUnreadCount + " unread" : undefined, onClick: () => openBeacon("you_beacon") },
    { id: "summary", category: "Account", icon: "account", title: "Account overview", description: presentation.personaLabel, keywords: "trust points experience protection", content: () => <dl className="settings-layout__account-meta"><div><dt>Experience</dt><dd>{presentation.personaLabel}</dd></div><div><dt>App access</dt><dd>{betaAccessAllowed?.() ? "Ready" : "Guest preview"}</dd></div>{showFamily ? <div><dt>Family protection</dt><dd>{familyProtectionLabel}</dd></div> : null}<div><dt>Restocks trust</dt><dd>{scoutGuessPoints} pts</dd></div></dl> },
    ...(typeof renderSettingsPrivacySafetyCard === "function" ? [{ id: "privacy", category: "Privacy", icon: "secure", title: "Privacy & safeguards", description: "Data, location & crash reports", keywords: "delete account policy permissions reporting", content: renderSettingsPrivacySafetyCard }] : []),
    { id: "blocked", category: "Privacy", icon: "secure", title: "Blocked people", description: "Manage hidden people", keywords: "unblock users reports posts", content: () => <BlockedUsersPanel /> },
    { id: "safety", category: "Privacy", icon: "secure", title: "Safety center", description: "Safe collecting & trading", keywords: "trust guidance", onClick: () => openUtilityPage("trust") },
    ...(showFamily ? [
      { id: "family", category: "Privacy", icon: "community", title: "Family permissions", description: "Parent controls & approvals", keywords: "child children kids profiles", status: kidApplicationCount ? kidApplicationCount + " requests" : undefined, onClick: () => openUtilityPage("parentCenter") },
      { id: "spark", category: "Privacy", icon: "spark", title: "The Spark", description: "Kid packs & donations", keywords: "giving requests", onClick: () => openUtilityPage("kidsProgram") },
      { id: "support-access", category: "Privacy", icon: "community", title: "Family access support", description: "Private pricing & access review", keywords: "discount evidence sensitive", content: () => <div className="settings-layout__support-copy"><p>Family pricing and access support use a private, human-reviewed process. Sensitive details stay out of public profiles.</p><ol><li>Request support in Plans or Support.</li><li>Share only the evidence needed for a decision.</li><li>Discounts apply after review.</li><li>Rechecks avoid asking for the same sensitive proof.</li></ol></div> },
    ] : []),
    ...(showCommunity ? [{ id: "community", category: "Privacy", icon: "pool", title: "Community", description: "Events, shops & connections", onClick: () => openUtilityPage("tidepool") }] : []),
    { id: "help", category: "Help", icon: "help", title: "Help & app status", description: "Support, feedback & known issues", keywords: "contact bug problem", onClick: () => openUtilityPage("help") },
    ...(typeof startAppTour === "function" ? [{ id: "tour", category: "Help", icon: "search", title: "Take the tour", description: "A quick guide to the app", keywords: "getting started onboarding", onClick: startAppTour }] : []),
    ...(typeof renderAppBuildDetails === "function" ? [{ id: "about", category: "Help", icon: "data", title: "About Code 3 TCG", description: "Version & build details", keywords: "update android technical", content: renderAppBuildDetails }] : []),
  ];
  // A sync-review link must bypass any current search or category filter.
  const visibleQuery = cloudSyncReviewRequested ? "" : query;
  const visibleCategory = cloudSyncReviewRequested ? "Everyday" : category;
  const visibleEntries = entries.filter(entry => matchesSetting(entry, visibleQuery, visibleCategory));
  const visibleIds = new Set(visibleEntries.map(entry => entry.id));
  return renderUtilityPageShell({
    title: "Settings",
    subtitle: "Make the app work for you.",
    className: "settings-utility-page settings-layout-shell",
    hideCommandHeader: true,
    children: (
      <div className="settings-layout settings-layout--focused">
        <PageHeader title="Settings" />
        <section className="settings-layout__identity-bar" aria-label="Account overview">
          <span className="settings-layout__avatar" aria-hidden="true"><AppNavIcon kind="account" /></span>
          <div><strong>{activeWorkspaceName || "My Personal Space"}</strong><span>{userEmail || accountLabel}</span></div>
          {typeof signOut === "function" && signedInWithSupabase ? <button type="button" className="settings-layout__sign-out" onClick={signOut}>Sign out</button> : <SecondaryButton onClick={() => openUtilityPage("account")}>Account</SecondaryButton>}
        </section>
        <div className="settings-layout__search">
          <label htmlFor="settings-search">Search settings</label>
          <div><input id="settings-search" type="search" value={visibleQuery} onChange={event => setQuery(event.target.value)} placeholder="Try theme, ZIP, backup…" autoComplete="off" />{visibleQuery ? <button type="button" onClick={() => { setQuery(""); document.getElementById("settings-search")?.focus(); }}>Clear</button> : null}</div>
        </div>
        <nav className="settings-layout__categories" aria-label="Settings categories">
          {SETTINGS_CATEGORIES.map(item => <button key={item} type="button" aria-pressed={!visibleQuery.trim() && visibleCategory === item} onClick={() => { setCategory(item); setQuery(""); }}>{item}</button>)}
        </nav>
        <SettingsGroup id="settings-results-heading" title={visibleQuery.trim() ? "Search results" : visibleCategory}>
          {/* Filtering must preserve drafts and any recovery review already in progress. */}
          {entries.map(entry => <div key={entry.id} hidden={!visibleIds.has(entry.id)} className="settings-layout__entry">{entry.content ? <SettingsDisclosure icon={entry.icon} title={entry.title} description={entry.description} reviewRequested={entry.id === "sync" && cloudSyncReviewRequested} onReviewShown={handleCloudReviewShown}>{entry.content()}</SettingsDisclosure> : <SettingsRow {...entry} />}</div>)}
        </SettingsGroup>
        {visibleQuery.trim() ? <p className="settings-layout__search-status" role="status">{visibleEntries.length ? visibleEntries.length + (visibleEntries.length === 1 ? " matching setting" : " matching settings") : "No settings found. Try a shorter word, or choose a category."}</p> : null}
        <footer className="settings-layout__footer"><span>Code 3 TCG{PUBLIC_APP_VERSION_LABEL ? " · " + PUBLIC_APP_VERSION_LABEL : ""}</span>{typeof openCompassSearch === "function" ? <button type="button" onClick={() => openCompassSearch("you_compass")}>Search the app</button> : null}</footer>
      </div>
    ),
  });
}
