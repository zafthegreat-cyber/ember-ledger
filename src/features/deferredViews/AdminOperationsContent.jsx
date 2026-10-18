// Rendering is deferred; the owning App retains record state and action handlers.
export default function AdminOperationsContent({ scope }) {
  const {
    REVIEW_SECTION_LABELS,
    TIER_LABELS,
    adminEditModeActive,
    adminQueueSearch,
    adminReviewFilter,
    betaAccessAllowedForProfile,
    betaReadinessData,
    buildAdminCommandCenterSummary,
    buildStoreMapRows,
    currentTier,
    getMarketplaceListingQualityContext,
    getPersistedNotificationRows,
    getSuggestionReviewSection,
    isAnnouncementNotification,
    isEmberAssistSuggestion,
    listingNeedsMarketplaceReview,
    phase2RecentReceipts,
    renderAdminAnnouncementSection,
    renderAdminCommunityGuessQueue,
    renderAdminScoutReportQueue,
    renderAdminShopReviewQueue,
    renderAdminStoreManagementSection,
    renderAdminTidepoolModerationQueue,
    renderAdminTrustActivity,
    renderRoleManagementSection,
    roleManagementVisible,
    scoutGuessRows,
    scoutReportRows,
    setActiveTab,
    setAdminQueueSearch,
    setAdminReviewFilter,
    shopReviewBadges,
    shorelineState,
    shortDate,
    storeLooksLikeCommunityShop,
    subscriptionProfile,
    suggestions,
    tidepoolPosts,
    workspaceMarketplaceListings,
    workspaces,
  } = scope;

  function renderAdminOperationsDashboard() {
    const assistMessages = suggestions.filter(isEmberAssistSuggestion);
    const localCommunityGuesses = scoutGuessRows;
    const localShopRows = buildStoreMapRows().filter((row) => storeLooksLikeCommunityShop(row) || shopReviewBadges(row.store).length);
    const commandSummary = buildAdminCommandCenterSummary({
      scoutReports: scoutReportRows,
      communityGuesses: localCommunityGuesses,
      assistMessages,
      stores: localShopRows.map((row) => row.store),
      tidepoolPosts,
      feedback: betaReadinessData.betaFeedback || [],
      errors: betaReadinessData.appErrorLogs || [],
    });
    const listingReviewItems = workspaceMarketplaceListings.filter((listing) => listingNeedsMarketplaceReview(listing, getMarketplaceListingQualityContext(listing)));
    const betaRequests = [
      ...(shorelineState.adminBetaRequests || []).filter((entry) => ["pending", "waitlist"].includes(entry.status || "pending")),
      ...(betaReadinessData.betaAccessUsers || []).filter((entry) => ["pending", "paused"].includes(entry.status || "pending")),
    ];
    const approvedBetaUserCount = (shorelineState.adminProfileUsers || []).filter((entry) => !entry.isAdmin && betaAccessAllowedForProfile(entry)).length;
    const betaInviteClaimCount = (shorelineState.adminBetaInvites || []).filter((invite) => invite.claimedAt || invite.status === "claimed").length;
    const roleManagementCount = (shorelineState.roleManagementUsers || []).length;
    const kidsApplications = [...(shorelineState.adminLittleSparksApplications || []), ...(betaReadinessData.kidsApplications || [])];
    const sponsorRows = betaReadinessData.sponsorInterest || [];
    const auditLogs = betaReadinessData.auditLogs || [];
    const announcementCount = getPersistedNotificationRows().filter(isAnnouncementNotification).length;
    const shopWorkspaces = workspaces.filter((workspace) => ["business", "card_shop_partner", "team"].includes(workspace.type));
    const receiptsNeedingReview = phase2RecentReceipts.filter((receipt) => /draft|review|duplicate|pending|needs/i.test(`${receipt.status || ""} ${receipt.reviewStatus || ""} ${receipt.importStatus || ""}`));
    const catalogCorrectionCount = suggestions.filter((suggestion) => ["Catalog Suggestions", "SKU / UPC Suggestions", "Store Suggestions"].includes(REVIEW_SECTION_LABELS[getSuggestionReviewSection(suggestion)])).length;
    const activeBetaInviteCount = (shorelineState.adminBetaInvites || []).filter((invite) => !invite.revokedAt && invite.status !== "revoked").length;
    const kidsReviewCount = kidsApplications.filter((entry) => ["pending", "pending_review"].includes(entry.status || "pending_review")).length;
    const flaggedContentCount = listingReviewItems.length + commandSummary.tidepoolPostsNeedingReview;
    const feedbackMessageCount = (betaReadinessData.betaFeedback || []).length + commandSummary.openAssistMessages;
    const adminQueueRows = [
      { key: "command", title: "Trust command center", count: commandSummary.totalOpen, priority: commandSummary.totalOpen ? "Needs review" : "Clear", submittedBy: "App queues", details: "Scout, guesses, shops, Assist messages, and user issues.", filter: "Trust Command Center" },
      { key: "roles", title: "Role management", count: roleManagementCount, priority: roleManagementVisible ? "Protected" : "Locked", submittedBy: "Profiles", details: "Assign admins, moderators, beta users, and users through secure role RPCs.", filter: "Role Management" },
      { key: "beta-users", title: "Beta users dashboard", count: approvedBetaUserCount + betaRequests.length, priority: betaRequests.length ? "Access review" : "Track", submittedBy: "Profiles/invites", details: "Track pending, approved, invited, joined, and active beta users.", filter: "Beta Users" },
      { key: "beta", title: "Beta access requests", count: betaRequests.length, priority: betaRequests.length ? "Today" : "Clear", submittedBy: "Applicants", details: "Approve, waitlist, pause, or deny app access.", filter: "Beta Access" },
      { key: "kids", title: "Kids Program requests", count: kidsReviewCount, priority: kidsApplications.length ? "High privacy" : "Clear", submittedBy: "Parents/guardians", details: "Private family requests. No child details are public.", filter: "Kids Program Applications" },
      { key: "scout", title: "Scout moderation", count: commandSummary.pendingScoutReports, priority: commandSummary.pendingScoutReports ? "Review" : "Clear", submittedBy: "Scout reporters", details: "Moderate unusual, conflicting, flagged, or hidden reports.", filter: "Scout Report Review" },
      { key: "guesses", title: "Community guesses / predictions", count: commandSummary.pendingCommunityGuesses, priority: commandSummary.pendingCommunityGuesses ? "Review" : "Clear", submittedBy: "Qualified Scouts", details: "Keep guesses separate from confirmed restock history.", filter: "Community Guess Review" },
      { key: "assist", title: "Business Assistant admin messages", count: commandSummary.openAssistMessages, priority: commandSummary.openAssistMessages ? "Review" : "Clear", submittedBy: "App users", details: "Questions escalated from Business Assistant with safe context.", filter: REVIEW_SECTION_LABELS.assist },
      { key: "shops", title: "Family-friendly shop review", count: commandSummary.shopsNeedingReview, priority: commandSummary.shopsNeedingReview ? "Review" : "Clear", submittedBy: "Admin/store metadata", details: "Approve mission-aligned shop badges without pricing guarantees.", filter: "Family-Friendly Shop Review" },
      { key: "market", title: "Marketplace pricing/scalping flags", count: listingReviewItems.length, priority: listingReviewItems.length ? "High" : "Clear", submittedBy: "Sellers/community", details: "Approve, reject, request edits, pause, archive, or feature flagged listings.", filter: "Marketplace Listings" },
      { key: "tidepool", title: "Tidepool post moderation", count: commandSummary.tidepoolPostsNeedingReview, priority: commandSummary.tidepoolPostsNeedingReview ? "Needs review" : "Clear", submittedBy: "Community", details: "Review pending, flagged, and unsafe community content.", filter: "Reports & Moderation" },
      { key: "receipts", title: "Receipts needing review", count: receiptsNeedingReview.length, priority: receiptsNeedingReview.length ? "Today" : "Clear", submittedBy: "Sellers", details: "Review receipt drafts, duplicates, and expense evidence.", filter: "System Health / Logs" },
      { key: "catalog", title: "Product/catalog corrections", count: catalogCorrectionCount, priority: catalogCorrectionCount ? "Review" : "Clear", submittedBy: "Users/admin", details: "Catalog, SKU, UPC, store, and data corrections.", filter: "Catalog Suggestions" },
      { key: "feedback", title: "App feedback and bug reports", count: (betaReadinessData.betaFeedback || []).length + (betaReadinessData.appErrorLogs || []).length, priority: ((betaReadinessData.betaFeedback || []).length + (betaReadinessData.appErrorLogs || []).length) ? "Review" : "Clear", submittedBy: "Beta users/app", details: "Feedback, bugs, and safe client error logs.", filter: "Beta Feedback" },
    ];
    const adminOverviewRows = [
      { key: "beta", label: "Beta requests", value: betaRequests.length, tone: betaRequests.length ? "warning" : "success", filter: "Beta Access" },
      { key: "invites", label: "Invites", value: activeBetaInviteCount, tone: activeBetaInviteCount ? "info" : "muted", filter: "Beta Access" },
      { key: "scout", label: "Scout review", value: commandSummary.pendingScoutReports, tone: commandSummary.pendingScoutReports ? "warning" : "success", filter: "Scout Report Review" },
      { key: "catalog", label: "Missing catalog", value: catalogCorrectionCount, tone: catalogCorrectionCount ? "warning" : "success", filter: "Catalog Suggestions" },
      { key: "feedback", label: "Feedback", value: feedbackMessageCount, tone: feedbackMessageCount ? "info" : "success", filter: "Beta Feedback" },
      { key: "flagged", label: "Flagged content", value: flaggedContentCount, tone: flaggedContentCount ? "danger" : "success", filter: "Reports & Moderation" },
      { key: "kids", label: "Kids requests", value: kidsReviewCount, tone: kidsReviewCount ? "warning" : "success", filter: "Kids Program Applications" },
      { key: "shops", label: "Shop approvals", value: commandSummary.shopsNeedingReview, tone: commandSummary.shopsNeedingReview ? "warning" : "success", filter: "Family-Friendly Shop Review" },
      { key: "roles", label: "User roles", value: roleManagementCount || approvedBetaUserCount || 0, tone: roleManagementVisible ? "info" : "muted", filter: "Role Management" },
    ];
    const adminEssentialQueues = [
      { key: "beta-requests", title: "Beta Requests", count: betaRequests.length, status: betaRequests.length ? "Needs review" : "Clear", detail: "Approve, waitlist, deny, or reset beta access requests.", filter: "Beta Access" },
      { key: "invites", title: "Invites", count: activeBetaInviteCount, status: activeBetaInviteCount ? "Active" : "No active invites", detail: "Create, copy, and review invitation links.", filter: "Beta Access" },
      { key: "scout-review", title: "Scout Report Review", count: commandSummary.pendingScoutReports, status: commandSummary.pendingScoutReports ? "Needs review" : "Clear", detail: "Moderate reports that affect Tide Score and community trust.", filter: "Scout Report Review" },
      { key: "missing-catalog", title: "Missing Catalog Requests", count: catalogCorrectionCount, status: catalogCorrectionCount ? "Needs review" : "Clear", detail: "Review missing products, UPC/SKU fixes, and catalog corrections.", filter: "Catalog Suggestions" },
      { key: "feedback", title: "Feedback Inbox", count: feedbackMessageCount, status: feedbackMessageCount ? "Open" : "Clear", detail: "Review app feedback, bug reports, and support messages.", filter: "Beta Feedback" },
      { key: "moderation", title: "Moderation / Flagged Content", count: flaggedContentCount, status: flaggedContentCount ? "Flagged" : "Clear", detail: "Review flagged Tidepool, Scout, and marketplace safety items.", filter: "Reports & Moderation" },
      { key: "kids", title: "Kids Program Requests", count: kidsReviewCount, status: kidsReviewCount ? "Needs review" : "Clear", detail: "Review The Spark requests with family safety context.", filter: "Kids Program Applications" },
      { key: "shops", title: "Family-friendly Shop Approvals", count: commandSummary.shopsNeedingReview, status: commandSummary.shopsNeedingReview ? "Needs review" : "Clear", detail: "Approve shop badges and community-safe partner metadata.", filter: "Family-Friendly Shop Review" },
      { key: "roles", title: "User / Role Controls", count: roleManagementCount || approvedBetaUserCount || 0, status: roleManagementVisible ? "Protected" : "View only", detail: "Manage users and roles only when protected admin tools allow it.", filter: "Role Management" },
    ];
    const adminControlGroups = [
      {
        key: "people",
        label: "People & Access",
        value: betaRequests.length + approvedBetaUserCount,
        helper: "Beta approvals, invites, waitlist by state, role management, and test/fake cleanup.",
        filter: "Beta Users",
      },
      {
        key: "reports",
        label: "Reports & Moderation",
        value: commandSummary.pendingScoutReports + flaggedContentCount,
        helper: "Scout report review, flagged content, community guesses, and Assist messages.",
        filter: "Reports & Moderation",
      },
      {
        key: "data",
        label: "Stores & Products",
        value: buildStoreMapRows().length + catalogCorrectionCount,
        helper: "Store management, product/catalog corrections, duplicate review, and safe public labels.",
        filter: "Store Management",
      },
      {
        key: "spark",
        label: "Spark & Partners",
        value: kidsReviewCount + sponsorRows.length + shopWorkspaces.length,
        helper: "Kids Program requests, Spark donation admin, shop partners, and family-friendly approvals.",
        filter: "Kids Program Applications",
      },
    ];
    const adminQueueSearchText = adminQueueSearch.trim().toLowerCase();
    const filteredAdminEssentialQueues = adminQueueSearchText
      ? adminEssentialQueues.filter((queue) => [
          queue.title,
          queue.status,
          queue.detail,
        ].join(" ").toLowerCase().includes(adminQueueSearchText))
      : adminEssentialQueues;
    const adminCommandSections = [
      { key: "beta-access", title: "Beta Access", purpose: "Review access requests and beta status.", status: betaRequests.length ? `${betaRequests.length} pending` : "Clear", cta: "Review", filter: "Beta Access" },
      { key: "invites", title: "Invites", purpose: "Create, copy, and review invite links.", status: activeBetaInviteCount ? `${activeBetaInviteCount} active` : "No active invites", cta: "Open", filter: "Beta Access" },
      { key: "members", title: "Members", purpose: "Manage access, cleanup test profiles, and review member context.", status: roleManagementVisible ? `${roleManagementCount || approvedBetaUserCount} profiles` : `${approvedBetaUserCount} beta profiles`, cta: "Manage", filter: "Beta Users" },
      { key: "scout-moderation", title: "Scout Moderation", purpose: "Check reports that affect trust signals.", status: commandSummary.pendingScoutReports ? `${commandSummary.pendingScoutReports} need review` : "Clear", cta: "Review", filter: "Scout Report Moderation" },
      { key: "catalog-products", title: "Catalog / Products", purpose: "Review missing items, SKU, UPC, and store corrections.", status: catalogCorrectionCount ? `${catalogCorrectionCount} requests` : "Clear", cta: "Open", filter: "Catalog Suggestions" },
      { key: "market-values", title: "Market Values", purpose: "Review listing and price-source issues.", status: listingReviewItems.length ? `${listingReviewItems.length} flagged` : "Clear", cta: "Review", filter: "Marketplace Listings" },
      { key: "expenses-tax", title: "Expenses / Tax Records", purpose: "Spot receipts and records that need follow-up.", status: receiptsNeedingReview.length ? `${receiptsNeedingReview.length} need review` : "Clear", cta: "Open", filter: "System Health / Logs" },
      { key: "assist-inbox", title: "Business Assistant Inbox", purpose: "Review user questions escalated from Business Assistant.", status: commandSummary.openAssistMessages ? `${commandSummary.openAssistMessages} open` : "Clear", cta: "Open", filter: REVIEW_SECTION_LABELS.assist },
      { key: "app-health", title: "App Health", purpose: "Check client errors, audit notes, and system status.", status: (betaReadinessData.appErrorLogs || []).length + auditLogs.length ? `${(betaReadinessData.appErrorLogs || []).length + auditLogs.length} notes` : "Stable", cta: "Open", filter: "System Health / Logs" },
    ];
    const primaryQueueKeys = new Set(["beta", "scout", "catalog", "feedback", "flagged", "kids", "shops", "roles"]);
    const primaryQueueRows = adminQueueRows.filter((queue) => primaryQueueKeys.has(queue.key === "market" || queue.key === "tidepool" ? "flagged" : queue.key));
    const secondaryQueueRows = adminQueueRows.filter((queue) => !primaryQueueRows.some((primary) => primary.key === queue.key));
    const adminOpsSections = [
      { title: "Trust Command Center", value: commandSummary.totalOpen, helper: "Scout, guesses, shops, Assist", filter: "Trust Command Center" },
      { title: "Reports & Moderation", value: commandSummary.pendingScoutReports + commandSummary.tidepoolPostsNeedingReview, helper: "Scout report and Tidepool post review", filter: "Reports & Moderation" },
      { title: "Community Guesses", value: commandSummary.pendingCommunityGuesses, helper: "Separate prediction notes", filter: "Community Guess Review" },
      { title: "Business Assistant Inbox", value: commandSummary.openAssistMessages, helper: "Escalated user messages", filter: REVIEW_SECTION_LABELS.assist },
      { title: "Family Shops", value: commandSummary.shopsNeedingReview, helper: "Mission-aligned shop badges", filter: "Family-Friendly Shop Review" },
      { title: "Store Management", value: buildStoreMapRows().length, helper: "Stores, nicknames, duplicate review", filter: "Store Management" },
      { title: "Announcements / New Stuff", value: announcementCount, helper: "Launch notes and app updates", filter: "Announcements / New Stuff" },
      { title: "Users & Usernames", value: 1 + (betaReadinessData.betaFeedback || []).length, helper: "Search users, usernames, badges", filter: "User Management" },
      { title: "Family / Kid Accounts", value: kidsApplications.length, helper: "Parent links and kid safety review", filter: "Family / Kid Accounts" },
      { title: "Kids Program", value: kidsApplications.filter((entry) => ["pending", "pending_review"].includes(entry.status)).length, helper: "Applications and fair-access status", filter: "Kids Program Applications" },
      { title: "Marketplace", value: listingReviewItems.length, helper: "Listings, reports, fair trade review", filter: "Marketplace Listings" },
      { title: "Memberships / Billing", value: subscriptionProfile?.subscriptionPlan || "free", helper: "Modeled membership status only", filter: "Memberships / Billing" },
      { title: "Shops / Seller Verification", value: sponsorRows.length + shopWorkspaces.length, helper: "Card shops, sponsors, sellers", filter: "Shops / Seller Verification" },
      { title: "Beta Users", value: approvedBetaUserCount || betaInviteClaimCount || betaRequests.length, helper: "Requests, invites, joined users", filter: "Beta Users" },
      { title: "Beta Access", value: betaRequests.length, helper: "Invite/waitlist approvals", filter: "Beta Access" },
      { title: "Role Management", value: roleManagementCount || "Secure", helper: "Owners/admins assign roles", filter: "Role Management" },
      { title: "App Content / Admin Edit", value: adminEditModeActive ? "On" : "Off", helper: "Safe edit mode and content review", filter: "App Content / Admin Edit" },
      { title: "System Health / Logs", value: (betaReadinessData.appErrorLogs || []).length + auditLogs.length, helper: "Client errors and admin audit log", filter: "System Health / Logs" },
    ];
    const adminReviewFoundationRows = [
      { title: "Proof review queue", detail: "Receipts, photos, confirmations, and admin-visible proof summaries.", status: "Review before action" },
      { title: "Scout report review", detail: "Current reports, disputed reports, hidden unsafe details, and confidence labels.", status: "No raw patterns" },
      { title: "Disputed reports", detail: "Wrong-store, wrong-time, duplicate, stale, and unsafe reports stay separated from current signals.", status: "Protect signals" },
      { title: "Tidepool moderation", detail: "Family-safe community posts, reports, shop updates, and event notes.", status: "Moderated only" },
      { title: "Shop approvals", detail: "Trusted family friend badges, shop metadata, and safe update permissions.", status: "Admin gated" },
      { title: "Spark donation review", detail: "Donation requests, sponsor support, event help, and thank-you states.", status: "Private family context" },
      { title: "Suspicious behavior review", detail: "Fake accounts, unsafe content, exploit attempts, and repeated bad reports.", status: "Escalate carefully" },
      { title: "User safety flags", detail: "Role issues, child-safety reports, suspicious accounts, and privacy requests stay admin-only.", status: "Protected" },
    ];
    const adminMockActions = [
      { label: "Approve", helper: "For clearly safe proof, badges, or content." },
      { label: "Reject", helper: "For unsafe, stale, false, or exploit-friendly submissions." },
      { label: "Request proof", helper: "Ask for safer evidence before anything public changes." },
      { label: "Hide", helper: "Remove unsafe public visibility while preserving review context." },
      { label: "Escalate", helper: "Move child safety, abuse, or policy issues to owner review." },
      { label: "Suspend placeholder", helper: "Shown as vocabulary only; no user mutation is wired here." },
    ];
    const adminReviewDecisionRows = [
      { title: "Scout proof", body: "Decide whether proof is useful for families without exposing exact quantities or raw patterns.", action: "Request proof" },
      { title: "Tidepool post", body: "Keep family posts, shop updates, tips, and events moderated without enabling kid messaging.", action: "Hide / Escalate" },
      { title: "Shop badge", body: "Review Trusted Family Friend language before any badge or update becomes public.", action: "Approve / Reject" },
      { title: "Spark request", body: "Check parent-safe context before counting donations, events, or sponsorship interest.", action: "Review first" },
      { title: "User safety flag", body: "Treat suspicious behavior and role issues as protected admin-only review.", action: "Escalate" },
    ];
    const activeAdminQueue = adminEssentialQueues.find((queue) => queue.filter === adminReviewFilter)
      || adminQueueRows.find((queue) => queue.filter === adminReviewFilter)
      || adminOpsSections.find((section) => section.filter === adminReviewFilter)
      || null;
    const chooseAdminQueue = (filter) => {
      setAdminReviewFilter(filter);
      window.setTimeout(() => {
        document.getElementById("admin-selected-queue-panel")?.scrollIntoView?.({
          block: "nearest",
          behavior: "smooth",
        });
      }, 80);
    };
    return (
      <section className="admin-ops-dashboard">
        <div className="admin-security-panel admin-secure-access-card">
          <div>
            <strong>Protected admin workspace</strong>
            <p>You are viewing protected queues. Frontend visibility is only a convenience layer; protected writes remain guarded by Supabase RLS, backend checks, and audit logs.</p>
          </div>
          <span className={adminEditModeActive ? "status-badge danger" : "status-badge"}>{adminEditModeActive ? "Admin Edit On" : "View Mode"}</span>
        </div>

        <section className="admin-review-foundation" aria-label="Admin Review foundation">
          <div className="compact-card-header">
            <div>
              <span className="section-kicker">Admin Review</span>
              <h3>Proof, safety, shops, Spark, and moderation in one protected queue.</h3>
              <p>These are mock UI summaries layered over existing admin sections. No real moderation calls, user mutations, bans, suspensions, or backend writes are wired from this panel.</p>
            </div>
            <span className="status-badge">Mock action map</span>
          </div>
          <div className="admin-review-foundation-grid">
            {adminReviewFoundationRows.map((row) => (
              <article className="admin-review-foundation-card" key={row.title}>
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
                <small>{row.status}</small>
              </article>
            ))}
          </div>
          <div className="admin-review-action-map" aria-label="Mock admin review actions">
            <strong>Action vocabulary</strong>
            <div>
              {adminMockActions.map((action) => (
                <span className="status-badge admin-review-action-pill" key={action.label}>
                  <b>{action.label}</b>
                  <small>{action.helper}</small>
                </span>
              ))}
            </div>
            <p>Destructive and moderation actions still require existing confirmation flows and protected admin access. This row is a visual map only.</p>
          </div>
          <div className="admin-review-decision-grid" aria-label="Admin Review decision guidance">
            {adminReviewDecisionRows.map((row) => (
              <article className="admin-review-decision-card" key={row.title}>
                <strong>{row.title}</strong>
                <span>{row.body}</span>
                <small className="status-badge">{row.action}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-control-map" aria-label="Admin control map">
          <div className="compact-card-header">
            <div>
              <h3>Admin control map</h3>
              <p>Start from the area you need. Edit, delete, revoke, and moderation actions stay behind confirmations.</p>
            </div>
            <span className="status-badge">Admin only</span>
          </div>
          <div className="admin-control-map-grid">
            {adminControlGroups.map((group) => (
              <button type="button" className="admin-control-map-card" key={group.key} onClick={() => chooseAdminQueue(group.filter)}>
                <span>{group.label}</span>
                <strong>{group.value}</strong>
                <p>{group.helper}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-overview-strip" aria-label="Admin overview">
          {adminOverviewRows.map((item) => (
            <button type="button" className={`admin-overview-tile tone-${item.tone}`} key={item.key} onClick={() => chooseAdminQueue(item.filter)}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </section>

        <section className="admin-queue-command-board" aria-label="Admin review queues">
          <div className="compact-card-header">
            <div>
              <h3>Command sections</h3>
              <p>Choose the protected area you need. Raw records, IDs, and audit details stay inside each section.</p>
            </div>
            <div className="summary-pill-row">
              <button type="button" className={adminReviewFilter === "All" ? "secondary-button active" : "secondary-button"} onClick={() => chooseAdminQueue("All")}>All queues</button>
              <button type="button" className={adminReviewFilter === "Trust Command Center" ? "secondary-button active" : "secondary-button"} onClick={() => chooseAdminQueue("Trust Command Center")}>Trust</button>
              <button type="button" className={adminReviewFilter === "Reports & Moderation" ? "secondary-button active" : "secondary-button"} onClick={() => chooseAdminQueue("Reports & Moderation")}>Moderation</button>
            </div>
          </div>
          <div className="admin-queue-toolbar">
            <label>
              <span>Search queues</span>
              <input
                value={adminQueueSearch}
                onChange={(event) => setAdminQueueSearch(event.target.value)}
                placeholder="Beta, Scout, feedback, roles..."
              />
            </label>
            <span className="status-badge">{filteredAdminEssentialQueues.length} section{filteredAdminEssentialQueues.length === 1 ? "" : "s"}</span>
          </div>
          {activeAdminQueue && adminReviewFilter !== "All" ? (
            <div id="admin-selected-queue-panel" className="admin-selected-queue-panel" role="status">
              <span className="status-badge">Selected queue</span>
              <div>
                <strong>{activeAdminQueue.title}</strong>
                <p>{activeAdminQueue.detail || activeAdminQueue.details || activeAdminQueue.helper}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => chooseAdminQueue(activeAdminQueue.filter)}>Review details below</button>
            </div>
          ) : null}
          <div className="admin-essential-queue-grid" aria-label="Priority admin queues">
            {filteredAdminEssentialQueues.length ? filteredAdminEssentialQueues.map((queue) => (
              <button
                type="button"
                className={`admin-essential-queue-card ${adminReviewFilter === queue.filter ? "active" : ""}`}
                key={queue.key}
                aria-pressed={adminReviewFilter === queue.filter}
                onClick={() => chooseAdminQueue(queue.filter)}
              >
                <span>{queue.title}</span>
                <strong>{queue.count}</strong>
                <small>{queue.status}</small>
                <p>{queue.detail}</p>
                <b>Review</b>
              </button>
            )) : (
              <div className="small-empty-state">
                <strong>No admin queues match that search</strong>
                <span>Clear the queue search or choose a section from All admin areas.</span>
              </div>
            )}
          </div>
          <div className="admin-command-section-grid">
            {adminCommandSections.map((section) => (
              <button type="button" className="admin-command-section-card" key={section.key} onClick={() => chooseAdminQueue(section.filter)}>
                <span>{section.title}</span>
                <strong>{section.status}</strong>
                <p>{section.purpose}</p>
                <b>{section.cta}</b>
              </button>
            ))}
          </div>
          {adminQueueRows.length ? (
            <details className="admin-secondary-queues">
              <summary>Detailed queue cards</summary>
              <div className="admin-queue-grid compact">
                {[...primaryQueueRows, ...secondaryQueueRows].map((queue) => (
                  <button type="button" className="admin-queue-card compact" key={queue.key} onClick={() => chooseAdminQueue(queue.filter)}>
                    <span>{queue.title}</span>
                    <strong>{queue.count}</strong>
                    <small>{queue.priority}</small>
                    <p>{queue.details}</p>
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <details className="admin-area-disclosure">
          <summary>All admin areas</summary>
          <div className="admin-ops-grid">
            {adminOpsSections.map((section) => (
              <button type="button" className="admin-ops-card" key={section.title} onClick={() => chooseAdminQueue(section.filter)}>
                <span>{section.title}</span>
                <strong>{section.value}</strong>
                <small>{section.helper}</small>
              </button>
            ))}
          </div>
        </details>

        <div className="admin-ops-lane-grid">
          {(adminReviewFilter === "All" || adminReviewFilter === "Trust Command Center") ? renderAdminTrustActivity(commandSummary) : null}
          {renderAdminScoutReportQueue()}
          {(adminReviewFilter === "Trust Command Center" || adminReviewFilter === "Community Guess Review") ? renderAdminCommunityGuessQueue() : null}
          {(adminReviewFilter === "Trust Command Center" || adminReviewFilter === "Family-Friendly Shop Review") ? renderAdminShopReviewQueue() : null}
          {renderAdminTidepoolModerationQueue()}
          {adminReviewFilter === "Role Management" ? renderRoleManagementSection() : null}
          {renderAdminStoreManagementSection()}
          {renderAdminAnnouncementSection()}
          {adminReviewFilter === "Memberships / Billing" ? (
          <section className="settings-subsection admin-ops-section">
            <div className="compact-card-header">
              <div>
                <h3>Memberships / Billing</h3>
                <p>Membership status is modeled locally. Raw payment data is never stored here; billing providers remain disconnected until approved.</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("membership")}>Open Membership Foundation</button>
            </div>
            <div className="admin-compact-list">
              <article className="admin-compact-row">
                <div><strong>{TIER_LABELS[currentTier] || currentTier}</strong><p>{subscriptionProfile?.subscriptionStatus || "active"} | {subscriptionProfile?.subscriptionPlan || "free"}</p></div>
                <span className="status-badge">No payment data</span>
              </article>
            </div>
          </section>
          ) : null}
          {adminReviewFilter === "Shops / Seller Verification" ? (
          <section className="settings-subsection admin-ops-section">
            <div className="compact-card-header">
              <div>
                <h3>Shops / Seller Verification</h3>
                <p>Review shop, sponsor, seller, and card shop partner interest without exposing private buyer data.</p>
              </div>
              <span className="status-badge">{sponsorRows.length + shopWorkspaces.length} records</span>
            </div>
            <div className="admin-compact-list">
              {[...sponsorRows.slice(0, 4), ...shopWorkspaces.slice(0, 4).map((workspace) => ({ id: workspace.id, businessName: workspace.name, status: workspace.type }))].map((entry) => (
                <article className="admin-compact-row" key={entry.id || entry.businessName}>
                  <div><strong>{entry.businessName || entry.name}</strong><p>{entry.city || entry.status || "Seller verification pending"}</p></div>
                  <span className="status-badge">{entry.status || "new"}</span>
                </article>
              ))}
            </div>
          </section>
          ) : null}
          {adminReviewFilter === "System Health / Logs" ? (
          <section className="settings-subsection admin-ops-section">
            <div className="compact-card-header">
              <div>
                <h3>System Health / Logs</h3>
                <p>Client-side error logs and local admin audit records. Server logs stay in backend/Vercel/Supabase tools.</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("betaReadiness")}>Open Beta Readiness</button>
            </div>
            <div className="admin-compact-list">
              {(auditLogs.slice(0, 5)).map((entry) => (
                <article className="admin-compact-row" key={entry.id}>
                  <div><strong>{entry.action}</strong><p>{entry.entityType} | {shortDate(entry.createdAt)}</p></div>
                  <span className="status-badge">audit</span>
                </article>
              ))}
              {!auditLogs.length ? <div className="small-empty-state"><strong>No audit log entries yet</strong><span>Important local admin actions will appear here.</span></div> : null}
            </div>
          </section>
          ) : null}
        </div>
      </section>
    );
  }

  return renderAdminOperationsDashboard();
}
