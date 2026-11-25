// Rendering is deferred; the owning App retains record state and action handlers.
export default function AdminBetaInvitesContent({ scope, args = [] }) {
  const {
    DetailItem,
    Field,
    adminBetaInviteCreated,
    adminBetaInviteForm,
    adminBetaInviteLoading,
    adminBetaInviteSearch,
    adminBetaInviteShowInactive,
    betaAdminVisible,
    betaInviteLinkForCreatedInvite,
    copyAdminBetaInviteLink,
    handleCreateAdminBetaInvite,
    handleRevokeAdminBetaInvite,
    maskEmail,
    refreshAdminBetaInvites,
    selectedAdminBetaInviteId,
    setAdminBetaInviteCreated,
    setAdminBetaInviteSearch,
    setAdminBetaInviteShowInactive,
    setSelectedAdminBetaInviteId,
    shorelineState,
    shortDate,
    updateAdminBetaInviteForm,
  } = scope;

  function renderAdminBetaInviteManagement() {
    if (!betaAdminVisible) return null;
    const createdInviteLink = adminBetaInviteCreated ? betaInviteLinkForCreatedInvite(adminBetaInviteCreated) : "";
    const inviteRows = shorelineState.adminBetaInvites || [];
    const activeInviteCount = inviteRows.filter((invite) => invite.status === "active").length;
    const inviteSearchText = adminBetaInviteSearch.trim().toLowerCase();
    const inviteMatchesSearch = (invite = {}) => {
      if (!inviteSearchText) return true;
      return [
        invite.recipientName,
        invite.recipientEmail,
        invite.claimedEmail,
        invite.status,
        invite.note,
        invite.audience,
      ].filter(Boolean).join(" ").toLowerCase().includes(inviteSearchText);
    };
    const inviteIsActive = (invite = {}) => invite.status === "active" && !invite.claimedAt && !invite.revokedAt;
    const visibleInviteRows = inviteRows.filter((invite) =>
      inviteMatchesSearch(invite) && (adminBetaInviteShowInactive || inviteIsActive(invite))
    );
    const selectedAdminBetaInvite = inviteRows.find((invite) => String(invite.id) === String(selectedAdminBetaInviteId));
    return (
      <section className="settings-subsection beta-review-queue beta-invite-management">
        <div className="compact-card-header">
          <div>
            <h3>Personal Beta Invites</h3>
            <p>Create one-time invite links for specific people. Links grant normal beta access only after a signed-in user claims them through Supabase.</p>
          </div>
          <span className="status-badge">{activeInviteCount} active</span>
        </div>
        {!shorelineState.adminBetaInvitesReady && shorelineState.adminBetaInvitesMessage ? (
          <div className="empty-state compact-empty-state">
            <h3>Secure invite backend needed</h3>
            <p>{shorelineState.adminBetaInvitesMessage}</p>
          </div>
        ) : null}
        {shorelineState.adminBetaInvitesError ? <p className="auth-status-message error" role="alert">{shorelineState.adminBetaInvitesError}</p> : null}
        {shorelineState.adminBetaInvitesMessage && shorelineState.adminBetaInvitesReady ? <p className="auth-status-message success" role="status">{shorelineState.adminBetaInvitesMessage}</p> : null}
        <form className="form admin-beta-invite-form" onSubmit={handleCreateAdminBetaInvite}>
          <div className="auth-name-grid">
            <Field label="Recipient name">
              <input value={adminBetaInviteForm.recipientName} onChange={(event) => updateAdminBetaInviteForm("recipientName", event.target.value)} placeholder="Person receiving this invite" />
            </Field>
            <Field label="Recipient email optional">
              <input type="email" value={adminBetaInviteForm.recipientEmail} onChange={(event) => updateAdminBetaInviteForm("recipientEmail", event.target.value)} placeholder="Optional email lock" />
            </Field>
            <Field label="Expiration optional">
              <input type="datetime-local" value={adminBetaInviteForm.expiresAt} onChange={(event) => updateAdminBetaInviteForm("expiresAt", event.target.value)} />
            </Field>
          </div>
          <Field label="Private note optional">
            <textarea value={adminBetaInviteForm.note} onChange={(event) => updateAdminBetaInviteForm("note", event.target.value)} placeholder="Private admin note. Never shown publicly." />
          </Field>
          <div className="quick-actions">
            <button type="submit" className="ember-gradient-button" disabled={adminBetaInviteLoading}>{adminBetaInviteLoading ? "Creating..." : "Create Invite"}</button>
            <button type="button" className="secondary-button" onClick={() => void refreshAdminBetaInvites()} disabled={adminBetaInviteLoading}>Refresh Invites</button>
          </div>
          <p className="compact-subtitle">Raw invite tokens are shown only once after creation. Do not post invite links publicly.</p>
        </form>
        {adminBetaInviteCreated && createdInviteLink ? (
          <div className="drawer-info-card">
            <strong>Copy this invite link now</strong>
            <p className="compact-subtitle">This raw one-time token will not appear in invite history.</p>
            <input readOnly value={createdInviteLink} onFocus={(event) => event.target.select()} />
            <div className="quick-actions">
              <button type="button" className="secondary-button" onClick={() => void copyAdminBetaInviteLink(adminBetaInviteCreated)}>Copy invite link</button>
              <button type="button" className="ghost-button" onClick={() => setAdminBetaInviteCreated(null)}>Hide link</button>
            </div>
          </div>
        ) : null}
        <div className="compact-card-header">
          <div>
            <h4>Invite history</h4>
            <p>Active invites show by default. History never shows plaintext tokens or token hashes; claimed, revoked, and expired invites stay available in details.</p>
          </div>
          <div className="admin-invite-toolbar">
            <input value={adminBetaInviteSearch} onChange={(event) => setAdminBetaInviteSearch(event.target.value)} placeholder="Search invites" />
            <label className="inline-toggle">
              <input type="checkbox" checked={adminBetaInviteShowInactive} onChange={(event) => setAdminBetaInviteShowInactive(event.target.checked)} />
              <span>Show old invites</span>
            </label>
          </div>
        </div>
        <div className="inventory-list compact-inventory-list">
          {visibleInviteRows.length ? visibleInviteRows.map((invite) => {
            const canRevoke = inviteIsActive(invite);
            return (
              <article className="inventory-card compact-card" key={invite.id}>
                <div className="compact-card-header">
                  <div>
                    <strong>{invite.recipientName || "Unnamed invite"}</strong>
                    <p>{invite.recipientEmail ? maskEmail(invite.recipientEmail) : "No email lock"} | Created {invite.createdAt ? shortDate(invite.createdAt) : "date unavailable"}</p>
                  </div>
                  <span className={`status-badge ${invite.status}`}>{String(invite.status || "active").replace(/_/g, " ")}</span>
                </div>
                <p className="compact-subtitle">{invite.note || "No private note."}</p>
                <div className="detail-grid compact-detail-grid">
                  <DetailItem label="Audience" value={invite.audience || "beta"} />
                  <DetailItem label="Expires" value={invite.expiresAt ? shortDate(invite.expiresAt) : "No expiration"} />
                  <DetailItem label="Claimed" value={invite.claimedAt ? shortDate(invite.claimedAt) : "Not claimed"} />
                </div>
                <div className="quick-actions">
                  <button type="button" className="secondary-button" onClick={() => setSelectedAdminBetaInviteId(invite.id)}>View details</button>
                  {canRevoke ? (
                    <button type="button" className="delete-button" onClick={() => void handleRevokeAdminBetaInvite(invite)} disabled={adminBetaInviteLoading}>Revoke Invite</button>
                  ) : null}
                </div>
              </article>
            );
          }) : (
            <div className="empty-state">
              <h3>No invites in this view</h3>
              <p>Create a named invite, change the search, or show old invites to include claimed and revoked rows.</p>
            </div>
          )}
        </div>
        {selectedAdminBetaInvite ? (
          <div className="location-modal-backdrop" role="presentation" onClick={() => setSelectedAdminBetaInviteId("")}>
            <section className="location-modal beta-invite-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="beta-invite-detail-title" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <p>Invite details</p>
                  <h2 id="beta-invite-detail-title">{selectedAdminBetaInvite.recipientName || "Beta invite"}</h2>
                </div>
                <button type="button" className="modal-close-button" aria-label="Close invite detail" onClick={() => setSelectedAdminBetaInviteId("")}>X</button>
              </div>
              <div className="detail-grid compact-detail-grid">
                <DetailItem label="Recipient" value={selectedAdminBetaInvite.recipientEmail ? maskEmail(selectedAdminBetaInvite.recipientEmail) : "No email lock"} />
                <DetailItem label="Status" value={String(selectedAdminBetaInvite.status || "active").replace(/_/g, " ")} />
                <DetailItem label="Created" value={selectedAdminBetaInvite.createdAt ? shortDate(selectedAdminBetaInvite.createdAt) : "Unavailable"} />
                <DetailItem label="Expires" value={selectedAdminBetaInvite.expiresAt ? shortDate(selectedAdminBetaInvite.expiresAt) : "No expiration"} />
                <DetailItem label="Claimed by" value={selectedAdminBetaInvite.claimedEmail ? maskEmail(selectedAdminBetaInvite.claimedEmail) : selectedAdminBetaInvite.claimedBy ? "Signed-in user" : "Not claimed"} />
                <DetailItem label="Revoked" value={selectedAdminBetaInvite.revokedAt ? shortDate(selectedAdminBetaInvite.revokedAt) : "No"} />
              </div>
              {selectedAdminBetaInvite.note ? (
                <div className="drawer-info-card">
                  <strong>Private note</strong>
                  <p>{selectedAdminBetaInvite.note}</p>
                </div>
              ) : null}
              {betaInviteLinkForCreatedInvite(selectedAdminBetaInvite) ? (
                <div className="quick-actions">
                  <button type="button" className="secondary-button" onClick={() => void copyAdminBetaInviteLink(selectedAdminBetaInvite)}>Copy active link</button>
                </div>
              ) : null}
              <details className="technical-details-disclosure">
                <summary>Technical details</summary>
                <div className="detail-grid compact-detail-grid">
                  <DetailItem label="Invite row" value={selectedAdminBetaInvite.id || "Unavailable"} />
                  <DetailItem label="Created by" value={selectedAdminBetaInvite.createdByEmail ? maskEmail(selectedAdminBetaInvite.createdByEmail) : selectedAdminBetaInvite.createdBy ? "Admin user" : "Unavailable"} />
                  <DetailItem label="Claimed user" value={selectedAdminBetaInvite.claimedBy || "Not claimed"} />
                </div>
              </details>
              <div className="location-modal-actions modal-sticky-footer">
                {inviteIsActive(selectedAdminBetaInvite) ? (
                  <button type="button" className="delete-button" disabled={adminBetaInviteLoading} onClick={() => void handleRevokeAdminBetaInvite(selectedAdminBetaInvite)}>Revoke Invite</button>
                ) : null}
                <button type="button" className="secondary-button" onClick={() => setSelectedAdminBetaInviteId("")}>Close</button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  return renderAdminBetaInviteManagement(...args);
}
