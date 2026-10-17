// App owns state, authority and handlers; only this existing renderer is deferred.
export default function MultiDestinationContent({ scope }) {
  const {
    ADD_ITEM_NO_RESULT_HINTS,
    ADD_ITEM_QUICK_SEARCH_CHIPS,
    AI_FEATURE_AREAS,
    AI_REVIEW_DISCLAIMER,
    DEFAULT_FORGE_PHYSICAL_LOCATION,
    FORGE_PHYSICAL_LOCATION_OPTIONS,
    Field,
    INFO_TOOLTIP_COPY,
    LazySmartCatalogSearchBox,
    MULTI_DESTINATION_STEPS,
    MULTI_DESTINATION_STEP_LABELS,
    PurchaserSelect,
    VAULT_CONDITIONS,
    VAULT_STATUS_OPTIONS,
    activeFlowModal,
    activeForgeWorkspace,
    activeWorkspace,
    addPurchaserName,
    adminToolsVisible,
    buildAiCatalogMatchSummary,
    catalogExpansionName,
    catalogImage,
    catalogProductTypeLabel,
    catalogProducts,
    catalogTitle,
    clearMultiDestinationCatalogProduct,
    closeFlowModal,
    defaultWorkspaceIdForDestination,
    destinationDefaults,
    destinationWorkspaceOptions,
    findSetSummaryForItem,
    focusMultiDestinationValidationError,
    forgeWorkspaceUnavailableMessage,
    getBestCatalogMatches,
    getCatalogIdentifiers,
    getCatalogMarketSourceLabel,
    getCatalogPickerResults,
    getMultiDestinationValidationErrors,
    getTideTradrMarketInfo,
    hasCatalogMarketPrice,
    isCatalogCardProduct,
    isCatalogSealedProduct,
    isMarketAddFlowSource,
    isSupabaseConfigured,
    items,
    mapCatalog,
    markMultiDestinationMissingCatalog,
    money,
    multiDestinationCatalogQuery,
    multiDestinationDestinationLabel,
    multiDestinationForm,
    multiDestinationMatchSearchOpen,
    multiDestinationMessage,
    multiDestinationStep,
    multiDestinationSuccess,
    multiDestinationValidationAttempted,
    openPictureLookupFlow,
    openPurchaserManager,
    openVaultScanFlow,
    openVaultSetSummary,
    purchasersForWorkspace,
    quickAddSellerToolsEnabled,
    renderCatalogPickerCard,
    renderProductImageFallback,
    runItemIdentificationAssist,
    runMultiDestinationCatalogSearch,
    runVariantAssist,
    selectMultiDestinationCatalogProduct,
    selectMultiDestinationCatalogSuggestion,
    selectRecentMultiDestinationItem,
    selectedMultiDestinationKeys,
    setActiveTab,
    setMultiDestinationCatalogQuery,
    setMultiDestinationForm,
    setMultiDestinationMatchSearchOpen,
    setMultiDestinationMessage,
    setMultiDestinationStep,
    setVaultSubTab,
    setVaultToast,
    showAiSuggestion,
    startMultiDestinationManualEntry,
    submitMultiDestinationAdd,
    supabase,
    supabaseCatalogStatus,
    updateMultiDestinationField,
    updateMultiDestinationSection,
    updateMultiDestinationToggle,
    vaultSetCompletionRows,
    vaultStatusLabel,
    workspaceSelectorOptions,
    workspaceTypeLabel,
  } = scope;

  function renderMultiDestinationAddFlowContent() {
    const selectedCatalog = catalogProducts.find((product) => String(product.id) === String(multiDestinationForm.catalogProductId));
    const marketAddFlowActive = isMarketAddFlowSource(activeFlowModal?.source);
    const itemTypeText = [
      multiDestinationForm.productType,
      selectedCatalog?.productType,
      selectedCatalog?.sealedProductType,
      selectedCatalog?.productKind,
      multiDestinationForm.itemName,
    ].filter(Boolean).join(" ");
    const addFlowIsCard = selectedCatalog
      ? isCatalogCardProduct(selectedCatalog)
      : /\b(card|single|graded|slab)\b/i.test(itemTypeText);
    const addFlowIsSealed = selectedCatalog
      ? isCatalogSealedProduct(selectedCatalog) && !addFlowIsCard
      : /(sealed|booster|elite trainer|box|tin|collection|bundle|pack|blister|deck)/i.test(itemTypeText) && !addFlowIsCard;
    const forgeDestinationWorkspaceId = multiDestinationForm.forge?.workspaceId || defaultWorkspaceIdForDestination("forge");
    const scanFoundationSourceActive = /^quick-add-(search|upc|manual|missing|scan|scan-anything)/i.test(String(activeFlowModal?.source || ""));
    const showForgeDestinationForThisFlow = Boolean(activeForgeWorkspace) && (!scanFoundationSourceActive || quickAddSellerToolsEnabled());
    const destinationOptions = [
      {
        key: "vault",
        title: "Vault",
        helper: "Owned collection or stored item.",
      },
      {
        key: "wishlist",
        title: "Wishlist",
        helper: "Wanted item, not owned yet.",
      },
      {
        key: "forge",
        title: "Forge",
        helper: showForgeDestinationForThisFlow
          ? `Business inventory in ${activeForgeWorkspace.name || "Forge"}.`
          : scanFoundationSourceActive
            ? "Turn on seller tools to add scanned or searched items to Forge."
            : forgeWorkspaceUnavailableMessage,
        disabled: !showForgeDestinationForThisFlow,
      },
      {
        key: "tidetradr",
        title: "Watch / Market tracking",
        helper: "Track price or suggest catalog data.",
      },
    ].filter((option) => option.key !== "forge" || showForgeDestinationForThisFlow || multiDestinationForm.destinations.forge);
    const selectedDestinations = selectedMultiDestinationKeys(multiDestinationForm);
    const selectedDestinationOptions = destinationOptions.filter((option) => selectedDestinations.includes(option.key));
    const currentStepIndex = Math.max(0, MULTI_DESTINATION_STEPS.indexOf(multiDestinationStep));
    const currentStepValidationErrors = getMultiDestinationValidationErrors(multiDestinationStep, multiDestinationForm);
    const reviewValidationErrors = getMultiDestinationValidationErrors("review", multiDestinationForm);
    const shouldShowValidationErrors = multiDestinationValidationAttempted || multiDestinationStep === "review";
    const visibleValidationErrors = shouldShowValidationErrors
      ? (multiDestinationStep === "review" ? reviewValidationErrors : currentStepValidationErrors)
      : [];
    const fieldError = (field) => visibleValidationErrors.find((error) => error.field === field)?.message || "";
    const stepHasVisibleError = (step) => visibleValidationErrors.some((error) => error.step === step);
    const validationErrorSummary = shouldShowValidationErrors && visibleValidationErrors.length
      ? `Please fix ${visibleValidationErrors.length} item${visibleValidationErrors.length === 1 ? "" : "s"} before saving.`
      : "";
    const manualModeActive = !selectedCatalog && !multiDestinationMatchSearchOpen;
    const selectedItemSummary = selectedCatalog
      ? `${catalogTitle(selectedCatalog)}${catalogExpansionName(selectedCatalog) ? ` | ${catalogExpansionName(selectedCatalog)}` : ""}`
      : String(multiDestinationForm.itemName || "No item selected").trim();
    const selectedCatalogIdentifierText = selectedCatalog
      ? getCatalogIdentifiers(selectedCatalog).filter((identifier) => ["UPC", "EAN", "GTIN", "SKU", "RETAILER_SKU"].includes(identifier.label)).map((identifier) => `${identifier.label}: ${identifier.value}`).slice(0, 2).join(" | ")
      : "";
    const selectedCatalogMarketText = selectedCatalog && hasCatalogMarketPrice(selectedCatalog)
      ? `Market ${money(getTideTradrMarketInfo(selectedCatalog).currentMarketValue)}`
      : "Market data unavailable";
    const selectedCatalogMarketSourceText = selectedCatalog
      ? `${getCatalogMarketSourceLabel(selectedCatalog)} source - ${getTideTradrMarketInfo(selectedCatalog).marketDataLabel || "freshness unknown"}`
      : "";
    const marketAddSetSummary = marketAddFlowActive && selectedCatalog
      ? findSetSummaryForItem(selectedCatalog, vaultSetCompletionRows)
      : null;
    const marketAddSetCanOpen = Boolean(marketAddSetSummary?.id && !marketAddSetSummary.unknownSet);
    const marketAddTypeLabel = selectedCatalog
      ? isCatalogCardProduct(selectedCatalog)
        ? "Single card"
        : isCatalogSealedProduct(selectedCatalog)
          ? "Sealed product"
          : "Type unknown"
      : addFlowIsCard
        ? "Single card"
        : addFlowIsSealed
          ? "Sealed product"
          : "Type unknown";
    const itemSearchQuery = String(multiDestinationCatalogQuery || "").trim();
    const itemSearchResults = itemSearchQuery ? getCatalogPickerResults(itemSearchQuery, 10) : [];
    const recentAddItems = [...items]
      .filter((item) => item?.name || item?.itemName || item?.catalogProductName)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, 4);
    const renderDestinationWorkspaceField = (destination, label) => {
      const options = destinationWorkspaceOptions[destination] || workspaceSelectorOptions;
      if (!options.length) {
        return (
          <div className="small-empty-state forge-workspace-unavailable">
            <strong>{label}</strong>
            <span>{destination === "forge" ? forgeWorkspaceUnavailableMessage : "No workspace is available for this destination."}</span>
          </div>
        );
      }
      return (
        <Field label={label}>
          <select
            value={multiDestinationForm[destination]?.workspaceId || defaultWorkspaceIdForDestination(destination)}
            onChange={(event) => updateMultiDestinationSection(destination, "workspaceId", event.target.value)}
          >
            {options.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} - {workspaceTypeLabel(workspace.type)}
              </option>
            ))}
          </select>
        </Field>
      );
    };
    const applyDestinationPreset = (preset) => {
      setMultiDestinationMessage("");
      setMultiDestinationForm((current) => {
        const nextDestinations = { ...current.destinations };
        if (preset === "vault") {
          nextDestinations.vault = true;
          nextDestinations.forge = false;
          nextDestinations.wishlist = false;
          nextDestinations.tidetradr = false;
        } else if (preset === "forge") {
          nextDestinations.vault = false;
          nextDestinations.forge = Boolean(activeForgeWorkspace);
          nextDestinations.wishlist = false;
          nextDestinations.tidetradr = false;
        } else if (preset === "both") {
          nextDestinations.vault = true;
          nextDestinations.forge = Boolean(activeForgeWorkspace);
          nextDestinations.wishlist = false;
          nextDestinations.tidetradr = false;
        } else if (preset === "watch") {
          nextDestinations.vault = false;
          nextDestinations.forge = false;
          nextDestinations.wishlist = true;
          nextDestinations.tidetradr = true;
        }
        return {
          ...current,
          destinations: nextDestinations,
          wishlist: {
            ...current.wishlist,
            addToMarketWatch: preset === "watch" || current.wishlist?.addToMarketWatch,
          },
        };
      });
    };
    if (multiDestinationStep === "success" && multiDestinationSuccess) {
      const savedItems = Array.isArray(multiDestinationSuccess.savedItems) ? multiDestinationSuccess.savedItems : [];
      return (
        <div className="multi-destination-flow market-add-success-flow" role="status" aria-live="polite">
          <div className="market-add-success-card">
            <span className="neon-chip">Saved</span>
            <h3>{multiDestinationSuccess.summary || "Item saved."}</h3>
            <p>{multiDestinationSuccess.itemName || selectedItemSummary} is ready. You can finish, add more detail, view it, or add another item{multiDestinationSuccess.receiptId ? " from this receipt." : " from the same Market results."}</p>
            {savedItems.length ? (
              <div className="market-add-success-destinations">
                {savedItems.map((entry) => (
                  <span key={`${entry.destination}-${entry.id}`}>
                    <strong>{multiDestinationDestinationLabel(entry.destination)}</strong>
                    <small>Qty {entry.quantity || 1}</small>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      );
    }
    return (
      <form id="multi-destination-add-form" className="form multi-destination-flow" onSubmit={submitMultiDestinationAdd} noValidate>
        <div className="universal-review-banner">
          <strong>{MULTI_DESTINATION_STEP_LABELS[multiDestinationStep] || "Review and Add"}</strong>
          <span>Step {currentStepIndex + 1} of {MULTI_DESTINATION_STEPS.length}: select the item, choose where it belongs, add only the needed details, then review.</span>
        </div>
        <div className="vault-add-review-note add-item-master-note">
          <strong>Master-card grouping.</strong>
          <span>Already have this card? Add it as a variant or duplicate under the same master card instead of creating a scattered separate identity.</span>
        </div>
        {scanFoundationSourceActive ? (
          <div className="scan-anything-review-note">
            <strong>Review before saving.</strong>
            <p>Please confirm this item before saving. Not sure? Search again or request a missing item.</p>
          </div>
        ) : null}
        <div className="quick-add-flow-summary" aria-live="polite">
          <div>
            <span>Item</span>
            <strong>{selectedItemSummary}</strong>
          </div>
          <div>
            <span>Destination</span>
            <strong>{selectedDestinationOptions.length ? selectedDestinationOptions.map((option) => option.title).join(", ") : "Choose Vault or Forge next"}</strong>
          </div>
        </div>
        {marketAddFlowActive && selectedCatalog && multiDestinationStep !== "item" ? (
          <div className="selected-product-card selected-match-card market-add-prefilled-card">
            <div className="catalog-thumb selected-match-thumb">
              {catalogImage(selectedCatalog) ? (
                <>
                  <img
                    src={catalogImage(selectedCatalog)}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                      event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                    }}
                  />
                  {renderProductImageFallback(selectedCatalog, { hidden: true })}
                </>
              ) : renderProductImageFallback(selectedCatalog)}
            </div>
            <div className="selected-match-copy">
              <span className="neon-chip add-item-selected-chip">From Market</span>
              <strong>{catalogTitle(selectedCatalog)}</strong>
              <span>{[catalogExpansionName(selectedCatalog), catalogProductTypeLabel(selectedCatalog)].filter(Boolean).join(" | ") || "Catalog product"}</span>
              <small>{[selectedCatalogIdentifierText, selectedCatalogMarketText].filter(Boolean).join(" | ")}</small>
            </div>
            {multiDestinationStep === "destination" ? (
              <div className="market-add-inline-destination-actions" aria-label="Market add destination choices">
                <button type="button" className={multiDestinationForm.destinations.vault && !multiDestinationForm.destinations.forge && !multiDestinationForm.destinations.wishlist ? "active" : ""} onClick={() => applyDestinationPreset("vault")}>Add to Vault</button>
                <button type="button" className={multiDestinationForm.destinations.forge && !multiDestinationForm.destinations.vault ? "active" : ""} disabled={!activeForgeWorkspace} onClick={() => applyDestinationPreset("forge")}>Add to Forge</button>
                <button type="button" className={multiDestinationForm.destinations.vault && multiDestinationForm.destinations.forge ? "active" : ""} disabled={!activeForgeWorkspace} onClick={() => applyDestinationPreset("both")}>Add to both</button>
              </div>
            ) : null}
            <div className="selected-match-actions">
              <button type="button" className="secondary-button" onClick={() => {
                setMultiDestinationStep("item");
                setMultiDestinationMatchSearchOpen(true);
              }}>
                Change match
              </button>
              <button type="button" className="ghost-button" onClick={clearMultiDestinationCatalogProduct}>
                Clear match
              </button>
            </div>
          </div>
        ) : null}
        <div className="multi-destination-wizard-stepper" aria-label="Add item progress">
          {MULTI_DESTINATION_STEPS.map((step, index) => (
            <span
              key={step}
              className={`wizard-step-pill ${index === currentStepIndex ? "is-active" : ""} ${index < currentStepIndex ? "is-complete" : ""} ${stepHasVisibleError(step) ? "has-error" : ""}`}
            >
              <small>{index + 1}</small>
              {MULTI_DESTINATION_STEP_LABELS[step]}
              {stepHasVisibleError(step) ? <em>Needs info</em> : null}
            </span>
          ))}
        </div>
        {validationErrorSummary ? (
          <div className="validation-summary" role="alert" aria-live="polite">
            <strong>{validationErrorSummary}</strong>
            <ul>
              {visibleValidationErrors.map((error) => (
                <li key={`${error.step}-${error.field}`}>
                  <span>{error.label}: {error.message}</span>
                  <button type="button" className="ghost-button" onClick={() => focusMultiDestinationValidationError(error)}>
                    Go to {error.stepLabel}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {multiDestinationStep === "item" ? (
        <section className="flow-form-section">
          <div className="add-item-step-heading">
            <h3>Select the item first</h3>
            <p>Search Market Watch, pick a recent item, or use manual add when the product is not in the catalog yet. You will choose Vault, Forge, Wishlist, or Market Watch on the next step.</p>
          </div>
          <div className="flow-form-grid">
            <div className="catalog-selector-panel add-item-search-panel">
              {selectedCatalog && !multiDestinationMatchSearchOpen ? (
                <div className="selected-product-card selected-match-card">
                  <div className="catalog-thumb selected-match-thumb">
                    {catalogImage(selectedCatalog) ? (
                      <>
                        <img
                          src={catalogImage(selectedCatalog)}
                          alt=""
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                            event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                          }}
                        />
                        {renderProductImageFallback(selectedCatalog, { hidden: true })}
                      </>
                    ) : renderProductImageFallback(selectedCatalog)}
                  </div>
                  <div className="selected-match-copy">
                    <span className="neon-chip add-item-selected-chip">Selected item</span>
                    <strong>{catalogTitle(selectedCatalog)}</strong>
                    <span>{catalogExpansionName(selectedCatalog) || "Expansion unavailable"} | {catalogProductTypeLabel(selectedCatalog)}</span>
                    <small>{hasCatalogMarketPrice(selectedCatalog) ? `Market: ${money(getTideTradrMarketInfo(selectedCatalog).currentMarketValue)}` : "Market data unavailable"}</small>
                  </div>
                  <div className="selected-match-actions">
                    <button type="button" className="secondary-button" onClick={() => setMultiDestinationMatchSearchOpen(true)}>
                      Change match
                    </button>
                    <button type="button" className="ghost-button" onClick={clearMultiDestinationCatalogProduct}>
                      Clear match
                    </button>
                  </div>
                </div>
              ) : manualModeActive ? (
                <div className="selected-product-card selected-match-card manual-selected-card">
                  <div className="catalog-thumb selected-match-thumb manual-selected-thumb">
                    <span>Manual</span>
                  </div>
                  <div className="selected-match-copy">
                    <span className="neon-chip add-item-selected-chip">Manual item</span>
                    <strong>{multiDestinationForm.itemName || "Manual item"}</strong>
                    <span>{[multiDestinationForm.productType || "Type not set", multiDestinationForm.setName || "Set optional"].filter(Boolean).join(" | ")}</span>
                    <small>{multiDestinationForm.upcSku ? `UPC/SKU: ${multiDestinationForm.upcSku}` : "You can add UPC/SKU, price, and notes below."}</small>
                  </div>
                  <div className="selected-match-actions">
                    <button type="button" className="secondary-button" onClick={() => setMultiDestinationMatchSearchOpen(true)}>
                      Search catalog
                    </button>
                    <button type="button" className="ghost-button" onClick={() => {
                      setMultiDestinationMatchSearchOpen(true);
                      setMultiDestinationCatalogQuery("");
                      updateMultiDestinationField("itemName", "");
                    }}>
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="add-item-search-card">
                    <Field label="Search product, set, UPC, or SKU">
                      <LazySmartCatalogSearchBox
                        value={multiDestinationCatalogQuery}
                        onChange={(value) => {
                          setMultiDestinationMessage("");
                          setMultiDestinationCatalogQuery(value);
                        }}
                        onSearch={runMultiDestinationCatalogSearch}
                        onSelectSuggestion={selectMultiDestinationCatalogSuggestion}
                        supabase={supabase}
                        isSupabaseConfigured={isSupabaseConfigured}
                        mapRow={mapCatalog}
                        productGroup="All"
                        dataFilter="All"
                        placeholder="Search product, set, UPC, or SKU"
                        maxSuggestions={8}
                        inputClassName="add-item-search-input"
                        localCatalogProducts={catalogProducts}
                        autoFocus
                        inputLabel="Search product, set, UPC, or SKU"
                        inlineResults
                        emptyMessage="No Market Watch match found. Try fewer words, a UPC/SKU, or add it manually."
                        renderEmptyActions={() => (
                          <div className="catalog-selector-actions">
                            <button type="button" className="secondary-button" onClick={() => startMultiDestinationManualEntry()}>
                              Can't find it? Add manually
                            </button>
                            <button type="button" onClick={markMultiDestinationMissingCatalog}>
                              Suggest Missing Product
                            </button>
                          </div>
                        )}
                        money={money}
                      />
                    </Field>
                    <p className="compact-subtitle">Partial names, set names, UPCs, SKUs, and sealed-product terms work here. {AI_REVIEW_DISCLAIMER}</p>
                  </div>
                  {!itemSearchQuery ? (
                    <div className="add-item-picker-start">
                      <div className="add-item-quick-section">
                        <span>Common sealed searches</span>
                        <div className="catalog-chip-row add-item-chip-row">
                          {ADD_ITEM_QUICK_SEARCH_CHIPS.map((value) => (
                            <button key={value} type="button" className="secondary-button" onClick={() => runMultiDestinationCatalogSearch(value)}>
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>
                      {recentAddItems.length ? (
                        <div className="add-item-quick-section">
                          <span>Recently added</span>
                          <div className="add-item-recent-grid">
                            {recentAddItems.map((item) => (
                              <button key={item.id || item.name || item.itemName} type="button" className="add-item-recent-card" onClick={() => selectRecentMultiDestinationItem(item)}>
                                <strong>{item.name || item.itemName || item.catalogProductName}</strong>
                                <small>{[item.productType, item.setName || item.expansion, item.barcode || item.upc || item.sku].filter(Boolean).join(" | ") || "Copy item details"}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {itemSearchQuery && itemSearchResults.length ? (
                    <div className="add-item-results-block">
                      <div className="add-item-results-heading">
                        <strong>Best matches</strong>
                        <span>{itemSearchResults.length} result{itemSearchResults.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="catalog-selector-results">
                        {itemSearchResults.map((product) => renderCatalogPickerCard(product, selectMultiDestinationCatalogProduct))}
                      </div>
                    </div>
                  ) : null}
                  {itemSearchQuery && supabaseCatalogStatus.loading ? (
                    <div className="small-empty-state add-item-search-status">
                      <strong>Searching Market Watch...</strong>
                      <span>Looking for product names, sets, UPCs, SKUs, and sealed-product terms.</span>
                    </div>
                  ) : null}
                  {itemSearchQuery && !supabaseCatalogStatus.loading && !itemSearchResults.length ? (
                    <div className="empty-state small-empty-state add-item-no-results">
                      <h3>Can&apos;t find item?</h3>
                      <p>Try a shorter search like ETB, tin, booster bundle, a set name, UPC, or SKU. If it still is not there, add it manually now or suggest it for admin catalog review.</p>
                      <div className="catalog-chip-row add-item-chip-row" aria-label="Alternate catalog search terms">
                        {ADD_ITEM_NO_RESULT_HINTS.map((hint) => {
                          const value = hint.replace(/^Try\s+/i, "").replace(/\s+instead of.*$/i, "");
                          return (
                            <button key={hint} type="button" className="secondary-button" onClick={() => runMultiDestinationCatalogSearch(value)}>
                              {hint}
                            </button>
                          );
                        })}
                      </div>
                      <div className="catalog-selector-actions">
                        <button type="button" className="secondary-button" onClick={() => startMultiDestinationManualEntry({ itemName: multiDestinationCatalogQuery })}>
                          Can't find it? Add manually
                        </button>
                        <button type="button" onClick={markMultiDestinationMissingCatalog}>
                          Suggest Missing Product
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="catalog-selector-actions match-tools">
                    <button type="button" className="secondary-button manual-add-fallback-card" onClick={() => startMultiDestinationManualEntry()}>
                      Manual Add
                    </button>
                    <button type="button" className="secondary-button" onClick={() => {
                      setMultiDestinationForm((current) => ({
                        ...current,
                        destinations: destinationDefaults({ wishlist: true }),
                        wishlist: {
                          ...current.wishlist,
                          workspaceId: current.wishlist?.workspaceId || defaultWorkspaceIdForDestination("wishlist"),
                        },
                      }));
                      setMultiDestinationMatchSearchOpen(false);
                    }}>
                      Add Wishlist Item
                    </button>
                    <button type="button" className="secondary-button" onClick={() => {
                      const query = String(multiDestinationCatalogQuery || multiDestinationForm.itemName || multiDestinationForm.upcSku || "").trim();
                      if (!query) {
                        setVaultToast("Enter a product name, UPC, SKU, or visible text first.");
                        return;
                      }
                      const matches = getBestCatalogMatches(query, catalogProducts).slice(0, 5);
                      const summary = buildAiCatalogMatchSummary({ query, matches });
                      void showAiSuggestion(AI_FEATURE_AREAS.CATALOG_MATCH, summary);
                    }}>
                      Suggest matches
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void runItemIdentificationAssist(multiDestinationCatalogQuery || multiDestinationForm.itemName || multiDestinationForm.upcSku)}>
                      Help identify item
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void runVariantAssist(multiDestinationForm.variant || multiDestinationForm.itemName)}>
                      Explain variants
                    </button>
                    <button type="button" className="secondary-button" onClick={() => {
                      const lookup = String(multiDestinationForm.upcSku || multiDestinationCatalogQuery || "").trim();
                      if (lookup) {
                        runMultiDestinationCatalogSearch(lookup, { mode: "barcode", barcode: lookup });
                      }
                    }}>
                      Enter UPC/SKU
                    </button>
                    <button type="button" className="secondary-button" onClick={() => {
                      closeFlowModal({ force: true, reset: false });
                      openVaultScanFlow();
                    }}>
                      Scan Product/Card
                    </button>
                    <button type="button" className="secondary-button" onClick={() => {
                      const destination = multiDestinationForm.destinations.forge ? "forge" : multiDestinationForm.destinations.wishlist ? "wishlist" : multiDestinationForm.destinations.vault ? "vault" : "none";
                      closeFlowModal({ force: true, reset: false });
                      openPictureLookupFlow(destination);
                    }}>
                      Photo Lookup
                    </button>
                    {selectedCatalog ? (
                      <button type="button" className="secondary-button" onClick={() => setMultiDestinationMatchSearchOpen(false)}>
                        Done
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            <Field label="Item Name" fieldId="item-name" error={fieldError("item-name")}>
              <input
                value={multiDestinationForm.itemName}
                onChange={(event) => updateMultiDestinationField("itemName", event.target.value)}
                placeholder="Destined Rivals Elite Trainer Box"
                required
              />
            </Field>
            <Field label="Type / Category">
              <input
                value={multiDestinationForm.productType}
                onChange={(event) => updateMultiDestinationField("productType", event.target.value)}
                placeholder={addFlowIsCard ? "Single Card, Graded Card..." : "Elite Trainer Box, Booster Bundle, Tin..."}
              />
            </Field>
            <Field label="Set / Expansion if known">
              <input
                value={multiDestinationForm.setName}
                onChange={(event) => updateMultiDestinationField("setName", event.target.value)}
                placeholder="Prismatic Evolutions, 151, Surging Sparks..."
              />
            </Field>
            {addFlowIsCard ? (
              <Field label="Variant">
                <input
                  value={multiDestinationForm.variant}
                  onChange={(event) => updateMultiDestinationField("variant", event.target.value)}
                  placeholder="Normal, Holofoil, Reverse Holofoil, promo..."
                />
              </Field>
            ) : null}
            <Field label="UPC / SKU if known">
              <input
                value={multiDestinationForm.upcSku}
                onChange={(event) => updateMultiDestinationField("upcSku", event.target.value)}
                placeholder="UPC, retail SKU, or other identifier"
              />
            </Field>
            {!addFlowIsCard ? (
              <Field label={addFlowIsSealed ? "MSRP" : "Retail Price / MSRP"}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={multiDestinationForm.msrpPrice}
                  onChange={(event) => updateMultiDestinationField("msrpPrice", event.target.value)}
                  placeholder="0.00"
                />
              </Field>
            ) : null}
            <Field label="Market Price">
              <input
                type="number"
                min="0"
                step="0.01"
                value={multiDestinationForm.marketPrice}
                onChange={(event) => updateMultiDestinationField("marketPrice", event.target.value)}
                placeholder="0.00"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={multiDestinationForm.notes}
              onChange={(event) => updateMultiDestinationField("notes", event.target.value)}
              placeholder="Condition notes, source notes, or anything the destination should remember."
            />
          </Field>
        </section>
        ) : null}

        {multiDestinationStep === "destination" ? (
        <section className="flow-form-section">
          <h3>Destinations</h3>
          <div className="quick-add-destination-helper">
            <strong>Where should this item go?</strong>
            <span>{marketAddFlowActive ? "Review before saving. Choose the destination now, then correct quantity, owner, notes, price, and source details before submit." : "Vault is for your collection. Forge is for business inventory. Wishlist and Market Watch are optional tracking destinations."}</span>
          </div>
          {fieldError("destination") ? (
            <p className="field-error destination-field-error" role="alert" data-validation-field="destination">
              {fieldError("destination")}
            </p>
          ) : null}
          {fieldError("forge-workspace") ? (
            <p className="field-error destination-field-error" role="alert" data-validation-field="forge-workspace">
              {fieldError("forge-workspace")}
            </p>
          ) : null}
          {marketAddFlowActive ? (
            <div className="market-add-destination-presets" aria-label="Common Market add destinations">
              <button type="button" className={multiDestinationForm.destinations.vault && !multiDestinationForm.destinations.forge && !multiDestinationForm.destinations.wishlist ? "active" : ""} onClick={() => applyDestinationPreset("vault")}>Add to Vault</button>
              <button type="button" className={multiDestinationForm.destinations.forge && !multiDestinationForm.destinations.vault ? "active" : ""} disabled={!activeForgeWorkspace} onClick={() => applyDestinationPreset("forge")}>Add to Forge</button>
              <button type="button" className={multiDestinationForm.destinations.vault && multiDestinationForm.destinations.forge ? "active" : ""} disabled={!activeForgeWorkspace} onClick={() => applyDestinationPreset("both")}>Add to both</button>
              <button type="button" className={multiDestinationForm.destinations.wishlist || multiDestinationForm.destinations.tidetradr ? "active" : ""} onClick={() => applyDestinationPreset("watch")}>Wishlist / Watch</button>
            </div>
          ) : null}
          <div className={`destination-checkbox-grid ${fieldError("destination") ? "has-error" : ""}`}>
            {destinationOptions.map((option) => {
              const checked = Boolean(multiDestinationForm.destinations[option.key]);
              return (
                <label className={`destination-checkbox ${checked ? "is-selected" : ""} ${option.disabled ? "is-disabled" : ""} ${fieldError("destination") ? "has-error" : ""}`} key={option.key}>
                  <input type="checkbox" checked={checked} disabled={option.disabled} onChange={(event) => updateMultiDestinationToggle(option.key, event.target.checked)} />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.helper}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
        ) : null}

        {multiDestinationStep === "details" ? (
        <>
        {multiDestinationForm.destinations.vault ? (
          <section className="flow-form-section destination-settings">
            <h3>Vault Settings</h3>
            <div className="flow-form-grid">
              {renderDestinationWorkspaceField("vault", "Vault Workspace")}
              <Field label="Quantity for Vault" fieldId="vault-quantity" error={fieldError("vault-quantity")}>
                <input aria-invalid={Boolean(fieldError("vault-quantity"))} type="number" min="1" value={multiDestinationForm.vault.quantity} onChange={(event) => updateMultiDestinationSection("vault", "quantity", event.target.value)} />
              </Field>
              <Field label="Status / Location">
                <select value={multiDestinationForm.vault.vaultStatus} onChange={(event) => updateMultiDestinationSection("vault", "vaultStatus", event.target.value)}>
                  {VAULT_STATUS_OPTIONS.filter((status) => status.value !== "all").map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Collection Category">
                <input value={multiDestinationForm.vault.vaultCategory} onChange={(event) => updateMultiDestinationSection("vault", "vaultCategory", event.target.value)} />
              </Field>
              <Field label="Cost Basis" fieldId="vault-unit-cost" error={fieldError("vault-unit-cost")} help={INFO_TOOLTIP_COPY.costBasis}>
                <input aria-invalid={Boolean(fieldError("vault-unit-cost"))} type="number" min="0" step="0.01" value={multiDestinationForm.vault.unitCost} onChange={(event) => updateMultiDestinationSection("vault", "unitCost", event.target.value)} placeholder="Optional" />
              </Field>
              <PurchaserSelect
                label="Who owns or paid?"
                purchasers={purchasersForWorkspace(multiDestinationForm.vault.workspaceId || activeWorkspace?.id)}
                valueId={multiDestinationForm.vault.purchaserId}
                valueName={multiDestinationForm.vault.purchaserName}
                onSelect={(purchaser) => {
                  updateMultiDestinationSection("vault", "purchaserId", purchaser?.id || "");
                  updateMultiDestinationSection("vault", "purchaserName", purchaser?.name || "");
                }}
                onCreatePurchaser={(name, note, type) => addPurchaserName(name, { note, type, workspaceId: multiDestinationForm.vault.workspaceId || activeWorkspace?.id })}
                onManagePurchasers={() => openPurchaserManager(multiDestinationForm.vault.workspaceId || activeWorkspace?.id)}
                help={INFO_TOOLTIP_COPY.ownerPerson}
              />
              <Field label="Purchase Date">
                <input type="date" value={multiDestinationForm.vault.purchaseDate} onChange={(event) => updateMultiDestinationSection("vault", "purchaseDate", event.target.value)} />
              </Field>
              <Field label="Storage Location">
                <input value={multiDestinationForm.vault.storageLocation} onChange={(event) => updateMultiDestinationSection("vault", "storageLocation", event.target.value)} placeholder="Binder, shelf, box, display case..." />
              </Field>
              <Field label="Vault Notes">
                <textarea value={multiDestinationForm.vault.notes} onChange={(event) => updateMultiDestinationSection("vault", "notes", event.target.value)} placeholder="Owned item notes for Vault only." />
              </Field>
            </div>
          </section>
        ) : null}

        {multiDestinationForm.destinations.wishlist ? (
          <section className="flow-form-section destination-settings">
            <h3>Wishlist Settings</h3>
            <p className="compact-subtitle">
              Wishlist quantity is wanted quantity only. It does not count as owned Vault inventory or collection value.
            </p>
            <div className="flow-form-grid">
              {renderDestinationWorkspaceField("wishlist", "Wishlist Workspace")}
              <Field label="Quantity Wanted" fieldId="wishlist-quantity" error={fieldError("wishlist-quantity")}>
                <input aria-invalid={Boolean(fieldError("wishlist-quantity"))} type="number" min="1" value={multiDestinationForm.wishlist.quantity} onChange={(event) => updateMultiDestinationSection("wishlist", "quantity", event.target.value)} />
              </Field>
              <Field label="Priority">
                <select value={multiDestinationForm.wishlist.priority} onChange={(event) => updateMultiDestinationSection("wishlist", "priority", event.target.value)}>
                  {["Low", "Medium", "High", "Grail"].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </Field>
              <Field label="Target Price" fieldId="wishlist-target-price" error={fieldError("wishlist-target-price")}>
                <input aria-invalid={Boolean(fieldError("wishlist-target-price"))} type="number" min="0" step="0.01" value={multiDestinationForm.wishlist.targetPrice} onChange={(event) => updateMultiDestinationSection("wishlist", "targetPrice", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Desired Condition">
                <select value={multiDestinationForm.wishlist.desiredCondition} onChange={(event) => updateMultiDestinationSection("wishlist", "desiredCondition", event.target.value)}>
                  <option value="">Any condition</option>
                  {VAULT_CONDITIONS.filter(Boolean).map((condition) => (
                    <option key={condition} value={condition}>{condition}</option>
                  ))}
                </select>
              </Field>
              <Field label="Wishlist Notes">
                <textarea value={multiDestinationForm.wishlist.notes} onChange={(event) => updateMultiDestinationSection("wishlist", "notes", event.target.value)} placeholder="Why you want it, preferred edition, gift idea, etc." />
              </Field>
              <div className="flow-checkbox-stack">
                <label>
                  <input type="checkbox" checked={Boolean(multiDestinationForm.wishlist.alertMarketPrice)} onChange={(event) => updateMultiDestinationSection("wishlist", "alertMarketPrice", event.target.checked)} />
                  <span>Alert / watch market price when supported</span>
                </label>
                <label>
                  <input type="checkbox" checked={Boolean(multiDestinationForm.wishlist.addToMarketWatch)} onChange={(event) => updateMultiDestinationSection("wishlist", "addToMarketWatch", event.target.checked)} />
                  <span>Add to Market Watch if this item is linked to a catalog product</span>
                </label>
              </div>
            </div>
          </section>
        ) : null}

        {multiDestinationForm.destinations.forge ? (
          <section className="flow-form-section destination-settings">
            <h3>Forge Settings</h3>
            <div className="flow-form-grid">
              {renderDestinationWorkspaceField("forge", "Forge Workspace")}
              <Field label="Quantity for Forge" fieldId="forge-quantity" error={fieldError("forge-quantity")}>
                <input aria-invalid={Boolean(fieldError("forge-quantity"))} type="number" min="1" value={multiDestinationForm.forge.quantity} onChange={(event) => updateMultiDestinationSection("forge", "quantity", event.target.value)} />
              </Field>
              <Field label="Cost Basis" fieldId="forge-unit-cost" error={fieldError("forge-unit-cost")} help={INFO_TOOLTIP_COPY.costBasis}>
                <input aria-invalid={Boolean(fieldError("forge-unit-cost"))} type="number" min="0" step="0.01" value={multiDestinationForm.forge.unitCost} onChange={(event) => updateMultiDestinationSection("forge", "unitCost", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Planned Sell Price" fieldId="forge-planned-sell-price" error={fieldError("forge-planned-sell-price")} help={INFO_TOOLTIP_COPY.plannedSalePrice}>
                <input aria-invalid={Boolean(fieldError("forge-planned-sell-price"))} type="number" min="0" step="0.01" value={multiDestinationForm.forge.plannedSellPrice} onChange={(event) => updateMultiDestinationSection("forge", "plannedSellPrice", event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Source / Purchase Location">
                <input value={multiDestinationForm.forge.source} onChange={(event) => updateMultiDestinationSection("forge", "source", event.target.value)} placeholder="Target, Best Buy, show, trade..." />
              </Field>
              <PurchaserSelect
                label="Who paid?"
                purchasers={purchasersForWorkspace(forgeDestinationWorkspaceId || activeForgeWorkspace?.id)}
                valueId={multiDestinationForm.forge.purchaserId}
                valueName={multiDestinationForm.forge.purchaserName}
                onSelect={(purchaser) => {
                  updateMultiDestinationSection("forge", "purchaserId", purchaser?.id || "");
                  updateMultiDestinationSection("forge", "purchaserName", purchaser?.name || "");
                }}
                onCreatePurchaser={(name, note, type) => addPurchaserName(name, { note, type, workspaceId: forgeDestinationWorkspaceId || activeForgeWorkspace?.id })}
                onManagePurchasers={() => openPurchaserManager(forgeDestinationWorkspaceId || activeForgeWorkspace?.id)}
              />
              <Field label="Where is this inventory?" fieldId="forge-physical-location" error={fieldError("forge-physical-location")}>
                <select aria-invalid={Boolean(fieldError("forge-physical-location"))} value={multiDestinationForm.forge.physicalLocation || DEFAULT_FORGE_PHYSICAL_LOCATION} onChange={(event) => updateMultiDestinationSection("forge", "physicalLocation", event.target.value)}>
                  {FORGE_PHYSICAL_LOCATION_OPTIONS.map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
              </Field>
              {multiDestinationForm.forge.physicalLocation === "Other" ? (
                <Field label="Custom location notes">
                  <input value={multiDestinationForm.forge.physicalLocationNotes || ""} onChange={(event) => updateMultiDestinationSection("forge", "physicalLocationNotes", event.target.value)} placeholder="Black tote 2, back office, partner shelf..." />
                </Field>
              ) : null}
              <Field label="Business Category">
                <input value={multiDestinationForm.forge.businessCategory} onChange={(event) => updateMultiDestinationSection("forge", "businessCategory", event.target.value)} />
              </Field>
              <Field label="Condition">
                <select value={multiDestinationForm.forge.conditionName} onChange={(event) => updateMultiDestinationSection("forge", "conditionName", event.target.value)}>
                  <option value="">Near Mint / Sealed by default</option>
                  {VAULT_CONDITIONS.filter(Boolean).map((condition) => (
                    <option key={condition} value={condition}>{condition}</option>
                  ))}
                </select>
              </Field>
              <Field label="Forge Notes">
                <textarea value={multiDestinationForm.forge.notes} onChange={(event) => updateMultiDestinationSection("forge", "notes", event.target.value)} placeholder="Business inventory notes for Forge only." />
              </Field>
            </div>
          </section>
        ) : null}

        {multiDestinationForm.destinations.tidetradr ? (
          <section className="flow-form-section destination-settings">
            <h3>Market Watch Settings</h3>
            <p className="compact-subtitle">
              Market Watch is catalog and market data. Normal users submit new universal catalog items for review; admins can create directly.
            </p>
            <div className="flow-form-grid">
              <div className="selected-product-card tide-tradr-link-card">
                <div>
                  <strong>{selectedCatalog ? "Link to existing Market Watch product" : "Suggest missing product"}</strong>
                  <span>{selectedCatalog ? catalogTitle(selectedCatalog) : "No existing product selected. Search Product / Card Match above to link one."}</span>
                </div>
                {selectedCatalog ? (
                  <button type="button" className="secondary-button" onClick={clearMultiDestinationCatalogProduct}>
                    Clear
                  </button>
                ) : (
                  <button type="button" className="secondary-button" onClick={markMultiDestinationMissingCatalog}>
                    Use as suggestion
                  </button>
                )}
              </div>
              {!addFlowIsCard ? (
                <Field label="MSRP" fieldId="tidetradr-msrp" error={fieldError("tidetradr-msrp")}>
                  <input aria-invalid={Boolean(fieldError("tidetradr-msrp"))} type="number" min="0" step="0.01" value={multiDestinationForm.tidetradr.msrpPrice} onChange={(event) => updateMultiDestinationSection("tidetradr", "msrpPrice", event.target.value)} placeholder="Optional" />
                </Field>
              ) : null}
              <Field label="UPC">
                <input value={multiDestinationForm.tidetradr.upc} onChange={(event) => updateMultiDestinationSection("tidetradr", "upc", event.target.value)} />
              </Field>
              <Field label="SKU">
                <input value={multiDestinationForm.tidetradr.sku} onChange={(event) => updateMultiDestinationSection("tidetradr", "sku", event.target.value)} />
              </Field>
              <Field label="Set / Expansion">
                <input value={multiDestinationForm.tidetradr.setName} onChange={(event) => updateMultiDestinationSection("tidetradr", "setName", event.target.value)} />
              </Field>
              <Field label="Product Type">
                <input value={multiDestinationForm.tidetradr.productType} onChange={(event) => updateMultiDestinationSection("tidetradr", "productType", event.target.value)} />
              </Field>
              <Field label="Release Date / Year">
                <input value={multiDestinationForm.tidetradr.releaseDate} onChange={(event) => updateMultiDestinationSection("tidetradr", "releaseDate", event.target.value)} placeholder="2026-05-30 or 2026" />
              </Field>
              <Field label="Source / Proof URL">
                <input value={multiDestinationForm.tidetradr.sourceUrl} onChange={(event) => updateMultiDestinationSection("tidetradr", "sourceUrl", event.target.value)} placeholder="Official, retailer, or price source URL" />
              </Field>
              <Field label="Correction Notes">
                <textarea value={multiDestinationForm.tidetradr.correctionNotes} onChange={(event) => updateMultiDestinationSection("tidetradr", "correctionNotes", event.target.value)} placeholder="What should Market Watch/admin review?" />
              </Field>
            </div>
          </section>
        ) : null}
        {!selectedDestinationOptions.length ? (
          <section className="flow-form-section destination-settings">
            <h3>No destination selected</h3>
            <p className="compact-subtitle">Go back to Choose Where and select Forge, Vault, Wishlist, or Market Watch before adding details.</p>
          </section>
        ) : null}
        </>
        ) : null}

        {multiDestinationStep === "review" ? (
          <section className="flow-form-section wizard-review-section">
            <h3>Review and Add</h3>
            {marketAddFlowActive ? (
              <div className="market-review-add-card">
                <div className="catalog-thumb market-review-add-thumb">
                  {selectedCatalog && catalogImage(selectedCatalog) ? (
                    <>
                      <img
                        src={catalogImage(selectedCatalog)}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                        }}
                      />
                      {renderProductImageFallback(selectedCatalog, { hidden: true })}
                    </>
                  ) : selectedCatalog ? renderProductImageFallback(selectedCatalog) : <span className="market-card-thumb-placeholder">Manual</span>}
                </div>
                <div className="market-review-add-copy">
                  <span className="neon-chip">Review before saving.</span>
                  <strong>{multiDestinationForm.itemName || selectedItemSummary}</strong>
                  <span>{[multiDestinationForm.setName || selectedCatalog && catalogExpansionName(selectedCatalog) || "Set unknown", selectedCatalog?.cardNumber || multiDestinationForm.cardNumber ? `#${selectedCatalog?.cardNumber || multiDestinationForm.cardNumber}` : "", multiDestinationForm.variant || "Variant unknown"].filter(Boolean).join(" | ")}</span>
                  <small>{[marketAddTypeLabel, selectedCatalogMarketText, selectedCatalogMarketSourceText].filter(Boolean).join(" | ")}</small>
                  <small>{multiDestinationForm.notes ? `Notes: ${multiDestinationForm.notes}` : "Notes can be added before saving."}</small>
                </div>
              </div>
            ) : null}
            {marketAddFlowActive && marketAddSetSummary ? (
              <div className="market-set-mastery-context">
                <div>
                  <strong>Set Mastery context</strong>
                  <span>{marketAddSetSummary.name} - {marketAddSetSummary.checklistAvailable ? "Checklist available" : "Missing count needs checklist data."}</span>
                </div>
                {marketAddSetCanOpen ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      closeFlowModal({ force: true, reset: false });
                      setActiveTab("vault");
                      setVaultSubTab("sets");
                      openVaultSetSummary(marketAddSetSummary);
                    }}
                  >
                    View Set
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="wizard-review-grid">
              <div className="wizard-summary-card">
                <span>Item</span>
                <strong>{selectedItemSummary}</strong>
                <small>
                  {[multiDestinationForm.productType || selectedCatalog?.productType || "Type not set", multiDestinationForm.variant, multiDestinationForm.marketPrice ? `Market ${money(Number(multiDestinationForm.marketPrice))}` : ""].filter(Boolean).join(" | ")}
                </small>
              </div>
              <div className="wizard-summary-card">
                <span>Destination</span>
                <strong>{selectedDestinationOptions.length ? selectedDestinationOptions.map((option) => option.title).join(", ") : "Missing"}</strong>
                <small>{selectedDestinationOptions.length ? "Only selected destination fields will be saved." : "Choose where this item belongs before saving."}</small>
              </div>
              {multiDestinationForm.destinations.forge ? (
                <div className="wizard-summary-card">
                  <span>Forge</span>
                  <strong>Qty {multiDestinationForm.forge.quantity || 1}</strong>
                  <small>{[multiDestinationForm.forge.source, multiDestinationForm.forge.physicalLocation || DEFAULT_FORGE_PHYSICAL_LOCATION, multiDestinationForm.forge.unitCost ? `Cost ${money(Number(multiDestinationForm.forge.unitCost))}` : "", multiDestinationForm.forge.plannedSellPrice ? `List ${money(Number(multiDestinationForm.forge.plannedSellPrice))}` : ""].filter(Boolean).join(" | ") || "Business inventory draft"}</small>
                </div>
              ) : null}
              {multiDestinationForm.destinations.vault ? (
                <div className="wizard-summary-card">
                  <span>Vault</span>
                  <strong>Qty {multiDestinationForm.vault.quantity || 1}</strong>
                  <small>{[vaultStatusLabel(multiDestinationForm.vault.vaultStatus), multiDestinationForm.vault.purchaserName ? `Owner ${multiDestinationForm.vault.purchaserName}` : "", multiDestinationForm.vault.storageLocation, multiDestinationForm.vault.unitCost ? `Cost ${money(Number(multiDestinationForm.vault.unitCost))}` : ""].filter(Boolean).join(" | ")}</small>
                </div>
              ) : null}
              {multiDestinationForm.destinations.wishlist ? (
                <div className="wizard-summary-card">
                  <span>Wishlist</span>
                  <strong>{multiDestinationForm.wishlist.priority || "Medium"} priority</strong>
                  <small>{[multiDestinationForm.wishlist.quantity ? `Wanted ${multiDestinationForm.wishlist.quantity}` : "", multiDestinationForm.wishlist.targetPrice ? `Target ${money(Number(multiDestinationForm.wishlist.targetPrice))}` : "", multiDestinationForm.wishlist.desiredCondition || "Any condition"].filter(Boolean).join(" | ")}</small>
                </div>
              ) : null}
              {multiDestinationForm.destinations.tidetradr ? (
                <div className="wizard-summary-card">
                  <span>Market Watch</span>
                  <strong>{selectedCatalog ? "Add to watchlist" : adminToolsVisible ? "Create catalog item" : "Submit suggestion"}</strong>
                  <small>{multiDestinationForm.tidetradr.sourceUrl || "Market details can be completed later."}</small>
                </div>
              ) : null}
            </div>
            {reviewValidationErrors.length ? (
              <p className="flow-inline-message is-warning" role="alert">Review needs {reviewValidationErrors.length} fix{reviewValidationErrors.length === 1 ? "" : "es"} before saving.</p>
            ) : (
              <p className="flow-inline-message is-info" role="status">Review before saving. Use Save and Add More to keep this wizard open for another item.</p>
            )}
          </section>
        ) : null}

        {multiDestinationMessage ? (
          <p className={`flow-inline-message ${/could not|choose|enter|required|must/i.test(multiDestinationMessage) ? "is-warning" : "is-info"}`} role="status">
            {multiDestinationMessage}
          </p>
        ) : null}
      </form>
    );
  }

  return renderMultiDestinationAddFlowContent();
}
