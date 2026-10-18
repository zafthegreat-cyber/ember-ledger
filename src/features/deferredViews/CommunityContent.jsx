import { PrivateStorageImage } from "../../components/PrivateReceipt.jsx";
// Rendering is deferred; the owning App retains record state and action handlers.
export default function CommunityContent({ scope }) {
  const {
    CommandBoardV4,
    EtMockupActionCard,
    EtMockupButton,
    EtMockupEmptyState,
    EtMockupPageShell,
    EtMockupPill,
    EtMockupRightRail,
    EtMockupSectionCard,
    EtMockupStatCard,
    LONG_LIST_PAGE_SIZE,
    OverflowMenu,
    PaginationControls,
    TIDEPOOL_FAMILY_SAFE_RULES,
    TIDEPOOL_TRUSTED_CIRCLE_TYPES,
    activeTabLocked,
    addTidepoolComment,
    addTidepoolReaction,
    adminEditModeActive,
    adminToolsVisible,
    betaAccessAllowed,
    canUserCreateTidepoolPost,
    canViewTidepoolPost,
    currentUserProfile,
    filteredTidepoolPosts,
    guestPreviewActive,
    hideOwnTidepoolPost,
    isOfficialCommunityUsername,
    normalizePublicUsername,
    normalizeTidepoolCircleEntry,
    normalizeTidepoolPostCategory,
    normalizeTidepoolPostStatus,
    openFeedbackDialog,
    openTidepoolCreatePostFlow,
    openTidepoolFlagFlow,
    openTidepoolTrustedCircleFlow,
    pagedTidepoolPosts,
    publicTidepoolPostSummary,
    publicUsernameLabelFromRecord,
    renderCollectorEventPlannerSection,
    renderCommunityProfileSummary,
    renderUpgradeValuePreview,
    runTidepoolAdminPostAction,
    scrollToResultsTop,
    setActiveTab,
    setTidepoolCommentDrafts,
    setTidepoolFilter,
    setTidepoolPage,
    setVaultToast,
    statusClass,
    tidepoolCommentDrafts,
    tidepoolComments,
    tidepoolFilter,
    tidepoolPostsWithCounts,
    tidepoolStatusTone,
    tidepoolTrustedCircle,
    updateTidepoolPost,
    visibleTidepoolFilters,
  } = scope;

  function renderTidepoolCommunity() {
    const visiblePosts = filteredTidepoolPosts.length;
    const tidepoolViewerId = currentUserProfile.userId || "local-beta";
    const visibleTidepoolPostsForViewer = tidepoolPostsWithCounts.filter((post) => canViewTidepoolPost(post, {
      isAdmin: adminEditModeActive,
      currentUserId: tidepoolViewerId,
    }));
    const visibleTidepoolPostIds = new Set(visibleTidepoolPostsForViewer.map((post) => post.postId));
    const localPosts = visibleTidepoolPostsForViewer.filter((post) => !post.state || String(post.state).toUpperCase() === "VA" || Boolean(post.city || post.zip)).length;
    const canCreateTidepoolPost = canUserCreateTidepoolPost({
      betaAccessAllowed: betaAccessAllowed(),
      guestPreviewActive,
      activeTabLocked,
    });
    const trustBadgesForPost = (post) => {
      const badges = [];
      const postUsername = normalizePublicUsername(post.username || post.publicUsername || post.public_username);
      const postCategory = normalizeTidepoolPostCategory(post.postType || post.category);
      if (isOfficialCommunityUsername(postUsername)) badges.push("Official Code 3 TCG Admin");
      if (normalizeTidepoolPostStatus(post) === "Published") badges.push("Published");
      if (/giveaway|donation|kid|family/i.test(`${post.postType || ""} ${post.title || ""}`)) badges.push("Parent-Approved");
      if (post.sourceType === "admin" || post.sourceType === "official") badges.push("Community Helper");
      if (postCategory === "Marketplace Tip") badges.push("Marketplace Tip");
      return badges;
    };
    const tidepoolStats = [
      { label: "Posts", value: visibleTidepoolPostsForViewer.length },
      { label: "Local", value: localPosts },
      { label: "Replies", value: tidepoolComments.filter((comment) => visibleTidepoolPostIds.has(comment.postId) && comment.status !== "removed").length },
    ];
    const tidepoolTrustCards = [
      { title: "Trusted members", detail: "Helpful public badges. Private emails, child details, and admin notes stay private." },
      { title: "Proof-based confirmations", detail: "Photos and replies build trust without exposing exact restock patterns." },
      { title: "Family-friendly discussion", detail: "Questions, events, tips, and collecting help stay calm and adult-guided." },
      { title: "Report and review", detail: "Flag unsafe posts, fake info, private details, or rush-alert behavior." },
    ];
    const tidepoolSectionCards = [
      { title: "Local", detail: "General-area collecting help without exact rush alerts, store routes, or private addresses.", status: `${localPosts} local` },
      { title: "Families", detail: "Parent-guided questions, kid-friendly wins, safe tips, and read/report community access.", status: "Family-safe" },
      { title: "Events", detail: "Trade nights, learning days, Spark support, and shop meetups with moderation guardrails.", status: "Moderated" },
      { title: "Shops", detail: "Trusted shop updates without inventory guarantees, exact quantities, or pressure.", status: "Shop-safe" },
      { title: "Tips", detail: "Binder care, fair value, scam awareness, and collecting help for newer families.", status: "Helpful" },
    ];
    const tidepoolModerationCards = [
      { title: "Read and report", detail: "Free users can read Tidepool and report unsafe content. Posting stays beta-reviewed." },
      { title: "Not a rush feed", detail: "No vendor schedules, raw restock pattern history, or guaranteed-stock language belongs here." },
      { title: "Adult-guided community", detail: "No unmoderated kid messaging, public child profiles, or private family details." },
    ];
    const tidepoolCircleEntries = tidepoolTrustedCircle.map(normalizeTidepoolCircleEntry);
    const tidepoolCirclePreview = tidepoolCircleEntries.slice(0, 4);
    const tidepoolCircleRoleCounts = TIDEPOOL_TRUSTED_CIRCLE_TYPES.map((type) => ({
      type,
      count: tidepoolCircleEntries.filter((entry) => entry.roleType === type).length,
    })).filter((entry) => entry.count > 0);
    const tidepoolShopFamilyNoteCount = tidepoolCircleEntries.filter((entry) => (
      /shop|seller|family|friend|parent|spark/i.test(`${entry.roleType || ""} ${entry.relationshipNote || ""}`)
    )).length;
    const tidepoolFollowUpCount = tidepoolCircleEntries.filter((entry) => (
      entry.reminderNotes || entry.circleStatus === "Invite Later"
    )).length;
    const tidepoolTrustDashboardCards = [
      {
        title: "Trusted Circle entries",
        value: tidepoolCircleEntries.length,
        detail: tidepoolCircleEntries.length ? "Private local notes saved for your own review." : "Add a private circle note when someone feels worth remembering.",
      },
      {
        title: "Shop/family notes",
        value: tidepoolShopFamilyNoteCount,
        detail: "Shops, parents, helpers, friends, and Spark supporters stay local-only here.",
      },
      {
        title: "People to follow up with",
        value: tidepoolFollowUpCount,
        detail: "Reminder notes help you remember who to check with later. No invites are sent.",
      },
      {
        title: "Trade/community safety reminders",
        value: 6,
        detail: "Use the checklist before meeting, trading, buying, or sharing details.",
      },
      {
        title: "Future community preview",
        value: "Preview",
        detail: "Future tools may add reviewed community workflows, but this beta does not verify people.",
      },
    ];
    const tidepoolCommunitySafetyChecklist = [
      "Meet in public.",
      "Check references.",
      "Avoid pressure.",
      "Verify prices independently.",
      "Protect kids' info.",
      "No guarantee or verification language.",
    ];
    const tidepoolPreviewCards = [
      {
        type: "Trusted shop update",
        title: "Family Table TCG posted a learning night",
        body: "Beginner-friendly table space is planned for Saturday afternoon. No inventory promises, exact quantities, or rush-alert wording.",
        meta: "Trusted shop | Event note | Richmond, VA",
        badge: "Shop update",
      },
      {
        type: "Event card",
        title: "Kids trade night needs sleeve donations",
        body: "A parent helper is collecting sleeves and deck boxes for a community table. Donation details stay reviewed through The Spark.",
        meta: "Spark support | Parent reviewed",
        badge: "Family event",
      },
      {
        type: "Tip post",
        title: "How to check a fair sealed price",
        body: "Compare Market fair range, recent source freshness, and MSRP before buying. Tidepool is not an auto-buy or profit feed.",
        meta: "Marketplace tip | No checkout",
        badge: "Tip",
      },
      {
        type: "Trade interest post",
        title: "Trade interest post: safe binder practice",
        body: "Family wants to practice value comparison before a real trade. Parent approval and review-first trade tools are recommended.",
        meta: "Trade interest | Parent-guided",
        badge: "Trade help",
      },
    ];

    return (
      <EtMockupPageShell
        accent="tidepool"
        className="tidepool-mockup-rebuild"
        ariaLabel="Tidepool safe collecting community"
      >
        <div className="et-mockup-main-column tidepool-mockup-main">
          <CommandBoardV4
            accent="tidepool"
            className="tidepool-command-board"
            ariaLabel="Tidepool community hub"
            label="Tidepool"
            title="Tidepool Community Center"
            description="Family-friendly posts, trusted shop updates, event notes, proof-based confirmations, and local collecting help. General areas only, with no private child data or guaranteed stock."
            primaryAction={{ label: "Start a Post", icon: "plus", onClick: openTidepoolCreatePostFlow, disabled: !canCreateTidepoolPost }}
            secondaryActions={[
              { label: "Scout Signals", icon: "scout", onClick: () => setActiveTab("scout") },
              { label: "Report Issue", icon: "help", onClick: () => openFeedbackDialog("bug", { page: "Tidepool Community" }) },
            ]}
            statusItems={[
              { key: "posts", icon: "community", label: "Visible posts", value: visiblePosts, detail: "Moderated feed" },
              { key: "local", icon: "scout", label: "Local", value: localPosts, detail: "General area" },
              { key: "replies", icon: "bell", label: "Replies", value: tidepoolComments.filter((comment) => visibleTidepoolPostIds.has(comment.postId) && comment.status !== "removed").length, detail: "Reviewed replies" },
              { key: "circle", icon: "account", label: "Trusted Circle", value: tidepoolCircleEntries.length, detail: "Private notes" },
              { key: "access", icon: "admin", label: "Posting", value: canCreateTidepoolPost ? "Open" : "Beta gated", detail: "Review-first" },
            ]}
            plan={{
              label: "Community Plan",
              title: "Share helpful community context without rush-feed behavior",
              items: [
                { key: "post", icon: "plus", label: "Start post", detail: "Review-first", action: openTidepoolCreatePostFlow, disabled: !canCreateTidepoolPost },
                { key: "circle", icon: "account", label: "Trusted Circle", detail: "Private notes", action: openTidepoolTrustedCircleFlow },
                { key: "scout", icon: "scout", label: "Scout signal", detail: "Local intel", action: () => setActiveTab("scout") },
                { key: "report", icon: "help", label: "Report issue", detail: "Safety review", action: () => openFeedbackDialog("bug", { page: "Tidepool Community" }) },
              ],
              actions: [
                { label: "Open Composer", icon: "plus", onClick: openTidepoolCreatePostFlow, disabled: !canCreateTidepoolPost },
                { label: "Add Circle", icon: "account", onClick: openTidepoolTrustedCircleFlow },
              ],
            }}
            routes={[
              { key: "local", icon: "scout", label: "Local", title: "General area", detail: `${localPosts} local`, action: () => setActiveTab("scout") },
              { key: "families", icon: "community", label: "Families", title: "Family safe", detail: "No child profiles" },
              { key: "events", icon: "calendar", label: "Events", title: "Family days", detail: "Moderated notes" },
              { key: "shops", icon: "market", label: "Shops", title: "Trusted shops", detail: "No stock guarantees" },
              { key: "tips", icon: "help", label: "Tips", title: "Safety lessons", detail: "Care and scams" },
              { key: "spark", icon: "spark", label: "Spark", title: "Support", detail: "Donation drives", action: () => setActiveTab("kidsProgram") },
            ]}
          >
            <div className="tidepool-mockup-guardrail-strip" aria-label="Tidepool guardrails">
              <span>Safe community posts</span>
              <span>Proof-based confirmations</span>
              <span>General areas only</span>
              <span>No vendor schedules</span>
              <span>No exact restock patterns</span>
              <span>No guaranteed stock</span>
            </div>
          </CommandBoardV4>

          <EtMockupSectionCard
            title="Community pulse"
            detail="Tidepool is for trusted collecting activity, not rush alerts. Posts stay helpful, moderated, and family-friendly."
            className="tidepool-mockup-pulse"
            action={<EtMockupPill tone="beta">Public beta</EtMockupPill>}
          >
            <div className="et-mockup-stat-grid tidepool-mockup-stat-grid" aria-label="Tidepool stats">
              {tidepoolStats.map((stat) => (
                <EtMockupStatCard key={stat.label} label={stat.label} value={stat.value} detail={stat.label === "Local" ? "General areas" : stat.label === "Replies" ? "Reviewed replies" : "Safe posts"} tone="collector" />
              ))}
            </div>
            <div className="tidepool-mockup-action-row">
              <button type="button" className="et-mockup-button et-mockup-button-primary tidepool-mockup-start-post" onClick={openTidepoolCreatePostFlow} disabled={!canCreateTidepoolPost}>Start a Post</button>
              <EtMockupButton variant="secondary" onClick={() => setActiveTab("scout")}>Scout Signals</EtMockupButton>
              <EtMockupButton variant="ghost" onClick={() => openFeedbackDialog("bug", { page: "Tidepool Community" })}>Report an issue</EtMockupButton>
            </div>
            {!canCreateTidepoolPost ? <p className="tidepool-mockup-access-note">Tidepool posting opens after beta access is approved. Published posts remain visible when allowed.</p> : null}
            <div className="tidepool-mockup-trust-grid" aria-label="Tidepool trust and safety">
              {tidepoolTrustCards.map((card) => (
                <EtMockupActionCard key={card.title} title={card.title} detail={card.detail} icon="pool" tone="collector" />
              ))}
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            title="Tidepool trust dashboard"
            detail="Local trust notes, follow-ups, and safety reminders for community collecting. Planning only; no verification or invitations are connected."
            className="tidepool-trust-dashboard-card"
            action={<EtMockupPill tone="beta">Local beta</EtMockupPill>}
          >
            <div className="tidepool-trust-dashboard-grid" aria-label="Tidepool trust dashboard cards">
              {tidepoolTrustDashboardCards.map((card) => (
                <article className="tidepool-trust-dashboard-item" key={card.title}>
                  <span>{card.title}</span>
                  <strong>{card.value}</strong>
                  <p>{card.detail}</p>
                </article>
              ))}
            </div>
            <div className="tidepool-community-safety-checklist" aria-label="Community Safety Checklist">
              <div>
                <span className="section-kicker">Community Safety Checklist</span>
                <strong>Before meeting, trading, or following up</strong>
                <p>These reminders are local guidance only. Code 3 TCG does not guarantee, verify, invite, or background-check anyone.</p>
              </div>
              <div className="tidepool-community-safety-list">
                {tidepoolCommunitySafetyChecklist.map((item) => <span key={item}>{item}</span>)}
              </div>
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            title="Trusted Circle"
            detail="Private notes for family friends, trusted shops, sellers, Spark partners, and community helpers you may want to remember."
            className="tidepool-trusted-circle-card"
            action={<EtMockupButton onClick={openTidepoolTrustedCircleFlow}>Add to Circle</EtMockupButton>}
          >
            <div className="tidepool-circle-safety-note">
              <strong>Safety helper</strong>
              <span>Trusted Circle is your private note space. It does not verify people, run background checks, or replace your own safety judgment.</span>
            </div>
            <div className="tidepool-circle-role-row" aria-label="Trusted Circle roles">
              {TIDEPOOL_TRUSTED_CIRCLE_TYPES.slice(0, 6).map((type) => (
                <span key={type}>{type}</span>
              ))}
            </div>
            {tidepoolCirclePreview.length ? (
              <div className="tidepool-circle-list" aria-label="Trusted Circle saved entries">
                {tidepoolCirclePreview.map((entry) => (
                  <article className="tidepool-circle-entry" key={entry.id || `${entry.name}-${entry.dateAdded}`}>
                    <div className="compact-card-header">
                      <div>
                        <span className="section-kicker">{entry.relationshipType || entry.roleType}</span>
                        <strong>{entry.name}</strong>
                      </div>
                      <span className="status-badge">{entry.circleStatus}</span>
                    </div>
                    <p>{entry.relationshipNote || entry.safetyNotes || "Private trust note saved locally for your own review."}</p>
                    {entry.reminderNotes ? <small>Reminder notes: {entry.reminderNotes}</small> : <small>Reminder notes can be added when you want to follow up later.</small>}
                    <small>{entry.dateAdded || "Date not saved"} | Not Verified Yet | No invites sent</small>
                    {entry.contactMethod || entry.contactNote ? <small>Private contact method/Circle Note saved locally. Contact details are not shown publicly.</small> : null}
                  </article>
                ))}
              </div>
            ) : (
              <EtMockupEmptyState
                title="No Trusted Circle entries yet."
                detail="Add private notes for family friends, shops, sellers, parents, event helpers, sponsors, or community helpers you may want to remember. Future community tools are preview-only and will not verify people from this local note."
                action={<EtMockupButton onClick={openTidepoolTrustedCircleFlow}>Add to Circle</EtMockupButton>}
              />
            )}
            <div className="tidepool-circle-status-row" aria-label="Trusted Circle status summary">
              {(tidepoolCircleRoleCounts.length ? tidepoolCircleRoleCounts : [{ type: "Not Verified Yet", count: tidepoolCircleEntries.length }]).map((entry) => (
                <span key={entry.type}>{entry.type}: {entry.count}</span>
              ))}
              <span>Invite Later is a placeholder only</span>
            </div>
          </EtMockupSectionCard>

          {renderCollectorEventPlannerSection({ surface: "tidepool", compact: true })}

          {renderUpgradeValuePreview("tidepool")}

          <EtMockupSectionCard
            title={tidepoolFilter === "Feed" ? "Community feed" : tidepoolFilter}
            detail="Helpful local posts, questions, events, proof-backed confirmations, and family-safe collector updates."
            className="tidepool-community tidepool-mockup-feed"
            action={<EtMockupPill tone="collector">{visiblePosts} visible</EtMockupPill>}
          >
          <div className="standard-page-header-tabs tidepool-mockup-tabs" aria-label="Tidepool navigation">
            {visibleTidepoolFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={tidepoolFilter === filter ? "active" : ""}
                onClick={() => setTidepoolFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="tidepool-live-section-grid" aria-label="Tidepool safe community sections">
            {tidepoolSectionCards.map((card) => (
              <article className="tidepool-live-section-card" key={card.title}>
                <span className="status-badge">{card.status}</span>
                <strong>{card.title}</strong>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>

          <div className="tidepool-moderation-grid" aria-label="Tidepool moderation guardrails">
            {tidepoolModerationCards.map((card) => (
              <article className="tidepool-moderation-card" key={card.title}>
                <strong>{card.title}</strong>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>

          <div className="tidepool-preview-feed" aria-label="Tidepool moderated examples">
            {tidepoolPreviewCards.map((card) => (
              <article className="tidepool-preview-card" key={card.title}>
                <div className="compact-card-header">
                  <div>
                    <span className="section-kicker">{card.type}</span>
                    <strong>{card.title}</strong>
                  </div>
                  <span className="status-badge">{card.badge}</span>
                </div>
                <p>{card.body}</p>
                <small>{card.meta}</small>
                <button type="button" className="secondary-button" onClick={() => openFeedbackDialog("feedback", { page: "Tidepool Community", whatHappened: `${card.type}: ` })}>Report or ask for review</button>
              </article>
            ))}
          </div>

          <div className="tidepool-support-strip">
            <div>
              <strong>Safety and support</strong>
              <span>Report unsafe posts from each post&apos;s Safety menu. Use feedback for app issues or moderation questions.</span>
            </div>
            <div className="tidepool-support-actions">
              <button type="button" className="secondary-button" onClick={() => openFeedbackDialog("feedback", { page: "Tidepool Community" })}>Send feedback</button>
              <button type="button" className="secondary-button" onClick={() => openFeedbackDialog("bug", { page: "Tidepool Community" })}>Report an issue</button>
            </div>
          </div>

          <div className="tidepool-feed-grid">
            {filteredTidepoolPosts.length === 0 ? (
              <div className="empty-state tidepool-empty-state">
                <h3>The community table is ready.</h3>
                <p>Start a family-friendly question, local collecting tip, event note, or proof-backed Scout confirmation. Keep it general, kind, and useful. Tidepool is for trusted collecting activity, not rush alerts.</p>
                <div className="quick-actions">
                  <button type="button" onClick={openTidepoolCreatePostFlow} disabled={!canCreateTidepoolPost}>Start a Post</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("scout")}>View Scout Signals</button>
                </div>
              </div>
            ) : null}
            {pagedTidepoolPosts.items.map((post) => {
              const postComments = tidepoolComments.filter((comment) => comment.postId === post.postId && !comment.parentCommentId && comment.status !== "removed");
              const locationParts = [post.city, post.state].filter(Boolean);
              const locationLabel = locationParts.length ? locationParts.join(", ") : post.state ? post.state : "Tidepool area";
              const postDate = post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "No date";
              const publicSummary = publicTidepoolPostSummary(post);
              const preview = publicSummary.bodyPreview || "No post body yet.";
              const postCategory = normalizeTidepoolPostCategory(post.postType || post.category);
              const postStatus = normalizeTidepoolPostStatus(post);
              const sourceBadge = post.sourceType === "mock" || post.sourceType === "demo" ? "Demo" : post.sourceType === "admin" ? "Admin" : "Member";
              const usernameLabel = publicUsernameLabelFromRecord(post, "community");
              const avatarInitial = usernameLabel.replace(/^@/, "").slice(0, 1).toUpperCase() || "C";
              const trustBadges = trustBadgesForPost(post);
              if (post.photoUrl) trustBadges.push("Proof attached");
              if (post.commentCount > 0) trustBadges.push("Community confirmed");
              const currentUserId = currentUserProfile.userId || "local-beta";
              const canHidePost = post.userId === currentUserId || adminToolsVisible;
              const showStatusToViewer = adminToolsVisible || post.userId === currentUserId || postStatus !== "Published";
              const safePostDetailsId = `tidepool-post-details-${post.postId}`;
              const proofLabel = post.photoUrl ? "Proof attached" : "Proof can be added";
              const confirmationLabel = post.commentCount > 0 ? `${post.commentCount} report confirmation${post.commentCount === 1 ? "" : "s"}` : "Open for helpful replies";
              const openPostDetails = () => {
                const details = document.getElementById(safePostDetailsId);
                if (details) details.open = true;
                document.getElementById(`tidepool-comment-${post.postId}`)?.focus();
              };
              return (
                <article className={`tidepool-post-card compact-card${postStatus !== "Published" ? " tidepool-post-card--moderated" : ""}`} key={post.postId}>
                  <div className="tidepool-post-top">
                    <div className="tidepool-author-block">
                      <div className="tidepool-avatar" aria-hidden="true">{avatarInitial}</div>
                      <div>
                        <strong>{usernameLabel}</strong>
                        <p className="tidepool-post-meta">
                          <span>{locationLabel}</span>
                          <span>{postDate}</span>
                        </p>
                        {renderCommunityProfileSummary(post, { compact: true, className: "tidepool-profile-card" })}
                      </div>
                    </div>
                    {adminEditModeActive ? (
                      <OverflowMenu
                        buttonLabel="Admin"
                        actions={[
                          { label: "Publish", onClick: () => runTidepoolAdminPostAction(post, "Publish", { status: "Published", moderationReason: "Approved for Tidepool." }) },
                          { label: "Needs Edit", onClick: () => runTidepoolAdminPostAction(post, "Needs Edit", { status: "Needs Edit", moderationReason: "Needs author edit before publishing." }, { confirm: true }) },
                          { label: "Reject", danger: true, onClick: () => runTidepoolAdminPostAction(post, "Reject", { status: "Rejected", moderationReason: "Rejected by admin review." }, { confirm: true, danger: true }) },
                          { label: "Archive", onClick: () => runTidepoolAdminPostAction(post, "Archive", { status: "Archived", moderationReason: "Archived by admin review." }, { confirm: true, message: "This hides the post without hard-deleting beta data." }) },
                          { label: "Lock Comments", onClick: () => runTidepoolAdminPostAction(post, "Lock Comments", { commentsLocked: true }, { confirm: true }) },
                          { label: "View Audit", onClick: () => setVaultToast("Tidepool audit details are not available in this beta UI yet.") },
                        ]}
                      />
                    ) : null}
                  </div>
                  <div className="tidepool-badge-row">
                    <span className={statusClass(postCategory)}>{postCategory}</span>
                    {showStatusToViewer ? <span className={`status-badge ${tidepoolStatusTone(postStatus)}`}>{postStatus}</span> : null}
                    {trustBadges.slice(0, 2).map((badge) => <span className="trust-badge tidepool-trust-badge" key={badge}>{badge}</span>)}
                    {post.flagged ? <span className="status-badge needs-review">Flagged for admin</span> : null}
                    {post.sourceType !== "user" ? <span className={statusClass(sourceBadge)}>{sourceBadge}</span> : null}
                  </div>
                  <div className="tidepool-post-copy">
                    <h3>{post.title || postCategory}</h3>
                    <p className="tidepool-post-meta">
                      <span>{locationLabel}</span>
                      <span>No private address shown</span>
                    </p>
                    <p>{preview}</p>
                    {post.storeReference || post.productReference ? (
                      <p className="compact-subtitle">{[post.storeReference, post.productReference].filter(Boolean).join(" | ")}</p>
                    ) : null}
                    {showStatusToViewer && postStatus === "Pending Review" ? (
                      <p className="compact-subtitle">Pending review: admins will check it before it appears publicly.</p>
                    ) : null}
                    <div className="tidepool-proof-row" aria-label="Post trust details">
                      <span>{proofLabel}</span>
                      <span>{confirmationLabel}</span>
                      <span>No private contact info</span>
                    </div>
                    {post.photoUrl ? <PrivateStorageImage className="tidepool-post-image" src={post.photoUrl} alt="" /> : null}
                  </div>
                  <div className="tidepool-post-counts">
                    <span>{post.commentCount} comment{post.commentCount === 1 ? "" : "s"}</span>
                    <span>{post.reactionCount} reaction{post.reactionCount === 1 ? "" : "s"}</span>
                    <span>{sourceBadge} post</span>
                  </div>
                  <div className="tidepool-post-actions">
                    <button type="button" className="secondary-button" onClick={() => addTidepoolReaction(post.postId, "helpful")}>Helpful</button>
                    <button type="button" className="secondary-button" onClick={openPostDetails}>Reply</button>
                    <button type="button" className="secondary-button" onClick={() => updateTidepoolPost(post.postId, { saved: !post.saved })}>{post.saved ? "Saved" : "Save / Follow"}</button>
                    <OverflowMenu
                      buttonLabel="Safety"
                      actions={[
                        { label: post.flagged ? "Reported" : "Report post", danger: true, onClick: () => openTidepoolFlagFlow(post) },
                        { label: "Block user", onClick: () => setVaultToast("Block controls are queued for account settings. Report unsafe content now.") },
                        ...(canHidePost ? [{ label: post.status === "hidden" ? "Hidden" : "Hide post", onClick: () => hideOwnTidepoolPost(post) }] : []),
                      ]}
                    />
                  </div>
                  <details className="tidepool-comments" id={safePostDetailsId}>
                    <summary>
                      <span>Replies and details</span>
                      <strong>{postComments.length}</strong>
                    </summary>
                    <div className="tidepool-comments-body">
                      {postComments.length ? (
                        <div className="tidepool-comment-list">
                          {postComments.slice(0, 3).map((comment) => {
                            const replies = tidepoolComments.filter((reply) => reply.parentCommentId === comment.commentId && reply.status !== "removed");
                            return (
                              <div className="tidepool-comment" key={comment.commentId}>
                                <p><strong>{publicUsernameLabelFromRecord(comment, "community")}</strong>: {comment.body}</p>
                                {replies.slice(0, 2).map((reply) => (
                                  <p className="compact-subtitle tidepool-reply" key={reply.commentId}><strong>{publicUsernameLabelFromRecord(reply, "community")}</strong>: {reply.body}</p>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="compact-subtitle">No replies yet.</p>
                      )}
                      {post.commentsLocked || postStatus !== "Published" ? (
                        <p className="compact-subtitle">Replies are locked for this post.</p>
                      ) : (
                        <div className="tidepool-comment-box">
                          <input id={`tidepool-comment-${post.postId}`} value={tidepoolCommentDrafts[post.postId] || ""} onChange={(event) => setTidepoolCommentDrafts((current) => ({ ...current, [post.postId]: event.target.value }))} placeholder="Add a safe community reply..." />
                          <button type="button" onClick={() => addTidepoolComment(post.postId)}>Post</button>
                        </div>
                      )}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
          <PaginationControls
            label="Posts"
            page={pagedTidepoolPosts.page}
            pageCount={pagedTidepoolPosts.pageCount}
            totalCount={pagedTidepoolPosts.total}
            pageSize={LONG_LIST_PAGE_SIZE}
            onPageChange={(page) => {
              setTidepoolPage(page);
              scrollToResultsTop();
            }}
            compact
          />

          <div className="tidepool-rules-card">
            <strong>Family-safe Tidepool</strong>
            <p>Keep it kind, helpful, and general. Use report/block if something feels off. Tidepool is not a restock leak feed.</p>
            <div className="tidepool-guideline-list">
              {TIDEPOOL_FAMILY_SAFE_RULES.slice(0, 3).map((guideline) => <span key={guideline}>{guideline}</span>)}
            </div>
          </div>
          </EtMockupSectionCard>
        </div>

        <EtMockupRightRail
          title="Safety stays visible"
          detail="Tidepool is moderated, proof-based, and designed for family-safe collecting help."
          className="tidepool-mockup-rail"
        >
          <EtMockupSectionCard
            title="Moderation framing"
            detail="Read, report, and review controls are visible before community activity can feel risky."
            className="tidepool-mockup-rail-card"
            action={<EtMockupPill tone="beta">Reviewed</EtMockupPill>}
          >
            <div className="et-mockup-action-stack">
              {tidepoolModerationCards.map((card) => (
                <EtMockupActionCard key={card.title} title={card.title} detail={card.detail} icon="pool" tone="collector" />
              ))}
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            title="What Tidepool avoids"
            detail="Community help without scalper-friendly or child-sensitive details."
            className="tidepool-mockup-rail-card"
          >
            <div className="tidepool-mockup-rail-rules" aria-label="Tidepool safety guardrails">
              {[
                "No private child data.",
                "No vendor schedules.",
                "No exact restock patterns.",
                "No guaranteed-stock claims.",
                "Report/review unsafe posts.",
              ].map((rule) => (
                <span key={rule}>{rule}</span>
              ))}
            </div>
          </EtMockupSectionCard>

          <EtMockupEmptyState
            title="Current help, not rush alerts."
            detail="Tidepool keeps Scout-adjacent community discussion proof-based, moderated, and general-area only."
            action={<EtMockupButton variant="secondary" onClick={() => setActiveTab("scout")}>View Scout Signals</EtMockupButton>}
          />
        </EtMockupRightRail>
      </EtMockupPageShell>
    );
  }

  return renderTidepoolCommunity();
}
