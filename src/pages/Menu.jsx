import { useEffect, useRef } from "react";
import { AppNavIcon } from "../components/command-system/AppNavIcon.jsx";
import { PageHeader, SecondaryButton } from "../components/operations/OperationsUI.jsx";
import CloudSyncPanel from "../features/persistence/CloudSyncPanel.jsx";
import { useCloudWorkspace } from "../features/persistence/CloudWorkspaceContext.js";
import { resolveExperiencePresentation } from "../utils/experiencePresentation.js";
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
  useEffect(() => {
    if (!reviewRequested) return undefined;
    const disclosure = disclosureRef.current;
    disclosure.open = true;
    // Wait until route-level focus has settled, including a lazy Settings mount.
    let focusFrame;
    const routeFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        const summary = disclosure.querySelector("summary");
        summary?.focus({ preventScroll: true });
        summary?.scrollIntoView({ block: "center", behavior: "auto" });
        onReviewShown?.();
      });
    });
    return () => { cancelAnimationFrame(routeFrame); cancelAnimationFrame(focusFrame); };
  }, [reviewRequested, onReviewShown]);
  return (
    <details ref={disclosureRef} className="settings-layout__disclosure">
      <summary>
        <span className="settings-layout__row-icon" aria-hidden="true"><AppNavIcon kind={icon} /></span>
        <span className="settings-layout__row-copy"><strong>{title}</strong><span>{description}</span></span>
        <SettingsArrow />
      </summary>
      <div className="settings-layout__detail-content">{children}</div>
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
  } = props;
  const presentation = experiencePresentation || resolveExperiencePresentation();
  const showFamily = presentation.showAdminTools || (typeof showFamilyExperience === "boolean" ? showFamilyExperience : presentation.showFamilyTools);
  const showCommunity = presentation.showAdminTools || showCommunityExperience === true;
  const preferencesDescription = presentation.isStore ? "Your store workspace, preferences, and privacy." : presentation.isSeller ? "Your selling workspace, preferences, and privacy." : "Your workspace, tuned to the way you collect.";
  const accountLabel = signedInWithSupabase ? "Cloud account" : guestPreviewActive ? "Guest preview" : "Local beta";
  const accessLabel = betaAccessAllowed() ? "Ready" : "Guest preview";
  const familyProtectionLabel = /no kids program request/i.test(String(settingsFamilyStatusLabel || ""))
    ? "Parent guard ready"
    : settingsFamilyStatusLabel || "Protected";
  const kidApplicationCount = Array.isArray(betaReadinessData.kidsApplications)
    ? betaReadinessData.kidsApplications.length
    : 0;
  const openBeacon = typeof openBeaconCenter === "function" ? openBeaconCenter : () => openUtilityPage("settings");

  return renderUtilityPageShell({
    title: "Settings",
    subtitle: "Your account, preferences, and privacy.",
    className: "settings-utility-page settings-layout-shell",
    hideCommandHeader: true,
    children: (
      <div className="settings-layout">
        <PageHeader
          eyebrow="Your space"
          title="Settings"
          description={preferencesDescription}
          actions={typeof openCompassSearch === "function" ? <SecondaryButton onClick={() => openCompassSearch("you_compass")}><AppNavIcon kind="search" />Search the app</SecondaryButton> : null}
        />

        <section className="settings-layout__account" aria-label="Account overview">
          <span className="settings-layout__avatar" aria-hidden="true"><AppNavIcon kind="account" /></span>
          <div className="settings-layout__identity">
            <span className="settings-layout__eyebrow">Current workspace</span>
            <h2>{activeWorkspaceName || "My Personal Space"}</h2>
            <p><span className="settings-layout__account-type">{accountLabel}</span><span>{accessLabel}</span></p>
          </div>
          <SecondaryButton onClick={() => openUtilityPage("profile")}>Open Profile<SettingsArrow /></SecondaryButton>
          <dl className="settings-layout__account-meta">
            <div><dt>Experience</dt><dd>{presentation.personaLabel}</dd></div>
            {showFamily ? <div><dt>Family protection</dt><dd>{familyProtectionLabel}</dd></div> : null}
            <div><dt>Scout trust</dt><dd>{scoutGuessPoints} pts<span>Report history and proof signals</span></dd></div>
          </dl>
        </section>

        <div className="settings-layout__columns">
          <div className="settings-layout__column">
            <SettingsGroup id="settings-account-heading" title="Account & app">
              {typeof renderSettingsPreferencesCard === "function" ? (
                <SettingsDisclosure icon="settings" title="Appearance & preferences" description="Theme, display, home area, and alerts">
                  {renderSettingsPreferencesCard()}
                </SettingsDisclosure>
              ) : null}
              {typeof renderSettingsWorkspaceCard === "function" ? (
                <SettingsDisclosure icon="workspace" title="Your workspace" description={presentation.isBusiness ? "Workspace and business settings" : "Workspace and collection settings"}>
                  {renderSettingsWorkspaceCard()}
                </SettingsDisclosure>
              ) : null}
              <SettingsRow icon="account" title="Account & security" description="Sign-in, private account details, and access" onClick={() => openUtilityPage("account")} />
              <SettingsRow icon="bell" title="Notifications" description="Open Beacon to review alerts and reminders" status={notificationUnreadCount ? `${notificationUnreadCount} unread` : "All quiet"} onClick={() => openBeacon("you_beacon")} />
              <SettingsRow icon="plan" title="Plans & access" description="Plan limits and access review" onClick={() => openUtilityPage("membership")} />
            </SettingsGroup>

            <SettingsGroup id="settings-support-heading" title="Records & support">
              {cloudWorkspace && <SettingsDisclosure icon="data" title="Cloud saving & recovery" description="Account backups, device sync, and signed-in devices" reviewRequested={cloudSyncReviewRequested} onReviewShown={onCloudSyncReviewShown}><CloudSyncPanel /></SettingsDisclosure>}
              <SettingsRow icon="data" title="Archive & backups" description="Receipts, proof, exports, and private records" status={commandDeskSellerAccess ? "Seller records" : undefined} onClick={() => openUtilityPage("dataBackup")} />
              <SettingsRow icon="help" title="Help & app status" description="Get help, share feedback, or check known issues" onClick={() => openUtilityPage("help")} />
              {typeof renderAppBuildDetails === "function" ? (
                <SettingsDisclosure icon="data" title="About Code 3 TCG" description="App version and build details">
                  {renderAppBuildDetails()}
                </SettingsDisclosure>
              ) : null}
            </SettingsGroup>
          </div>

          <div className="settings-layout__column">
            <SettingsGroup id="settings-family-heading" title={showFamily && showCommunity ? "Family, community & safety" : showFamily ? "Family & safety" : showCommunity ? "Community & safety" : "Privacy & safety"}>
              {showFamily ? <SettingsRow icon="community" title="Family permissions" description="Child profiles and parent approvals" status={kidApplicationCount ? `${kidApplicationCount} request${kidApplicationCount === 1 ? "" : "s"}` : undefined} onClick={() => openUtilityPage("parentCenter")} /> : null}
              <SettingsRow icon="secure" title="Safety center" description="Guidance for safe collecting and trading" onClick={() => openUtilityPage("trust")} />
              {showFamily ? <SettingsRow icon="spark" title="The Spark" description="Kid-pack requests, donations, and giving" onClick={() => openUtilityPage("kidsProgram")} /> : null}
              {showCommunity ? <SettingsRow icon="pool" title="Community" description="Local events, trusted shops, and connections" onClick={() => openUtilityPage("tidepool")} /> : null}
              {typeof renderSettingsPrivacySafetyCard === "function" ? (
                <SettingsDisclosure icon="secure" title="Privacy & safeguards" description={showFamily ? "How your family, location, and records stay private" : "How your location and records stay private"}>
                  {renderSettingsPrivacySafetyCard()}
                </SettingsDisclosure>
              ) : null}
            </SettingsGroup>

            {showFamily ? <aside className="settings-layout__note" aria-labelledby="settings-access-heading">
              <span className="settings-layout__note-icon" aria-hidden="true"><AppNavIcon kind="community" /></span>
              <div>
                <h2 id="settings-access-heading">Room for every collector.</h2>
                <p>Family pricing and access support follow a private, human-reviewed process. Your sensitive details stay out of public profiles.</p>
                <details>
                  <summary>How access review works</summary>
                  <ol>
                    <li><strong>Request support</strong><span>Start in Plans or Support.</span></li>
                    <li><strong>Private evidence review</strong><span>Only the minimum evidence needed for a decision.</span></li>
                    <li><strong>Reviewed decision</strong><span>Discounts never auto-apply.</span></li>
                    <li><strong>A gentle recheck</strong><span>Avoid repeated sensitive proof.</span></li>
                  </ol>
                </details>
              </div>
            </aside> : null}
          </div>
        </div>
        <footer className="settings-layout__footer"><span>Code 3 TCG</span>{PUBLIC_APP_VERSION_LABEL ? <span>{PUBLIC_APP_VERSION_LABEL}</span> : null}</footer>
      </div>
    ),
  });
}
