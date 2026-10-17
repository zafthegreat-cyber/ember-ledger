// App owns state, authority and handlers; only this existing renderer is deferred.
export default function CollectionsContent({ scope }) {
  const {
    DEFAULT_PERSONAL_WORKSPACE_ID,
    FORGE_IDENTITY_MODE_OPTIONS,
    Field,
    WORKSPACE_NAME_MAX_LENGTH,
    WORKSPACE_ROLES,
    WORKSPACE_TYPES,
    activeCollectionCount,
    activeForgeIdentityMode,
    activeForgeWorkspace,
    activeWorkspace,
    activeWorkspaceId,
    activeWorkspaceRole,
    canEditActiveWorkspace,
    canManageActiveWorkspace,
    canManageInviteWorkspace,
    changeActiveWorkspace,
    collectionUtilityDrawer,
    copyWorkspaceInviteLink,
    createWorkspace,
    currentWorkspaceEmail,
    currentWorkspaceUserId,
    emberTideForgeWorkspace,
    forgeIdentityModeLabel,
    isProtectedWorkspace,
    isWorkspaceArchived,
    normalizeForgeIdentityMode,
    openWorkspaceArchive,
    openWorkspaceDelete,
    openWorkspaceRename,
    renderUtilityPageShell,
    resetWorkspaceIdentityForm,
    saveWorkspaceIdentitySettings,
    sendWorkspaceInvite,
    setCollectionManagerOpen,
    setCollectionUtilityDrawer,
    setWorkspaceForm,
    setWorkspaceInviteForm,
    updateWorkspaceIdentityForm,
    workspaceDeleteBlockReason,
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
    workspaceRoleForId,
    workspaceRoleLabel,
    workspaceSelectorOptions,
    workspaceTypeLabel,
  } = scope;

  function renderCollectionsPage() {
    const activeWorkspaceCounts = workspaceRecordCountsFor(activeWorkspace?.id);
    const activeWorkspaceMembers = workspaceMembers.filter((member) => String(member.workspaceId || member.workspace_id) === String(activeWorkspace?.id));
    const activeWorkspaceInvites = workspaceInvites.filter((invite) => String(invite.workspaceId || invite.workspace_id) === String(activeWorkspace?.id));
    const activePendingInvites = activeWorkspaceInvites.filter((invite) => invite.status === "invited");
    const activeWorkspaceRecordTotal = Number(activeWorkspaceCounts.total || 0);
    const activeWorkspaceSummaryStats = [
      { label: "Vault items", value: activeWorkspaceCounts.vault || 0, helper: "Protected collection" },
      { label: "Forge items", value: activeWorkspaceCounts.forge || 0, helper: "Seller workspace" },
      { label: "Members", value: activeWorkspaceMembers.length || 0, helper: `${activePendingInvites.length || 0} pending invite${activePendingInvites.length === 1 ? "" : "s"}` },
    ];
    const activeWorkspaceAccessCopy = canManageActiveWorkspace
      ? "You can invite, manage access, and open owner tools for this workspace."
      : canEditActiveWorkspace
        ? "You can edit workspace details. Owner-only member tools stay hidden."
        : "You can view this workspace. Only owners and admins can manage members.";
    const collectionDrawerTitle = {
      identity: "Manage workspace",
      create: "Create workspace",
      invite: "Invite member",
      members: "Members",
      manage: "Collection tools",
      switch: "Switch workspace",
    }[collectionUtilityDrawer] || "Workspace tools";
    const closeCollectionUtilityDrawer = () => setCollectionUtilityDrawer("");
    const renderCollectionUtilityDrawerBody = () => {
      if (collectionUtilityDrawer === "switch") {
        return (
          <div className="collections-drawer-form">
            <strong>Choose where you are working</strong>
            <p className="compact-subtitle">Switching changes the active Vault, Forge, Market Watch, and workspace-scoped records. Archived workspaces stay hidden here.</p>
            <div className="workspace-switch-list" role="list">
              {workspaceSelectorOptions.map((workspace) => {
                const counts = workspaceRecordCountsFor(workspace.id);
                const isCurrent = String(workspace.id) === String(activeWorkspace?.id);
                return (
                  <article className={`workspace-switch-card${isCurrent ? " is-current" : ""}`} key={workspace.id} role="listitem">
                    <div>
                      <strong>{workspace.name || "Untitled workspace"}</strong>
                      <small>{workspaceTypeLabel(workspace.type)} - {workspaceRoleLabel(workspaceRoleForId(workspace.id))}</small>
                    </div>
                    <dl>
                      <div><dt>Vault</dt><dd>{counts.vault || 0}</dd></div>
                      <div><dt>Forge</dt><dd>{counts.forge || 0}</dd></div>
                      <div><dt>Records</dt><dd>{counts.total || 0}</dd></div>
                    </dl>
                    <button
                      type="button"
                      className={isCurrent ? "secondary-button" : "drawer-link"}
                      disabled={isCurrent}
                      onClick={() => {
                        changeActiveWorkspace(workspace.id);
                        closeCollectionUtilityDrawer();
                      }}
                    >
                      {isCurrent ? "Current" : "Switch"}
                    </button>
                  </article>
                );
              })}
              {!workspaceSelectorOptions.length ? (
                <div className="small-empty-state">
                  <strong>No active workspaces yet.</strong>
                  <span>Create a workspace to start separating collection and business records.</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      }
      if (collectionUtilityDrawer === "identity") {
        return (
          <form className="forge-identity-settings-card collections-drawer-form" onSubmit={saveWorkspaceIdentitySettings} noValidate>
            <div className="compact-card-header">
              <div>
                <strong>Workspace &amp; Forge Identity</strong>
                <p className="compact-subtitle">Choose how this workspace appears across Vault, Forge, and shared records.</p>
              </div>
              <span className="status-badge">{forgeIdentityModeLabel(activeForgeIdentityMode)}</span>
            </div>
            <Field label="Workspace name">
              <input value={workspaceIdentityForm.workspaceName} onChange={(event) => updateWorkspaceIdentityForm({ workspaceName: event.target.value })} maxLength={WORKSPACE_NAME_MAX_LENGTH} disabled={!canEditActiveWorkspace} placeholder="Workspace name" />
            </Field>
            <div className="drawer-two-column">
              <Field label="Business / shop name">
                <input value={workspaceIdentityForm.businessName} onChange={(event) => updateWorkspaceIdentityForm({ businessName: event.target.value })} disabled={!canEditActiveWorkspace} placeholder="Optional business name" />
              </Field>
              <Field label="Public display label">
                <input value={workspaceIdentityForm.displayLabel} onChange={(event) => updateWorkspaceIdentityForm({ displayLabel: event.target.value })} disabled={!canEditActiveWorkspace} placeholder="Optional display label" />
              </Field>
            </div>
            <Field label="Shop nickname">
              <input value={workspaceIdentityForm.shopName} onChange={(event) => updateWorkspaceIdentityForm({ shopName: event.target.value })} disabled={!canEditActiveWorkspace} placeholder="Optional nickname, DBA, or internal label" />
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
                    {disabled ? <small>Ember &amp; Tide workspace access is not available yet.</small> : null}
                  </button>
                );
              })}
            </div>
            <div className="menu-toggle-list">
              <label className="toggle-row forge-mode-toggle">
                <span><strong>Use Ember &amp; Tide branding</strong><small>Use Ember &amp; Tide naming in Forge where you have access.</small></span>
                <input type="checkbox" checked={workspaceIdentityForm.useEmberTideBranding} disabled={!canEditActiveWorkspace || !emberTideForgeWorkspace} onChange={(event) => updateWorkspaceIdentityForm({ useEmberTideBranding: event.target.checked, forgeIdentityMode: event.target.checked ? "ember_tide" : "business", defaultForgeMode: event.target.checked ? "ember_tide" : "business" })} />
              </label>
              <label className="toggle-row forge-mode-toggle">
                <span><strong>Keep personal Forge separate</strong><small>Personal Forge stays available as its own private option.</small></span>
                <input type="checkbox" checked={workspaceIdentityForm.keepPersonalForgeSeparate} disabled={!canEditActiveWorkspace} onChange={(event) => updateWorkspaceIdentityForm({ keepPersonalForgeSeparate: event.target.checked })} />
              </label>
            </div>
            <dl className="drawer-status-list forge-mode-summary">
              <div><dt>Forge mode</dt><dd>{forgeIdentityModeLabel(workspaceIdentityForm.forgeIdentityMode)}</dd></div>
              <div><dt>Active Forge</dt><dd>{activeForgeWorkspace?.name || "Unavailable"}</dd></div>
              <div><dt>Workspace records</dt><dd>{activeWorkspaceCounts.total} linked</dd></div>
            </dl>
            {workspaceIdentityMessage ? <p className="flow-inline-message is-info" role="status">{workspaceIdentityMessage}</p> : null}
            <div className="drawer-inline-actions">
              <button type="submit" className="drawer-link" disabled={!canEditActiveWorkspace}>Save Workspace</button>
              <button type="button" className="secondary-button" onClick={resetWorkspaceIdentityForm}>Reset</button>
              <button type="button" className="secondary-button" onClick={() => openWorkspaceArchive(activeWorkspace)} disabled={!canManageActiveWorkspace || activeCollectionCount <= 1 || isProtectedWorkspace(activeWorkspace, { defaultWorkspaceId: DEFAULT_PERSONAL_WORKSPACE_ID })}>Archive</button>
            </div>
          </form>
        );
      }
      if (collectionUtilityDrawer === "create") {
        return (
          <form className="collections-drawer-form collections-create-form" onSubmit={createWorkspace}>
            <strong>Create workspace</strong>
            <p className="compact-subtitle">New workspaces start empty. Existing personal data stays private until you intentionally add or move items.</p>
            <Field label="Workspace name">
              <input className="drawer-field" value={workspaceForm.name} onChange={(event) => setWorkspaceForm((current) => ({ ...current, name: event.target.value }))} placeholder="Family collection, Show inventory, Online shop..." />
            </Field>
            <Field label="Workspace type">
              <select className="drawer-field" value={workspaceForm.type} onChange={(event) => setWorkspaceForm((current) => ({ ...current, type: event.target.value }))}>
                {WORKSPACE_TYPES.filter((type) => !["personal", "shared_collection", "team"].includes(type.value)).map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </Field>
            <p className="compact-subtitle">Workspace notes and branding can be edited after creation from Manage Workspace.</p>
            <button type="submit" className="drawer-link">Create Workspace</button>
            {workspaceMessage ? <p className="flow-inline-message is-info" role="status">{workspaceMessage}</p> : null}
          </form>
        );
      }
      if (collectionUtilityDrawer === "invite") {
        return (
          <form className="collections-drawer-form collections-invite-form" onSubmit={sendWorkspaceInvite}>
            <strong>Invite member by email</strong>
            <p className="compact-subtitle">{canManageInviteWorkspace ? "Create a workspace invite, then copy and send the invite link." : "You do not have permission to invite members in this workspace."}</p>
            <Field label="Workspace">
              <select className="drawer-field" value={workspaceInviteForm.workspaceId} onChange={(event) => setWorkspaceInviteForm((current) => ({ ...current, workspaceId: event.target.value }))} disabled={workspaceInviteSending}>
                {workspaceSelectorOptions.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </Field>
            <Field label="Recipient email">
              <input className="drawer-field" type="email" value={workspaceInviteForm.email} onChange={(event) => setWorkspaceInviteForm((current) => ({ ...current, email: event.target.value }))} placeholder="member@example.com" disabled={!canManageInviteWorkspace || workspaceInviteSending} />
            </Field>
            <Field label="Role">
              <select className="drawer-field" value={workspaceInviteForm.role} onChange={(event) => setWorkspaceInviteForm((current) => ({ ...current, role: event.target.value }))} disabled={!canManageInviteWorkspace || workspaceInviteSending}>
                {WORKSPACE_ROLES.filter((role) => role.value !== "owner").map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </Field>
            <Field label="Note">
              <input className="drawer-field" value={workspaceInviteForm.note} onChange={(event) => setWorkspaceInviteForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" disabled={!canManageInviteWorkspace || workspaceInviteSending} />
            </Field>
            <button type="submit" className="drawer-link" disabled={!canManageInviteWorkspace || workspaceInviteSending}>{workspaceInviteSending ? "Creating..." : "Create Invite"}</button>
            {workspaceInviteDelivery ? (
              <div className="workspace-invite-delivery" role="status">
                <strong>{workspaceInviteDelivery.emailSent ? "Email sent" : "Invite created"}</strong>
                <p className="compact-subtitle">{workspaceInviteDelivery.emailSent ? `Workspace invite email was sent to ${workspaceInviteDelivery.email}.` : "Email is not configured - copy and send this link to the invited person."}</p>
                <input className="drawer-field" value={workspaceInviteLinkForInvite(workspaceInviteDelivery)} readOnly onFocus={(event) => event.target.select()} aria-label="Workspace invite link" />
                <button type="button" className="drawer-link" onClick={() => copyWorkspaceInviteLink(workspaceInviteDelivery)}>Copy invite link</button>
              </div>
            ) : null}
          </form>
        );
      }
      if (collectionUtilityDrawer === "members") {
        return (
          <div className="collections-drawer-form">
            <strong>Members</strong>
            <p className="compact-subtitle">People with access to {activeWorkspace?.name || "this workspace"}. Role changes and removals stay limited to supported owner/admin tools.</p>
            <div className="workspace-member-list">
              {activeWorkspaceMembers.map((member) => (
                <div className="workspace-member-row collections-member-row" key={`${member.workspaceId}-${member.userId || member.email || member.role}`}>
                  <span>
                    <strong>{member.email || (member.userId === "local-beta" ? "You" : member.userId || "Invited user")}</strong>
                    <small>{workspaceRoleLabel(member.role)} - {member.status === "active" ? "Active" : "Invite pending"}</small>
                  </span>
                  <span className="status-badge">{String(member.userId || member.user_id) === String(currentWorkspaceUserId) || String(member.email || "").toLowerCase() === String(currentWorkspaceEmail || "").toLowerCase() ? "You" : "Member"}</span>
                </div>
              ))}
              {!activeWorkspaceMembers.length ? <p className="compact-subtitle">No members yet. Invite someone by email.</p> : null}
            </div>
            {activeWorkspaceInvites.length ? (
              <details className="mobile-ux-disclosure">
                <summary>Pending and recent invites ({activeWorkspaceInvites.length})</summary>
                <div className="workspace-member-list">
                  {activeWorkspaceInvites.map((invite) => (
                    <div className="workspace-member-row collections-member-row" key={invite.id || invite.email}>
                      <span><strong>{invite.email || "Invite"}</strong><small>{invite.status || "pending"} - {workspaceRoleLabel(invite.role)}</small></span>
                      {invite.status === "invited" ? <button type="button" className="secondary-button" onClick={() => copyWorkspaceInviteLink(invite)}>Copy link</button> : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {!canManageActiveWorkspace ? (
              <p className="compact-subtitle">Only owners and admins can invite members or change access.</p>
            ) : (
              <button type="button" className="drawer-link" onClick={() => setCollectionUtilityDrawer("invite")}>Invite Member</button>
            )}
          </div>
        );
      }
      return (
        <div className="collections-drawer-form collections-manage-drawer">
          <strong>Manage workspace</strong>
          <p className="compact-subtitle">{activeWorkspaceAccessCopy}</p>
          <section className="collections-manage-summary" aria-label="Current workspace summary">
            <div>
              <span>Current workspace</span>
              <strong>{activeWorkspace?.name || "My Personal Space"}</strong>
              <small>{workspaceTypeLabel(activeWorkspace?.type)} - {workspaceRoleLabel(activeWorkspaceRole)}</small>
            </div>
            <span className={canManageActiveWorkspace ? "status-badge success" : "status-badge"}>{canManageActiveWorkspace ? "Owner/admin tools" : "Limited access"}</span>
          </section>
          <dl className="drawer-status-list collections-compact-status-list">
            <div><dt>Type</dt><dd>{workspaceTypeLabel(activeWorkspace?.type)}</dd></div>
            <div><dt>Role</dt><dd>{workspaceRoleLabel(activeWorkspaceRole)}</dd></div>
            <div><dt>Linked records</dt><dd>{activeWorkspaceRecordTotal}</dd></div>
            <div><dt>Members</dt><dd>{activeWorkspaceMembers.length}</dd></div>
          </dl>
          <div className="collections-action-grid">
            <button
              type="button"
              className="drawer-link"
              onClick={() => {
                closeCollectionUtilityDrawer();
                openWorkspaceRename(activeWorkspace);
              }}
              disabled={!canEditActiveWorkspace}
            >
              Edit name/type
            </button>
            <button type="button" className="secondary-button" onClick={() => setCollectionUtilityDrawer("identity")} disabled={!canEditActiveWorkspace}>
              Workspace identity
            </button>
            <button type="button" className="secondary-button" onClick={() => setCollectionUtilityDrawer("members")}>
              View members
            </button>
          </div>
          <section className="collections-danger-zone" aria-label="Workspace archive and delete actions">
            <div>
              <strong>Archive or delete</strong>
              <p className="compact-subtitle">Archive hides a workspace from normal switching. Permanent delete is only available for empty, supported workspaces.</p>
            </div>
            <div className="drawer-inline-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  closeCollectionUtilityDrawer();
                  openWorkspaceArchive(activeWorkspace);
                }}
                disabled={!canManageActiveWorkspace || activeCollectionCount <= 1 || isProtectedWorkspace(activeWorkspace, { defaultWorkspaceId: DEFAULT_PERSONAL_WORKSPACE_ID })}
              >
                Archive
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  closeCollectionUtilityDrawer();
                  openWorkspaceDelete(activeWorkspace);
                }}
                disabled={!canManageActiveWorkspace || Boolean(workspaceDeleteBlockReason(activeWorkspace, activeWorkspaceCounts, {
                  activeWorkspaceId,
                  activeWorkspaceCount: activeCollectionCount,
                  canManage: canManageActiveWorkspace,
                  confirmed: true,
                  defaultWorkspaceId: DEFAULT_PERSONAL_WORKSPACE_ID,
                }))}
              >
                Delete
              </button>
            </div>
          </section>
          <details className="mobile-ux-disclosure collections-technical-details">
            <summary>Technical details</summary>
            <dl className="drawer-status-list">
              <div><dt>Workspace ID</dt><dd>{activeWorkspace?.id || "Unavailable"}</dd></div>
              <div><dt>Owner</dt><dd>{activeWorkspace?.ownerUserId || activeWorkspace?.owner_user_id || "Unavailable"}</dd></div>
              <div><dt>Status</dt><dd>{isWorkspaceArchived(activeWorkspace) ? "Archived" : "Active"}</dd></div>
              <div><dt>Collections</dt><dd>{activeCollectionCount}</dd></div>
            </dl>
          </details>
          <button type="button" className="secondary-button" onClick={() => { closeCollectionUtilityDrawer(); setCollectionManagerOpen(true); }}>
            Open full collection manager
          </button>
          {workspaceMessage ? <p className="flow-inline-message is-info" role="status">{workspaceMessage}</p> : null}
        </div>
      );
    };
    const collectionUtilityDrawerNode = collectionUtilityDrawer ? (
      <div className="location-modal-backdrop collection-utility-backdrop" role="presentation" onClick={closeCollectionUtilityDrawer}>
        <section className="location-modal flow-modal collection-utility-drawer" role="dialog" aria-modal="true" aria-label={collectionDrawerTitle} onClick={(event) => event.stopPropagation()}>
          <header className="flow-modal-header">
            <div>
              <p className="eyebrow">Collections</p>
              <h2>{collectionDrawerTitle}</h2>
            </div>
            <button type="button" className="modal-close-button" aria-label="Close" onClick={closeCollectionUtilityDrawer}>
              X
            </button>
          </header>
          <div className="flow-modal-body collection-utility-body">
            {renderCollectionUtilityDrawerBody()}
          </div>
        </section>
      </div>
    ) : null;
    return renderUtilityPageShell({
      title: "Collections",
      subtitle: "Choose where you are working, see who has access, and keep workspace management contained.",
      className: "collections-utility-page",
      children: (
        <>
          <section className="drawer-info-card utility-card utility-card-wide collections-hub-card collections-main-card">
            <div className="collections-workspace-hero">
              <div>
                <p className="section-kicker">Current Workspace</p>
                <h2>{activeWorkspace?.name || "My Personal Space"}</h2>
                <p>{activeWorkspaceAccessCopy}</p>
                <div className="collections-badge-row" aria-label="Workspace context">
                  <span className="status-badge">{workspaceTypeLabel(activeWorkspace?.type)}</span>
                  <span className="status-badge">{workspaceRoleLabel(activeWorkspaceRole)}</span>
                  <span className="status-badge">{activeWorkspaceRecordTotal ? `${activeWorkspaceRecordTotal} linked` : "No records yet"}</span>
                </div>
              </div>
              <button type="button" className="secondary-button" onClick={() => setCollectionUtilityDrawer("switch")}>
                Switch Workspace
              </button>
            </div>
            <div className="collections-summary-grid" aria-label="Workspace summary">
              {activeWorkspaceSummaryStats.map((stat) => (
                <article className="collections-summary-tile" key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                  <small>{stat.helper}</small>
                </article>
              ))}
            </div>
            <div className="collections-action-grid collections-primary-actions" aria-label="Primary workspace actions">
              <button type="button" className="drawer-link" onClick={() => setCollectionUtilityDrawer("switch")}>Switch</button>
              <button type="button" className="drawer-link" onClick={() => setCollectionUtilityDrawer("manage")}>Manage</button>
              {canManageActiveWorkspace ? <button type="button" className="drawer-link" onClick={() => setCollectionUtilityDrawer("invite")}>Invite</button> : null}
              <button type="button" className="drawer-link" onClick={() => setCollectionUtilityDrawer("create")}>Create</button>
            </div>
            {workspaceMessage ? <p className="flow-inline-message is-info" role="status">{workspaceMessage}</p> : null}
          </section>

          <section className="collections-support-grid" aria-label="Workspace support">
            <article className="drawer-info-card utility-card collections-support-card">
              <strong>Access</strong>
              <p className="compact-subtitle">{activeWorkspaceMembers.length ? `${activeWorkspaceMembers.length} member${activeWorkspaceMembers.length === 1 ? "" : "s"} can access this workspace.` : "No member rows yet. Invite someone when you are ready."}</p>
              <button type="button" className="secondary-button" onClick={() => setCollectionUtilityDrawer("members")}>View members</button>
            </article>
            <article className="drawer-info-card utility-card collections-support-card">
              <strong>Workspace tools</strong>
              <p className="compact-subtitle">Rename, archive, delete empty workspaces, and open technical details only when needed.</p>
              <button type="button" className="secondary-button" onClick={() => setCollectionUtilityDrawer("manage")}>Manage Workspace</button>
            </article>
          </section>
          <section className="drawer-info-card utility-card collections-limited-card">
            <div>
              <strong>{canManageActiveWorkspace ? "Owner/admin controls are contained" : "Limited access"}</strong>
              <p className="compact-subtitle">
                {canManageActiveWorkspace
                  ? "Invite, archive, and delete controls open in drawers or confirmations so the main page stays simple."
                  : "You can switch and view workspace context. Member and destructive controls stay hidden unless your role allows them."}
              </p>
            </div>
          </section>
          {collectionUtilityDrawerNode}
        </>
      ),
    });
  }

  return renderCollectionsPage();
}
