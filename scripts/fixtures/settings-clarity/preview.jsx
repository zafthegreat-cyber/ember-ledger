import React, {useState, useCallback} from "react";
import {createRoot} from "react-dom/client";
import Menu from "../../../src/pages/Menu.jsx";
import {ExperiencePreferences} from "../../../src/components/ExperienceControls.jsx";
import {CloudWorkspaceContext} from "../../../src/features/persistence/CloudWorkspaceContext.js";
import {resolveExperiencePresentation} from "../../../src/utils/experiencePresentation.js";
import {STORE_DIRECTORY_STATES, storeStateShortName} from "../../../src/data/storeStates.js";
import {IN_APP_ALERT_DISCLOSURE,NATIVE_ALERT_DISCLOSURE,NOTIFICATION_PREFERENCE_ROWS} from "../../../src/utils/notificationCenterUtils.js";
import "../../../src/App.css";
import "../focused-ui/preview.css";
function Preview() {
 const [theme,setTheme]=useState("dark");
 const [crashReportsAllowedState,setCrashReportsOn]=useState(false);
 const setCrashReportingAllowed=()=>{},actualAdminUser=false,settingsFamilyStatusLabel="Protected",commandDeskSellerAccess=false;
 const [family,setFamily]=useState(false);
 const [review,setReview]=useState(false);
 const [notice,setNotice]=useState("");
 const [dashboardCardStyle,updateDashboardCardStyle]=useState("comfortable");
 const [locationSettings,setLocation]=useState({manualLocation:"",trackingEnabled:false});
 const [storeDirectoryState,chooseStoreDirectoryState]=useState("VA");
 const [effectiveNotificationPreferences,setAlerts]=useState({});
 const [personal,setPersonal]=useState({experiencePersona:"collector",optionalTools:{}});
 const experiencePresentation=resolveExperiencePresentation({personaPreference:personal.experiencePersona});
 const optionalExperienceTools=personal.optionalTools,showFamilyExperience=family;
 const updateAppSetupPersonalization=(update,message)=>{setPersonal(update);setNotice(message)};
 const settingsAppPreferencePersistenceLabel="Preview only — changes stay in memory";
 const resolvedAppTheme=theme,DASHBOARD_CARD_STYLES=["compact","comfortable","detailed"];
 const renderThemeChoiceControl=()=> <div className="theme-choice-grid">{["light","dark"].map(t=><button key={t} className={"theme-choice-card"+(theme===t?" is-selected":"")} onClick={()=>setTheme(t)}><strong>{t==="light"?"Light":"Dark"}</strong></button>)}</div>;
 const updateLocationSettings=patch=>setLocation(current=>({...current,...patch}));
 const saveManualLocation=()=>setNotice("Sample home area saved in preview memory.");
 const disableLocationTracking=()=>setNotice("Sample device location is off.");
 const storeDirectoryStateSource="manual",settingsFollowedStores=[],settingsStoreAlertPersistenceLabel="Choose stores for alerts";
 const setActiveTab=value=>setNotice("Open "+value+" (preview only)."),setScoutView=setActiveTab,setScoutStoresMode=setActiveTab,openSmartSetupFlow=()=>setActiveTab("setup");
 const nativeAlerts=false,updateNotificationPreference=(key,value)=>setAlerts(current=>({...current,[key]:value}));
 const cloud={user:null,enabled:false,status:{status:"IDLE",message:"Preview only. No cloud account is connected."},setEnabled:()=>setNotice("Cloud control selected (preview only)."),syncNow:async()=>({status:"IDLE"})};
 const onReviewShown=useCallback(()=>{setReview(false);setNotice("Cloud review opened and focused.")},[]);
  function renderSettingsPreferencesCard(section = "all") {
    const show = (name) => section === "all" || section === name;
    return (
      <section className="drawer-info-card settings-preferences-card utility-card utility-card-wide">
        {show("experience") && <ExperiencePreferences experience={experiencePresentation} optionalTools={{ ...optionalExperienceTools, family: showFamilyExperience }} previewActive={experiencePresentation.isPreview} onPersonaChange={(persona) => updateAppSetupPersonalization((current) => ({ ...current, experiencePersona: persona }), "Your experience is updated. Existing records are kept.")} onOptionalToolChange={(key, enabled) => updateAppSetupPersonalization((current) => ({ ...current, optionalTools: { ...current.optionalTools, [key]: enabled }, optionalToolsCustomized: [...new Set([...(current.optionalToolsCustomized || []), key])] }), "Optional tools updated.")} />}
        {section === "all" && <div className="compact-card-header">
          <div>
            <strong>Preferences</strong>
            <p className="compact-subtitle">Theme, notifications, home area, stores, and display controls stay grouped here.</p>
          </div>
          <span className="status-badge">{settingsAppPreferencePersistenceLabel}</span>
        </div>}
        <div className="settings-preference-grid">
          {show("appearance") && <article className="settings-preference-panel">
            <span>Appearance</span>
            <strong>{resolvedAppTheme === "dark" ? "Dark appearance" : "Light appearance"}</strong>
            <p>Choose a theme and card spacing.</p>
            {renderThemeChoiceControl({ compact: true })}
            <p className="compact-subtitle">Current density: {dashboardCardStyle}.</p>
            <div className="drawer-inline-actions">
              {DASHBOARD_CARD_STYLES.map((style) => (
                <button key={style} type="button" className={dashboardCardStyle === style ? "drawer-link active" : "drawer-link"} onClick={() => updateDashboardCardStyle(style)}>
                  {style.charAt(0).toUpperCase() + style.slice(1)}
                </button>
              ))}
            </div>
          </article>}
          {show("location") && <article className="settings-preference-panel">
            <span>Home area</span>
            <strong>{locationSettings.manualLocation || locationSettings.selectedSavedLocation || "Not set"}</strong>
            <p>Used for nearby watched stores. Exact user location is never shown publicly.</p>
            <input className="drawer-field" aria-label="Home area / ZIP or city" value={locationSettings.manualLocation} onChange={(event) => updateLocationSettings({ mode: "manual", manualLocation: event.target.value, trackingEnabled: false })} placeholder="ZIP or city" />
            <div className="drawer-inline-actions">
              <button type="button" className="drawer-link" onClick={saveManualLocation}>Save area</button>
              <button type="button" className="secondary-button" onClick={disableLocationTracking}>Turn off device location</button>
            </div>
          </article>}
          {show("location") && <article className="settings-preference-panel">
            <span>Restocks state</span>
            <strong>{storeStateShortName(storeDirectoryState)}</strong>
            <p>{storeDirectoryStateSource === "detected" ? "Matched from your home area. Pick a state to change it." : "Restocks shows stores and reports for this state."}</p>
            <select className="drawer-field" aria-label="Restocks state" value={storeDirectoryState} onChange={(event) => chooseStoreDirectoryState(event.target.value)}>
              {STORE_DIRECTORY_STATES.map((state) => <option key={state.code} value={state.code}>{state.shortName}</option>)}
            </select>
          </article>}
          {show("location") && <article className="settings-preference-panel">
            <span>Favorite stores</span>
            <strong>{settingsFollowedStores.length} followed</strong>
            <p>{settingsStoreAlertPersistenceLabel}. Hide irrelevant stores from Smart Setup when possible.</p>
            <div className="drawer-inline-actions">
              <button type="button" className="drawer-link" onClick={() => { setActiveTab("scout"); setScoutView("stores"); setScoutStoresMode("map"); }}>Manage stores</button>
              <button type="button" className="secondary-button" onClick={() => openSmartSetupFlow({ reset: false })}>Update setup</button>
            </div>
          </article>}
          {show("notifications") && <article className="settings-preference-panel">
            <span>Notifications</span>
            <strong>In-app alerts</strong>
            <p>{nativeAlerts ? NATIVE_ALERT_DISCLOSURE : IN_APP_ALERT_DISCLOSURE}</p>
            <div className="settings-toggle-stack">
              {NOTIFICATION_PREFERENCE_ROWS.slice(0, 4).map((row) => (
                <label className="toggle-row" key={row.key}>
                  <span><strong>{row.label}</strong><small>{row.description}</small></span>
                  <input type="checkbox" checked={effectiveNotificationPreferences[row.key] !== false} onChange={(event) => updateNotificationPreference(row.key, event.target.checked)} />
                </label>
              ))}
            </div>
          </article>}
        </div>
      </section>
    );
  }


  function renderSettingsPrivacySafetyCard() {
    const crashReportsOn = crashReportsAllowedState;
    const privacyRows = [
      { title: "Private location", body: "Exact user location is never shown publicly. Reports are shared by store, not private address.", status: locationSettings.trackingEnabled ? "Device location on" : "Manual/local" },
      { title: "Child privacy", body: "Child-sensitive details stay parent-managed. Public child profiles and private family information are not exposed.", status: "Protected" },
      { title: "No open kid messaging", body: "The app does not enable unmoderated child messaging. Family tools stay parent-guided.", status: "Not connected" },
      { title: "Protected restock data", body: "Raw restock history, exact pattern windows, and unsafe restock details stay hidden from normal users.", status: "Guarded" },
      { title: "Role-scoped tools", body: "Business, shop, admin, and moderation surfaces follow role and workspace access instead of public visibility.", status: "Scoped" },
      { title: "Family-safe community", body: "Public community areas stay family-friendly. Use report/block when something feels off.", status: settingsFamilyStatusLabel },
      { title: "Admin review", body: "Flagged reports, posts, Spark requests, and support messages may be reviewed by approved admins.", status: actualAdminUser ? "Admin visible" : "Protected" },
      { title: "Business records", body: "Business sales, receipts, mileage, and expenses stay private to seller/business workspaces.", status: commandDeskSellerAccess ? "Seller enabled" : "Hidden" },
    ];
    return (
      <section className="drawer-info-card settings-privacy-trust-card settings-privacy-safety-card utility-card utility-card-wide">
        <div className="compact-card-header">
          <div>
            <strong>Privacy &amp; Safety</strong>
            <p className="compact-subtitle">Clear guardrails for location, family data, public areas, and admin review.</p>
          </div>
          <span className="status-badge">Private by default</span>
        </div>
        <label className="checkbox-row settings-crash-reports-toggle">
          <input type="checkbox" checked={crashReportsOn} onChange={(event) => { setCrashReportingAllowed(event.target.checked); setCrashReportsOn(event.target.checked); }} />
          <span><strong>Send crash reports</strong> — when the app breaks, send a report with the error, the screen you were on and your device type. No emails, record contents or card numbers are ever included. Turned off automatically for kid profiles.</span>
        </label>
        <div className="drawer-inline-actions">
          <button type="button" className="secondary-button" onClick={() => setActiveTab("trust")}>Privacy policy</button>
          <button type="button" className="secondary-button" onClick={() => setActiveTab("delete-account")}>Delete account</button>
        </div>
        <details className="settings-privacy-explainer"><summary>How your information is protected</summary>
        <div className="settings-section-grid compact">
          {privacyRows.map((row) => (
            <article className="settings-section-card" key={row.title}>
              <strong>{row.title}</strong>
              <span>{row.body}</span>
              <small className="status-badge">{row.status}</small>
            </article>
          ))}
        </div>
        </details>
      </section>
    );
  }


 return <div className="app app-command-shell focused-preview" data-theme={theme}>
  <header className="preview-toolbar"><strong>CODE 3 TCG <small>Unpublished Settings preview</small></strong><button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>{theme==="dark"?"Light":"Dark"} theme</button></header>
  <main className="preview-main"><CloudWorkspaceContext.Provider value={cloud}><Menu
    activeWorkspaceName="My collection" userEmail="collector@example.com" signedInWithSupabase
    experiencePresentation={experiencePresentation} showFamilyExperience={family} showCommunityExperience={family}
    betaAccessAllowed={()=>true} cloudSyncReviewRequested={review} onCloudSyncReviewShown={onReviewShown}
    signOut={()=>setNotice("Sign out selected (preview only).")} startAppTour={()=>setNotice("Tour selected (preview only).")}
    openUtilityPage={setActiveTab} openBeaconCenter={()=>setActiveTab("notifications")} openCompassSearch={()=>setActiveTab("app search")}
    renderUtilityPageShell={({children,className})=><section className={className}>{children}</section>}
    renderSettingsPreferencesCard={renderSettingsPreferencesCard}
    renderSettingsWorkspaceCard={()=><div className="utility-card"><h3>My collection</h3><p>Personal workspace</p><button className="secondary-button" onClick={()=>setActiveTab("workspace")}>Manage workspace</button></div>}
    renderSettingsPrivacySafetyCard={renderSettingsPrivacySafetyCard}
    renderAppBuildDetails={()=><p>Unpublished Settings preview · sample account</p>} PUBLIC_APP_VERSION_LABEL="Preview"
   /></CloudWorkspaceContext.Provider>
   {notice&&<p role="status">{notice}</p>}
   <details className="preview-test-tools"><summary>Preview test tools</summary><button onClick={()=>setFamily(f=>!f)}>Toggle family & community</button><button onClick={()=>setReview(true)}>Test sync review link</button></details>
  </main><footer className="preview-footer">Sample account · Preferences stay in memory · No records or prices changed</footer>
 </div>;
}
createRoot(document.getElementById("root")).render(<Preview />);
