// Rendering is deferred; the owning App retains record state and action handlers.
export default function BetaReviewContent({ scope }) {
  const {
    BETA_ACCESS_STATUSES,
    BETA_REQUEST_STATUSES,
    DetailItem,
    Field,
    LITTLE_SPARKS_STATUSES,
    SPARK_PROGRAM_STATUS_OPTIONS,
    adminReviewFilter,
    betaAccessAllowedForProfile,
    betaAccessStatusForProfile,
    betaAdminVisible,
    betaReadinessData,
    currentUserProfile,
    maskEmail,
    money,
    phase2ReceiptDestinationSummaryText,
    phase2ReceiptLineItemCounts,
    phase2RecentReceipts,
    publicUsernameFromProfile,
    renderAdminBetaInviteManagement,
    renderBetaUsersDashboard,
    renderCommunityProfileSummary,
    runFeedbackAiSummary,
    runFeedbackSeverityAiAssist,
    runKidsProgramAiAssist,
    runMarketingAiAssist,
    scoutReportRows,
    setActiveTab,
    setAdminProfileUserNote,
    setForgeSubTab,
    setUserAdminNote,
    setUserManagementSearch,
    shorelineState,
    shortDate,
    sparkProgramStatusLabel,
    statusLabel,
    updateBetaAccessUser,
    updateDataRequestStatus,
    updateExistingBetaUserAccess,
    updateKidsProgramApplicationAdminNotes,
    updateKidsProgramApplicationStatus,
    updateShorelineAdminStatus,
    updateSponsorStatus,
    userBetaAccessStatus,
    userManagementSearch,
    validatePublicUsername,
  } = scope;

  function renderBetaAdminReviewQueues() {
    if (!betaAdminVisible) return null;
    const showBetaUsers = adminReviewFilter === "Beta Users";
    const showBetaAccess = adminReviewFilter === "Beta Access";
    const showKids = adminReviewFilter === "Kids Program Applications";
    const showSponsor = adminReviewFilter === "Sponsor Interest";
    const showFeedback = adminReviewFilter === "Beta Feedback";
    const showDataRequests = adminReviewFilter === "Data Requests";
    const showUserManagement = adminReviewFilter === "User Management";
    const showSystemHealth = adminReviewFilter === "System Health / Logs" || adminReviewFilter === "App Error Logs";
    const showErrors = showSystemHealth;
    const adminProfileUsers = shorelineState.adminProfileUsers || [];
    const backendBetaRequestKeys = new Set((shorelineState.adminBetaRequests || []).map((entry) => String(entry.userId || entry.email || "").toLowerCase()).filter(Boolean));
    const localBetaAccessRows = (betaReadinessData.betaAccessUsers || []).filter((entry) => {
      const key = String(entry.userId || entry.email || "").toLowerCase();
      return key && !backendBetaRequestKeys.has(key);
    });
    const betaAccessRows = [...(shorelineState.adminBetaRequests || []), ...localBetaAccessRows];
    const receiptsNeedingReview = phase2RecentReceipts.filter((receipt) => /draft|review|duplicate|pending|needs/i.test(`${receipt.status || ""} ${receipt.reviewStatus || ""} ${receipt.importStatus || ""}`));
    const localUsers = [
      currentUserProfile,
      ...(betaReadinessData.kidsApplications || []).map((entry) => ({
        userId: entry.userId,
        email: entry.email,
        fullName: entry.parentName,
        displayName: entry.parentName,
        createdAt: entry.createdAt,
        kidsProgramStatus: entry.status,
      })),
      ...(betaReadinessData.betaFeedback || []).map((entry) => ({
        userId: entry.userId,
        email: entry.email || "",
        fullName: entry.fullName || "",
        displayName: entry.fullName || entry.email || "Beta user",
        createdAt: entry.createdAt,
      })),
    ].filter(Boolean);
    const userMap = new Map();
    adminProfileUsers.forEach((entry) => {
      const key = String(entry.userId || entry.email || "").toLowerCase();
      if (!key) return;
      userMap.set(key, { ...entry, backendProfileRow: true });
    });
    localUsers.forEach((entry) => {
      const key = String(entry.userId || entry.email || entry.displayName || "").toLowerCase();
      if (!key) return;
      const existing = userMap.get(key) || {};
      userMap.set(key, { ...entry, ...existing, backendProfileRow: Boolean(existing.backendProfileRow) });
    });
    const userSearch = userManagementSearch.trim().toLowerCase();
    const visibleUsers = [...userMap.values()].filter((entry) => {
      const haystack = `${entry.fullName || ""} ${entry.displayName || ""} ${entry.publicUsername || ""} ${entry.username || ""} ${entry.email || ""} ${entry.betaStatus || ""} ${entry.betaAccessStatus || ""}`.toLowerCase();
      return !userSearch || haystack.includes(userSearch);
    });
    return (
      <>
        {showBetaUsers ? renderBetaUsersDashboard() : null}
        {(showUserManagement || showBetaAccess) ? renderAdminBetaInviteManagement() : null}
        {showUserManagement ? (
          <section className="settings-subsection beta-review-queue">
            <div className="compact-card-header">
              <div>
                <h3>User Management</h3>
                <p>Admin-only profile access queue. Approvals update real backend beta fields; private Vault/Forge data is not exposed here.</p>
              </div>
              <input value={userManagementSearch} onChange={(event) => setUserManagementSearch(event.target.value)} placeholder="Search name or email" />
            </div>
            {!shorelineState.adminProfileUsersReady ? (
              <div className="empty-state compact-empty-state">
                <h3>Secure profile approval needs backend setup</h3>
                <p>Beta request reviews still work. Existing signed-up users appear here after the admin beta approval RPC migration is applied.</p>
              </div>
            ) : null}
            <div className="inventory-list compact-inventory-list">
              {visibleUsers.length ? visibleUsers.map((entry) => {
                const kidsStatus = (betaReadinessData.kidsApplications || []).find((application) =>
                  String(application.userId || application.email) === String(entry.userId || entry.email)
                )?.status || entry.kidsProgramStatus || "not_applied";
                const reportCount = scoutReportRows.filter((report) => String(report.userId || report.user_id || report.reporterEmail || "") === String(entry.userId || entry.email)).length;
                const feedbackCount = (betaReadinessData.betaFeedback || []).filter((feedback) => String(feedback.userId || feedback.email || "") === String(entry.userId || entry.email)).length;
                const note = (betaReadinessData.userAdminNotes || []).find((item) => String(item.userId) === String(entry.userId || entry.email));
                const backendProfileRow = Boolean(entry.backendProfileRow);
                const accessStatus = backendProfileRow ? betaAccessStatusForProfile(entry) : userBetaAccessStatus(entry);
                const accessAllowed = backendProfileRow ? betaAccessAllowedForProfile(entry) : accessStatus === "approved";
                const usernameReviewError = validatePublicUsername(publicUsernameFromProfile(entry), entry, []);
                return (
                  <article className="inventory-card compact-card" key={entry.userId || entry.email || entry.displayName}>
                    <div className="compact-card-header">
                      <div>
                        <strong>{entry.fullName || entry.displayName || "Unnamed user"}</strong>
                        <p>{maskEmail(entry.email)} | {entry.createdAt ? shortDate(entry.createdAt) : "Created date unavailable"} | {backendProfileRow ? "Supabase profile" : "Local fallback"}</p>
                      </div>
                      <span className={`status-badge ${accessStatus}`}>{entry.isAdmin ? "admin" : statusLabel(accessStatus)}</span>
                    </div>
                    {renderCommunityProfileSummary(entry, { compact: true, adminDetail: true, className: "admin-reputation-profile-card" })}
                    <div className="detail-grid compact-detail-grid">
                      <DetailItem label="Plan/tier" value={entry.planTier || entry.tier || "free"} />
                      <DetailItem label="Beta access" value={accessAllowed ? "Approved" : statusLabel(accessStatus)} />
                      <DetailItem label="Kids Program" value={kidsStatus} />
                      <DetailItem label="Last seen" value={entry.lastSeenAt ? shortDate(entry.lastSeenAt) : "Unavailable"} />
                      <DetailItem label="Reports" value={String(reportCount)} />
                      <DetailItem label="Feedback" value={String(feedbackCount)} />
                      <DetailItem label="Username review" value={usernameReviewError ? "Needs review" : "Clear"} />
                    </div>
                    {usernameReviewError ? <p className="compact-subtitle warning-text">{usernameReviewError}</p> : null}
                    {backendProfileRow ? (
                      <>
                        {entry.isAdmin ? <p className="compact-subtitle">Admin/moderator access is not managed from beta approval.</p> : null}
                        <textarea
                          className="drawer-field"
                          value={entry.betaAccessNotes || ""}
                          placeholder="Private beta access note"
                          onChange={(event) => setAdminProfileUserNote(entry.userId, event.target.value)}
                        />
                        <div className="quick-actions">
                          {BETA_REQUEST_STATUSES.filter((status) => status !== "not_requested").map((status) => (
                            <button
                              type="button"
                              className="secondary-button"
                              key={status}
                              disabled={entry.isAdmin}
                              onClick={() => void updateExistingBetaUserAccess(entry, status)}
                            >
                              {status === "denied" ? "Deny / Revoke" : statusLabel(status)}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <textarea className="drawer-field" defaultValue={note?.note || ""} placeholder="Internal admin note" onBlur={(event) => setUserAdminNote(entry.userId || entry.email, event.target.value)} />
                        <div className="quick-actions">
                          {BETA_ACCESS_STATUSES.map((status) => (
                            <button type="button" className="secondary-button" key={status} onClick={() => void updateBetaAccessUser(entry, status)}>{status}</button>
                          ))}
                        </div>
                      </>
                    )}
                  </article>
                );
              }) : (
                <div className="empty-state">
                  <h3>No users match that search</h3>
                  <p>Signed-up users appear from Supabase profiles when the admin approval backend is available. Local fallback rows still appear from applications and feedback.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
        {showBetaAccess ? (
          <section className="settings-subsection beta-review-queue">
            <div className="compact-card-header">
              <div>
                <h3>Beta Access Requests</h3>
                <p>Approve, deny, waitlist, or reset requests. Supabase Shoreline rows appear first; local fallback access rows stay admin-only.</p>
              </div>
              <span className="status-badge">{betaAccessRows.length} total</span>
            </div>
            <div className="inventory-list compact-inventory-list">
              {betaAccessRows.length ? betaAccessRows.map((entry) => {
                const backendRow = Boolean(entry.id && (shorelineState.adminBetaRequests || []).some((request) => request.id === entry.id));
                return (
                <article className="inventory-card compact-card" key={entry.id || entry.userId || entry.email}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{entry.fullName || entry.email}</strong>
                      <p>{maskEmail(entry.email)} | {entry.cityArea || "Area not provided"} | {entry.collectorType || "collector"} | {backendRow ? "Supabase" : "Local fallback"}</p>
                    </div>
                    <span className={`status-badge ${entry.status}`}>{statusLabel(entry.status)}</span>
                  </div>
                  <p className="compact-subtitle">{entry.reason || "No beta access note."}</p>
                  <div className="detail-grid compact-detail-grid">
                    <DetailItem label="Local" value={entry.localAreaAnswer || "Not answered"} />
                    <DetailItem label="Social" value={entry.socialHandle || "None"} />
                    <DetailItem label="Rules" value={entry.rulesAgreed ? "Agreed" : "Missing"} />
                    <DetailItem label="Submitted" value={entry.createdAt ? shortDate(entry.createdAt) : "No date"} />
                  </div>
                  <div className="quick-actions">
                    {backendRow ? BETA_REQUEST_STATUSES.filter((status) => status !== "not_requested").map((status) => (
                      <button type="button" className="secondary-button" key={status} onClick={() => void updateShorelineAdminStatus("beta", entry, status)}>{statusLabel(status)}</button>
                    )) : BETA_ACCESS_STATUSES.map((status) => (
                      <button type="button" className="secondary-button" key={status} onClick={() => void updateBetaAccessUser(entry, status)}>{statusLabel(status)}</button>
                    ))}
                  </div>
                </article>
                );
              }) : (
                <div className="empty-state">
                  <h3>No beta requests yet</h3>
                  <p>Signed-in users submit requests from the beta access welcome screen.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
        {showKids ? (
          <section className="settings-subsection beta-review-queue">
            <div className="compact-card-header">
              <div>
                <h3>Kids Program Applications</h3>
                <p>Admins review manually. AI and Regular Preview Mode never approve applications.</p>
              </div>
              <span className="status-badge">{(betaReadinessData.kidsApplications || []).length} local total</span>
            </div>
            <div className="inventory-list compact-inventory-list">
              {(shorelineState.adminLittleSparksApplications || []).length ? shorelineState.adminLittleSparksApplications.map((entry) => (
                <article className="inventory-card compact-card" key={entry.id}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{entry.guardianName || entry.email}</strong>
                      <p>{maskEmail(entry.email)} | {entry.cityArea || "Area not provided"} | Child: {entry.childNickname || "Nickname hidden"}</p>
                    </div>
                    <span className={`status-badge ${entry.status}`}>{statusLabel(entry.status)}</span>
                  </div>
                  <p className="compact-subtitle">{entry.applicationNote || entry.hopedProducts || "No Little Sparks note."}</p>
                  <div className="detail-grid compact-detail-grid">
                    <DetailItem label="Age" value={entry.childAge ? String(entry.childAge) : "Not provided"} />
                    <DetailItem label="Products" value={entry.hopedProducts || "Not provided"} />
                    <DetailItem label="Parent confirmed" value={entry.guardianConfirmed ? "Yes" : "No"} />
                    <DetailItem label="Submitted" value={entry.createdAt ? shortDate(entry.createdAt) : "No date"} />
                  </div>
                  <div className="quick-actions">
                    {LITTLE_SPARKS_STATUSES.filter((status) => status !== "not_applied").map((status) => (
                      <button type="button" className="secondary-button" key={status} onClick={() => void updateShorelineAdminStatus("sparks", entry, status)}>{statusLabel(status)}</button>
                    ))}
                  </div>
                </article>
              )) : null}
              {(betaReadinessData.kidsApplications || []).length ? betaReadinessData.kidsApplications.map((entry) => (
                <article className="inventory-card compact-card" key={entry.id}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{entry.parentName || entry.email}</strong>
                      <p>{entry.zipCode || "ZIP not provided"} | {entry.childAgeRange || "Age range not provided"} | {(entry.requestedAccess || []).join(", ") || "Access not specified"}</p>
                    </div>
                    <span className="status-badge">{sparkProgramStatusLabel(entry.status || "interest_submitted")}</span>
                  </div>
                  <p className="compact-subtitle">{entry.collectingInterest || entry.reason || "No application note."}</p>
                  <Field label="Internal admin notes">
                    <textarea
                      value={entry.adminNotes || ""}
                      onChange={(event) => updateKidsProgramApplicationAdminNotes(entry.id, event.target.value)}
                      placeholder="Private admin notes. Never shown to families or the public."
                    />
                  </Field>
                  <div className="quick-actions">
                    <button type="button" className="secondary-button" onClick={() => void runKidsProgramAiAssist(entry)}>Summarize application</button>
                    {SPARK_PROGRAM_STATUS_OPTIONS.map((status) => (
                      <button type="button" className="secondary-button" key={status} onClick={() => updateKidsProgramApplicationStatus(entry.id, status)}>{sparkProgramStatusLabel(status)}</button>
                    ))}
                  </div>
                </article>
              )) : !(shorelineState.adminLittleSparksApplications || []).length ? (
                <div className="empty-state">
                  <h3>No Kids Program applications pending</h3>
                  <p>Applications appear here after a signed-in user submits the Kids Program form.</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
        {showSponsor ? (
          <section className="settings-subsection beta-review-queue">
            <div className="compact-card-header">
              <div>
                <h3>Sponsor Interest</h3>
                <p>Partner, card shop, donor, and sponsor outreach queue.</p>
              </div>
              <span className="status-badge">{(betaReadinessData.sponsorInterest || []).length} total</span>
            </div>
            <div className="inventory-list compact-inventory-list">
              {(betaReadinessData.sponsorInterest || []).length ? betaReadinessData.sponsorInterest.map((entry) => (
                <article className="inventory-card compact-card" key={entry.id}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{entry.businessName || entry.name}</strong>
                      <p>{maskEmail(entry.email)} | {entry.city || "City not provided"}</p>
                    </div>
                    <span className="status-badge">{entry.status || "new"}</span>
                  </div>
                  <p className="compact-subtitle">{(entry.partnershipTypes || []).join(", ") || "No partnership type"} | {entry.message || "No message"}</p>
                  <div className="quick-actions">
                    <button type="button" className="secondary-button" onClick={() => void runMarketingAiAssist("sponsor")}>Draft sponsor message</button>
                    {["reviewing", "planned", "archived"].map((status) => (
                      <button type="button" className="secondary-button" key={status} onClick={() => updateSponsorStatus(entry.id, status)}>{status}</button>
                    ))}
                  </div>
                </article>
              )) : (
                <div className="empty-state">
                  <h3>No sponsor interest yet</h3>
                  <p>New partner and sponsor forms will appear here.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
        {showFeedback ? (
          <section className="settings-subsection beta-review-queue">
            <div className="compact-card-header">
              <div>
                <h3>Beta Feedback</h3>
                <p>Feedback, bugs, wrong catalog data, scanner issues, receipt problems, and feature requests.</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => void runFeedbackAiSummary()}>Summarize feedback</button>
            </div>
            <div className="inventory-list compact-inventory-list">
              {(betaReadinessData.betaFeedback || []).length ? betaReadinessData.betaFeedback.map((entry) => (
                <article className="inventory-card compact-card" key={entry.id}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{entry.title}</strong>
                      <p>{entry.feedbackType || entry.type || "Feedback"} | {entry.page || "Page not set"}</p>
                    </div>
                    <span className="status-badge">{entry.status || "new"}</span>
                  </div>
                  <p className="compact-subtitle">{entry.description}</p>
                  <div className="quick-actions">
                    <button type="button" className="secondary-button" onClick={() => void runFeedbackSeverityAiAssist(entry)}>Suggest severity</button>
                  </div>
                </article>
              )) : (
                <div className="empty-state">
                  <h3>No beta feedback waiting for review</h3>
                  <p>Feedback submitted through the app appears here for admins.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
        {showDataRequests ? (
          <section className="settings-subsection beta-review-queue">
            <div className="compact-card-header">
              <div>
                <h3>Data Requests</h3>
                <p>Data export, deletion, correction, and privacy questions are manual admin-review requests during beta.</p>
              </div>
              <span className="status-badge">{(betaReadinessData.dataRequests || []).length} total</span>
            </div>
            <div className="inventory-list compact-inventory-list">
              {(betaReadinessData.dataRequests || []).length ? betaReadinessData.dataRequests.map((entry) => (
                <article className="inventory-card compact-card" key={entry.id}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{String(entry.requestType || "").replace(/_/g, " ")}</strong>
                      <p>{maskEmail(entry.email)} | {entry.createdAt ? shortDate(entry.createdAt) : "No date"}</p>
                    </div>
                    <span className="status-badge">{entry.status || "new"}</span>
                  </div>
                  <p className="compact-subtitle">{entry.message || "No message"}</p>
                  <div className="quick-actions">
                    {["reviewing", "completed", "rejected", "archived"].map((status) => (
                      <button type="button" className="secondary-button" key={status} onClick={() => updateDataRequestStatus(entry.id, status)}>{status}</button>
                    ))}
                  </div>
                </article>
              )) : (
                <div className="empty-state">
                  <h3>No data requests</h3>
                  <p>Privacy and account requests will appear here.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
        {showSystemHealth ? (
          <section className="settings-subsection beta-review-queue">
            <div className="compact-card-header">
              <div>
                <h3>Receipts Needing Review</h3>
                <p>Admin-only view of receipt drafts, duplicate warnings, and review states available from the current Phase 2 receipt data.</p>
              </div>
              <span className="status-badge">{receiptsNeedingReview.length} need review</span>
            </div>
            <div className="inventory-list compact-inventory-list">
              {receiptsNeedingReview.length ? receiptsNeedingReview.slice(0, 12).map((receipt) => (
                <article className="inventory-card compact-card" key={receipt.id}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{receipt.merchant || receipt.storeName || "Receipt review"}</strong>
                      <p>{receipt.purchaseDate || shortDate(receipt.purchasedAt || receipt.createdAt) || "No date"} | {money(receipt.total || receipt.receiptTotal || 0)}</p>
                    </div>
                    <span className="status-badge">{receipt.status || receipt.reviewStatus || "review"}</span>
                  </div>
                  <div className="detail-grid compact-detail-grid">
                    <DetailItem label="Lines" value={String(phase2ReceiptLineItemCounts[receipt.id] || 0)} />
                    <DetailItem label="Destination" value={phase2ReceiptDestinationSummaryText(receipt.id)} />
                    <DetailItem label="Source" value={receipt.source || "manual"} />
                    <DetailItem label="Workspace" value={receipt.workspaceId || receipt.workspace_id || "Personal"} />
                  </div>
                  <p className="compact-subtitle">Receipt images and raw OCR are not shown in this summary. Open Forge receipt review before changing records.</p>
                  <div className="quick-actions">
                    <button type="button" className="secondary-button" onClick={() => { setActiveTab("expenses"); setForgeSubTab("expenses"); }}>Open Forge Expenses</button>
                  </div>
                </article>
              )) : (
                <div className="empty-state">
                  <h3>No receipts need review</h3>
                  <p>Draft, duplicate, pending, and needs-review receipts will appear here when Phase 2 receipt data is available.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
        {showErrors ? (
          <section className="settings-subsection beta-review-queue">
            <div className="compact-card-header">
              <div>
                <h3>App Error Logs</h3>
                <p>Lightweight client errors only. Sensitive images, tokens, passwords, and child details are excluded.</p>
              </div>
              <span className="status-badge">{(betaReadinessData.appErrorLogs || []).length} total</span>
            </div>
            <div className="inventory-list compact-inventory-list">
              {(betaReadinessData.appErrorLogs || []).length ? betaReadinessData.appErrorLogs.slice(0, 20).map((entry) => (
                <article className="inventory-card compact-card" key={entry.id}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{entry.action}</strong>
                      <p>{entry.page} | {entry.createdAt ? shortDate(entry.createdAt) : "No date"}</p>
                    </div>
                    <span className={`status-badge severity-${entry.severity || "normal"}`}>{entry.severity || "normal"}</span>
                  </div>
                  <p className="compact-subtitle">{entry.errorMessage}</p>
                </article>
              )) : (
                <div className="empty-state">
                  <h3>No app errors logged</h3>
                  <p>Failed saves and safe app errors will appear here for admins.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </>
    );
  }

  return renderBetaAdminReviewQueues();
}
