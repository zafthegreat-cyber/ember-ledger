import { AppNavIcon } from "../components/command-system/AppNavIcon.jsx";
import { PageHeader, SecondaryButton } from "../components/operations/OperationsUI.jsx";
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

function SettingsDisclosure({ icon, title, description, children }) {
  return (
    <details className="settings-layout__disclosure">
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
  const {
    activeWorkspaceName = "",
    adaptiveUiState = {},
    betaReadinessData = {},
    betaAccessAllowed,
    commandDeskSellerAccess = false,
    dashboardPreset,
    dashboardPresetLabel,
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
    signedInWithSupabase,
  } = props;
  const setupLabel = dashboardPresetLabel(dashboardPreset);
  const familyModeLabel = adaptiveUiState.modeLabel || setupLabel || "Collector view";
  const accountLabel = signedInWithSupabase ? "Cloud account" : guestPreviewActive ? "Guest preview" : "Local beta";
  const accessLabel = betaAccessAllowed() ? "Beta approved" : "Limited preview";
  const familyProtectionLabel = /no kids program request/i.test(String(settingsFamilyStatusLabel || ""))
    ? "Parent guard ready"
    : settingsFamilyStatusLabel || "Protected";
  const kidApplicationCount = Array.isArray(betaReadinessData.kidsApplications)
    ? betaReadinessData.kidsApplications.length
    : 0;
  const openBeacon = typeof openBeaconCenter === "function" ? openBeaconCenter : () => openUtilityPage("settings");

  return renderUtilityPageShell({
    title: "Settings",
    subtitle: "Your account, preferences, and family controls.",
    className: "settings-utility-page settings-layout-shell",
    hideCommandHeader: true,
    children: (
      <div className="settings-layout">
        <PageHeader
          eyebrow="Your space"
          title="Settings"
          description="Your workspace, tuned to the way you collect."
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
            <div><dt>Experience</dt><dd>{familyModeLabel}<span>Setup: {setupLabel}</span></dd></div>
            <div><dt>Family protection</dt><dd>{familyProtectionLabel}</dd></div>
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
                <SettingsDisclosure icon="workspace" title="Your workspace" description="Personal and business settings">
                  {renderSettingsWorkspaceCard()}
                </SettingsDisclosure>
              ) : null}
              <SettingsRow icon="account" title="Account & security" description="Sign-in, private account details, and access" onClick={() => openUtilityPage("account")} />
              <SettingsRow icon="bell" title="Notifications" description="Open Beacon to review alerts and reminders" status={notificationUnreadCount ? `${notificationUnreadCount} unread` : "All quiet"} onClick={() => openBeacon("you_beacon")} />
              <SettingsRow icon="plan" title="Plans & access" description="Plan limits, family pricing, and access review" onClick={() => openUtilityPage("membership")} />
            </SettingsGroup>

            <SettingsGroup id="settings-support-heading" title="Records & support">
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
            <SettingsGroup id="settings-family-heading" title="Family & community">
              <SettingsRow icon="community" title="Family permissions" description="Open Nest for child profiles and parent approvals" status={kidApplicationCount ? `${kidApplicationCount} request${kidApplicationCount === 1 ? "" : "s"}` : undefined} onClick={() => openUtilityPage("parentCenter")} />
              <SettingsRow icon="secure" title="Safety center" description="Lantern guidance for safe collecting and trading" onClick={() => openUtilityPage("trust")} />
              <SettingsRow icon="spark" title="The Spark" description="Kid-pack requests, donations, and giving" onClick={() => openUtilityPage("kidsProgram")} />
              <SettingsRow icon="pool" title="Community" description="Tidepool events, trusted shops, and local connections" onClick={() => openUtilityPage("tidepool")} />
              {typeof renderSettingsPrivacySafetyCard === "function" ? (
                <SettingsDisclosure icon="secure" title="Privacy & safeguards" description="How your family, location, and records stay private">
                  {renderSettingsPrivacySafetyCard()}
                </SettingsDisclosure>
              ) : null}
            </SettingsGroup>

            <aside className="settings-layout__note" aria-labelledby="settings-access-heading">
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
            </aside>
          </div>
        </div>
        <footer className="settings-layout__footer"><span>Code 3 TCG</span>{PUBLIC_APP_VERSION_LABEL ? <span>{PUBLIC_APP_VERSION_LABEL}</span> : null}</footer>
      </div>
    ),
  });
}
