import { useId, useRef } from "react";
import { useModalFocus } from "../../components/operations/useModalFocus.js";
import MenuNavigation from "./MenuNavigation.jsx";
import MenuItemIcon from "./MenuItemIcon.jsx";
import "./menu-drawer.css";

// App owns state, authority and handlers; only this existing renderer is deferred.
export default function MenuDrawerContent({ scope }) {
  const {
    APP_STRUCTURE_LINKS,
    AppNavIcon,
    BATCH_INTAKE_MODES,
    BETA_LOCAL_MODE,
    BETA_MODE_COPY,
    BRAND_CONFIG,
    BackupExportImport,
    DASHBOARD_CARD_STYLES,
    DATA_REQUEST_TYPES,
    DEFAULT_PERSONAL_WORKSPACE_ID,
    FORGE_IDENTITY_MODE_OPTIONS,
    Field,
    IN_APP_ALERT_DISCLOSURE,
    LazyToolBoundary,
    NOTIFICATION_PREFERENCE_ROWS,
    PUBLIC_APP_VERSION_LABEL,
    SIGNUP_BETA_ACK_TEXT,
    SIGNUP_NAME_HELPER,
    SIGNUP_TERMS_TEXT,
    TCG_OS_MODES,
    TIER_LABELS,
    UNIVERSAL_DATA_ENTITIES,
    WORKSPACE_NAME_MAX_LENGTH,
    WORKSPACE_ROLES,
    WORKSPACE_TYPES,
    acceptWorkspaceInvite,
    accountEmail,
    accountStatusDescription,
    accountStatusTitle,
    activeCollectionCount,
    activeForgeIdentityMode,
    activeForgeModeSummary,
    activeForgeWorkspace,
    activeWorkspace,
    activeWorkspaceRole,
    actualAdminRole,
    actualAdminUser,
    adaptiveUiState,
    adminEditModeActive,
    adminToolsVisible,
    adminViewMode,
    adminViewingAsAdmin,
    appRefreshInProgress,
    appUpdate,
    applyBetaBackupImport,
    applyHomeViewPreset,
    authBetaAcknowledged,
    authEmail,
    authError,
    authFirstName,
    authLastName,
    authLoading,
    authMessage,
    authMode,
    authPassword,
    authPublicUsername,
    authTermsAccepted,
    backupImportMessage,
    backupImportPreview,
    canEditActiveWorkspace,
    canManageActiveWorkspace,
    canManageInviteWorkspace,
    changeActiveWorkspace,
    cloudSyncPreference,
    commandDeskSellerAccess,
    copyWorkspaceInviteLink,
    createWorkspace,
    currentPlan,
    currentTier,
    currentUserProfile,
    dashboardCardStyle,
    dashboardPreset,
    dashboardSectionState,
    dataRequestForm,
    disableLocationTracking,
    downloadBackup,
    effectiveNotificationPreferences,
    experiencePresentation,
    emberTideForgeWorkspace,
    enableLocationTracking,
    exitGuestPreview,
    forgeIdentityModeDescription,
    forgeIdentityModeLabel,
    forgeInventoryItems,
    forgeModeSettings,
    forgeWorkspaceOptions,
    forgeWorkspaceUnavailableMessage,
    guestPreviewActive,
    handleAuth,
    handleBackupFileUpload,
    handlePasswordResetRequest,
    handleSafeAppRefresh,
    handleSignedInPasswordReset,
    homeStatsEnabled,
    isDesktopSidebarItemActive,
    isProtectedWorkspace,
    isSupabaseConfigured,
    locationSettings,
    menuCommandSections,
    menuLocation,
    menuCurrentWorkspaceId,
    switcherWorkspaces,
    navigateProductWorkspace,
    menuDashboardSectionRows,
    menuHomeStatRows,
    navigateMainTab,
    normalizeDashboardPreset,
    normalizeForgeIdentityMode,
    normalizePublicUsername,
    normalizeUserType,
    notificationPreferenceRows,
    openAddActionSheet,
    openBulkAddFlow,
    openCollectorEventPlannerSurface,
    openFeedbackDialog,
    openInventoryImportAssistant,
    openOperatingSystemFeature,
    openPasswordResetRequest,
    openPublicBetaFeedback,
    openTidepoolCommunity,
    openUtilityPage,
    openWishlistIsoSurface,
    openWorkspaceArchive,
    openWorkspaceRename,
    passwordResetEmail,
    passwordResetError,
    passwordResetLoading,
    passwordResetMessage,
    profileForm,
    profileSaving,
    publicIdentityForProfile,
    publicProfileForCurrentUser,
    publicProfileLabel,
    renderAppBuildDetails,
    renderCommunityProfileSummary,
    renderMenuPullDown,
    renderOnboardingSettingsCard,
    renderThemeChoiceControl,
    renderUsernameRulesCard,
    requestLockedFeatureAccess,
    resetBetaLocalData,
    resetWorkspaceIdentityForm,
    resolvedAppTheme,
    restartOnboarding,
    runFeedbackAiSummary,
    runMenuAction,
    runNotificationCopyAiAssist,
    runSettingsHelpAiAssist,
    saveManualLocation,
    saveProfileSettings,
    saveWorkspaceIdentitySettings,
    scoutBackendSync,
    scoutGuessPoints,
    scoutSnapshot,
    sendWorkspaceInvite,
    setActiveTab,
    setAdminEditMode,
    setAdminModeView,
    setAdminReviewFilter,
    setAuthBetaAcknowledged,
    setAuthEmail,
    setAuthError,
    setAuthFirstName,
    setAuthLastName,
    setAuthMessage,
    setAuthMode,
    setAuthPassword,
    setAuthPublicUsername,
    setAuthTermsAccepted,
    setCollectionManagerOpen,
    setDataRequestForm,
    setMenuOpen,
    setPasswordResetEmail,
    setPasswordResetError,
    setPasswordResetMessage,
    setPersonalForgeEnabled,
    setProfileForm,
    setScoutStoresMode,
    setScoutView,
    setVaultToast,
    setWorkspaceForm,
    setWorkspaceInviteForm,
    settingsAppPreferencePersistenceLabel,
    settingsFamilyStatusLabel,
    settingsFollowedStores,
    settingsProfilePersistenceLabel,
    settingsScoutAlertPersistenceLabel,
    settingsSectionRows,
    settingsSellerModeActive,
    settingsStoreAlertPersistenceLabel,
    settingsTrustSourceLabel,
    signOut,
    signedInWithSupabase,
    storageStatus,
    submitDataRequest,
    updateCloudSyncPreference,
    updateDashboardCardStyle,
    updateDashboardSection,
    updateForgeModeSettings,
    updateHomeStatsEnabled,
    updateLocationSettings,
    updateNotificationPreference,
    updateScoutAlertPreference,
    updateWorkspaceIdentityForm,
    userType,
    vaultItems,
    workspaceForm,
    workspaceIdentityForm,
    workspaceIdentityMessage,
    workspaceInviteDelivery,
    workspaceInviteForm,
    workspaceInviteLinkForInvite,
    workspaceInviteSending,
    workspaceInvites,
    workspaceMembers,
    workspaceMessage,
    workspaceRecordCountsFor,
    workspaceRoleLabel,
    workspaceSelectorOptions,
    workspaceTypeLabel,
    workspaces,
  } = scope;
  const titleId = useId();
  const menuOpenerRef = useRef(typeof document === "undefined" ? null : document.activeElement);
  const { dialogRef, onKeyDown } = useModalFocus(true, () => setMenuOpen(false));
  const settingsItem = menuCommandSections.flatMap(section => section.items).find(item => item.key === "settings");

  function isMenuItemActive(item) {
    if (item.target) return menuLocation.activeTab === item.target;
    if (item.key === "scout") return menuLocation.activeTab === "flipScout" && menuLocation.flipScoutView === "restocks";
    if (item.key === "watchList") return menuLocation.activeTab === "scout" && menuLocation.scoutView === "alerts";
    const utilityTabs = { membership: "membership", privacySafety: "trust", parentCenter: "parentCenter", shopPortal: "sponsor" };
    if (utilityTabs[item.key]) return menuLocation.activeTab === utilityTabs[item.key];
    return isDesktopSidebarItemActive(item);
  }

  function openMenuItem(item) {
    if (item.keepOpen) {
      item.action?.();
      return;
    }
    runMenuAction(() => {
      if (!item.action) return navigateMainTab(item);
      // The report dialog outlives this drawer, so return to its persistent opener.
      if (item.key === "reportRestock") return item.action({ returnFocusTo: menuOpenerRef.current });
      return item.action();
    });
  }

  function renderDeferredMenuDrawer() {
    return (<>
          <div className="drawer-backdrop code3-menu-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />

          <aside ref={dialogRef} className="drawer menu-drawer navigation-drawer code3-menu-drawer open" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
            <div className="drawer-header">
              <div className="menu-brand-heading"><img src={BRAND_CONFIG.logoReference} alt="" /><div><p>{BRAND_CONFIG.applicationDisplayName}</p><h2 id={titleId}>Menu</h2></div></div>
              <button type="button" className="secondary-button drawer-close-button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
            </div>
            <MenuNavigation sections={menuCommandSections} NavIcon={AppNavIcon} isItemActive={isMenuItemActive} onSelect={openMenuItem} onAdd={() => openAddActionSheet("menu")} modeLabel={experiencePresentation?.personaLabel || adaptiveUiState.modeLabel} experiencePresentation={experiencePresentation} workspaces={switcherWorkspaces} currentWorkspaceId={menuCurrentWorkspaceId} onSelectWorkspace={workspace => runMenuAction(() => navigateProductWorkspace(workspace.id))}>
              {renderMenuPullDown("account", "Account", "App version, sign-in, private beta status, and account actions", (
                <div className="drawer-links">
                  <div className="drawer-info-card account-status-card">
                    <div>
                      <h3>{accountStatusTitle}</h3>
                      <p className="compact-subtitle">{accountStatusDescription}</p>
                    </div>
                    <dl className="drawer-status-list">
                  <div><dt>App Version</dt><dd>{BRAND_CONFIG.applicationDisplayName} beta web application</dd></div>
                      <div><dt>Account</dt><dd>{guestPreviewActive ? "Guest preview" : signedInWithSupabase ? "Supabase" : "Private beta"}</dd></div>
                      <div><dt>Role</dt><dd>{actualAdminUser ? actualAdminRole : "user"}</dd></div>
                      <div><dt>Tier</dt><dd>{TIER_LABELS[currentTier] || "Free"}</dd></div>
                      <div><dt>Data</dt><dd>{guestPreviewActive ? "Read-only preview" : cloudSyncPreference === "cloud" ? "Local now, cloud sync requested" : "Stored on this device"}</dd></div>
                    </dl>
                    {actualAdminUser ? <span className="status-badge">{actualAdminRole}</span> : null}
                  </div>
                  {guestPreviewActive ? (
                    <div className="drawer-info-card">
                      <strong>Preview mode</strong>
                      <p className="compact-subtitle">You can browse the app, but saving inventory, reports, scans, and settings requires a free account.</p>
                      <div className="drawer-inline-actions">
                        <button type="button" className="drawer-link" onClick={() => runMenuAction(exitGuestPreview)}>Back to Log In</button>
                        <button
                          type="button"
                          className="drawer-link"
                          onClick={() => {
                            runMenuAction(() => {
                              exitGuestPreview();
                              setAuthMode("signup");
                            });
                          }}
                        >
                          Sign Up
                        </button>
                      </div>
                    </div>
                  ) : !signedInWithSupabase ? (
                    authMode === "reset" ? (
                      <form className="drawer-info-card" onSubmit={handlePasswordResetRequest} noValidate>
                        <strong>Reset password</strong>
                        <p className="compact-subtitle">Enter your account email and we&apos;ll send a password reset link.</p>
                        {!isSupabaseConfigured ? <p className="compact-subtitle danger-text">Supabase anon auth is not configured in this frontend.</p> : null}
                        <input
                          className="drawer-field"
                          type="email"
                          value={passwordResetEmail}
                          onChange={(event) => setPasswordResetEmail(event.target.value)}
                          placeholder="Email"
                          autoComplete="email"
                        />
                        {passwordResetError ? <p className="auth-status-message error" role="alert">{passwordResetError}</p> : null}
                        {passwordResetMessage ? <p className="auth-status-message success" role="status">{passwordResetMessage}</p> : null}
                        <div className="drawer-inline-actions">
                          <button type="submit" className="drawer-link" disabled={passwordResetLoading || !isSupabaseConfigured}>
                            {passwordResetLoading ? "Sending..." : "Send reset link"}
                          </button>
                          <button
                            type="button"
                            className="drawer-link"
                            onClick={() => {
                              setPasswordResetError("");
                              setPasswordResetMessage("");
                              setAuthMode("login");
                            }}
                          >
                            Back to Sign In
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form className="drawer-info-card" onSubmit={handleAuth} noValidate>
                        <strong>{authMode === "login" ? "Sign in with Supabase" : "Create Supabase account"}</strong>
                        <p className="compact-subtitle">Sign in for admin tools and future cloud sync. User-owned beta data stays local for now.</p>
                        {!isSupabaseConfigured ? <p className="compact-subtitle danger-text">Supabase anon auth is not configured in this frontend.</p> : null}
                        {authMode === "signup" ? (
                          <>
                            <div className="drawer-two-column">
                              <input
                                className="drawer-field"
                                type="text"
                                value={authFirstName}
                                onChange={(event) => setAuthFirstName(event.target.value)}
                                placeholder="First name"
                                autoComplete="given-name"
                              />
                              <input
                                className="drawer-field"
                                type="text"
                                value={authLastName}
                                onChange={(event) => setAuthLastName(event.target.value)}
                                placeholder="Last name"
                                autoComplete="family-name"
                              />
                            </div>
                            <input
                              className="drawer-field"
                              type="text"
                              value={authPublicUsername}
                              onChange={(event) => setAuthPublicUsername(normalizePublicUsername(event.target.value))}
                              placeholder="public_username"
                              autoComplete="nickname"
                            />
                            <p className="compact-subtitle">{SIGNUP_NAME_HELPER}</p>
                            {renderUsernameRulesCard({ compact: true })}
                            <label className="checkbox-row">
                              <input type="checkbox" checked={authTermsAccepted} onChange={(event) => setAuthTermsAccepted(event.target.checked)} />
                              <span>{SIGNUP_TERMS_TEXT}</span>
                            </label>
                            <label className="checkbox-row">
                              <input type="checkbox" checked={authBetaAcknowledged} onChange={(event) => setAuthBetaAcknowledged(event.target.checked)} />
                              <span>{SIGNUP_BETA_ACK_TEXT}</span>
                            </label>
                            <button type="button" className="auth-text-button drawer-auth-link" onClick={() => runMenuAction(() => setActiveTab("trust"))}>
                              View Terms / Privacy
                            </button>
                          </>
                        ) : null}
                        <input
                          className="drawer-field"
                          type="email"
                          value={authEmail}
                          onChange={(event) => setAuthEmail(event.target.value)}
                          placeholder="Email"
                          autoComplete="email"
                        />
                        <input
                          className="drawer-field"
                          type="password"
                          value={authPassword}
                          onChange={(event) => setAuthPassword(event.target.value)}
                          placeholder="Password"
                          autoComplete={authMode === "login" ? "current-password" : "new-password"}
                        />
                        {authError ? <p className="auth-status-message error" role="alert">{authError}</p> : null}
                        {authMessage ? <p className="auth-status-message success" role="status">{authMessage}</p> : null}
                        {authMode === "login" ? (
                          <button type="button" className="auth-text-button drawer-auth-link" onClick={openPasswordResetRequest}>
                            Forgot password?
                          </button>
                        ) : null}
                        <div className="drawer-inline-actions">
                          <button type="submit" className="drawer-link" disabled={authLoading || !isSupabaseConfigured}>
                            {authLoading ? "Working..." : authMode === "login" ? "Sign In" : "Create Account"}
                          </button>
                        <button
                          type="button"
                          className="drawer-link"
                          onClick={() => {
                            setAuthError("");
                            setAuthMessage("");
                            const nextMode = authMode === "login" ? "signup" : "login";
                            setAuthMode(nextMode);
                            if (nextMode === "login") {
                              setAuthFirstName("");
                              setAuthLastName("");
                              setAuthPublicUsername("");
                              setAuthTermsAccepted(false);
                              setAuthBetaAcknowledged(false);
                            }
                          }}
                        >
                          {authMode === "login" ? "Create Account" : "Use Login"}
                        </button>
                        </div>
                      </form>
                    )
                  ) : (
                    <div className="drawer-info-card">
                      <strong>{actualAdminUser ? "Signed in with admin role" : "Signed in"}</strong>
                      <p className="compact-subtitle">Supabase session is active. Log out only clears the account session; it does not erase private beta records on this device.</p>
                      {passwordResetError ? <p className="auth-status-message error" role="alert">{passwordResetError}</p> : null}
                      {passwordResetMessage ? <p className="auth-status-message success" role="status">{passwordResetMessage}</p> : null}
                      <button type="button" className="drawer-link" disabled={passwordResetLoading || !isSupabaseConfigured} onClick={handleSignedInPasswordReset}>
                        {passwordResetLoading ? "Sending..." : "Send Password Reset Email"}
                      </button>
                      <button type="button" className="drawer-link logout-link" onClick={() => runMenuAction(signOut)}>Log Out</button>
                    </div>
                  )}
                  {!guestPreviewActive ? (
                    <form className="drawer-info-card" onSubmit={saveProfileSettings} noValidate>
                      <strong>Profile Settings</strong>
                      <p className="compact-subtitle">Your full name is private by default and used for account, Kids Program, and admin review context.</p>
                      <dl className="drawer-status-list">
                        <div><dt>Profile source</dt><dd>{settingsProfilePersistenceLabel}</dd></div>
                        <div><dt>Display name / region</dt><dd>{signedInWithSupabase ? "Supabase profile" : "Local beta"}</dd></div>
                        <div><dt>Username / bio</dt><dd>{signedInWithSupabase ? "Account metadata" : "Local beta"}</dd></div>
                      </dl>
                      <div className="profile-public-preview settings-highlight-card">
                        <span>Public identity preview</span>
                        {renderCommunityProfileSummary(publicProfileForCurrentUser({
                          publicBio: profileForm.publicBio,
                          scoutPoints: scoutGuessPoints,
                        }), { compact: false, className: "settings-community-profile-preview" })}
                        <small>Your public username may appear on Scout reports, community guesses, marketplace listings, and Tidepool. Private email and child/family details stay hidden from public views.</small>
                      </div>
                      <div className="ai-helper-note">
                        <span>AI can explain what these settings do; it cannot change account permissions.</span>
                        <button type="button" className="secondary-button" onClick={() => void runSettingsHelpAiAssist()}>Explain this setting</button>
                      </div>
                      <div className="drawer-two-column">
                        <input className="drawer-field" value={profileForm.firstName} onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} placeholder="First name" autoComplete="given-name" />
                        <input className="drawer-field" value={profileForm.lastName} onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} placeholder="Last name" autoComplete="family-name" />
                      </div>
                      <input className="drawer-field" value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="Display name" />
                      <label className="settings-field-group">
                        <span>Public username</span>
                        <input
                          className="drawer-field"
                          value={profileForm.publicUsername}
                          onChange={(event) => setProfileForm((current) => ({ ...current, publicUsername: normalizePublicUsername(event.target.value) }))}
                          placeholder="public_username"
                          autoComplete="nickname"
                        />
                        <small>Shown on Scout reports, community guesses, marketplace listings, and Tidepool instead of private account details. Code 3 TCG staff, support, moderator, and official names are protected.</small>
                        {publicIdentityForProfile({ ...currentUserProfile, email: accountEmail() }).isOfficialAdminIdentity ? (
                          <small className="status-badge verified-badge">Official Code 3 TCG admin identity: {publicProfileLabel()}</small>
                        ) : null}
                      </label>
                      <label className="settings-field-group">
                        <span>Short public bio</span>
                        <textarea
                          className="drawer-field"
                          rows={3}
                          value={profileForm.publicBio}
                          onChange={(event) => setProfileForm((current) => ({ ...current, publicBio: event.target.value.slice(0, 160) }))}
                          placeholder="Optional: collector, parent helper, Scout, or seller note."
                        />
                        <small>Optional and public. Do not include private family details, exact locations, or child information.</small>
                      </label>
                      <select className="drawer-field" value={profileForm.preferredRegion} onChange={(event) => setProfileForm((current) => ({ ...current, preferredRegion: event.target.value }))}>
                        {["Hampton Roads / 757", "Richmond / Central Virginia", "Northern Virginia", "Fredericksburg", "Charlottesville / Albemarle", "Roanoke / Southwest Virginia", "Lynchburg", "Shenandoah Valley", "Eastern Shore", "Southside Virginia", "Other Virginia"].map((region) => (
                          <option key={region} value={region}>{region}</option>
                        ))}
                      </select>
                      <p className="compact-subtitle">Email: {accountEmail() || "Not signed in"}. Email changes require a separate auth-safe flow.</p>
                      <button type="submit" className="drawer-link" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save Profile"}</button>
                    </form>
                  ) : null}
                  {!guestPreviewActive ? (
                    <>
                      <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("profileProgress"))}>Profile progress</button>
                      <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("mySuggestions"))}>My Suggestions</button>
                      <div className="drawer-danger-zone">
                        <strong>Danger zone</strong>
                        <p className="compact-subtitle">Resetting private beta data clears saved beta records on this device. Export first if you want a backup.</p>
                        <button type="button" className="drawer-link drawer-danger-link" onClick={resetBetaLocalData}>Reset Private Beta Data</button>
                      </div>
                    </>
                  ) : null}
                </div>
              ), "account")}
              {renderMenuPullDown("workspace", "Collections", "Switch collections, invite members, and keep personal data separate", (
                <div className="drawer-links workspace-settings-panel">
                  <div className="drawer-info-card">
                    <strong>Current collection</strong>
                    <p className="compact-subtitle">Vault, Wishlist, Forge, dashboard stats, Market Watch, and listings are filtered to this collection. Archived collections are hidden here by default.</p>
                    <div className="settings-active-workspace-card">
                      <span>Active workspace</span>
                      <strong>{activeWorkspace?.name || "My Personal Space"}</strong>
                      <small>{workspaceTypeLabel(activeWorkspace?.type)} · {workspaceRoleLabel(activeWorkspaceRole)}</small>
                    </div>
                    <Field label="Collection">
                      <select value={activeWorkspace?.id || DEFAULT_PERSONAL_WORKSPACE_ID} onChange={(event) => changeActiveWorkspace(event.target.value)}>
                        {workspaceSelectorOptions.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name} - {workspaceTypeLabel(workspace.type)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <dl className="drawer-status-list">
                      <div><dt>Type</dt><dd>{workspaceTypeLabel(activeWorkspace?.type)}</dd></div>
                      <div><dt>Workspace role</dt><dd>{workspaceRoleLabel(activeWorkspaceRole)}</dd></div>
                      <div><dt>Vault items</dt><dd>{vaultItems.length}</dd></div>
                      <div><dt>Forge items</dt><dd>{forgeInventoryItems.length}</dd></div>
                    </dl>
                    <div className="drawer-inline-actions">
                      <button type="button" className="drawer-link" onClick={() => openWorkspaceRename(activeWorkspace)} disabled={!canEditActiveWorkspace}>
                        Edit Collection
                      </button>
                      <button type="button" className="secondary-button" onClick={() => setCollectionManagerOpen(true)}>
                        Manage Collections
                      </button>
                    </div>
                    <div className="settings-section-grid compact">
                      <article className="settings-section-card">
                        <strong>Personal workspace</strong>
                        <span>Private collection space for personal Vault, wishlist, and optional Personal Forge records.</span>
                      </article>
                      <article className="settings-section-card">
                        <strong>Code 3 TCG workspace</strong>
                        <span>Shared/business space for Code 3 TCG inventory when you have access.</span>
                      </article>
                      <article className="settings-section-card">
                        <strong>Business workspace</strong>
                        <span>Seller records, expenses, mileage, listings, and tax-review exports stay scoped to the workspace.</span>
                      </article>
                    </div>
                  </div>

                  <form className="drawer-info-card forge-identity-settings-card" onSubmit={saveWorkspaceIdentitySettings} noValidate>
                    <div className="compact-card-header">
                      <div>
                        <strong>Workspace &amp; Forge Identity</strong>
                        <p className="compact-subtitle">Control whether Forge acts like your private seller space, a business workspace, or Code 3 TCG branded workspace.</p>
                      </div>
                      <span className="status-badge">{forgeIdentityModeLabel(activeForgeIdentityMode)}</span>
                    </div>
                    <div className="settings-active-workspace-card">
                      <span>Active workspace</span>
                      <strong>{activeWorkspace?.name || "My Personal Space"}</strong>
                      <small>{workspaceTypeLabel(activeWorkspace?.type)} · {workspaceRoleLabel(activeWorkspaceRole)} · {activeForgeWorkspace?.name ? `Forge uses ${activeForgeWorkspace.name}` : "Forge unavailable"}</small>
                    </div>
                    <Field label="Workspace name">
                      <input
                        value={workspaceIdentityForm.workspaceName}
                        onChange={(event) => updateWorkspaceIdentityForm({ workspaceName: event.target.value })}
                        maxLength={WORKSPACE_NAME_MAX_LENGTH}
                        disabled={!canEditActiveWorkspace}
                        placeholder="Workspace name"
                      />
                    </Field>
                    <div className="drawer-two-column">
                      <Field label="Business / shop name">
                        <input
                          value={workspaceIdentityForm.businessName}
                          onChange={(event) => updateWorkspaceIdentityForm({ businessName: event.target.value })}
                          disabled={!canEditActiveWorkspace}
                          placeholder="Optional business name"
                        />
                      </Field>
                      <Field label="Public display label">
                        <input
                          value={workspaceIdentityForm.displayLabel}
                          onChange={(event) => updateWorkspaceIdentityForm({ displayLabel: event.target.value })}
                          disabled={!canEditActiveWorkspace}
                          placeholder="Optional display label"
                        />
                      </Field>
                    </div>
                    <Field label="Shop nickname">
                      <input
                        value={workspaceIdentityForm.shopName}
                        onChange={(event) => updateWorkspaceIdentityForm({ shopName: event.target.value })}
                        disabled={!canEditActiveWorkspace}
                        placeholder="Optional nickname, DBA, or internal label"
                      />
                    </Field>
                    <Field label="Workspace notes">
                      <textarea
                        value={workspaceIdentityForm.notes}
                        onChange={(event) => updateWorkspaceIdentityForm({ notes: event.target.value })}
                        disabled={!canEditActiveWorkspace}
                        rows={3}
                        placeholder="Private notes for this workspace"
                      />
                    </Field>
                    <div className="settings-mode-grid forge-identity-mode-grid" role="group" aria-label="Forge display mode">
                      {FORGE_IDENTITY_MODE_OPTIONS.map((mode) => {
                        const disabled = mode.value === "ember_tide" && !emberTideForgeWorkspace;
                        const active = normalizeForgeIdentityMode(workspaceIdentityForm.forgeIdentityMode) === mode.value;
                        return (
                          <button
                            key={mode.value}
                            type="button"
                            className={active ? "settings-mode-card active" : "settings-mode-card"}
                            aria-pressed={active}
                            disabled={disabled || !canEditActiveWorkspace}
                            onClick={() => updateWorkspaceIdentityForm({
                              forgeIdentityMode: mode.value,
                              defaultForgeMode: mode.value,
                              useEmberTideBranding: mode.value === "ember_tide",
                            })}
                          >
                            <strong>{mode.label}</strong>
                            <span>{mode.description}</span>
                            {disabled ? <small>Code 3 TCG workspace access is not available yet.</small> : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="menu-toggle-list">
                      <label className="toggle-row forge-mode-toggle">
                        <span>
                          <strong>Use Code 3 TCG branding</strong>
                          <small>Use Code 3 TCG naming in Forge where you have access. This does not overwrite your personal profile.</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={workspaceIdentityForm.useEmberTideBranding}
                          disabled={!canEditActiveWorkspace || !emberTideForgeWorkspace}
                          onChange={(event) => updateWorkspaceIdentityForm({
                            useEmberTideBranding: event.target.checked,
                            forgeIdentityMode: event.target.checked ? "ember_tide" : "business",
                            defaultForgeMode: event.target.checked ? "ember_tide" : "business",
                          })}
                        />
                      </label>
                      <label className="toggle-row forge-mode-toggle">
                        <span>
                          <strong>Keep personal Forge separate</strong>
                          <small>Personal Forge stays available as its own private option. Turning this off hides it from Forge choices without deleting data.</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={workspaceIdentityForm.keepPersonalForgeSeparate}
                          disabled={!canEditActiveWorkspace}
                          onChange={(event) => updateWorkspaceIdentityForm({ keepPersonalForgeSeparate: event.target.checked })}
                        />
                      </label>
                    </div>
                    <dl className="drawer-status-list forge-mode-summary">
                      <div><dt>Forge mode</dt><dd>{forgeIdentityModeLabel(workspaceIdentityForm.forgeIdentityMode)}</dd></div>
                      <div><dt>Mode meaning</dt><dd>{forgeIdentityModeDescription(workspaceIdentityForm.forgeIdentityMode)}</dd></div>
                      <div><dt>Active Forge</dt><dd>{activeForgeWorkspace?.name || "Unavailable"}</dd></div>
                      <div><dt>Workspace records</dt><dd>{workspaceRecordCountsFor(activeWorkspace?.id).total} linked</dd></div>
                    </dl>
                    <p className="compact-subtitle">Workspace metadata saves with beta workspace data where supported. Cloud schema currently stores name/type; extended identity fields stay in local beta backup until cloud fields are added.</p>
                    {workspaceIdentityMessage ? <p className="flow-inline-message is-info" role="status">{workspaceIdentityMessage}</p> : null}
                    <div className="drawer-inline-actions">
                      <button type="submit" className="drawer-link" disabled={!canEditActiveWorkspace}>Save Workspace Identity</button>
                      <button type="button" className="secondary-button" onClick={resetWorkspaceIdentityForm}>Cancel / Reset</button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openWorkspaceArchive(activeWorkspace)}
                        disabled={!canManageActiveWorkspace || activeCollectionCount <= 1 || isProtectedWorkspace(activeWorkspace, { defaultWorkspaceId: DEFAULT_PERSONAL_WORKSPACE_ID })}
                      >
                        Archive Workspace
                      </button>
                    </div>
                  </form>

                  <div className="drawer-info-card forge-mode-settings-card">
                    <strong>Forge workspace mode</strong>
                    <p className="compact-subtitle">Choose whether Forge follows your personal workspace or stays locked to Code 3 TCG seller inventory. Personal Forge data is hidden when turned off, not deleted.</p>
                    <div className="settings-mode-summary">
                      <span>Seller mode</span>
                      <strong>{settingsSellerModeActive ? "On" : "Off"}</strong>
                      <small>{settingsSellerModeActive ? "Forge, receipts, mileage, inventory, and sales are prioritized." : "Turn on Seller mode to prioritize business tools."}</small>
                    </div>
                    <div className="drawer-inline-actions">
                      <button type="button" className={settingsSellerModeActive ? "drawer-link active" : "drawer-link"} onClick={() => applyHomeViewPreset("seller")}>Turn Seller Mode On</button>
                      <button type="button" className={!settingsSellerModeActive ? "secondary-button" : "secondary-button"} onClick={() => applyHomeViewPreset("collector")}>Use Collector Mode</button>
                    </div>
                    <label className="toggle-row forge-mode-toggle">
                      <span>
                        <strong>Show Personal Forge</strong>
                        <small>Keep your personal seller inventory visible as a Forge option.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={forgeModeSettings.personalForgeEnabled}
                        onChange={(event) => setPersonalForgeEnabled(event.target.checked)}
                      />
                    </label>
                    <label className="toggle-row forge-mode-toggle">
                      <span>
                        <strong>Always use Code 3 TCG Forge</strong>
                        <small>Open Forge, Add Item, and Vault-to-Forge transfers directly in Code 3 TCG.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={forgeModeSettings.lockToEmberTide}
                        disabled={!emberTideForgeWorkspace}
                        onChange={(event) => {
                          updateForgeModeSettings({
                            lockToEmberTide: event.target.checked,
                            defaultForgeWorkspaceId: event.target.checked ? emberTideForgeWorkspace?.id || "" : forgeModeSettings.defaultForgeWorkspaceId,
                          });
                        }}
                      />
                    </label>
                    <Field label="Default Forge">
                      <select
                        value={forgeModeSettings.lockToEmberTide ? emberTideForgeWorkspace?.id || "__ember_tide_missing__" : forgeModeSettings.defaultForgeWorkspaceId || ""}
                        disabled={forgeModeSettings.lockToEmberTide || !forgeWorkspaceOptions.length}
                        onChange={(event) => updateForgeModeSettings({ defaultForgeWorkspaceId: event.target.value })}
                      >
                        <option value="">Follow current workspace when possible</option>
                        {forgeWorkspaceOptions.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name} - {workspaceTypeLabel(workspace.type)}
                          </option>
                        ))}
                        {forgeModeSettings.lockToEmberTide && !emberTideForgeWorkspace ? (
                          <option value="__ember_tide_missing__">Code 3 TCG unavailable</option>
                        ) : null}
                      </select>
                    </Field>
                    <dl className="drawer-status-list forge-mode-summary">
                      <div><dt>Active Forge</dt><dd>{activeForgeWorkspace?.name || "Unavailable"}</dd></div>
                      <div><dt>Personal Forge</dt><dd>{forgeModeSettings.personalForgeEnabled ? "Visible" : "Hidden"}</dd></div>
                      <div><dt>Locked mode</dt><dd>{forgeModeSettings.lockToEmberTide ? "Code 3 TCG" : "Off"}</dd></div>
                    </dl>
                    <p className="compact-subtitle">{activeForgeModeSummary}</p>
                    {!emberTideForgeWorkspace ? (
                      <p className="compact-subtitle">Code 3 TCG Forge is not available in your workspace list yet. Create a Code 3 TCG business workspace or keep Personal Forge enabled.</p>
                    ) : null}
                    {!activeForgeWorkspace ? (
                      <p className="auth-status-message error" role="status">{forgeWorkspaceUnavailableMessage}</p>
                    ) : null}
                    <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("inventory"))}>
                      Open Forge
                    </button>
                  </div>

                  <form className="drawer-info-card" onSubmit={createWorkspace}>
                    <strong>Create workspace</strong>
                    <p className="compact-subtitle">New workspaces start empty. Existing personal data stays private until you intentionally add or move items. Business info currently saves as workspace name/type.</p>
                    <input
                      className="drawer-field"
                      value={workspaceForm.name}
                      onChange={(event) => setWorkspaceForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Collection name"
                    />
                    <select
                      className="drawer-field"
                      value={workspaceForm.type}
                      onChange={(event) => setWorkspaceForm((current) => ({ ...current, type: event.target.value }))}
                    >
                      {WORKSPACE_TYPES.filter((type) => !["personal", "shared_collection", "team"].includes(type.value)).map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                    <button type="submit" className="drawer-link">Create Collection</button>
                  </form>

                  <form className="drawer-info-card" onSubmit={sendWorkspaceInvite}>
                    <strong>Invite member by email</strong>
                    <p className="compact-subtitle">
                      {canManageInviteWorkspace
                        ? "Create a workspace invite. Email delivery is not connected yet, so copy and send the invite link after it is created."
                        : "You do not have permission to invite members in this workspace."}
                    </p>
                    <select
                      className="drawer-field"
                      value={workspaceInviteForm.workspaceId}
                      onChange={(event) => setWorkspaceInviteForm((current) => ({ ...current, workspaceId: event.target.value }))}
                      disabled={workspaceInviteSending}
                    >
                      {workspaceSelectorOptions.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                      ))}
                    </select>
                    <input
                      className="drawer-field"
                      type="email"
                      value={workspaceInviteForm.email}
                      onChange={(event) => setWorkspaceInviteForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="member@example.com"
                      disabled={!canManageInviteWorkspace || workspaceInviteSending}
                    />
                    <select
                      className="drawer-field"
                      value={workspaceInviteForm.role}
                      onChange={(event) => setWorkspaceInviteForm((current) => ({ ...current, role: event.target.value }))}
                      disabled={!canManageInviteWorkspace || workspaceInviteSending}
                    >
                      {WORKSPACE_ROLES.filter((role) => role.value !== "owner").map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                    <input
                      className="drawer-field"
                      value={workspaceInviteForm.note}
                      onChange={(event) => setWorkspaceInviteForm((current) => ({ ...current, note: event.target.value }))}
                      placeholder="Optional note"
                      disabled={!canManageInviteWorkspace || workspaceInviteSending}
                    />
                    <button type="submit" className="drawer-link" disabled={!canManageInviteWorkspace || workspaceInviteSending}>
                      {workspaceInviteSending ? "Creating..." : "Create Invite"}
                    </button>
                    {workspaceInviteDelivery ? (
                      <div className="workspace-invite-delivery" role="status">
                        <strong>{workspaceInviteDelivery.emailSent ? "Email sent" : "Invite created"}</strong>
                        <p className="compact-subtitle">
                          {workspaceInviteDelivery.emailSent
                            ? `Workspace invite email was sent to ${workspaceInviteDelivery.email}.`
                            : "Email is not configured - copy and send this link to the invited person."}
                        </p>
                        <input className="drawer-field" value={workspaceInviteLinkForInvite(workspaceInviteDelivery)} readOnly onFocus={(event) => event.target.select()} aria-label="Workspace invite link" />
                        <button type="button" className="drawer-link" onClick={() => copyWorkspaceInviteLink(workspaceInviteDelivery)}>
                          Copy invite link
                        </button>
                      </div>
                    ) : null}
                  </form>

                  <div className="drawer-info-card">
                    <strong>Members</strong>
                    <div className="workspace-member-list">
                      {workspaceMembers
                        .filter((member) => String(member.workspaceId || member.workspace_id) === String(activeWorkspace?.id))
                        .map((member) => (
                          <div className="workspace-member-row" key={`${member.workspaceId}-${member.userId || member.email || member.role}`}>
                            <span>
                              <strong>{member.email || (member.userId === "local-beta" ? "You" : member.userId || "Invited user")}</strong>
                              <small>{workspaceRoleLabel(member.role)} - {member.status === "active" ? "Active" : "Invite pending"}</small>
                            </span>
                          </div>
                        ))}
                      {!workspaceMembers.filter((member) => String(member.workspaceId || member.workspace_id) === String(activeWorkspace?.id)).length ? (
                        <p className="compact-subtitle">No members yet. Invite someone by email.</p>
                      ) : null}
                    </div>
                  </div>

                  {workspaceInvites.filter((invite) => invite.status === "invited").length ? (
                    <div className="drawer-info-card">
                      <strong>Pending invites</strong>
                      {workspaceInvites.filter((invite) => invite.status === "invited").map((invite) => (
                        <div className="workspace-member-row" key={invite.id}>
                          <span>
                            <strong>{invite.email}</strong>
                            <small>
                              {workspaces.find((workspace) => workspace.id === invite.workspaceId)?.name || "Workspace"} - {workspaceRoleLabel(invite.role)}
                              {invite.emailSent ? " - Email sent" : " - Copy link"}
                            </small>
                          </span>
                          <button type="button" className="drawer-link" onClick={() => copyWorkspaceInviteLink(invite)}>Copy link</button>
                          {BETA_LOCAL_MODE ? (
                            <button type="button" className="drawer-link" onClick={() => acceptWorkspaceInvite(invite.id)}>Accept locally</button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {workspaceMessage ? <p className="compact-subtitle">{workspaceMessage}</p> : null}
                </div>
              ), "workspace")}
              {renderMenuPullDown("tcg_os", "TCG OS", "Jump to collect, sell, find, share, know, decide, scan, and give", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>App identity</strong>
                    <p className="compact-subtitle">Vault = collect. Forge = sell. Scout = find. Tidepool = share. Catalog = know. Deal Finder = decide. Scanner = add anything.</p>
                    <div className="tcg-os-link-grid">
                      {TCG_OS_MODES.map((mode) => (
                        <button type="button" className="drawer-link" key={mode.key} onClick={() => runMenuAction(() => openOperatingSystemFeature(mode.key))}>
                          <strong>{mode.title}</strong>
                          <small>{mode.verb}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>More tools</strong>
                    <div className="tcg-os-link-grid">
                      {APP_STRUCTURE_LINKS.map((link) => (
                        <button type="button" className="drawer-link" key={link.key} onClick={() => runMenuAction(() => openOperatingSystemFeature(link.key))}>
                          <strong>{link.label}</strong>
                          <small>{link.description}</small>
                        </button>
                      ))}
                      <button type="button" className="drawer-link" onClick={() => runMenuAction(openWishlistIsoSurface)}>
                        <strong>Wishlist / ISO</strong>
                        <small>Local wanted-item planning. No automatic matching or seller offers.</small>
                      </button>
                      <button type="button" className="drawer-link" onClick={() => runMenuAction(openCollectorEventPlannerSurface)}>
                        <strong>Event Planner</strong>
                        <small>Local collector event planning. No RSVP, tickets, payments, or public listings.</small>
                      </button>
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>Universal data uses admin approval</strong>
                    <p className="compact-subtitle">Users can suggest changes, but shared store/catalog/identifier defaults should be reviewed before becoming universal data.</p>
                    <div className="universal-data-chip-grid">
                      {UNIVERSAL_DATA_ENTITIES.map((entity) => <span key={entity}>{entity}</span>)}
                    </div>
                  </div>
                </div>
              ), "tcg-os")}
              {renderMenuPullDown("settings", "Settings", "Appearance, location, notifications, and dashboard display", (
                <div className="drawer-links">
                  <div className="drawer-info-card settings-command-overview">
                    <strong>Settings</strong>
                    <p className="compact-subtitle">Control your Code 3 TCG experience without changing private data or workspace ownership.</p>
                    <div className="settings-section-grid">
                      {settingsSectionRows.map((row) => (
                        <article className="settings-section-card" key={row.title}>
                          <strong>{row.title}</strong>
                          <span>{row.body}</span>
                          <small className="status-badge">{row.status}</small>
                        </article>
                      ))}
                    </div>
                  </div>
                  {renderOnboardingSettingsCard()}
                  <div className="drawer-info-card experience-mode-settings-card">
                    <strong>Experience Mode</strong>
                    <p className="compact-subtitle">This changes what Hearth and Today&apos;s Tide prioritize. Mobile navigation stays stable unless seller personalization is already supported.</p>
                    <p className="compact-subtitle">Persistence: {settingsAppPreferencePersistenceLabel}. Card density remains local-only until a backend field exists.</p>
                    <div className="settings-mode-grid">
                      {[
                        { key: "budget", title: "Simple", helper: "Parents, families, and new collectors.", active: normalizeUserType(userType) === "budget" || normalizeDashboardPreset(dashboardPreset) === "budget_parent" },
                        { key: "collector", title: "Collector", helper: "Vault, Scout, Market, and Tidepool.", active: normalizeUserType(userType) === "collector" && normalizeDashboardPreset(dashboardPreset) !== "seller" },
                        { key: "seller", title: "Seller", helper: "Forge, receipts, mileage, inventory, and sales.", active: normalizeUserType(userType) === "seller" || normalizeDashboardPreset(dashboardPreset) === "seller" },
                      ].map((mode) => (
                        <button
                          key={mode.key}
                          type="button"
                          className={mode.active ? "settings-mode-card active" : "settings-mode-card"}
                          aria-pressed={mode.active}
                          onClick={() => applyHomeViewPreset(mode.key)}
                        >
                          <strong>{mode.title}</strong>
                          <span>{mode.helper}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>Appearance</strong>
                    <p className="compact-subtitle">Theme: {resolvedAppTheme === "dark" ? "Dark" : "Light"}. Light is the default; Dark stays available for low light.</p>
                    {renderThemeChoiceControl({ compact: true })}
                    <p className="compact-subtitle">Current density: {dashboardCardStyle}. Keep the beta compact on mobile, or switch to a roomier card style.</p>
                    <div className="drawer-inline-actions">
                      {DASHBOARD_CARD_STYLES.map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={dashboardCardStyle === style ? "drawer-link active" : "drawer-link"}
                          onClick={() => updateDashboardCardStyle(style)}
                        >
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {signedInWithSupabase ? (
                    <div className="drawer-info-card">
                      <strong>Account Security</strong>
                      <p className="compact-subtitle">Send a password reset email to your signed-in Supabase account.</p>
                      {passwordResetError ? <p className="auth-status-message error" role="alert">{passwordResetError}</p> : null}
                      {passwordResetMessage ? <p className="auth-status-message success" role="status">{passwordResetMessage}</p> : null}
                      <button type="button" className="drawer-link" disabled={passwordResetLoading || !isSupabaseConfigured} onClick={handleSignedInPasswordReset}>
                        {passwordResetLoading ? "Sending..." : "Send Password Reset Email"}
                      </button>
                    </div>
                  ) : null}
                  <div className="drawer-info-card">
                    <strong>Location</strong>
                    <p className="compact-subtitle">Location is used for nearby Scout stores and alerts. Device location stays off unless you enable it.</p>
                    <input
                      className="drawer-field"
                      value={locationSettings.manualLocation}
                      onChange={(event) => updateLocationSettings({ mode: "manual", manualLocation: event.target.value, trackingEnabled: false })}
                      placeholder="ZIP or city"
                    />
                    <div className="drawer-inline-actions">
                      <button type="button" className="drawer-link" onClick={saveManualLocation}>Save Location</button>
                      <button type="button" className="drawer-link" onClick={enableLocationTracking}>Use Device Location</button>
                      <button type="button" className="drawer-link" onClick={disableLocationTracking}>Turn Off Location</button>
                    </div>
                  </div>
                  <div className="drawer-info-card store-alert-settings-card">
                    <strong>Store Watch Notes</strong>
                    <p className="compact-subtitle">Followed stores power favorite-store alerts and regional Scout context. Store follows sync to Supabase when the store comes from the cloud directory; manual/local stores remain local fallback.</p>
                    <dl className="drawer-status-list">
                      <div><dt>Followed stores</dt><dd>{settingsFollowedStores.length}</dd></div>
                      <div><dt>Persistence</dt><dd>{settingsStoreAlertPersistenceLabel}</dd></div>
                      <div><dt>Store data</dt><dd>{scoutBackendSync.loaded ? "Cloud + local fallback" : scoutBackendSync.loading ? "Loading Scout stores" : "Open Scout or Regional Stores to load"}</dd></div>
                    </dl>
                    <div className="drawer-inline-actions">
                      <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setActiveTab("scout"); setScoutView("stores"); setScoutStoresMode("map"); })}>Open Store Directory</button>
                      <button type="button" className="secondary-button" onClick={() => runMenuAction(() => { setActiveTab("scout"); setScoutView("alerts"); })}>Open Store Watch Notes</button>
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>In-app Alert Preferences</strong>
                    <p className="compact-subtitle">{IN_APP_ALERT_DISCLOSURE} These category toggles are local beta preferences. Scout alert routing below uses {settingsScoutAlertPersistenceLabel} when available.</p>
                    <div className="ai-helper-note">
                      <span>Draft clearer alert copy without sending anything.</span>
                      <button type="button" className="secondary-button" onClick={() => void runNotificationCopyAiAssist()}>Draft notification</button>
                      <button type="button" className="secondary-button" onClick={() => void runSettingsHelpAiAssist()}>Explain alert settings</button>
                    </div>
                    <div className="menu-toggle-list">
                      {NOTIFICATION_PREFERENCE_ROWS.map((row) => (
                        <label className="toggle-row" key={row.key}>
                          <span>
                            <strong>{row.label}</strong>
                            <small>{row.description}</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={effectiveNotificationPreferences[row.key] !== false}
                            onChange={(event) => updateNotificationPreference(row.key, event.target.checked)}
                          />
                        </label>
                      ))}
                    </div>
                    <details className="drawer-subdetails">
                      <summary>Scout alert routing preferences</summary>
                      <div className="menu-toggle-list">
                        {notificationPreferenceRows.map((row) => (
                          <label className="toggle-row" key={row.key}>
                            <span>
                              <strong>{row.label}</strong>
                              <small>{row.description}</small>
                            </span>
                            <input
                              type="checkbox"
                              checked={scoutSnapshot.alertSettings?.[row.key] !== false}
                              onChange={(event) => updateScoutAlertPreference(row.key, event.target.checked)}
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                    <div className="settings-frequency-panel">
                      <strong>Frequency</strong>
                      <p className="compact-subtitle">Frequency is local-only in this beta. Watch notes are grouped and deduped so one useful planning note beats a noisy feed.</p>
                      <div className="drawer-inline-actions">
                        {["Immediate", "Daily Digest", "Off"].map((frequency) => (
                          <button type="button" className="secondary-button" key={frequency} onClick={() => setVaultToast(`${frequency} preference noted locally for beta planning.`)}>{frequency}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="drawer-info-card settings-privacy-trust-card">
                    <strong>Privacy, Trust & Family</strong>
                    <p className="compact-subtitle">Privacy controls describe current behavior. Data requests are admin-reviewed; family details and admin notes are not public.</p>
                    <div className="settings-section-grid compact">
                      <article className="settings-section-card">
                        <strong>Business data privacy</strong>
                        <span>Your Forge inventory, receipts, sales, and mileage stay private to you and authorized workspace members.</span>
                        <small className="status-badge">{commandDeskSellerAccess ? "Seller/admin private" : "Hidden from non-sellers"}</small>
                      </article>
                      <article className="settings-section-card">
                        <strong>Location usage for Scout</strong>
                        <span>Device location is optional and only used for nearby stores and restock signals.</span>
                        <small className="status-badge">{locationSettings.trackingEnabled ? "Device location on" : "Manual/local"}</small>
                      </article>
                      <article className="settings-section-card">
                        <strong>Trust & reputation</strong>
                        <span>Photos, accurate reports, fair pricing, and helpful community activity improve trust.</span>
                        <small className="status-badge">{settingsTrustSourceLabel}</small>
                      </article>
                      <article className="settings-section-card">
                        <strong>Family & child profiles</strong>
                        <span>Parent-approved access only. No private child messaging. Parent-approved trades only.</span>
                        <small className="status-badge">{settingsFamilyStatusLabel}</small>
                      </article>
                      <article className="settings-section-card">
                        <strong>Help & Support</strong>
                        <span>Use Feedback / Help for local tester notes, bugs, feature requests, refresh/update help, or account support.</span>
                        <small className="status-badge">Local/admin review</small>
                      </article>
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>Dashboard Display Settings</strong>
                    <p className="compact-subtitle">Choose which Home cards and sections are visible. This only changes the dashboard display, not your saved data.</p>
                    <div className="menu-toggle-list">
                      {menuHomeStatRows.map((row) => (
                        <label className="toggle-row" key={row.key}>
                          <span><strong>{row.label}</strong></span>
                          <input
                            type="checkbox"
                            checked={
                              row.key === "alerts"
                                ? scoutSnapshot.alertSettings?.showHomeActiveAlerts !== false
                                : row.key === "marketUpdates"
                                  ? scoutSnapshot.alertSettings?.showHomeMarketUpdates !== false
                                  : homeStatsEnabled[row.key] !== false
                            }
                            onChange={(event) => {
                              if (row.key === "alerts") {
                                updateScoutAlertPreference("showHomeActiveAlerts", event.target.checked);
                                return;
                              }
                              if (row.key === "marketUpdates") {
                                updateScoutAlertPreference("showHomeMarketUpdates", event.target.checked);
                                return;
                              }
                              updateHomeStatsEnabled({ [row.key]: event.target.checked });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <details className="drawer-subdetails">
                      <summary>Home sections</summary>
                      <div className="menu-toggle-list">
                        {menuDashboardSectionRows.map((row) => {
                          const section = dashboardSectionState(row.key);
                          return (
                            <label className="toggle-row" key={row.key}>
                              <span><strong>{row.label}</strong></span>
                              <input
                                type="checkbox"
                                checked={section.enabled !== false}
                                onChange={(event) => updateDashboardSection(row.key, { enabled: event.target.checked })}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                </div>
              ), "settings")}
              {renderMenuPullDown("data", "Data Safety & Export", "Local storage, export/import, clear beta data, and sync status", (
                <>
                  <div className="drawer-info-card">
                    <strong>Optional Cloud Sync</strong>
                    <p className="compact-subtitle">
                      {BETA_LOCAL_MODE
                        ? "Your beta data is stored locally in this browser. Clearing browser data may remove it; export before switching devices. Cloud sync requires backend support later."
                        : isSupabaseConfigured
                          ? "Cloud sync is enabled for QA. Sign in to save Phase 2 workflows to Supabase."
                          : "Cloud sync is enabled for QA, but Supabase URL/key configuration is missing."}
                    </p>
                    <dl className="drawer-status-list">
                      <div><dt>Current mode</dt><dd>{BETA_LOCAL_MODE ? "Private beta" : "Cloud-ready"}</dd></div>
                      <div><dt>Preference</dt><dd>{cloudSyncPreference === "cloud" ? "Cloud sync access requested" : "Keep local"}</dd></div>
                    </dl>
                    <div className="drawer-inline-actions">
                      <button type="button" className={cloudSyncPreference === "local" ? "drawer-link active" : "drawer-link"} onClick={() => updateCloudSyncPreference("local")}>Keep Private Beta Local</button>
                      <button type="button" className={cloudSyncPreference === "cloud" ? "drawer-link active" : "drawer-link"} onClick={() => updateCloudSyncPreference("cloud")}>Request Cloud Sync Access</button>
                    </div>
                  </div>
                  <LazyToolBoundary label="Loading backup tools...">
                    <BackupExportImport
                      storageStatus={storageStatus}
                      importPreview={backupImportPreview}
                      importMessage={backupImportMessage}
                      onExport={downloadBackup}
                      onImportFile={handleBackupFileUpload}
                      onApplyImport={applyBetaBackupImport}
                      onClearDemoData={resetBetaLocalData}
                    />
                  </LazyToolBoundary>
                  <div className="drawer-info-card">
                    <strong>Collection transfer and bulk add</strong>
                    <p className="compact-subtitle">Bring in a CSV, copied list, seller list, or manually staged batch. Every row goes through review before anything is saved.</p>
                    <div className="drawer-inline-actions">
                      <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openInventoryImportAssistant("Vault", { mode: BATCH_INTAKE_MODES.TRANSFER, sourceType: "spreadsheet_csv", source: "data-menu-import" }))}>Import / Transfer Collection</button>
                      <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openBulkAddFlow("Mixed"))}>Bulk Add Items</button>
                    </div>
                  </div>
                  <form className="drawer-info-card" onSubmit={submitDataRequest} noValidate>
                    <strong>Privacy / Data Requests</strong>
                    <p className="compact-subtitle">These requests are saved in your app records. Contact support for a response. Account deletion uses a separate password-confirmed process.</p>
                    <select className="drawer-field" value={dataRequestForm.requestType} onChange={(event) => setDataRequestForm((current) => ({ ...current, requestType: event.target.value }))}>
                      {DATA_REQUEST_TYPES.filter((type) => type !== "account_deletion").map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
                    </select>
                    <input className="drawer-field" type="email" value={dataRequestForm.email || accountEmail()} onChange={(event) => setDataRequestForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                    <textarea className="drawer-field" value={dataRequestForm.message} onChange={(event) => setDataRequestForm((current) => ({ ...current, message: event.target.value }))} placeholder="Optional details" />
                    <button type="submit" className="drawer-link">Save privacy request</button>
                    <button type="button" className="drawer-link" onClick={() => runMenuAction(() => window.location.assign("/delete-account"))}>Delete account</button>
                    <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("trust"))}>Open Privacy / Terms</button>
                  </form>
                  {adminToolsVisible ? (
                    <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("adminReview"))}>
                      Admin Review Queue
                    </button>
                  ) : null}
                </>
              ), "data")}
              {renderMenuPullDown("feedback", "Feedback / Help", "Tester notes, bug reports, and app help", (
                <div className="drawer-links">
                  <div className="drawer-info-card app-support-card">
                    <strong>App Support</strong>
                    <p className="compact-subtitle">Having issues after an update? Refresh Code 3 TCG to load the newest version.</p>
                    <dl className="drawer-status-list">
                      <div><dt>Loaded build</dt><dd>{PUBLIC_APP_VERSION_LABEL}</dd></div>
                      <div><dt>Update status</dt><dd>{appUpdate.available ? "Update available" : "Up to date"}</dd></div>
                    </dl>
                    {renderAppBuildDetails()}
                    <button type="button" className="drawer-link" disabled={appRefreshInProgress} onClick={() => runMenuAction(() => void handleSafeAppRefresh())}>
                      {appRefreshInProgress ? "Refreshing..." : "Refresh App"}
                    </button>
                  </div>
                  <div className="drawer-info-card">
                    <strong>Tester Notes</strong>
                    <p className="compact-subtitle">Saved in this browser first. Copy or export the note when you are ready to share it with the Code 3 TCG team.</p>
                    <div className="ai-helper-note">
                      <span>AI can help categorize feedback, but admin status changes stay manual.</span>
                      <button type="button" className="secondary-button" onClick={() => runMenuAction(() => void runFeedbackAiSummary())}>Summarize feedback</button>
                    </div>
                  </div>
                  <div className="drawer-info-card">
                    <strong>Product glossary</strong>
                    <p className="compact-subtitle">Hearth, Market Watch, Tidepool Community, Tide Score, Fair Price Badges, and future roadmap names live with Known Limitations.</p>
                    <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("knownLimitations"))}>Open Glossary</button>
                  </div>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openPublicBetaFeedback({ page: "More Feedback", mainReason: "General feedback" }))}>Join Beta / Request State</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("feedback"))}>Tester Notes</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("bug"))}>Report a Bug</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("feature"))}>Request a Feature</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("catalog_data"))}>Report Bad Catalog Data</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("store_data"))}>Report Bad Store Data</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openFeedbackDialog("market_data"))}>Report Wrong Market Price</button>
                  {adminToolsVisible ? <button type="button" className="drawer-link" onClick={() => runMenuAction(() => void runFeedbackAiSummary())}>Summarize feedback</button> : null}
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(restartOnboarding)}>App Guide / Replay Onboarding</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("profileProgress"))}>Profile progress</button>
                </div>
              ), "help")}
              {renderMenuPullDown("beta_foundations", "Beta Foundations", "Kids Program, trust pages, notifications, membership, and launch links", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>{BETA_MODE_COPY}</strong>
                    <p className="compact-subtitle">SMS, billing, provider integrations, and marketplace auto-posting are intentionally disabled.</p>
                  </div>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("kidsProgram"))}>The Spark / Kids Program</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("sponsor"))}>Sponsor / Partner Interest</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("links"))}>Link-in-Bio Page</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("whatsNew"))}>What's New / Changelog</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("knownLimitations"))}>Known Limitations</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("trust"))}>Privacy / Terms / Rules</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("profileProgress"))}>Profile progress</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("membership"))}>Membership Foundation</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(restartOnboarding)}>Restart Onboarding</button>
                </div>
              ), "help")}
              {renderMenuPullDown("community", "Tidepool Community", "Family-safe posts, guidelines, and community rules", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>Tidepool Community</strong>
                    <p className="compact-subtitle">Family-safe community hub for reports, guidelines, questions, events, and future community tools.</p>
                  </div>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => openTidepoolCommunity("Latest"))}>Open Tidepool Community</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setVaultToast("Report Guidelines are coming soon for beta."))}>Report Guidelines</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("trust"))}>Community Rules</button>
                  <button type="button" className="drawer-link disabled-link" disabled>Discord Coming Soon</button>
                </div>
              ), "community")}
              {renderMenuPullDown("subscription", "Plans & Features", "Free vs paid features and beta planning", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>Beta launch pricing preview.</strong>
                    <p className="compact-subtitle">Current plan: {TIER_LABELS[currentTier] || currentPlan}. Beta is a status flag, Admin is internal, and no payment processing or checkout is connected.</p>
                    <p className="compact-subtitle">Upgrade Value Preview: current beta, local beta, and upgraded-plan capacity are explained without connecting billing.</p>
                  </div>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("dashboard"))}>Open Settings / Plans</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("membership"))}>Compare Plans Preview</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("membership"))}>Membership Foundation</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => requestLockedFeatureAccess("seller_tools"))}>Ask admin to upgrade during beta</button>
                  <button type="button" className="drawer-link disabled-link" disabled>Stripe Not Connected</button>
                </div>
              ), "plan")}
              {adminToolsVisible ? renderMenuPullDown("admin", "Admin Tools", "Admin moderation, imports, suggestions, and shared data controls", (
                <div className="drawer-links">
                  <div className="drawer-info-card">
                    <strong>Admin Tools</strong>
                    <p className="compact-subtitle">Admin tools for moderation, imports, suggestions, and shared data controls. Protected credentials stay server-side.</p>
                  </div>
                  <div className="drawer-info-card admin-edit-mode-card">
                    <strong>Admin Display Controls</strong>
                    <p className="compact-subtitle">Use the header control bar to switch Regular/Admin viewing and Edit Mode without changing your actual role.</p>
                    <div className="drawer-inline-actions">
                      <button type="button" className={adminViewMode === "regular" ? "drawer-link active" : "drawer-link"} onClick={() => setAdminModeView("regular")}>Regular Mode</button>
                      <button type="button" className={adminViewMode === "admin" ? "drawer-link active" : "drawer-link"} onClick={() => setAdminModeView("admin")}>Admin Mode</button>
                      <button type="button" className={!adminEditModeActive ? "drawer-link active" : "drawer-link"} onClick={() => setAdminEditMode(false)}>Edit Off</button>
                      <button type="button" className={adminEditModeActive ? "drawer-link active" : "drawer-link"} disabled={!adminViewingAsAdmin} onClick={() => setAdminEditMode(true)}>Edit On</button>
                    </div>
                  </div>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("adminReview"))}>Open Admin Dashboard</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => setActiveTab("betaReadiness"))}>Beta Readiness Dashboard</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("All"); setActiveTab("adminReview"); })}>Import Status & Review Queue</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Beta Access"); setActiveTab("adminReview"); })}>Beta Access Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Kids Program Applications"); setActiveTab("adminReview"); })}>Kids Program Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Beta Feedback"); setActiveTab("adminReview"); })}>Beta Feedback Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Sponsor Interest"); setActiveTab("adminReview"); })}>Sponsor Interest Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminEditMode(true); openTidepoolCommunity("Needs Review"); })}>Tidepool Moderation</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Market Source Controls"); setActiveTab("adminReview"); })}>Market Source Controls</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Marketplace Listings"); setActiveTab("adminReview"); })}>Marketplace Listing Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Store Suggestions"); setActiveTab("adminReview"); })}>Store Correction Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Catalog Suggestions"); setActiveTab("adminReview"); })}>Catalog Correction Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("SKU / UPC Suggestions"); setActiveTab("adminReview"); })}>Best Buy SKU Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminEditMode(true); setAdminReviewFilter("Scout Report Review"); setActiveTab("adminReview"); })}>Scout Report Review</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Store Intelligence Suggestions"); setActiveTab("adminReview"); })}>Store Intelligence Suggestions</button>
                  <button type="button" className="drawer-link" onClick={() => runMenuAction(() => { setAdminReviewFilter("Flagged / Duplicate Items"); setActiveTab("adminReview"); })}>Flagged / Duplicate Items</button>
                </div>
              ), "admin") : null}
            </MenuNavigation>
            <div className="drawer-footer-card">
              {settingsItem ? <button type="button" className="menu-settings-shortcut" onClick={() => openMenuItem(settingsItem)}><MenuItemIcon item={settingsItem} NavIcon={AppNavIcon} />Settings</button> : <span>{BRAND_CONFIG.applicationDisplayName}</span>}
              {signedInWithSupabase ? (
                <button type="button" className="logout-link" onClick={() => runMenuAction(signOut)}>Sign out</button>
              ) : (
                <button type="button" className="secondary-button" onClick={() => { setAuthMode("login"); openUtilityPage("account"); }}>
                  Sign In
                </button>
              )}
            </div>
          </aside>
        </>);
  }

  return renderDeferredMenuDrawer();
}
