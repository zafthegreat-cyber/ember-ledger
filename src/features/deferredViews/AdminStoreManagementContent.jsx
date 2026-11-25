// Rendering is deferred; the owning App retains record state and action handlers.
export default function AdminStoreManagementContent({ scope, args = [] }) {
  const {
    ADMIN_STORE_PERSISTENCE_NOTE,
    STORE_LOCATION_TYPES,
    STORE_PARTNER_NO_GUARANTEE_COPY,
    adminEditModeActive,
    adminReviewFilter,
    adminStoreDraft,
    adminStoreEditingId,
    adminToolsVisible,
    betaAdminVisible,
    buildStoreMapRows,
    getAdminStoreManagementSummary,
    openStoreProfile,
    quickPatchAdminStore,
    resetAdminStoreDraft,
    saveAdminStoreManagementDraft,
    setActiveTab,
    setScoutStoresMode,
    setScoutView,
    startAdminStoreDraft,
    suggestions,
    updateAdminStoreDraft,
  } = scope;

  function renderAdminStoreManagementSection() {
    if (!adminToolsVisible || !betaAdminVisible || adminReviewFilter !== "Store Management") return null;
    const storeRows = buildStoreMapRows({ unfiltered: true, admin: true });
    const summary = getAdminStoreManagementSummary(storeRows.map((row) => row.store), suggestions);
    return (
      <section className="settings-subsection admin-ops-section">
        <div className="compact-card-header">
          <div>
            <h3>Store Management</h3>
            <p>Manage store records, nicknames, city/state/area data, active status, reportable status, and family-friendly partner fields. {STORE_PARTNER_NO_GUARANTEE_COPY}</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => { setActiveTab("scout"); setScoutView("stores"); setScoutStoresMode("map"); }}>Open Stores</button>
        </div>
        <div className="cards mini-cards admin-store-summary-cards">
          <div className="card"><p>Total Stores</p><h2>{summary.totalStores}</h2></div>
          <div className="card"><p>Active</p><h2>{summary.activeStores}</h2></div>
          <div className="card"><p>Inactive</p><h2>{summary.inactiveStores}</h2></div>
          <div className="card"><p>Family-Friendly</p><h2>{summary.familyFriendlyStores}</h2></div>
          <div className="card"><p>Featured</p><h2>{summary.featuredPartners}</h2></div>
          <div className="card"><p>Open Suggestions</p><h2>{summary.openStoreSuggestions}</h2></div>
        </div>
        <div className="small-empty-state admin-only-note">
          <strong>Persistence note</strong>
          <span>{ADMIN_STORE_PERSISTENCE_NOTE}</span>
        </div>
        <form className="admin-store-draft-form compact-form-grid" onSubmit={saveAdminStoreManagementDraft}>
          <label className="form-field">
            <span>Display name</span>
            <input value={adminStoreDraft.displayName} onChange={(event) => updateAdminStoreDraft("displayName", event.target.value)} placeholder="Store or shop name" />
          </label>
          <label className="form-field">
            <span>Chain / brand</span>
            <input value={adminStoreDraft.chain} onChange={(event) => updateAdminStoreDraft("chain", event.target.value)} placeholder="Target, local shop, bookstore" />
          </label>
          <label className="form-field">
            <span>Store type</span>
            <select value={adminStoreDraft.storeType} onChange={(event) => updateAdminStoreDraft("storeType", event.target.value)}>
              {STORE_LOCATION_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Nickname</span>
            <input value={adminStoreDraft.nickname} onChange={(event) => updateAdminStoreDraft("nickname", event.target.value)} placeholder="RM T, Pem T, shop nickname" />
          </label>
          <label className="form-field">
            <span>City</span>
            <input value={adminStoreDraft.city} onChange={(event) => updateAdminStoreDraft("city", event.target.value)} placeholder="Virginia Beach" />
          </label>
          <label className="form-field">
            <span>State</span>
            <input value={adminStoreDraft.state} onChange={(event) => updateAdminStoreDraft("state", event.target.value)} placeholder="Virginia" />
          </label>
          <label className="form-field">
            <span>Region / area</span>
            <input value={adminStoreDraft.region} onChange={(event) => updateAdminStoreDraft("region", event.target.value)} placeholder="Hampton Roads / 757" />
          </label>
          <label className="form-field">
            <span>Public notes</span>
            <textarea value={adminStoreDraft.publicNotes} onChange={(event) => updateAdminStoreDraft("publicNotes", event.target.value)} placeholder="Public-safe store notes" />
          </label>
          <label className="form-field">
            <span>Kids / fair-access notes</span>
            <textarea value={adminStoreDraft.kidsFairAccessNotes} onChange={(event) => updateAdminStoreDraft("kidsFairAccessNotes", event.target.value)} placeholder="Private review context stays in admin tools/local data" />
          </label>
          <label className="form-field">
            <span>Partner notes</span>
            <textarea value={adminStoreDraft.partnerNotes} onChange={(event) => updateAdminStoreDraft("partnerNotes", event.target.value)} placeholder="Events, trade nights, partner context" />
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.active} onChange={(event) => updateAdminStoreDraft("active", event.target.checked)} />
            <span>Active store</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.reportable} onChange={(event) => updateAdminStoreDraft("reportable", event.target.checked)} />
            <span>Reportable in Restocks</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.familyFriendlyApproved} onChange={(event) => updateAdminStoreDraft("familyFriendlyApproved", event.target.checked)} />
            <span>Family-friendly approved</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.supportsKidsAccess} onChange={(event) => updateAdminStoreDraft("supportsKidsAccess", event.target.checked)} />
            <span>Kids access support</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.supportsMsrpOrReasonablePricing} onChange={(event) => updateAdminStoreDraft("supportsMsrpOrReasonablePricing", event.target.checked)} />
            <span>Reasonable pricing when possible</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.agreedToCommunityMotto} onChange={(event) => updateAdminStoreDraft("agreedToCommunityMotto", event.target.checked)} />
            <span>Agreed to community motto</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.offersKidEvents} onChange={(event) => updateAdminStoreDraft("offersKidEvents", event.target.checked)} />
            <span>Kid events</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.offersTradeNights} onChange={(event) => updateAdminStoreDraft("offersTradeNights", event.target.checked)} />
            <span>Trade nights</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.featuredPartner} onChange={(event) => updateAdminStoreDraft("featuredPartner", event.target.checked)} />
            <span>Featured partner</span>
          </label>
          <label className="inline-toggle">
            <input type="checkbox" checked={adminStoreDraft.advertisingPartner} onChange={(event) => updateAdminStoreDraft("advertisingPartner", event.target.checked)} />
            <span>Advertising partner</span>
          </label>
          <div className="flow-form-footer">
            <button type="submit" disabled={!adminEditModeActive}>{adminStoreEditingId ? "Save Store Metadata" : "Add Store Draft"}</button>
            <button type="button" className="secondary-button" onClick={resetAdminStoreDraft}>Reset</button>
          </div>
        </form>
        <div className="admin-store-management-grid">
          {storeRows.slice(0, 16).map((row) => (
            <article className="admin-store-card" key={`admin-store-${row.id}`}>
              <div>
                <strong>{row.name}</strong>
                <p>{row.retailer} | {row.profile?.storeType || row.storeType} | {row.area || "Area not listed"}</p>
              </div>
              <div className="summary-pill-row">
                <span className={`status-badge${["Empty shelves", "Low stock", "Needs report"].includes(row.status) ? " warning" : ""}`}>{row.status}</span>
                <span className="confidence-badge">{row.confidence} confidence</span>
                <span className={row.store.active === false || row.store.isActive === false ? "status-badge danger" : "status-badge"}>{row.store.active === false || row.store.isActive === false ? "Inactive" : "Active"}</span>
                {row.store.reportable === false || row.store.isReportable === false ? <span className="status-badge warning">Not reportable</span> : <span className="status-badge">Restocks reportable</span>}
              </div>
              {row.profile?.badges?.length ? (
                <div className="store-expansion-badges">
                  {row.profile.badges.slice(0, 6).map((badge) => (
                    <span key={badge.key} className={`store-expansion-badge store-expansion-badge-${badge.tone || "muted"}`}>{badge.label}</span>
                  ))}
                </div>
              ) : null}
              <p className="compact-subtitle">{row.store.publicNotes || row.store.public_notes || row.store.partnerNotes || row.store.partner_notes || "No public notes yet."}</p>
              <div className="quick-actions">
                <button type="button" className="secondary-button" onClick={() => openStoreProfile(row)}>Details</button>
                <button type="button" className="secondary-button" disabled={!adminEditModeActive} onClick={() => startAdminStoreDraft(row)}>Edit</button>
                <button type="button" className="secondary-button" disabled={!adminEditModeActive} onClick={() => quickPatchAdminStore(row, { familyFriendlyApproved: true, supportsKidsAccess: true, reviewStatus: "Approved" })}>Approve Family</button>
                <button type="button" className="ghost-button" disabled={!adminEditModeActive} onClick={() => quickPatchAdminStore(row, { active: false, reportable: false, reviewStatus: "Inactive" })}>Mark Inactive</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return renderAdminStoreManagementSection(...args);
}
