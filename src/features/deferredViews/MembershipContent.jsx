// Rendering is deferred; the owning App retains record state and action handlers.
export default function MembershipContent({ scope }) {
  const {
    AppNavIcon,
    BETA_LOCAL_MODE,
    CommandBoardSection,
    CommandBoardV4,
    CommandMetricGrid,
    TIER_DISPLAY_GUIDANCE,
    TIER_LABELS,
    adminViewingAsAdmin,
    canUseFeature,
    currentTier,
    currentTierLabel,
    currentUserProfile,
    experiencePresentation,
    getLockedFeatureDetails,
    getTierAccess,
    getTierAddOns,
    getTierPricingCards,
    isTrialActive,
    openUtilityPage,
    requestLockedFeatureAccess,
    setActiveTab,
    tierAccess,
  } = scope;

  function renderMembershipFoundation() {
    const plan = tierAccess.planTier;
    const isPreview = experiencePresentation?.isPreview === true;
    const planLabel = currentTierLabel || tierAccess.tierLabel || TIER_LABELS[currentTier] || "Free";
    const planHeading = isPreview ? "Preview plan" : "Current plan";
    const trialActive = !isPreview && isTrialActive(currentUserProfile);
    const planDetail = isPreview ? "Preview only; your account is unchanged." : trialActive ? "Trial is active." : "No active trial.";
    const freeStoreSlots = getTierAccess({ tier: "free" }).scoutStoreSlots;
    const tierCards = getTierPricingCards().map((tier) => ({
      ...tier,
      display: TIER_DISPLAY_GUIDANCE[tier.id] || {},
      access: getTierAccess({ tier: tier.id }),
    }));
    const addOns = getTierAddOns();
    const planScoutDetailsAllowed = canUseFeature({ tier: plan }, "scout_current_details");
    const betaStatusLabel = tierAccess.isBeta || BETA_LOCAL_MODE ? "Active beta access" : "Approval required";
    const adminStatusVisible = Boolean(adminViewingAsAdmin && !isPreview);
    const freeCoreFeatures = [
      {
        title: "Protected Vault",
        detail: "Manual card, sealed, graded, wishlist, folder, and set tracking stay in the core collector app.",
        meta: "Collector",
        icon: "vault",
        tone: "vault",
      },
      {
        title: "Fair value basics",
        detail: "Basic fair range, collection value, card search, and product search stay available without checkout.",
        meta: "Market",
        icon: "market",
        tone: "market",
      },
      {
        title: "Trade review",
        detail: "Basic trade analyzer, deck/list builder, and review-first Forge planning stay available.",
        meta: "Forge",
        icon: "forge",
        tone: "forge",
      },
      {
        title: "Scout starter access",
        detail: `Manual Scout reports, screenshot review, proof review, and ${freeStoreSlots} watched store${Number(freeStoreSlots) === 1 ? "" : "s"} stay included.`,
        meta: "Scout",
        icon: "scout",
        tone: "scout",
      },
      {
        title: "Family and community",
        detail: "Tidepool read/report, The Spark view, Business Assistant prompts, and safety basics stay included.",
        meta: "Safe",
        icon: "spark",
        tone: "gold",
      },
    ];
    const accessStatusRows = [
      {
        label: "Beta",
        value: betaStatusLabel,
        helper: "Early access status is separate from your plan.",
      },
      ...(adminStatusVisible ? [{
        label: "Admin",
        value: "Visible for this session",
        helper: "Admin tools remain permission-gated and are not customer plan features.",
      }] : []),
      {
        label: "Checkout",
        value: "Not live",
        helper: "Pricing, trials, and add-ons are beta preview copy. Admin handles access changes for now.",
      },
    ];
    const lockPreviewKeys = ["restock_predictions", "seller_tools", "kid_profiles", "shop_profile_tools"];
    const lockPreviews = lockPreviewKeys.map((featureKey) => getLockedFeatureDetails(featureKey));
    return (
      <div className="membership-command-only-route membership-v4-route" data-qa="tier-pricing-explainer">
        <CommandBoardV4
          accent="you"
          className="membership-v4-command-board"
          ariaLabel="Plans & access"
          label="Membership"
          title="Plans & access"
          description="Compare collecting, family, selling, and shop features. Your plan and access limits are shown below."
          primaryAction={{ label: "Compare Plans", icon: "plan", onClick: () => document.getElementById("membership-plan-grid")?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
          secondaryActions={[
            { label: "Ask Admin", icon: "help", onClick: () => requestLockedFeatureAccess("seller_tools") },
            { label: "Back to Hearth", icon: "home", onClick: () => setActiveTab("dashboard") },
          ]}
          statusItems={[
            { key: "plan", icon: "plan", label: planHeading, value: planLabel, detail: planDetail },
            { key: "scout", icon: "scout", label: "Scout stores", value: String(tierAccess.scoutStoreSlots), detail: tierAccess.scoutStoreSwapDays ? `${tierAccess.scoutStoreSwapDays}-day changes` : "Admin managed" },
            { key: "details", icon: "data", label: "Scout details", value: planScoutDetailsAllowed ? "Selected" : "Limited", detail: "Fair current access" },
            { key: "history", icon: "vault", label: "Raw history", value: tierAccess.canViewRawScoutHistory ? "Admin" : "Protected", detail: "Not paywalled" },
            { key: "checkout", icon: "help", label: "Checkout", value: "Off", detail: "Admin-managed beta" },
          ]}
          plan={{
            label: "Access Model",
            title: "Free stays useful. Paid tiers add scale and support.",
            items: [
              { key: "free", icon: "vault", label: "Core collecting", detail: "Vault, Market, Forge basics" },
              { key: "scout", icon: "scout", label: "Fair Scout", detail: "Reports stay current and safe", action: () => document.getElementById("membership-scout-guardrails")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
              { key: "family", icon: "community", label: "Family access", detail: "Special needs and kid support path" },
              { key: "seller", icon: "market", label: "Seller scale", detail: "Locked until enabled" },
            ],
            actions: [
              { label: "Review Guardrails", icon: "scout", onClick: () => document.getElementById("membership-scout-guardrails")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
              { label: "Request Access", icon: "help", onClick: () => requestLockedFeatureAccess("seller_tools") },
            ],
          }}
          routes={[
            { key: "vault", icon: "vault", label: "Vault", title: "Core app", detail: "Collection basics", action: () => setActiveTab("vault") },
            { key: "scout", icon: "scout", label: "Scout", title: "Fair reports", detail: "Watch limits", action: () => setActiveTab("scout") },
            { key: "exchange", icon: "market", label: "Exchange", title: "Seller tiers", detail: "No checkout", action: () => setActiveTab("market") },
            { key: "spark", icon: "spark", label: "Spark", title: "Family support", detail: "Access path", action: () => setActiveTab("kidsProgram") },
            { key: "you", icon: "account", label: "You", title: "Plan controls", detail: "Profile and billing", action: () => setActiveTab("menu") },
            { key: "help", icon: "help", label: "Help", title: "Support", detail: "Beta questions", action: () => openUtilityPage("help") },
          ]}
        >
          <CommandBoardSection
            className="membership-v4-status"
            kicker="Current access"
            title={isPreview ? "Preview plan and Scout limits" : "Current plan and Scout limits"}
            detail="Free access remains a complete collector app. Paid tiers add scale and convenience without exposing raw Scout history."
            action={<span className="status-badge">{planHeading}: {planLabel}</span>}
          >
            <CommandMetricGrid
              className="membership-v4-status-grid"
              items={[
                { key: "plan", label: planHeading, value: planLabel, detail: planDetail },
                { key: "stores", label: "Scout watch stores", value: String(tierAccess.scoutStoreSlots), detail: tierAccess.scoutStoreSwapDays ? `Change every ${tierAccess.scoutStoreSwapDays} days.` : "Admin moderation access." },
                { key: "details", label: "Current Scout details", value: planScoutDetailsAllowed ? "Selected" : "Limited", detail: planScoutDetailsAllowed ? "Selected-store current details." : "Limited to keep Scout fair." },
                { key: "history", label: "Raw Scout history", value: tierAccess.canViewRawScoutHistory ? "Admin" : "Protected", detail: "No hidden history behind paid locks." },
                { key: "patterns", label: "Pattern tools", value: tierAccess.canViewPatternTools ? "Admin" : "Protected", detail: "Protected from non-admin users." },
              ]}
            />
            <div id="membership-scout-guardrails" className="membership-v4-guardrail-rack" aria-label="Scout membership guardrails">
              {[
                `${tierAccess.scoutStoreSlots} Scout watch store${Number(tierAccess.scoutStoreSlots) === 1 ? "" : "s"}`,
                tierAccess.scoutStoreSwapDays ? `${tierAccess.scoutStoreSwapDays}-day store changes` : "Store changes managed by admin",
                planScoutDetailsAllowed ? "Selected-store current details" : "Current details limited",
                tierAccess.canViewRawScoutHistory ? "Raw history restricted to admin" : "Raw history protected",
                tierAccess.canViewPatternTools ? "Pattern tools restricted to admin" : "Pattern tools protected",
                "No all-store exact access",
              ].map((rule) => <span key={rule}>{rule}</span>)}
            </div>
          </CommandBoardSection>

          <CommandBoardSection
            className="membership-v4-core"
            kicker="Included"
            title="Free is the core collector app"
            detail="Paid plans add scale, convenience, family seats, seller workflows, or shop tools. Core collecting and safety basics stay included."
            action={<span className="status-badge">Safety basics free</span>}
          >
            <div className="membership-v4-feature-grid">
              {freeCoreFeatures.map((feature) => (
                <article className="membership-v4-feature-card" key={feature.title}>
                  <i aria-hidden="true"><AppNavIcon kind={feature.icon} /></i>
                  <span>{feature.meta}</span>
                  <strong>{feature.title}</strong>
                  <p>{feature.detail}</p>
                </article>
              ))}
            </div>
          </CommandBoardSection>

          <CommandBoardSection
            className="membership-v4-plans"
            kicker="Plans"
            title="Plans add scale, not basic collecting"
            detail="Plan cards are beta preview copy. Checkout is not live, and upgrades are admin-managed during beta."
            action={<span className="status-badge">No checkout</span>}
            ariaLabel="Code 3 TCG public plans"
          >
            <div id="membership-plan-grid" className="membership-v4-plan-grid">
              {tierCards.map((tier) => (
                <article className={`membership-v4-plan-card${tier.id === plan ? " current" : ""}`} key={tier.id} data-tier-plan={tier.id}>
                  <div>
                    <span>{tier.id === plan ? isPreview ? "Previewing" : "Current" : tier.display.status || "Beta preview"}</span>
                    <strong>{tier.label}</strong>
                  </div>
                  <h3>{tier.price}</h3>
                  <p>{tier.summary}</p>
                  <div className="membership-v4-plan-rules">
                    <span>{tier.access.scoutStoreSlots} Scout store{Number(tier.access.scoutStoreSlots) === 1 ? "" : "s"}</span>
                    <span>{tier.access.scoutStoreSwapDays ? `${tier.access.scoutStoreSwapDays}-day changes` : "Admin changes"}</span>
                    <span>{tier.access.canViewPatternTools ? "Admin patterns" : "Patterns protected"}</span>
                  </div>
                  <ul>
                    {tier.features.slice(0, 5).map((feature) => <li key={`${tier.id}-${feature}`}>{feature}</li>)}
                  </ul>
                  <button type="button" className="command-board-v4-secondary-action" disabled>{tier.cta}</button>
                </article>
              ))}
            </div>
          </CommandBoardSection>

          <div className="membership-v4-lower-grid">
            <CommandBoardSection
              className="membership-v4-locks"
              kicker="Locked states"
              title="Explain value without exposing hidden data"
              detail="Locks should tell users what the feature does, why it is restricted, and what the safe next step is."
              action={<span className="status-badge">Clear gates</span>}
            >
              <div className="membership-v4-lock-grid">
                {lockPreviews.map((lock) => (
                  <article className="membership-v4-lock-card" key={lock.label}>
                    <span>{lock.statusLabel}</span>
                    <strong>{lock.label}</strong>
                    <p>{lock.benefit}</p>
                    <small>{lock.guardrail}</small>
                  </article>
                ))}
              </div>
            </CommandBoardSection>

            <CommandBoardSection
              className="membership-v4-admin"
              kicker="Beta access"
              title="Admin-managed until billing is approved"
              detail="No add-on checkout is connected. Upgrades and seller/shop access remain reviewed beta actions."
              action={<span className="status-badge">Checkout off</span>}
            >
              <div className="membership-v4-admin-grid">
                {accessStatusRows.map((row) => (
                  <article className="membership-v4-admin-card" key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                    <p>{row.helper}</p>
                  </article>
                ))}
              </div>
              <div className="membership-v4-addon-row" aria-label="Membership add-ons">
                {addOns.map((addOn) => (
                  <span key={addOn.id}>{addOn.label}: {addOn.status}</span>
                ))}
              </div>
            </CommandBoardSection>
          </div>
        </CommandBoardV4>
      </div>
    );
  }

  return renderMembershipFoundation();
}
