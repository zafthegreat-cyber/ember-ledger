import { EtMockupPageShell } from "../components/command-system";

export default function VaultPage(props) {
  const {
    children,
    renderHeader,
    showDashboard,
    activeVaultCardItems,
    activeVaultItems,
    activeVaultSealedItems,
    CollectorShowcaseCard,
    EtMockupActionCard,
    EtMockupButton,
    EtMockupEmptyState,
    EtMockupPill,
    EtMockupRightRail,
    EtMockupSectionCard,
    EtMockupStatCard,
    FlowNextActionCard,
    hasValue,
    MASTER_CARD_GROUPING_PREVIEW_CARDS,
    MasterCardGroupPreview,
    normalizeVaultStatus,
    openMarketWatchForVaultItem,
    openProductAddFlow,
    openTradeCompassFlow,
    openVaultCollectionSetFlow,
    openVaultImportCollectionFlow,
    openVaultQuickAddFlow,
    openVaultScanFlow,
    recentVaultItems,
    removeVaultDisplayCaseEntry,
    renderUpgradeValuePreview,
    setActiveTab,
    setSelectedVaultDetailId,
    setVaultFilter,
    setVaultLocationFilter,
    setVaultOwnerFilter,
    setVaultSearch,
    setVaultSetFilter,
    setVaultSubTab,
    setVaultToast,
    setVaultTypeFilter,
    setVaultValueFilter,
    shortDate,
    vaultCollectionSetSummary,
    vaultDisplayCaseCategoryLabel,
    vaultFilter,
    vaultItemDisplayImage,
    vaultItemSetLabel,
    vaultItemTotalMarketValue,
    vaultMarketValueDisplay,
    vaultSearch,
    vaultSetCompletionRows,
    vaultStatusLabel,
    vaultSubTab,
    vaultTypeFilter,
    visibleVaultCollectionSets,
    visibleVaultDisplayCase,
    visibleVaultMasterCards,
    wishlistItems,
  } = props;

  const openVaultItems = (filter = "all", refinements = {}) => {
    setVaultSubTab("collection");
    setVaultFilter(filter);
    setVaultTypeFilter(refinements.type || "all");
    setVaultSetFilter(refinements.set || "all");
    setVaultLocationFilter(refinements.location || "all");
    setVaultOwnerFilter(refinements.owner || "all");
    setVaultValueFilter(refinements.value || "all");
    setVaultSearch(refinements.search || "");
    setActiveTab("vault");
    window.setTimeout(() => document.getElementById("vault-items-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  function renderVaultHomeDashboard() {
      // TODO: Replace folder health and binder reminders with a reviewed read-only Vault summary contract when available.
      const cardQuantity = activeVaultCardItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const sealedQuantity = activeVaultSealedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const topSet = vaultSetCompletionRows.find((row) => row.ownedCount > 0 && (row.totalCards > 0 || row.catalogCards.length));
      const knownValueCount = activeVaultItems.filter((item) => Number(vaultItemTotalMarketValue(item) || item.marketPrice || item.marketValue || 0) > 0).length;
      const vaultItemHasNotes = (item) => [
        item.collectorNotes,
        item.collector_notes,
        item.notes,
        item.note,
        item.memoryStory,
        item.memory_story,
        item.story,
        item.actionNotes,
        item.action_notes,
      ].some(hasValue);
      const vaultItemHasProfileDetails = (item) => {
        const value = Number(vaultItemTotalMarketValue(item) || item.marketPrice || item.marketValue || item.currentValue || 0);
        return Boolean(
          vaultItemHasNotes(item) &&
          (item.conditionName || item.condition || item.grade) &&
          (value > 0) &&
          (vaultItemSetLabel(item) || item.productType || item.category)
        );
      };
      const itemsWithNotesCount = activeVaultItems.filter(vaultItemHasNotes).length;
      const itemsWithoutValueCount = activeVaultItems.filter((item) => Number(vaultItemTotalMarketValue(item) || item.marketPrice || item.marketValue || item.currentValue || 0) <= 0).length;
      const needsProfileDetailsCount = activeVaultItems.filter((item) => !vaultItemHasProfileDetails(item)).length;
      const collectionHealthPercent = activeVaultItems.length ? Math.round((knownValueCount / activeVaultItems.length) * 100) : 0;
      const estimatedValue = vaultMarketValueDisplay === "Price data unavailable" ? "Value pending" : vaultMarketValueDisplay;
      const folderCards = [
        { key: "main", title: "Main Binder", count: cardQuantity || activeVaultCardItems.length, detail: "Master cards + variants", action: () => openVaultItems("all", { type: "Card" }) },
        { key: "sealed", title: "Sealed", count: sealedQuantity || activeVaultSealedItems.length, detail: "Products kept separate", action: () => setVaultSubTab("sealed") },
        { key: "favorites", title: "Favorites", count: activeVaultItems.filter((item) => item.favorite || item.pinned || item.featured).length, detail: "Pinned family picks", action: () => openVaultItems("all") },
        { key: "kids", title: "Kids Collection", count: activeVaultItems.filter((item) => /kid|child|family/i.test(`${item.location || ""} ${item.owner || ""} ${item.purchaser || ""}`)).length, detail: "Family-safe folders", action: () => openVaultItems("all") },
        { key: "wishlist", title: "Wish List", count: wishlistItems.length, detail: "Wanted, not owned", action: () => setVaultSubTab("wishlist") },
      ];
      const recentRows = recentVaultItems.slice(0, 3);
      const quickActions = [
        { key: "scan-card", title: "Scan card", detail: "Find identity + variant", onClick: () => openVaultScanFlow() },
        { key: "scan-binder", title: "Scan binder page", detail: "Group copies before saving", onClick: () => openProductAddFlow({ source: "vault-home-binder-page", destinations: { vault: true } }) },
        { key: "manual", title: "Add manually", detail: "Cards, graded, sealed", onClick: () => openVaultQuickAddFlow() },
        { key: "import", title: "Import list", detail: "Review duplicate groups", onClick: () => openVaultImportCollectionFlow() },
      ];
      const masterPreviewCards = visibleVaultMasterCards.length
        ? visibleVaultMasterCards.slice(0, 2)
        : MASTER_CARD_GROUPING_PREVIEW_CARDS.slice(0, 2);
      const groupedVariantCount = visibleVaultMasterCards.reduce((sum, card) => sum + Number(card.variantCount || card.variants?.length || 0), 0);
      const vaultCollectionSummaryCards = [
        { key: "total-items", label: "Total items", value: activeVaultItems.length, detail: activeVaultItems.length ? "Owned Vault records" : "Add one item to begin", tone: "vault" },
        { key: "wishlist-count", label: "Wishlist count", value: wishlistItems.length, detail: wishlistItems.length ? "Wanted, not owned" : "No wishlist wants yet", tone: "collector" },
        { key: "items-with-notes", label: "Items with notes", value: itemsWithNotesCount, detail: itemsWithNotesCount ? "Collector context saved" : "Add stories or notes", tone: "gold" },
        { key: "items-without-value", label: "Items without value", value: itemsWithoutValueCount, detail: itemsWithoutValueCount ? "No saved estimate yet" : "Known values only", tone: "vault" },
        { key: "sets-created", label: "Sets created", value: vaultCollectionSetSummary.total, detail: vaultCollectionSetSummary.total ? "Local Set Shelf groups" : "Create a Set Shelf", tone: "collector" },
        { key: "recently-added", label: "Recently added", value: recentRows.length, detail: recentRows.length ? recentRows[0]?.name || "Recent Vault item" : "No recent movement", tone: "gold" },
        { key: "needs-profile-details", label: "Needs profile details", value: needsProfileDetailsCount, detail: needsProfileDetailsCount ? "Notes, condition, or value missing" : "Profiles look filled in", tone: "vault" },
      ];

      return (
        <section className="vault-live-home-dashboard" aria-label="Vault Home dashboard">
          <EtMockupSectionCard
            className="vault-live-home-hero vault-mockup-home-hero"
            title="Vault Home"
            detail="Your protected collection room for cards, sealed products, variants, wishlist gaps, and set progress."
          >
            <div className="et-mockup-stat-grid vault-live-summary-grid" aria-label="Vault collection summary">
              <EtMockupStatCard label="Cards" value={cardQuantity} detail="Owned quantity" tone="vault" />
              <EtMockupStatCard label="Sealed" value={sealedQuantity} detail="Separate from sets" tone="gold" />
              <EtMockupStatCard label="Est. value" value={estimatedValue} detail="Known values only" tone="collector" />
              <EtMockupStatCard label="Completion" value={topSet ? topSet.completionLabel : "Ready"} detail={topSet ? topSet.name : "Add set details"} tone="vault" />
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            className="vault-collection-intelligence-card"
            title="Collection Summary"
            detail="Local-only collection signals for organization, notes, values, sets, and profile cleanup."
            action={<EtMockupPill tone="vault">Vault local data</EtMockupPill>}
          >
            <div className="et-mockup-stat-grid vault-collection-intelligence-grid" aria-label="Vault collection intelligence summary">
              {vaultCollectionSummaryCards.map((card) => (
                <EtMockupStatCard
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  detail={card.detail}
                  tone={card.tone}
                />
              ))}
            </div>
          </EtMockupSectionCard>

          <FlowNextActionCard
            eyebrow="Vault next action"
            title={activeVaultItems.length ? "Clean up one item profile." : "Start with one reviewed Vault item."}
            detail={activeVaultItems.length
              ? "Add a condition note, save a manual value, or check a trade before moving anything through Forge."
              : "Add one card, sealed product, slab, supply, or wishlist want. Nothing saves until you review it."}
            tone="vault"
            actions={[
              { label: activeVaultItems.length ? "Open first profile" : "Add to Vault", onClick: () => {
                if (activeVaultItems[0]?.id) setSelectedVaultDetailId(activeVaultItems[0].id);
                else openVaultQuickAddFlow();
              } },
              { label: "Check Market", onClick: () => setActiveTab("market") },
              { label: "Trade Compass", onClick: () => openTradeCompassFlow({ source: "vault-next-action" }) },
            ]}
          />

          <EtMockupSectionCard
            id="vault-display-case-section"
            className="vault-display-case-panel"
            title="Display Case"
            detail="Feature favorite cards and sealed products in a local collection-room showcase. Local display only; not public sharing, not a listing, and not a sale."
            action={<EtMockupButton variant="secondary" onClick={() => {
              if (activeVaultItems[0]?.id) setSelectedVaultDetailId(activeVaultItems[0].id);
              else openVaultQuickAddFlow();
            }}>{activeVaultItems.length ? "Open Item Profile" : "Add to Vault"}</EtMockupButton>}
            ariaLabel="Vault Display Case"
          >
            <div className="vault-display-case-safety" aria-label="Display Case safety">
              <strong>Local display only</strong>
              <span>Display Case is private to this browser. It does not create public sharing, seller listings, marketplace posts, checkout, or sales.</span>
            </div>
            {visibleVaultDisplayCase.length ? (
              <div className="vault-display-case-grid" aria-label="Featured Display Case items">
                {visibleVaultDisplayCase.slice(0, 8).map((entry) => (
                  <article className={`vault-display-case-card vault-display-case-${entry.displayCategory}`} key={entry.id || entry.itemId}>
                    <CollectorShowcaseCard
                      title={entry.displayTitle}
                      subtitle={entry.displaySubtitle}
                      image={entry.displayImage}
                      kind={entry.displayKind}
                      mode="display"
                      rarity={entry.displayRarity}
                      valueLabel={entry.displayValue}
                      meta={[vaultDisplayCaseCategoryLabel(entry.displayCategory), entry.displayOrder ? `Position ${entry.displayOrder}` : "Display Case"]}
                      helper={entry.displayNote || "Featured locally in your Display Case."}
                    />
                    <div className="vault-display-case-card-actions">
                      <button
                        type="button"
                        onClick={() => {
                          if (entry.item?.id) setSelectedVaultDetailId(entry.item.id);
                          else setVaultToast("This Display Case memory is local, but the original Vault item was not found.");
                        }}
                      >
                        Open Profile
                      </button>
                      <button type="button" className="secondary-button" onClick={() => removeVaultDisplayCaseEntry(entry.id)}>
                        Remove from Display Case
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EtMockupEmptyState
                title="Your Display Case is waiting."
                detail="Open a Vault Item Profile and choose Add to Display Case to feature a favorite, grail, sealed product, trade bait, or kid favorite. Items stay in Vault."
                action={<EtMockupButton variant="secondary" onClick={() => {
                  if (activeVaultItems[0]?.id) setSelectedVaultDetailId(activeVaultItems[0].id);
                  else openVaultQuickAddFlow();
                }}>{activeVaultItems.length ? "Choose first item" : "Add first Vault item"}</EtMockupButton>}
              />
            )}
          </EtMockupSectionCard>

          <EtMockupSectionCard
            className="vault-live-controls-card vault-mockup-search-card"
            title="Find anything in Vault"
            detail="Search locally, filter by collection type, or jump into a protected review flow."
            action={<EtMockupButton variant="secondary" onClick={() => document.getElementById("vault-items-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Open collection</EtMockupButton>}
          >
            <div className="vault-live-search-row">
              <label className="vault-filter-field vault-search-field">
                <span>Search Vault</span>
                <input className="vault-search-input" value={vaultSearch} onChange={(event) => setVaultSearch(event.target.value)} placeholder="Search cards, sealed, sets, notes" />
              </label>
              <div className="vault-live-filter-row" role="group" aria-label="Vault quick filters">
                {[
                  ["all", "All"],
                  ["card", "Cards"],
                  ["sealed", "Sealed"],
                  ["wishlist", "Wishlist"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={(value === "wishlist" ? vaultSubTab === "wishlist" : value === "card" ? vaultTypeFilter === "Card" : vaultFilter === value || (value === "all" && vaultFilter === "all" && vaultTypeFilter === "all")) ? "active" : ""}
                    onClick={() => {
                      if (value === "wishlist") {
                        setVaultSubTab("wishlist");
                        return;
                      }
                      setVaultSubTab("collection");
                      if (value === "card") {
                        setVaultFilter("all");
                        setVaultTypeFilter("Card");
                        return;
                      }
                      setVaultFilter(value);
                      setVaultTypeFilter("all");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            className="vault-live-master-card vault-mockup-master-card"
            title="One card identity, all exact copies."
            detail="Vault groups cards by normalized name, set, and card number first. Normal, reverse holo, graded, promo, duplicates, and wishlist wants stay inside the same master card."
            action={<span className="trust-badge trust-badge--secure">Master-card view</span>}
          >
            <div className="et-mockup-stat-grid vault-live-master-stats" aria-label="Master card grouping summary">
              <EtMockupStatCard label="Identities" value={visibleVaultMasterCards.length || "Preview"} detail="Same card, set, number" tone="vault" />
              <EtMockupStatCard label="Variants" value={groupedVariantCount || masterPreviewCards.reduce((sum, card) => sum + Number(card.variantCount || card.variants?.length || 0), 0)} detail="Copies live below identity" tone="gold" />
              <EtMockupStatCard label="Wishlist" value={wishlistItems.length} detail="Wanted copies stay separate" tone="collector" />
            </div>
            {masterPreviewCards.length ? (
              <div className="vault-live-master-preview-grid">
                {masterPreviewCards.map((masterCard) => (
                  <MasterCardGroupPreview
                    key={masterCard.id}
                    masterCard={masterCard}
                    compact
                    onOpenRecord={visibleVaultMasterCards.length ? (record) => setSelectedVaultDetailId(record.id) : null}
                    onOpenMarket={visibleVaultMasterCards.length ? openMarketWatchForVaultItem : null}
                  />
                ))}
              </div>
            ) : null}
          </EtMockupSectionCard>

          <div className="vault-live-main-grid">
            <EtMockupSectionCard
              className="vault-live-folder-card"
              title="Folders"
              detail="Mock folder labels keep this home organized while real folder data is reviewed later."
              action={<span className="status-badge">{folderCards.length} folders</span>}
            >
              <div className="vault-live-folder-grid">
                {folderCards.map((folder) => (
                  <button type="button" className="vault-live-folder-tile" key={folder.key} onClick={folder.action}>
                    <span>{folder.title}</span>
                    <strong>{folder.count}</strong>
                    <small>{folder.detail}</small>
                  </button>
                ))}
              </div>
            </EtMockupSectionCard>

            <EtMockupSectionCard
              className="vault-live-recent-card"
              title="Recent additions"
              detail="Recent items stay reviewable before trades, sales, or set completion."
              action={<EtMockupButton variant="secondary" onClick={() => openVaultItems("all")}>See all</EtMockupButton>}
            >
              <div className="vault-live-recent-list">
                {recentRows.length ? recentRows.map((item) => (
                  <button type="button" className="vault-live-recent-row" key={item.id} onClick={() => setSelectedVaultDetailId(item.id)}>
                    <span className="vault-live-item-thumb" aria-hidden="true">{vaultItemDisplayImage(item) ? <img src={vaultItemDisplayImage(item)} alt="" /> : "Card"}</span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{[vaultItemSetLabel(item), `Qty ${item.quantity || 1}`, vaultStatusLabel(normalizeVaultStatus(item))].filter(Boolean).join(" | ")}</small>
                    </span>
                  </button>
                )) : (
                  <div className="empty-state small-empty-state">
                    <h3>No recent Vault movement yet.</h3>
                    <p>Add a card, sealed product, slab, binder page, or wishlist want to start a protected collection trail.</p>
                  </div>
                )}
              </div>
            </EtMockupSectionCard>

            <EtMockupRightRail
              className="vault-live-health-card"
              title="Collection Health"
              detail={activeVaultItems.length ? `${knownValueCount} of ${activeVaultItems.length} grouped items have known value context.` : "Start with one reviewed item to build health signals."}
            >
              <h2>{collectionHealthPercent || "Ready"}{collectionHealthPercent ? "%" : ""}</h2>
              <div className="vault-progress-track" aria-label="Vault collection health">
                <i style={{ width: `${collectionHealthPercent || 8}%` }} />
              </div>
              <div className="scout-safety-strip">
                <span>Review before saving</span>
                <span>Variants grouped</span>
                <span>Sealed separate</span>
                <span>Wishlist separate</span>
              </div>
            </EtMockupRightRail>
          </div>

          <EtMockupSectionCard
            className="vault-live-actions-card"
            title="Quick actions"
            detail="Every add path stays review-first. No card scanning service or upload backend is added in this section."
          >
            <div className="et-mockup-action-grid vault-live-action-grid">
              {quickActions.map((action) => (
                <EtMockupActionCard
                  key={action.key}
                  title={action.title}
                  detail={action.detail}
                  icon={action.key.includes("scan") ? "search" : "vault"}
                  tone={action.key === "manual" ? "vault" : action.key === "import" ? "collector" : "gold"}
                  className="vault-live-action-tile"
                  onClick={action.onClick}
                />
              ))}
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            className="vault-collection-sets-card"
            title="Collection Sets"
            detail="Set Shelf keeps favorites, kids' collections, sealed product, slabs, trade binders, and family goals together without changing your Vault items yet."
            action={<EtMockupButton onClick={() => openVaultCollectionSetFlow({ source: "vault-set-shelf" })}>Create Set</EtMockupButton>}
          >
            <div className="et-mockup-stat-grid vault-collection-set-summary-grid" aria-label="Collection Sets summary">
              <EtMockupStatCard label="Set Shelf" value={vaultCollectionSetSummary.total} detail="Local collection groups" tone="vault" />
              <EtMockupStatCard label="Family Set" value={vaultCollectionSetSummary.kids} detail="Kid and family labels" tone="collector" />
              <EtMockupStatCard label="Sealed Set" value={vaultCollectionSetSummary.sealed} detail="Sealed product shelves" tone="gold" />
              <EtMockupStatCard label="Trade Binder" value={vaultCollectionSetSummary.tradeBinders} detail="Trade review groups" tone="vault" />
            </div>

            {visibleVaultCollectionSets.length ? (
              <div className="vault-collection-set-grid" aria-label="Saved Collection Sets">
                {visibleVaultCollectionSets.slice(0, 6).map((set) => {
                  const setType = set.setType || "Collection Set";
                  const setProgressLabel = "0 items assigned";
                  const setProgressCopy = "Add items later. Vault items are not assigned automatically in this local beta.";
                  return (
                    <article className="vault-collection-set-card" key={set.id || `${set.setName}-${set.createdAt}`}>
                      <div className="compact-card-header">
                        <div>
                          <span className="trust-badge trust-badge--secure">{setType}</span>
                          <h3>{set.setName || "Untitled set"}</h3>
                          <p>{set.familyKidLabel || set.setGoal || "Personal Set Shelf group"}</p>
                        </div>
                        <span className="status-badge">{set.dateCreated ? shortDate(set.dateCreated) : "Local"}</span>
                      </div>
                      <div className="vault-collection-set-progress" aria-label={`${set.setName || "Collection Set"} progress`}>
                        <div>
                          <span>Set progress</span>
                          <strong>{setProgressLabel}</strong>
                          <small>{setProgressCopy}</small>
                        </div>
                        <div className="vault-progress-track"><i style={{ width: "8%" }} /></div>
                      </div>
                      <p>{set.setNotes || "No Set Notes yet. Add why this set matters, what belongs here, or who it helps."}</p>
                      {set.setGoal ? <small>Goal: {set.setGoal}</small> : <small>Goal: Add a collecting goal when this set is ready.</small>}
                      <div className="compact-actions vault-collection-set-actions">
                        <button type="button" className="secondary-button" onClick={() => setVaultToast("Set Shelf details are saved locally. Add items later is still coming soon.")}>View Set</button>
                        <button type="button" className="secondary-button" disabled title="Item assignment is coming soon.">Add to Set</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EtMockupEmptyState
                title="Your Set Shelf is waiting."
                detail="Your Set Shelf is waiting. Create a set for favorites, sealed product, slabs, kid collections, trade binders, or master set goals. Upgraded plans can expand deeper organization tools when enabled."
                action={<EtMockupButton variant="secondary" onClick={() => openVaultCollectionSetFlow({ source: "vault-set-shelf-empty" })}>Create Set</EtMockupButton>}
              />
            )}

            <div className="vault-collection-set-coming-soon" aria-label="Collection Sets item assignment status">
              <strong>Add to Set</strong>
              <span>Soon you{"\u2019"}ll be able to tuck Vault items directly into this set.</span>
            </div>
          </EtMockupSectionCard>

          {renderUpgradeValuePreview("vault")}
        </section>
      );
    }

  return (
    <EtMockupPageShell accent="vault" className="vault-mockup-rebuild" ariaLabel="Vault protected collection room">
      <div className="et-mockup-main-column vault-mockup-main">
        {renderHeader()}
        {showDashboard ? renderVaultHomeDashboard() : null}
        {children}
      </div>
    </EtMockupPageShell>
  );
}
