// Rendering is deferred; the owning App retains record state and action handlers.
export default function RoleManagementContent({ scope, args = [] }) {
  const {
    APP_ROLES,
    DetailItem,
    Field,
    ROLE_FILTERS,
    actualAdminRole,
    canAssignAppRole,
    confirmRoleChange,
    isOfficialAdminProfile,
    isOwner,
    maskEmail,
    normalizeAppRole,
    openRoleChangeConfirmation,
    refreshRoleManagementData,
    roleChangeReason,
    roleChangeRole,
    roleChangeSaving,
    roleChangeTarget,
    roleFilterMatches,
    roleLabel,
    roleManagementFilter,
    roleManagementSearch,
    roleManagementVisible,
    rolePermissionProfile,
    setRoleChangeReason,
    setRoleChangeTarget,
    setRoleManagementFilter,
    setRoleManagementSearch,
    shorelineState,
    shortDate,
    statusLabel,
  } = scope;

  function renderRoleManagementSection() {
    if (!roleManagementVisible) return null;
    const actorProfile = { ...rolePermissionProfile, appRole: actualAdminRole, app_role: actualAdminRole };
    const roleRows = (shorelineState.roleManagementUsers || []).map((entry) => {
      const appRole = normalizeAppRole(entry.appRole || entry.app_role || entry.userRole);
      return {
        ...entry,
        appRole,
        app_role: appRole,
        protectedOfficialAdmin: Boolean(entry.protectedOfficialAdmin || entry.protected_official_admin || isOfficialAdminProfile(entry)),
      };
    });
    const searchText = roleManagementSearch.trim().toLowerCase();
    const visibleRoleRows = roleRows.filter((entry) => {
      const haystack = `${entry.displayName || ""} ${entry.fullName || ""} ${entry.username || ""} ${entry.publicUsername || ""} ${entry.email || ""} ${entry.appRole || ""} ${entry.betaAccessStatus || ""}`.toLowerCase();
      return (!searchText || haystack.includes(searchText)) && roleFilterMatches(entry, roleManagementFilter);
    });
    const roleCounts = {
      owner: roleRows.filter((entry) => entry.appRole === APP_ROLES.OWNER).length,
      admin: roleRows.filter((entry) => entry.appRole === APP_ROLES.ADMIN).length,
      moderator: roleRows.filter((entry) => entry.appRole === APP_ROLES.MODERATOR).length,
      betaUser: roleRows.filter((entry) => entry.appRole === APP_ROLES.BETA_USER).length,
      user: roleRows.filter((entry) => entry.appRole === APP_ROLES.USER).length,
    };
    const assignableRoles = isOwner(actorProfile)
      ? [APP_ROLES.USER, APP_ROLES.BETA_USER, APP_ROLES.MODERATOR, APP_ROLES.ADMIN, APP_ROLES.OWNER]
      : [APP_ROLES.USER, APP_ROLES.BETA_USER, APP_ROLES.MODERATOR];

    return (
      <section className="settings-subsection role-management-panel" aria-label="Role Management">
        <div className="compact-card-header">
          <div>
            <h3>Role Management</h3>
            <p>Owner/admin-only controls for assigning beta users, moderators, admins, and owners. Role changes are handled by secure Supabase RPCs and logged.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void refreshRoleManagementData(roleManagementSearch)}>Refresh roles</button>
        </div>
        {shorelineState.roleManagementMessage ? (
          <div className="empty-state compact-empty-state">
            <h3>Role backend setup needed</h3>
            <p>{shorelineState.roleManagementMessage}</p>
          </div>
        ) : null}
        {shorelineState.roleManagementError ? <p className="auth-status-message error" role="alert">{shorelineState.roleManagementError}</p> : null}
        <div className="role-management-overview">
          <article><span>Owners</span><strong>{roleCounts.owner}</strong></article>
          <article><span>Admins</span><strong>{roleCounts.admin}</strong></article>
          <article><span>Moderators</span><strong>{roleCounts.moderator}</strong></article>
          <article><span>Beta users</span><strong>{roleCounts.betaUser}</strong></article>
          <article><span>Users</span><strong>{roleCounts.user}</strong></article>
        </div>
        <div className="beta-users-toolbar">
          <input value={roleManagementSearch} onChange={(event) => setRoleManagementSearch(event.target.value)} placeholder="Search users by name, username, or email" />
          <div className="segmented-control" role="tablist" aria-label="Role filters">
            {ROLE_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter}
                className={roleManagementFilter === filter ? "active" : ""}
                onClick={() => setRoleManagementFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
        <p className="role-warning">
          Admins can assign moderator, beta user, and user roles. Only owners can assign owner/admin roles. Self role changes and the last owner/admin downgrade are blocked server-side.
        </p>
        <div className="role-management-user-grid">
          {visibleRoleRows.length ? visibleRoleRows.map((entry) => {
            const currentRole = normalizeAppRole(entry.appRole || entry.app_role);
            return (
              <article className="role-user-card" key={entry.userId || entry.email}>
                <div className="role-user-card-main">
                  <div>
                    <strong>{entry.displayName || entry.fullName || entry.email || "User"}</strong>
                    <p>{maskEmail(entry.email)} | {entry.username || entry.publicUsername || "No username"}</p>
                    <small>Joined {entry.createdAt ? shortDate(entry.createdAt) : "date unavailable"} | Last active {entry.lastActiveAt || entry.lastSeenAt ? shortDate(entry.lastActiveAt || entry.lastSeenAt) : "unavailable"}</small>
                  </div>
                  <span className={`status-badge ${currentRole}`}>{roleLabel(currentRole)}</span>
                </div>
                <div className="detail-grid compact-detail-grid">
                  <DetailItem label="Beta access" value={entry.appAccess ? "Allowed" : statusLabel(entry.betaAccessStatus || entry.beta_status)} />
                  <DetailItem label="App access" value={entry.appAccess ? "true" : "false"} />
                  <DetailItem label="Protected admin" value={entry.protectedOfficialAdmin ? "Yes" : "No"} />
                  <DetailItem label="Plan" value={entry.planTier || entry.tier || "free"} />
                </div>
                <div className="role-action-grid">
                  {assignableRoles.map((nextRole) => {
                    const disabled = nextRole === currentRole || !canAssignAppRole(actorProfile, entry, nextRole) || (entry.protectedOfficialAdmin && !isOwner(actorProfile));
                    return (
                      <button
                        type="button"
                        className={nextRole === APP_ROLES.ADMIN || nextRole === APP_ROLES.OWNER ? "delete-button" : "secondary-button"}
                        key={nextRole}
                        disabled={disabled}
                        onClick={() => openRoleChangeConfirmation(entry, nextRole)}
                      >
                        Make {roleLabel(nextRole)}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          }) : (
            <div className="empty-state compact-empty-state">
              <h3>No role users match this view</h3>
              <p>{shorelineState.roleManagementUsersReady ? "Try another search or filter." : "Apply the role management migration to load live users."}</p>
            </div>
          )}
        </div>
        <section className="role-audit-panel">
          <div className="compact-card-header">
            <div>
              <h4>Recent role changes</h4>
              <p>Audit log entries are admin-only and do not expose protected app data.</p>
            </div>
            <span className="status-badge">{(shorelineState.roleAuditLog || []).length} entries</span>
          </div>
          <div className="admin-compact-list">
            {(shorelineState.roleAuditLog || []).slice(0, 8).map((entry) => (
              <article className="admin-compact-row" key={entry.id}>
                <div>
                  <strong>{maskEmail(entry.targetEmail) || "User role changed"}</strong>
                  <p>{roleLabel(entry.oldRole)} to {roleLabel(entry.newRole)} | {entry.createdAt ? shortDate(entry.createdAt) : "No date"}</p>
                </div>
                <span className="status-badge">{entry.reason || "role change"}</span>
              </article>
            ))}
            {!(shorelineState.roleAuditLog || []).length ? (
              <div className="small-empty-state"><strong>No role changes logged yet</strong><span>Role changes made through the secure RPC will appear here.</span></div>
            ) : null}
          </div>
        </section>
        {roleChangeTarget ? (
          <div className="location-modal-backdrop" role="presentation" onClick={() => setRoleChangeTarget(null)}>
            <section className="location-modal role-change-modal" role="dialog" aria-modal="true" aria-labelledby="role-change-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <p>Confirm role change</p>
                  <h2 id="role-change-title">{roleChangeTarget.displayName || roleChangeTarget.email || "User"}</h2>
                </div>
                <button type="button" className="modal-close-button" aria-label="Close role confirmation" onClick={() => setRoleChangeTarget(null)}>X</button>
              </div>
              <p className="compact-subtitle">
                Change this user from {roleLabel(roleChangeTarget.appRole)} to {roleLabel(roleChangeRole)}. This does not grant seller access, paid tier, or private workspace data by itself.
              </p>
              {roleChangeRole === APP_ROLES.ADMIN || roleChangeRole === APP_ROLES.OWNER ? (
                <p className="role-warning">Admin and owner promotion is sensitive. Confirm the user is an official Code 3 TCG operator before continuing.</p>
              ) : null}
              {roleChangeTarget.protectedOfficialAdmin ? (
                <p className="role-warning">This looks like official admin Code 3 TCG. Only owners should change this role.</p>
              ) : null}
              <Field label="Reason optional">
                <textarea value={roleChangeReason} onChange={(event) => setRoleChangeReason(event.target.value)} placeholder="Why is this role changing?" />
              </Field>
              <div className="quick-actions">
                <button type="button" className="ember-gradient-button" disabled={roleChangeSaving} onClick={() => void confirmRoleChange()}>
                  {roleChangeSaving ? "Saving..." : `Confirm ${roleLabel(roleChangeRole)}`}
                </button>
                <button type="button" className="secondary-button" onClick={() => setRoleChangeTarget(null)}>Cancel</button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  return renderRoleManagementSection(...args);
}
