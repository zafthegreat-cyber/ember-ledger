// Rendering is deferred; the owning App retains record state and action handlers.
export default function BetaUsersContent({ scope }) {
  const {
    DetailItem,
    betaAccessAllowedForProfile,
    betaAccessStatusForProfile,
    betaAdminNoteDraft,
    betaAdminNoteSaving,
    betaAdminVisible,
    betaReadinessData,
    betaUserFilter,
    betaUserSearch,
    handleCreateBetaAdminNote,
    markSuspectedTestAccount,
    maskEmail,
    normalizeBetaStatus,
    queueDisableSuspectedTestAccount,
    refreshAdminBetaUsersDashboardData,
    renderAdminBetaInviteManagement,
    selectedBetaUserId,
    setAdminBetaInviteForm,
    setAdminBetaRequestNote,
    setAdminProfileUserNote,
    setBetaAdminNoteDraft,
    setBetaUserFilter,
    setBetaUserSearch,
    setSelectedBetaUserId,
    setVaultToast,
    shorelineState,
    shortDate,
    statusLabel,
    updateExistingBetaUserAccess,
    updateShorelineAdminStatus,
  } = scope;

  function renderBetaUsersDashboard() {
    if (!betaAdminVisible) return null;
    const profileUsers = shorelineState.adminProfileUsers || [];
    const requestRows = [
      ...(shorelineState.adminBetaRequests || []),
      ...(betaReadinessData.betaAccessUsers || []).map((entry) => ({
        ...entry,
        fullName: entry.fullName || entry.displayName || "",
        userId: entry.userId || "",
        adminNotes: entry.adminNotes || "",
        source: "Local fallback",
      })),
    ];
    const inviteRows = shorelineState.adminBetaInvites || [];
    const activityRows = shorelineState.adminBetaActivityEvents || [];
    const adminNotes = shorelineState.adminBetaAdminNotes || [];
    const nowMs = Date.now();
    const recentCutoffMs = 30 * 24 * 60 * 60 * 1000;
    const isRecent = (value) => {
      const time = Date.parse(value || "");
      return Number.isFinite(time) && nowMs - time <= recentCutoffMs;
    };
    const rowKey = (entry = {}) => String(entry.userId || entry.id || entry.email || entry.displayName || entry.fullName || "").toLowerCase();
    const profileKeyFor = (entry = {}) => String(entry.userId || entry.id || entry.email || "").toLowerCase();
    const userMap = new Map();
    const upsertUser = (entry = {}, source = "Profile") => {
      const key = profileKeyFor(entry);
      if (!key) return;
      const existing = userMap.get(key) || {};
      userMap.set(key, {
        ...existing,
        ...entry,
        userId: entry.userId || entry.id || existing.userId || "",
        email: entry.email || existing.email || "",
        displayName: entry.displayName || entry.fullName || existing.displayName || "Beta user",
        fullName: entry.fullName || existing.fullName || entry.displayName || "",
        createdAt: entry.createdAt || existing.createdAt || "",
        lastSeenAt: entry.lastSeenAt || existing.lastSeenAt || "",
        source: existing.source ? `${existing.source}, ${source}` : source,
        backendProfileRow: Boolean(existing.backendProfileRow || source === "Profile"),
      });
    };
    profileUsers.forEach((entry) => upsertUser(entry, "Profile"));
    requestRows.forEach((entry) => upsertUser({
      ...entry,
      displayName: entry.fullName || entry.displayName || entry.email || "Beta applicant",
      createdAt: entry.createdAt || entry.requestedAt || entry.updatedAt || "",
      betaStatus: entry.status,
      betaAccessStatus: entry.status,
    }, entry.source || "Beta request"));
    inviteRows.forEach((invite) => {
      const inviteIdentity = invite.claimedBy || invite.claimedEmail || invite.recipientEmail;
      if (!inviteIdentity) return;
      upsertUser({
        userId: invite.claimedBy || "",
        email: invite.claimedEmail || invite.recipientEmail || "",
        displayName: invite.recipientName || invite.claimedEmail || invite.recipientEmail || "Invited beta user",
        createdAt: invite.claimedAt || invite.createdAt || "",
        betaStatus: invite.claimedAt ? "approved" : "pending",
        betaAccessStatus: invite.claimedAt ? "approved" : "pending",
      }, invite.claimedAt ? "Claimed invite" : "Invite");
    });
    const betaUsers = [...userMap.values()].map((entry) => {
      const key = rowKey(entry);
      const userId = String(entry.userId || entry.id || "");
      const email = String(entry.email || "").toLowerCase();
      const matchingRequests = requestRows.filter((request) => {
        const requestUser = String(request.userId || "").toLowerCase();
        const requestEmail = String(request.email || "").toLowerCase();
        return (userId && requestUser === userId.toLowerCase()) || (email && requestEmail === email);
      });
      const matchingInvites = inviteRows.filter((invite) => {
        const claimedUser = String(invite.claimedBy || "").toLowerCase();
        const claimedEmail = String(invite.claimedEmail || "").toLowerCase();
        const recipientEmail = String(invite.recipientEmail || "").toLowerCase();
        return (userId && claimedUser === userId.toLowerCase()) || (email && (claimedEmail === email || recipientEmail === email));
      });
      const matchingActivities = activityRows.filter((event) => String(event.userId || "").toLowerCase() === String(userId || "").toLowerCase());
      const matchingNotes = adminNotes.filter((note) => String(note.targetUserId || "").toLowerCase() === String(userId || "").toLowerCase());
      const latestActivity = matchingActivities[0];
      const latestRequest = matchingRequests[0];
      const latestInvite = matchingInvites[0];
      const backendProfileRow = Boolean(entry.backendProfileRow);
      const accessStatus = entry.isAdmin
        ? "admin"
        : backendProfileRow
          ? betaAccessStatusForProfile(entry)
          : normalizeBetaStatus(entry.betaAccessStatus || entry.betaStatus || latestRequest?.status || (latestInvite?.claimedAt ? "approved" : "pending"));
      const accessAllowed = entry.isAdmin || (backendProfileRow ? betaAccessAllowedForProfile(entry) : accessStatus === "approved");
      const lastActiveAt = latestActivity?.createdAt || entry.lastSeenAt || "";
      return {
        ...entry,
        key,
        accessStatus,
        accessAllowed,
        matchingRequests,
        matchingInvites,
        matchingActivities,
        matchingNotes,
        latestActivity,
        latestRequest,
        latestInvite,
        lastActiveAt,
        isActive: isRecent(lastActiveAt),
        inviteSource: latestInvite?.claimedAt ? "Invite claimed" : latestInvite ? "Invited" : latestRequest ? "Request" : "Profile",
      };
    });
    const pendingRequests = requestRows.filter((entry) => ["pending", "waitlist"].includes(normalizeBetaStatus(entry.status || entry.betaAccessStatus)));
    const pendingProfileUsers = profileUsers.filter((entry) => !entry.isAdmin && !betaAccessAllowedForProfile(entry));
    const approvedUsers = betaUsers.filter((entry) => entry.accessAllowed && !entry.isAdmin);
    const activeUsers = approvedUsers.filter((entry) => entry.isActive);
    const inactiveUsers = approvedUsers.filter((entry) => !entry.isActive);
    const filteredBetaUsers = betaUsers.filter((entry) => {
      const filter = betaUserFilter;
      const haystack = `${entry.displayName || ""} ${entry.fullName || ""} ${entry.username || ""} ${entry.publicUsername || ""} ${entry.email || ""} ${entry.accessStatus || ""} ${entry.inviteSource || ""}`.toLowerCase();
      const searchMatch = !betaUserSearch.trim() || haystack.includes(betaUserSearch.trim().toLowerCase());
      if (!searchMatch) return false;
      if (filter === "All") return true;
      if (filter === "Pending") return ["pending", "waitlist", "not_requested"].includes(entry.accessStatus) || !entry.accessAllowed;
      if (filter === "Approved") return entry.accessAllowed;
      if (filter === "Denied") return ["denied", "revoked", "paused"].includes(entry.accessStatus);
      if (filter === "Invited") return entry.matchingInvites.length > 0;
      if (filter === "Claimed") return entry.matchingInvites.some((invite) => invite.claimedAt);
      if (filter === "Active") return entry.isActive;
      if (filter === "Inactive") return entry.accessAllowed && !entry.isActive;
      if (filter === "Revoked") return entry.matchingInvites.some((invite) => invite.revokedAt || invite.status === "revoked") || entry.accessStatus === "revoked";
      return true;
    });
    const selectedBetaUser = betaUsers.find((entry) => String(entry.userId || entry.email || entry.key) === String(selectedBetaUserId));
    const overviewCards = [
      { label: "Pending requests", value: pendingRequests.length + pendingProfileUsers.length, helper: "Requests and signed-up users awaiting access" },
      { label: "Approved beta users", value: approvedUsers.length, helper: "Profiles with app access" },
      { label: "Invites sent", value: inviteRows.length, helper: "Secure one-time invite rows" },
      { label: "Invites claimed", value: inviteRows.filter((invite) => invite.claimedAt || invite.status === "claimed").length, helper: "Claimed invites only" },
      { label: "Active beta users", value: shorelineState.adminBetaActivityReady ? activeUsers.length : "Needs migration", helper: "Recent activity in the last 30 days" },
      { label: "Inactive users", value: shorelineState.adminBetaActivityReady ? inactiveUsers.length : "Unknown", helper: "Approved but no recent activity signal" },
    ];
    const filters = ["All", "Pending", "Approved", "Denied", "Invited", "Claimed", "Active", "Inactive", "Revoked"];
    const activityLabel = (eventType = "") => String(eventType || "activity").replace(/_/g, " ");
    const betaUserActivityCounts = (entry = {}) => ({
      scout: entry.matchingActivities.filter((event) => /scout/.test(event.eventType || "")).length,
      inventory: entry.matchingActivities.filter((event) => /vault|forge|item/.test(event.eventType || "")).length,
      market: entry.matchingActivities.filter((event) => /market|watch/.test(event.eventType || "")).length,
      assist: entry.matchingActivities.filter((event) => /ember|assist|support/.test(event.eventType || "")).length,
    });
    const testAccountSignals = (entry = {}) => {
      const haystack = [
        entry.displayName,
        entry.fullName,
        entry.username,
        entry.publicUsername,
        entry.email,
        entry.source,
        entry.inviteSource,
      ].filter(Boolean).join(" ").toLowerCase();
      const signals = [];
      if (/\b(test|fake|smoke|demo|sample|placeholder|qa)\b/.test(haystack)) signals.push("test/demo wording");
      if (/@(example|test|fake|demo)\./.test(haystack) || /(\+test|\+qa|\+smoke)@/.test(haystack)) signals.push("test email pattern");
      if (/local[-_ ]?beta|not[-_ ]?a[-_ ]?real|fixture/.test(haystack)) signals.push("local/test fixture");
      return signals;
    };
    const suspectedTestUsers = betaUsers
      .map((entry) => ({ ...entry, cleanupSignals: testAccountSignals(entry) }))
      .filter((entry) => entry.cleanupSignals.length && !entry.isAdmin)
      .slice(0, 8);

    return (
      <section className="settings-subsection beta-users-dashboard" aria-label="Beta Users">
        <div className="compact-card-header">
          <div>
            <h3>Beta Users</h3>
            <p>Admin-only view from request to approval, invite, joined user, and testing activity. Official Code 3 TCG admins and existing admin roles only.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void refreshAdminBetaUsersDashboardData()}>Refresh activity</button>
        </div>
        {shorelineState.adminBetaDashboardMessage ? (
          <div className="empty-state compact-empty-state">
            <h3>Activity tracking backend needed</h3>
            <p>{shorelineState.adminBetaDashboardMessage}</p>
          </div>
        ) : null}
        {shorelineState.adminBetaDashboardError ? <p className="auth-status-message error" role="alert">{shorelineState.adminBetaDashboardError}</p> : null}
        <div className="beta-users-overview-grid">
          {overviewCards.map((card) => (
            <article className="beta-users-overview-card" key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.helper}</small>
            </article>
          ))}
        </div>
        <div className="beta-users-toolbar">
          <input value={betaUserSearch} onChange={(event) => setBetaUserSearch(event.target.value)} placeholder="Search name, username, or email" />
          <div className="segmented-control" role="tablist" aria-label="Beta user filters">
            {filters.map((filter) => (
              <button
                type="button"
                key={filter}
                className={betaUserFilter === filter ? "active" : ""}
                onClick={() => setBetaUserFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <section className="beta-users-section admin-cleanup-panel">
          <div className="compact-card-header">
            <div>
              <h4>Test/fake account cleanup</h4>
              <p>Suspected test profiles can be hidden from normal app access. Full Supabase Auth deletion is intentionally not exposed here.</p>
            </div>
            <span className="status-badge">{suspectedTestUsers.length} suspected</span>
          </div>
          {suspectedTestUsers.length ? (
            <div className="beta-users-list compact">
              {suspectedTestUsers.map((entry) => (
                <article className="beta-user-row-card admin-cleanup-card" key={`cleanup-${entry.key || entry.userId || entry.email}`}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{entry.displayName || entry.fullName || "Beta user"}</strong>
                      <p>{maskEmail(entry.email)} | {entry.backendProfileRow ? "Supabase profile" : "Local fallback"}</p>
                      <small>{entry.cleanupSignals.join(", ")}</small>
                    </div>
                    <span className={`status-badge ${entry.accessStatus}`}>{statusLabel(entry.accessStatus)}</span>
                  </div>
                  <div className="quick-actions">
                    <button type="button" className="secondary-button" onClick={() => setSelectedBetaUserId(entry.userId || entry.email || entry.key)}>Open details</button>
                    <button type="button" className="ghost-button" onClick={() => markSuspectedTestAccount(entry)}>Mark test account</button>
                    <button type="button" className="delete-button" onClick={() => queueDisableSuspectedTestAccount(entry)}>Disable access</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty-state">
              <h3>No obvious test accounts</h3>
              <p>Search Members if you need to review a specific profile manually.</p>
            </div>
          )}
        </section>

        <section className="beta-users-section">
          <div className="compact-card-header">
            <div>
              <h4>Pending beta requests</h4>
              <p>Approve or deny requests with private notes. Existing signed-up profiles are handled through the backend beta approval RPC.</p>
            </div>
            <span className="status-badge">{pendingRequests.length + pendingProfileUsers.length} pending</span>
          </div>
          <div className="beta-users-list">
            {pendingRequests.length ? pendingRequests.map((entry) => (
              <article className="beta-user-row-card" key={entry.id || entry.userId || entry.email}>
                <div>
                  <strong>{entry.fullName || entry.displayName || entry.email || "Beta request"}</strong>
                  <p>{maskEmail(entry.email)} | {entry.createdAt ? shortDate(entry.createdAt) : "Requested date unavailable"}</p>
                  <small>{entry.reason || entry.message || "No request message."}</small>
                </div>
                <span className={`status-badge ${entry.status}`}>{statusLabel(entry.status)}</span>
                <textarea
                  className="drawer-field"
                  value={entry.adminNotes || ""}
                  placeholder="Private review note"
                  onChange={(event) => setAdminBetaRequestNote(entry.id, event.target.value)}
                />
                <div className="quick-actions">
                  <button type="button" className="secondary-button" onClick={() => void updateShorelineAdminStatus("beta", entry, "approved")}>Approve</button>
                  <button type="button" className="ghost-button" onClick={() => void updateShorelineAdminStatus("beta", entry, "denied")}>Deny</button>
                </div>
              </article>
            )) : null}
            {pendingProfileUsers.length ? pendingProfileUsers.map((entry) => (
              <article className="beta-user-row-card" key={entry.userId || entry.email}>
                <div>
                  <strong>{entry.displayName || entry.fullName || entry.email || "Signed-up user"}</strong>
                  <p>{maskEmail(entry.email)} | {entry.createdAt ? shortDate(entry.createdAt) : "Joined date unavailable"}</p>
                  <small>{entry.betaAccessNotes || "Signed-up user has not been approved yet."}</small>
                </div>
                <span className={`status-badge ${betaAccessStatusForProfile(entry)}`}>{statusLabel(betaAccessStatusForProfile(entry))}</span>
                <textarea
                  className="drawer-field"
                  value={entry.betaAccessNotes || ""}
                  placeholder="Private beta access note"
                  onChange={(event) => setAdminProfileUserNote(entry.userId, event.target.value)}
                />
                <div className="quick-actions">
                  <button type="button" className="secondary-button" disabled={entry.isAdmin} onClick={() => void updateExistingBetaUserAccess(entry, "approved")}>Approve</button>
                  <button type="button" className="ghost-button" disabled={entry.isAdmin} onClick={() => void updateExistingBetaUserAccess(entry, "denied")}>Deny / Revoke</button>
                </div>
              </article>
            )) : null}
            {!pendingRequests.length && !pendingProfileUsers.length ? (
              <div className="empty-state compact-empty-state">
                <h3>No pending beta requests</h3>
                <p>New access requests and pending profile rows will appear here.</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="beta-users-section">
          <div className="compact-card-header">
            <div>
              <h4>Approved and invited beta users</h4>
              <p>Searchable user list with access state, invite source, and recent activity.</p>
            </div>
            <span className="status-badge">{filteredBetaUsers.length} shown</span>
          </div>
          <div className="beta-users-list">
            {filteredBetaUsers.length ? filteredBetaUsers.map((entry) => {
              const counts = betaUserActivityCounts(entry);
              return (
                <article className="beta-user-row-card beta-user-click-card" key={entry.key || entry.userId || entry.email}>
                  <button type="button" className="beta-user-row-main" onClick={() => setSelectedBetaUserId(entry.userId || entry.email || entry.key)}>
                    <div>
                      <strong>{entry.displayName || entry.fullName || "Beta user"}</strong>
                      <p>{maskEmail(entry.email)} | {entry.username || entry.publicUsername || "No username"}</p>
                      <small>{entry.inviteSource} | Joined {entry.createdAt ? shortDate(entry.createdAt) : "date unavailable"} | Last active {entry.lastActiveAt ? shortDate(entry.lastActiveAt) : "unavailable"}</small>
                    </div>
                    <span className={`status-badge ${entry.accessStatus}`}>{entry.isAdmin ? "admin" : statusLabel(entry.accessStatus)}</span>
                  </button>
                  <div className="detail-grid compact-detail-grid">
                    <DetailItem label="App access" value={entry.accessAllowed ? "Allowed" : "Blocked"} />
                    <DetailItem label="Scout reports" value={String(counts.scout)} />
                    <DetailItem label="Vault/Forge adds" value={String(counts.inventory)} />
                    <DetailItem label="Market/watch" value={String(counts.market)} />
                    <DetailItem label="Business Assistant" value={String(counts.assist)} />
                    <DetailItem label="Admin notes" value={String(entry.matchingNotes.length)} />
                  </div>
                  <div className="quick-actions">
                    <button type="button" className="secondary-button" onClick={() => setSelectedBetaUserId(entry.userId || entry.email || entry.key)}>Open details</button>
                    {entry.backendProfileRow ? <button type="button" className="ghost-button" disabled={entry.isAdmin} onClick={() => void updateExistingBetaUserAccess(entry, "denied")}>Revoke beta access</button> : null}
                    <button type="button" className="ghost-button" onClick={() => {
                      setAdminBetaInviteForm((current) => ({
                        ...current,
                        recipientName: entry.displayName || entry.fullName || "",
                        recipientEmail: entry.email || "",
                      }));
                      setVaultToast("Invite form prefilled below. Create a new one-time invite if needed.");
                    }}>Create new invite</button>
                  </div>
                </article>
              );
            }) : (
              <div className="empty-state compact-empty-state">
                <h3>No beta users match this view</h3>
                <p>Try another filter or search term.</p>
              </div>
            )}
          </div>
        </section>

        <section className="beta-users-section beta-invite-tracking">
          <div className="compact-card-header">
            <div>
              <h4>Invite tracking</h4>
              <p>Invite history never exposes plaintext tokens or token hashes. Copy is only available for the just-created invite link.</p>
            </div>
            <span className="status-badge">{inviteRows.length} invites</span>
          </div>
          {renderAdminBetaInviteManagement()}
        </section>

        {selectedBetaUser ? (
          <div className="location-modal-backdrop" role="presentation" onClick={() => setSelectedBetaUserId("")}>
            <section className="location-modal beta-user-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="beta-user-detail-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <p>Beta user detail</p>
                  <h2 id="beta-user-detail-title">{selectedBetaUser.displayName || selectedBetaUser.fullName || "Beta user"}</h2>
                </div>
                <button type="button" className="modal-close-button" aria-label="Close beta user detail" onClick={() => setSelectedBetaUserId("")}>X</button>
              </div>
              <div className="detail-grid compact-detail-grid">
                <DetailItem label="Email" value={maskEmail(selectedBetaUser.email)} />
                <DetailItem label="Username" value={selectedBetaUser.username || selectedBetaUser.publicUsername || "Not set"} />
                <DetailItem label="Beta status" value={statusLabel(selectedBetaUser.accessStatus)} />
                <DetailItem label="App access" value={selectedBetaUser.accessAllowed ? "Allowed" : "Blocked"} />
                <DetailItem label="Joined" value={selectedBetaUser.createdAt ? shortDate(selectedBetaUser.createdAt) : "Unavailable"} />
                <DetailItem label="Last active" value={selectedBetaUser.lastActiveAt ? shortDate(selectedBetaUser.lastActiveAt) : "Unavailable"} />
                <DetailItem label="Invite source" value={selectedBetaUser.inviteSource} />
                <DetailItem label="Source rows" value={selectedBetaUser.source || "Profile"} />
              </div>
              {selectedBetaUser.latestRequest ? (
                <div className="drawer-info-card">
                  <strong>Beta request</strong>
                  <p>{selectedBetaUser.latestRequest.reason || selectedBetaUser.latestRequest.message || "No request message."}</p>
                  <small>{selectedBetaUser.latestRequest.createdAt ? shortDate(selectedBetaUser.latestRequest.createdAt) : "No request date"} | {statusLabel(selectedBetaUser.latestRequest.status)}</small>
                </div>
              ) : null}
              {selectedBetaUser.matchingInvites.length ? (
                <div className="drawer-info-card">
                  <strong>Invite info</strong>
                  {selectedBetaUser.matchingInvites.slice(0, 3).map((invite) => (
                    <p key={invite.id}>{invite.recipientName || "Invite"} | {invite.status} | Created {invite.createdAt ? shortDate(invite.createdAt) : "date unavailable"} | Claimed {invite.claimedAt ? shortDate(invite.claimedAt) : "no"}</p>
                  ))}
                </div>
              ) : null}
              <section className="beta-user-activity-panel">
                <div className="compact-card-header">
                  <div>
                    <h3>Activity summary</h3>
                    <p>Recent app activity is based on the optional app_activity_events table.</p>
                  </div>
                  <span className="status-badge">{selectedBetaUser.matchingActivities.length} events</span>
                </div>
                <div className="beta-user-activity-list">
                  {selectedBetaUser.matchingActivities.length ? selectedBetaUser.matchingActivities.slice(0, 12).map((event) => (
                    <article key={event.id}>
                      <strong>{activityLabel(event.eventType)}</strong>
                      <span>{event.createdAt ? shortDate(event.createdAt) : "No date"} | {event.eventContext || "app"}</span>
                    </article>
                  )) : (
                    <p className="compact-subtitle">No activity events yet.</p>
                  )}
                </div>
              </section>
              <section className="beta-user-activity-panel">
                <div className="compact-card-header">
                  <div>
                    <h3>Admin notes</h3>
                    <p>Private notes are admin-only and never shown to beta users.</p>
                  </div>
                  <span className="status-badge">{selectedBetaUser.matchingNotes.length} notes</span>
                </div>
                <div className="beta-user-activity-list">
                  {selectedBetaUser.matchingNotes.length ? selectedBetaUser.matchingNotes.map((note) => (
                    <article key={note.id}>
                      <strong>{note.createdAt ? shortDate(note.createdAt) : "Admin note"}</strong>
                      <span>{note.note}</span>
                    </article>
                  )) : <p className="compact-subtitle">No admin notes yet.</p>}
                </div>
                {selectedBetaUser.userId ? (
                  <div className="beta-user-note-composer">
                    <textarea value={betaAdminNoteDraft} onChange={(event) => setBetaAdminNoteDraft(event.target.value)} placeholder="Add a private admin note" />
                    <button type="button" className="secondary-button" disabled={betaAdminNoteSaving} onClick={() => void handleCreateBetaAdminNote(selectedBetaUser.userId, selectedBetaUser.latestRequest?.id || "")}>{betaAdminNoteSaving ? "Saving..." : "Save note"}</button>
                  </div>
                ) : (
                  <p className="compact-subtitle">Backend notes require a signed-up user profile id.</p>
                )}
              </section>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  return renderBetaUsersDashboard();
}
