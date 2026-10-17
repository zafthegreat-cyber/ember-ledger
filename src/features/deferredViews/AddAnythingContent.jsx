import "./add-anything.css";

// App owns state, authority and handlers; only this existing renderer is deferred.
export default function AddAnythingContent({ scope }) {
  const {
    ADD_ITEM_QUICK_SEARCH_CHIPS,
    CollectorShowcaseCard,
    CommandGlyphIcon,
    Field,
    LazySmartCatalogSearchBox,
    MARKET_SEARCH_CATEGORIES,
    MARKET_SEARCH_TYPE_SCOPES,
    OWNED_ITEM_PURPOSES,
    POKEMON_SETS,
    PurchaserSelect,
    SCOUT_PRODUCT_CATEGORY_OPTIONS,
    activeForgeWorkspace,
    activeWorkspace,
    addPurchaserName,
    appendScoutScanItemCategory,
    catalogExpansionName,
    catalogImage,
    catalogPageSize,
    catalogProductTypeLabel,
    catalogProducts,
    catalogTitle,
    closeFlowModal,
    collectorVisualTypeLabel,
    createQuickAddCardScanRow,
    createQuickAddWizardState,
    detectCollectorItemVisualType,
    getCatalogIdentifiers,
    getCatalogPickerResults,
    getTideTradrMarketInfo,
    handleQuickAddPhotoFile,
    hasCatalogMarketPrice,
    isLikelyBarcodeValue,
    isSupabaseConfigured,
    loadImportedPokemonCatalog,
    mapCatalog,
    money,
    normalizeBarcodeValue,
    openFlipScoutView,
    openProductAddFlow,
    openPurchaserManager,
    openQuickAddManualItemFlow,
    openQuickAddManualReview,
    openQuickAddMissingProduct,
    openQuickAddReviewForProduct,
    openReceiptAddItemFlow,
    openReceiptCreateExpense,
    openReceiptDetail,
    openScoutReportDetail,
    openSparkKidPackFlow,
    ownerFeatureControls,
    quickAddScoutScanMissingFields,
    quickAddScoutScanValidation,
    quickAddSellerToolsEnabled,
    quickAddWizard,
    renderProductImageFallback,
    runAddSheetAction,
    runScoutScanExtractionFromText,
    saveQuickAddBasicReceipt,
    saveQuickAddScoutScanReport,
    setQuickAddPath,
    setQuickAddWizard,
    sharedPeopleOptions,
    supabase,
    updateQuickAddWizard,
  } = scope;

  function renderAddAnythingFlowContent() {
    const quickAddScreen = quickAddWizard.screen || "entry";
    const searchQuery = String(quickAddWizard.query || "").trim();
    const upcQuery = String(quickAddWizard.upcQuery || "").trim();
    const searchResults = searchQuery ? getCatalogPickerResults(searchQuery, 8) : [];
    const upcResults = upcQuery ? getCatalogPickerResults(upcQuery, 8) : [];
    const sellerQuickAddActive = quickAddSellerToolsEnabled();
    const destinationOptions = [
      { value: "vault", label: "Vault", helper: "Personal collection" },
      ...(sellerQuickAddActive && activeForgeWorkspace ? [{ value: "forge", label: "Forge", helper: "Seller inventory" }] : []),
      ...(sellerQuickAddActive && activeForgeWorkspace ? [{ value: "both", label: "Both", helper: "Vault and Forge" }] : []),
      { value: "wishlist", label: "Wishlist/Watch", helper: "Track for later" },
    ];
    const comingLaterScanModes = [
      { key: "card", title: "Scan Card", helper: "Card image matching is coming later.", icon: "scan", tone: "search" },
      { key: "binder", title: "Scan Binder", helper: "Binder intake is coming later.", icon: "vault", tone: "vault" },
      { key: "slab", title: "Scan Slab", helper: "Slab intake is coming later.", icon: "grade", tone: "warning" },
      { key: "receipt", title: "Scan Receipt", helper: "Receipt parsing is coming later.", icon: "receipt", tone: "forge" },
    ];
    const runSearch = (value = quickAddWizard.query) => {
      const query = String(value || "").trim();
      if (!query) {
        updateQuickAddWizard({ message: "Enter a product, set, UPC, SKU, or card name." });
        return;
      }
      updateQuickAddWizard({ query, message: "" });
      const normalizedCode = normalizeBarcodeValue(query);
      const exactIdentifier = isLikelyBarcodeValue(query) || /^\d{6,}$/.test(normalizedCode);
      void loadImportedPokemonCatalog(query, {
        page: 1,
        pageSize: Math.min(24, catalogPageSize || 24),
        mode: exactIdentifier ? "barcode" : "general",
        barcode: exactIdentifier ? normalizedCode || query : "",
        forceSearch: true,
      });
    };
    const runUpcLookup = () => {
      if (!upcQuery) {
        updateQuickAddWizard({ message: "Enter or paste a UPC, barcode, SKU, or product ID." });
        return;
      }
      const normalizedUpcQuery = normalizeBarcodeValue(upcQuery);
      if (/^\d+$/.test(normalizedUpcQuery) && normalizedUpcQuery.length > 18) {
        updateQuickAddWizard({ upcQuery, message: "No exact identifier match. Use Search Again, Manual Entry, or Request Missing Item." });
        return;
      }
      runSearch(upcQuery);
      updateQuickAddWizard({ upcQuery, message: upcResults.length ? "Matches are below." : "Looking for an exact identifier match." });
    };
    const renderFlowHeader = (title, copy) => (
      <div className="add-anything-path-header">
        <button type="button" className="ghost-button" onClick={() => setQuickAddWizard(createQuickAddWizardState())}>
          Back
        </button>
        <div>
          <strong>{title}</strong>
          <p>{copy}</p>
        </div>
      </div>
    );
    const renderProductResult = (product, source = "quick-add-search") => {
      const priceInfo = getTideTradrMarketInfo(product);
      const identifiers = getCatalogIdentifiers(product)
        .filter((identifier) => ["UPC", "EAN", "GTIN", "SKU", "RETAILER_SKU", "TCGPLAYER_PRODUCT_ID"].includes(String(identifier.label || "").toUpperCase()))
        .slice(0, 1)
        .map((identifier) => `${identifier.label}: ${identifier.value}`);
      const cardNumberText = product.cardNumber ? `#${product.cardNumber}` : "";
      const sourceText = product._matchReason || product.marketSource || product.sourceType || "Market Watch catalog";
      const productKind = detectCollectorItemVisualType(product);
      const productKindLabel = collectorVisualTypeLabel(productKind);
      const productTypeLabel = catalogProductTypeLabel(product);
      const productTypeLabels = [...new Set([
        productKindLabel,
        productTypeLabel,
      ].filter((label) => label && label !== "Unknown"))];
      return (
        <button
          type="button"
          className="quick-add-result-card"
          key={product.id || catalogTitle(product)}
          onClick={() => openQuickAddReviewForProduct(product, source)}
        >
          <CollectorShowcaseCard
            title={catalogTitle(product)}
            subtitle={catalogExpansionName(product) || catalogProductTypeLabel(product)}
            image={catalogImage(product)}
            kind={productKind}
            mode="mini"
            valueLabel={hasCatalogMarketPrice(product) ? `${money(priceInfo.currentMarketValue)} saved estimate` : "Market data unavailable"}
            rarity={product.rarity || product.variant || product.priceSubtype || ""}
            meta={[...productTypeLabels, sourceText]}
            helper="Preview only. Review destination and details before anything is saved."
            className="quick-add-showcase-preview"
          />
          <span className="quick-add-result-thumb">
            {catalogImage(product) ? (
              <img
                src={catalogImage(product)}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                  event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                }}
              />
            ) : null}
            {renderProductImageFallback(product, { hidden: Boolean(catalogImage(product)) })}
          </span>
          <span className="quick-add-result-copy">
            <strong>{catalogTitle(product)}</strong>
            <small>{[catalogExpansionName(product), cardNumberText, ...productTypeLabels].filter(Boolean).join(" | ") || "Catalog product"}</small>
            <small>{[sourceText, ...identifiers].filter(Boolean).join(" | ")}</small>
            <small>{hasCatalogMarketPrice(product) ? `Market ${money(priceInfo.currentMarketValue)}` : "Market data unavailable"}</small>
          </span>
          <span className="quick-add-result-action">Review/Add</span>
        </button>
      );
    };
    const renderSearchResults = (results, source, emptyCopy) => (
      <div className="quick-add-results-panel">
        {results.length ? (
          <>
            <div className="quick-add-results-heading">
              <strong>{results.length} match{results.length === 1 ? "" : "es"}</strong>
              <span>Tap a result to choose destination and save.</span>
            </div>
            <div className="quick-add-result-list">
              {results.map((product) => renderProductResult(product, source))}
            </div>
          </>
        ) : (
          <div className="empty-state small-empty-state quick-add-empty-result">
            <h3>Can&apos;t find it?</h3>
            <p>{emptyCopy || "Request a catalog item or add it manually for now."}</p>
            <div className="quick-add-inline-actions">
              <button type="button" className="secondary-button" onClick={() => setQuickAddPath("search", { query: upcQuery || searchQuery })}>
                Search Again
              </button>
              <button type="button" className="secondary-button" onClick={openQuickAddMissingProduct}>
                Request missing item
              </button>
              <button type="button" onClick={() => openQuickAddManualItemFlow({ itemName: searchQuery || upcQuery, upcSku: upcQuery })}>
                Manual item
              </button>
            </div>
          </div>
        )}
      </div>
    );
    const renderComingLaterTile = (mode) => (
      <button
        key={mode.key}
        type="button"
        className={`add-anything-option add-anything-option--${mode.tone || mode.key} add-anything-option--locked`}
        aria-label={`${mode.title}. ${mode.helper} Coming later.`}
        disabled
      >
        <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed={mode.icon || mode.key} /></span>
        <strong>{mode.title}</strong>
        <small>{mode.helper}</small>
        <em>Coming later</em>
      </button>
    );
    const openScoutScanSavedReportDetails = () => {
      const report = quickAddWizard.scoutScanSavedReport;
      if (!report) {
        updateQuickAddWizard({ message: "Saved report is not available. Open Scout reports to find it." });
        return;
      }
      closeFlowModal({ force: true, reset: false });
      window.setTimeout(() => openScoutReportDetail(report, { fallback: report, focus: "details" }), 80);
    };
    const updateCardScanRow = (rowId, patch = {}) => {
      const rows = Array.isArray(quickAddWizard.cardScanRows) && quickAddWizard.cardScanRows.length
        ? quickAddWizard.cardScanRows
        : [createQuickAddCardScanRow({ id: "card-scan-row-1" })];
      updateQuickAddWizard({
        cardScanRows: rows.map((row) => String(row.id) === String(rowId) ? { ...row, ...patch } : row),
        message: "",
      });
    };
    const addCardScanRow = () => {
      const rows = Array.isArray(quickAddWizard.cardScanRows) && quickAddWizard.cardScanRows.length
        ? quickAddWizard.cardScanRows
        : [createQuickAddCardScanRow({ id: "card-scan-row-1" })];
      updateQuickAddWizard({ cardScanRows: [...rows, createQuickAddCardScanRow()], message: "" });
    };
    const removeCardScanRow = (rowId) => {
      const rows = Array.isArray(quickAddWizard.cardScanRows) && quickAddWizard.cardScanRows.length
        ? quickAddWizard.cardScanRows
        : [createQuickAddCardScanRow({ id: "card-scan-row-1" })];
      updateQuickAddWizard({ cardScanRows: rows.length > 1 ? rows.filter((row) => String(row.id) !== String(rowId)) : rows, message: "" });
    };
    const openCardScanRowReview = (row) => {
      if (!String(row?.cardName || "").trim()) {
        updateQuickAddWizard({ message: "Add a card name before reviewing this row." });
        return;
      }
      if (!row) {
        updateQuickAddWizard({ message: "Add at least one card row before review." });
        return;
      }
      openQuickAddManualReview({
        itemName: row.cardName,
        setName: row.setName,
        cardNumber: row.cardNumber,
        variant: row.variant,
        condition: row.condition,
        destination: row.destination || "vault",
        itemKind: "single",
        productType: "Single Card",
        note: "Scan page of cards manual review. Automatic card detection is coming later.",
      });
    };
    const reviewFirstCardScanRow = () => {
      const row = (quickAddWizard.cardScanRows || []).find((candidate) => String(candidate.cardName || "").trim());
      if (!row) {
        updateQuickAddWizard({ message: "Add at least one card row before review." });
        return;
      }
      openCardScanRowReview(row);
    };

    if (quickAddScreen === "scanAnything") {
      return (
        <div className="add-anything-flow add-anything-scan-foundation">
          {renderFlowHeader("Scan Anything", "Search, enter UPC/SKU, or add manually.")}
          <div className="scan-anything-principle-card">
            <strong>Review before saving.</strong>
            <p>Search, UPC/SKU lookup, Scout screenshot review, and manual card-page review work now. Camera scanning and automatic card detection are coming later.</p>
          </div>
          <div className="add-anything-option-grid">
            <button type="button" className="add-anything-option add-anything-option--scout" aria-label="Scout screenshot or photo review. Try text extraction, then review before saving a Scout report." onClick={() => setQuickAddPath("scoutScreenshotReview")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="scout" /></span>
              <strong>Scout screenshot/photo review</strong>
              <small>Try text extraction, then review before saving a Scout report.</small>
            </button>
            <button type="button" className="add-anything-option add-anything-option--vault" aria-label="Scan page of cards. Manual multi-card review. Automatic card detection is not live yet." onClick={() => setQuickAddPath("cardPageReview")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="vault" /></span>
              <strong>Scan page of cards</strong>
              <small>Manual multi-card review. Add rows yourself; automatic card detection is not live yet.</small>
            </button>
            <button type="button" className="add-anything-option add-anything-option--search" aria-label="Search by name. Find cards, sets, sealed products, UPCs, or SKUs." onClick={() => setQuickAddPath("search")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="search" /></span>
              <strong>Search by name</strong>
              <small>Find cards, sets, sealed products, UPCs, or SKUs.</small>
            </button>
            <button type="button" className="add-anything-option add-anything-option--search" aria-label="Enter UPC or SKU. Look up sealed products or identifiers manually." onClick={() => setQuickAddPath("upc")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="scan" /></span>
              <strong>Enter UPC/SKU</strong>
              <small>Look up sealed products or identifiers manually.</small>
            </button>
            <button type="button" className="add-anything-option add-anything-option--warning" aria-label="Manual entry. Add a record now and correct details before saving." onClick={() => setQuickAddPath("manual")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="manual_entry" /></span>
              <strong>Manual entry</strong>
              <small>Add a record now and correct details before saving.</small>
            </button>
            <button type="button" className="add-anything-option add-anything-option--warning" aria-label="Request Missing Item. Ask for a catalog item when search cannot find it." onClick={openQuickAddMissingProduct}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="search" /></span>
              <strong>Request Missing Item</strong>
              <small>Ask for a catalog item when search cannot find it.</small>
            </button>
          </div>
          <details className="scan-anything-unavailable">
            <summary>Coming later <span>{comingLaterScanModes.length} scan modes</span></summary>
            <div className="scan-anything-coming-soon-grid" aria-label="Scan modes coming later">
              {comingLaterScanModes.map(renderComingLaterTile)}
            </div>
          </details>
          <p className="quick-add-missing-help">Unknown items route to search, manual entry, or Request Missing Item. Nothing is auto-submitted.</p>
        </div>
      );
    }

    if (quickAddScreen === "scoutScreenshotReview") {
      const validationError = quickAddScoutScanValidation();
      const missingScanFields = quickAddScoutScanMissingFields();
      const ocrFlags = Array.isArray(quickAddWizard.scoutScanOcrFlags) ? quickAddWizard.scoutScanOcrFlags : [];
      const scanOcrStatus = quickAddWizard.scoutScanOcrStatus || "idle";
      const scanHasSourceText = Boolean(String(quickAddWizard.scoutScanSourceText || "").trim());
      const scanMissingRequired = Object.values(missingScanFields).some(Boolean);
      const scanLowConfidence = ["low", "low_confidence"].includes(String(quickAddWizard.scoutScanOcrConfidence || scanOcrStatus).toLowerCase());
      const scanNeedsReview = scanMissingRequired || scanLowConfidence || ["idle", "running", "failed", "unsupported", "low_confidence"].includes(scanOcrStatus);
      const scanSourceStatusLabel = scanOcrStatus === "complete" && scanHasSourceText
        ? "Text extracted"
        : ["unsupported", "failed"].includes(scanOcrStatus)
          ? "OCR unavailable"
          : scanHasSourceText
            ? "Paste review"
            : "Needs review";
      const scanReviewStateLabel = scanNeedsReview ? "Needs Review" : "Ready to save";
      const scanRequiredItems = [
        { key: "store", label: "Store", ready: !missingScanFields.store },
        { key: "date", label: "Date", ready: !missingScanFields.date },
        { key: "time", label: "Time", ready: !missingScanFields.time },
        { key: "detail", label: "Items/details", ready: !missingScanFields.evidence },
      ];
      return (
        <form className="add-anything-flow add-anything-scout-scan-review" onSubmit={saveQuickAddScoutScanReport}>
          {renderFlowHeader("Review Scout Scan", "We filled what we could. Review before saving. Nothing is saved yet.")}
          <div className="scan-anything-principle-card">
            <strong>Nothing is saved yet.</strong>
            <p>Browser text extraction and pasted text only prefill this draft. Confirm the store, observed time, items, and notes before saving a Scout report.</p>
          </div>
          <div className="scout-scan-required-strip" aria-label="Required Scout scan fields">
            {scanRequiredItems.map((item) => (
              <span key={item.key} className={item.ready ? "is-ready" : "needs-review"}>
                {item.ready ? "Ready" : "Needed"}: {item.label}
              </span>
            ))}
          </div>
          <div className="quick-add-photo-panel scout-scan-photo-panel">
            {quickAddWizard.scoutScanPhotoUrl ? (
              <div className="picture-lookup-preview quick-add-photo-preview">
                <img src={quickAddWizard.scoutScanPhotoUrl} alt="Scout screenshot reference" />
                <span>{quickAddWizard.scoutScanPhotoFileName || "Screenshot/photo attached"}</span>
              </div>
            ) : (
              <div className="small-empty-state">
                <strong>Add a screenshot or paste the source text.</strong>
                <span>Use a store screenshot, shelf photo, receipt, or post text. You stay in control before saving.</span>
              </div>
            )}
            <label className="secondary-button file-action-label">
              Upload or take photo
              <input type="file" accept="image/*" capture="environment" onChange={(event) => handleQuickAddPhotoFile(event, "scoutScan")} />
            </label>
            <p className="scan-proof-note">Screenshot uploads are used for review in this beta flow. Add proof later if you need a lasting image on the report.</p>
          </div>
          <div className={`scout-scan-ocr-panel scout-scan-ocr-panel--${scanOcrStatus}`} aria-live="polite">
            <div>
              <strong>{scanSourceStatusLabel}</strong>
              <span>Review state: {scanReviewStateLabel}</span>
              {quickAddWizard.scoutScanOcrConfidence ? <em>Confidence: {quickAddWizard.scoutScanOcrConfidence}</em> : null}
            </div>
            {ocrFlags.length ? (
              <ul>
                {ocrFlags.map((flag) => <li key={flag}>{flag}</li>)}
              </ul>
            ) : (
              <p>Store, date, time, items/categories, details, and source text can all be edited before Save Report.</p>
            )}
          </div>
          <div className="flow-form-grid quick-add-scout-scan-grid">
            <Field label="Store or store name">
              <input value={quickAddWizard.scoutScanStoreName} autoFocus onChange={(event) => updateQuickAddWizard({ scoutScanStoreName: event.target.value, message: "" })} placeholder="Target, Walmart, local shop..." />
              {missingScanFields.store ? <p className="scan-field-hint">Store is required before saving.</p> : null}
            </Field>
            <Field label="Observed date">
              <input type="date" value={quickAddWizard.scoutScanDate} onChange={(event) => updateQuickAddWizard({ scoutScanDate: event.target.value, message: "" })} />
              {missingScanFields.date ? <p className="scan-field-hint">Add the observed date.</p> : null}
            </Field>
            <Field label="Observed time">
              <input type="time" value={quickAddWizard.scoutScanTime} disabled={quickAddWizard.scoutScanTimeUnknown} onChange={(event) => updateQuickAddWizard({ scoutScanTime: event.target.value, message: "" })} />
              {missingScanFields.time ? <p className="scan-field-hint">Add the time or mark it unknown.</p> : null}
            </Field>
            <label className="field checkbox-field quick-add-unknown-time">
              <input type="checkbox" checked={Boolean(quickAddWizard.scoutScanTimeUnknown)} onChange={(event) => updateQuickAddWizard({ scoutScanTimeUnknown: event.target.checked, message: "" })} />
              <span>Time unknown</span>
            </label>
            <Field label="Source type">
              <select value={quickAddWizard.scoutScanSourceType} onChange={(event) => updateQuickAddWizard({ scoutScanSourceType: event.target.value, message: "" })}>
                <option value="screenshot">Screenshot</option>
                <option value="photo">Photo</option>
                <option value="manual">Manual note</option>
              </select>
            </Field>
          </div>
          <div className="scout-scan-review-section">
            <div className="scan-category-chip-row" role="group" aria-label="Quick item categories">
              {SCOUT_PRODUCT_CATEGORY_OPTIONS.slice(0, 7).map((category) => (
                <button key={category} type="button" className="secondary-button" onClick={() => appendScoutScanItemCategory(category)}>{category}</button>
              ))}
            </div>
            <Field label="Items/categories">
              <textarea value={quickAddWizard.scoutScanItems} onChange={(event) => updateQuickAddWizard({ scoutScanItems: event.target.value, message: "" })} placeholder="One item/category per line: Pokemon TCG, ETBs, packs, binders..." />
              {missingScanFields.evidence ? <p className="scan-field-hint">Add at least one item, category, note, source text, or screenshot/photo indicator.</p> : null}
            </Field>
          </div>
          <Field label="Details / source text">
            <textarea className="scout-scan-source-textarea" value={quickAddWizard.scoutScanSourceText} onChange={(event) => updateQuickAddWizard({ scoutScanSourceText: event.target.value, message: "" })} placeholder="Paste Facebook post text, store update text, caption, or OCR text here." />
          </Field>
          <Field label="Review notes">
            <textarea value={quickAddWizard.scoutScanNotes} onChange={(event) => updateQuickAddWizard({ scoutScanNotes: event.target.value, message: "" })} placeholder="Stock status, limits, shelf context, or what needs review." />
          </Field>
          {quickAddWizard.message ? <p className="flow-inline-message is-warning" role="alert">{quickAddWizard.message}</p> : null}
          <div className="quick-add-inline-actions quick-add-sticky-actions">
            <button type="button" className="secondary-button" onClick={runScoutScanExtractionFromText}>Re-run Extraction</button>
            <button type="button" className="secondary-button" onClick={() => updateQuickAddWizard({ message: "Edit any field above before saving. Nothing is saved yet." })}>Edit Details</button>
            <button type="button" className="secondary-button" onClick={() => setQuickAddPath("scanAnything")}>Back</button>
            <button type="button" className="secondary-button" onClick={() => setQuickAddPath("manual")}>Manual Entry</button>
            <button type="button" className="ghost-button" onClick={openQuickAddMissingProduct}>Request Missing Item</button>
            <button type="submit" disabled={Boolean(validationError) || quickAddWizard.scoutScanSaving}>{quickAddWizard.scoutScanSaving ? "Saving..." : "Save Report"}</button>
          </div>
          {validationError ? <p className="compact-subtitle">Required before saving: {validationError}</p> : null}
        </form>
      );
    }

    if (quickAddScreen === "scoutScanSuccess") {
      return (
        <div className="add-anything-flow add-anything-success">
          <div className="quick-add-success-card">
            <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="scout" /></span>
            <strong>Scout report saved.</strong>
            <p>{quickAddWizard.message || "Opening the created Scout report detail."}</p>
          </div>
          <div className="quick-add-inline-actions">
            <button type="button" onClick={openScoutScanSavedReportDetails}>Add More Details</button>
            <button type="button" className="secondary-button" onClick={() => setQuickAddPath("scoutScreenshotReview")}>Review another screenshot</button>
            <button type="button" className="ghost-button" onClick={() => closeFlowModal({ force: true, reset: true })}>Finish</button>
          </div>
        </div>
      );
    }

    if (quickAddScreen === "cardPageReview") {
      const rows = Array.isArray(quickAddWizard.cardScanRows) && quickAddWizard.cardScanRows.length
        ? quickAddWizard.cardScanRows
        : [createQuickAddCardScanRow({ id: "card-scan-row-1" })];
      return (
        <div className="add-anything-flow add-anything-card-page-review">
          {renderFlowHeader("Scan page of cards", "Manual multi-card review. Add rows yourself; automatic card detection is not live yet.")}
          <div className="scan-anything-principle-card">
            <strong>Review before saving.</strong>
            <p>Each row defaults to Vault. Change the destination only when the card should go somewhere else.</p>
          </div>
          <div className="quick-add-card-scan-list">
            {rows.map((row, index) => (
              <div className="quick-add-card-scan-row" key={row.id}>
                <div className="quick-add-row-heading">
                  <strong>Card row {index + 1}</strong>
                  <div className="quick-add-row-actions">
                    <button type="button" className="secondary-button" onClick={() => openCardScanRowReview(row)}>Review this card</button>
                    <button type="button" className="ghost-button" onClick={() => removeCardScanRow(row.id)} disabled={rows.length <= 1}>Remove</button>
                  </div>
                </div>
                <div className="flow-form-grid quick-add-card-scan-grid">
                  <Field label="Card name">
                    <input value={row.cardName} onChange={(event) => updateCardScanRow(row.id, { cardName: event.target.value })} placeholder="Pikachu, Charizard..." />
                  </Field>
                  <Field label="Set">
                    <input value={row.setName} onChange={(event) => updateCardScanRow(row.id, { setName: event.target.value })} placeholder="151, Prismatic Evolutions..." />
                  </Field>
                  <Field label="Card number">
                    <input value={row.cardNumber} onChange={(event) => updateCardScanRow(row.id, { cardNumber: event.target.value })} placeholder="025/165, SVP..." />
                  </Field>
                  <Field label="Variant">
                    <input value={row.variant} onChange={(event) => updateCardScanRow(row.id, { variant: event.target.value })} placeholder="Holo, Reverse Holo, promo..." />
                  </Field>
                  <Field label="Condition">
                    <input value={row.condition} onChange={(event) => updateCardScanRow(row.id, { condition: event.target.value })} placeholder="Near mint, played..." />
                  </Field>
                  <Field label="Destination">
                    <select value={row.destination || "vault"} onChange={(event) => updateCardScanRow(row.id, { destination: event.target.value })}>
                      <option value="vault">Vault - collection</option>
                      {sellerQuickAddActive && activeForgeWorkspace ? <option value="forge">Forge - seller inventory</option> : null}
                      <option value="wishlist">Wishlist/Watch</option>
                    </select>
                  </Field>
                </div>
              </div>
            ))}
          </div>
          {quickAddWizard.message ? <p className="flow-inline-message is-warning" role="alert">{quickAddWizard.message}</p> : null}
          <div className="quick-add-inline-actions quick-add-sticky-actions">
            <button type="button" className="secondary-button" onClick={addCardScanRow}>Add card row</button>
            <button type="button" onClick={reviewFirstCardScanRow}>Review first filled card</button>
            <button type="button" className="ghost-button" onClick={() => setQuickAddPath("manual")}>Manual Entry</button>
            <button type="button" className="ghost-button" onClick={openQuickAddMissingProduct}>Request Missing Item</button>
          </div>
        </div>
      );
    }

    if (quickAddScreen === "search") {
      return (
        <div className="add-anything-flow add-anything-search">
          {renderFlowHeader("Search item", "Search by name, set, UPC, SKU, or card number. Choose one match, then review before saving.")}
          <div className="scan-anything-principle-card">
            <strong>Review before saving.</strong>
            <p>Please confirm this item before saving. Not sure? Search again or request a missing item.</p>
          </div>
          <Field label="Search cards, sets, sealed products, UPC, or SKU">
            <LazySmartCatalogSearchBox
              value={quickAddWizard.query}
              onChange={(value) => updateQuickAddWizard({ query: value, message: "" })}
              onSearch={runSearch}
              onSelectSuggestion={(suggestion) => {
                if (suggestion.product?.id) {
                  openQuickAddReviewForProduct(suggestion.product, "quick-add-search-suggestion");
                  return;
                }
                runSearch(suggestion.searchValue || suggestion.label || quickAddWizard.query);
              }}
              supabase={supabase}
              isSupabaseConfigured={isSupabaseConfigured}
              mapRow={mapCatalog}
              productGroup="All"
              dataFilter="All"
              placeholder="Search product, set, card, UPC, or SKU"
              maxSuggestions={6}
              inputClassName="add-item-search-input"
              localCatalogProducts={catalogProducts}
              autoFocus
              inputLabel="Search product, set, card, UPC, or SKU"
              includeScopeSuggestions
              searchCategories={MARKET_SEARCH_CATEGORIES}
              scopeSets={POKEMON_SETS}
              scopeProductTypes={MARKET_SEARCH_TYPE_SCOPES}
              suppressSuggestions
              emptyMessage="No matches yet. Try fewer words, UPC, SKU, or set name."
              money={money}
            />
          </Field>
          <div className="quick-add-inline-actions">
            <button type="button" onClick={() => runSearch()}>Search</button>
            <button type="button" className="secondary-button" onClick={() => setQuickAddPath("upc", { upcQuery: searchQuery })}>UPC/SKU lookup</button>
            <button type="button" className="ghost-button" onClick={() => setQuickAddPath("manual", { manualItemName: searchQuery })}>Manual item</button>
          </div>
          {searchQuery ? renderSearchResults(searchResults, "quick-add-search", "Request a catalog item or add it manually for now.") : (
            <div className="quick-add-search-starter">
              {ADD_ITEM_QUICK_SEARCH_CHIPS.slice(0, 6).map((value) => (
                <button key={value} type="button" className="secondary-button" onClick={() => runSearch(value)}>
                  {value}
                </button>
              ))}
            </div>
          )}
          {quickAddWizard.message ? <p className="flow-inline-message is-info">{quickAddWizard.message}</p> : null}
        </div>
      );
    }

    if (quickAddScreen === "upc") {
      return (
        <div className="add-anything-flow add-anything-upc">
          {renderFlowHeader("Enter UPC/SKU", "Type or paste a UPC, barcode, SKU, or product ID. Automated scan lookup is coming later.")}
          <div className="scan-anything-principle-card">
            <strong>Review before saving.</strong>
            <p>If the source is weak or the match looks wrong, search again or request a missing item.</p>
          </div>
          <Field label="UPC, barcode, SKU, or product ID">
            <input
              value={quickAddWizard.upcQuery}
              autoFocus
              inputMode="search"
              onChange={(event) => updateQuickAddWizard({ upcQuery: event.target.value, message: "" })}
              placeholder="0820650..., SKU, or product ID"
            />
          </Field>
          <div className="quick-add-inline-actions">
            <button type="button" onClick={runUpcLookup}>Lookup UPC/SKU</button>
            <button type="button" className="secondary-button" disabled>Scan lookup coming later</button>
          </div>
          <div className="empty-state small-empty-state quick-add-empty-result quick-add-upc-fallback">
            <h3>No UPC match?</h3>
            <p>Keep the fallback actions close: search by name, add manually, or request the catalog item.</p>
            <div className="quick-add-inline-actions">
              <button type="button" className="secondary-button" onClick={() => setQuickAddPath("search", { query: upcQuery })}>
                Search Again
              </button>
              <button type="button" onClick={() => openQuickAddManualItemFlow({ itemName: upcQuery, upcSku: upcQuery })}>
                Manual Entry
              </button>
              <button type="button" className="secondary-button" onClick={openQuickAddMissingProduct}>
                Request Missing Item
              </button>
            </div>
          </div>
          {upcQuery && upcResults.length ? renderSearchResults(upcResults, "quick-add-upc", "No UPC match yet. Try searching by product name or request a missing item.") : null}
          {quickAddWizard.message ? <p className="flow-inline-message is-info">{quickAddWizard.message}</p> : null}
        </div>
      );
    }

    if (quickAddScreen === "photo") {
      return (
        <div className="add-anything-flow add-anything-photo">
          {renderFlowHeader("Photo reference", "Automatic photo, binder, slab, and receipt recognition are coming later. Use the photo only as a manual reference for now.")}
          <div className="quick-add-photo-panel">
            {quickAddWizard.photoPreviewUrl ? (
              <div className="picture-lookup-preview quick-add-photo-preview">
                <img src={quickAddWizard.photoPreviewUrl} alt="Uploaded product reference" />
                <span>{quickAddWizard.photoFileName || "Photo attached"}</span>
              </div>
            ) : (
              <div className="small-empty-state">
                <strong>No automatic AI match yet.</strong>
                <span>Upload a reference photo, then continue manually or request a catalog item.</span>
              </div>
            )}
            <label className="secondary-button file-action-label">
              Upload photo
              <input type="file" accept="image/*" onChange={(event) => handleQuickAddPhotoFile(event, "photo")} />
            </label>
          </div>
          <div className="quick-add-inline-actions">
            <button type="button" onClick={() => openQuickAddManualItemFlow({ note: quickAddWizard.photoFileName ? `Photo reference: ${quickAddWizard.photoFileName}` : "" })}>Manual item</button>
            <button type="button" className="secondary-button" onClick={openQuickAddMissingProduct}>Request missing item</button>
            <button type="button" className="ghost-button" onClick={() => setQuickAddPath("search")}>Search by name instead</button>
          </div>
          {quickAddWizard.message ? <p className="flow-inline-message is-info">{quickAddWizard.message}</p> : null}
        </div>
      );
    }

    if (quickAddScreen === "receipt") {
      const editingReceipt = Boolean(quickAddWizard.receiptEditingId);
      return (
        <form className="add-anything-flow add-anything-receipt" onSubmit={saveQuickAddBasicReceipt}>
          {renderFlowHeader(editingReceipt ? "Edit receipt" : "Receipt", "Save the basics first. Item linking and OCR stay optional follow-up steps.")}
          <div className="flow-form-grid quick-add-receipt-grid">
            <Field label="Merchant / store">
              <input value={quickAddWizard.receiptMerchant} autoFocus onChange={(event) => updateQuickAddWizard({ receiptMerchant: event.target.value, message: "" })} placeholder="Target, Walmart, local shop..." />
            </Field>
            <Field label="Date">
              <input type="date" value={quickAddWizard.receiptDate} onChange={(event) => updateQuickAddWizard({ receiptDate: event.target.value })} />
            </Field>
            <Field label="Total optional">
              <input type="number" min="0" step="0.01" value={quickAddWizard.receiptTotal} onChange={(event) => updateQuickAddWizard({ receiptTotal: event.target.value })} placeholder="0.00" />
            </Field>
            <PurchaserSelect
              label="Who paid?"
              purchasers={sharedPeopleOptions}
              valueName={quickAddWizard.receiptPayerName || ""}
              onSelect={(purchaser) => updateQuickAddWizard({ receiptPayerName: purchaser?.name || "" })}
              onCreatePurchaser={(name, note, type) => addPurchaserName(name, { note, type, workspaceId: activeForgeWorkspace?.id || activeWorkspace?.id })}
              onManagePurchasers={() => openPurchaserManager(activeForgeWorkspace?.id || activeWorkspace?.id)}
            />
            <Field label="Note optional">
              <input value={quickAddWizard.receiptNote} onChange={(event) => updateQuickAddWizard({ receiptNote: event.target.value })} placeholder="What this receipt is for" />
            </Field>
          </div>
          <div className="quick-add-photo-panel">
            {quickAddWizard.receiptPhotoUrl ? (
              <div className="picture-lookup-preview quick-add-photo-preview">
                <img src={quickAddWizard.receiptPhotoUrl} alt="Receipt proof" />
                <span>{quickAddWizard.receiptFileName || "Receipt photo attached"}</span>
              </div>
            ) : null}
            <label className="secondary-button file-action-label">
              Add receipt photo optional
              <input type="file" accept="image/*" onChange={(event) => handleQuickAddPhotoFile(event, "receipt")} />
            </label>
          </div>
          <p className="compact-subtitle">No OCR or automatic item extraction is promised here. Add items from the receipt after saving.</p>
          <div className="quick-add-inline-actions">
            <button type="submit" disabled={quickAddWizard.receiptSaving}>{quickAddWizard.receiptSaving ? "Saving..." : editingReceipt ? "Save receipt changes" : "Save receipt"}</button>
            <button type="button" className="secondary-button" onClick={() => runAddSheetAction("receipt")}>Open receipt review</button>
          </div>
          {quickAddWizard.message ? <p className="flow-inline-message is-info">{quickAddWizard.message}</p> : null}
        </form>
      );
    }

    if (quickAddScreen === "receiptSuccess") {
      return (
        <div className="add-anything-flow add-anything-success">
          <div className="quick-add-success-card">
            <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="receipt" /></span>
            <strong>Receipt saved.</strong>
            <p>{quickAddWizard.message || "You can link existing items or add new items from this receipt later."}</p>
          </div>
          <div className="quick-add-inline-actions">
            <button type="button" onClick={() => openReceiptAddItemFlow(quickAddWizard.receiptSaved)}>Add items from receipt</button>
            <button type="button" className="secondary-button" onClick={() => {
              closeFlowModal({ force: true, reset: false });
              window.setTimeout(() => openReceiptDetail(quickAddWizard.receiptSaved), 80);
            }}>Link existing items</button>
            <button type="button" className="secondary-button" onClick={() => openReceiptCreateExpense(quickAddWizard.receiptSaved)}>Link expense</button>
            <button type="button" className="secondary-button" onClick={() => {
              closeFlowModal({ force: true, reset: false });
              window.setTimeout(() => openReceiptDetail(quickAddWizard.receiptSaved), 80);
            }}>View receipt</button>
            <button type="button" className="ghost-button" onClick={() => setQuickAddWizard(createQuickAddWizardState({ screen: "receipt", path: "receipt" }))}>Add another receipt</button>
            <button type="button" className="ghost-button" onClick={() => closeFlowModal({ force: true, reset: true })}>Finish</button>
          </div>
        </div>
      );
    }

    if (quickAddScreen === "manual") {
      return (
        <form className="add-anything-flow add-anything-manual" onSubmit={(event) => { event.preventDefault(); openQuickAddManualReview(); }}>
          {renderFlowHeader("Manual entry", "Enter what you know now, correct it before saving, and finish advanced details later.")}
          <div className="scan-anything-principle-card">
            <strong>Review before saving.</strong>
            <p>Manual entries are editable. Use Request Missing Item when you want this added to the shared catalog later.</p>
          </div>
          <div className="flow-form-grid quick-add-manual-grid">
            <Field label="Item name">
              <input value={quickAddWizard.manualItemName} autoFocus onChange={(event) => updateQuickAddWizard({ manualItemName: event.target.value, message: "" })} placeholder="Product, card, supply, or item" />
            </Field>
            <Field label="Item kind">
              <select value={quickAddWizard.manualItemKind} onChange={(event) => updateQuickAddWizard({ manualItemKind: event.target.value })}>
                <option value="single">Single card</option>
                <option value="sealed">Sealed product</option>
                <option value="slab">Graded / slabbed later</option>
                <option value="supply">Supply / other</option>
              </select>
            </Field>
            <Field label="Category / type">
              <input value={quickAddWizard.manualCategory} onChange={(event) => updateQuickAddWizard({ manualCategory: event.target.value })} placeholder="Pokemon, sealed, single, supply..." />
            </Field>
            <Field label="Set if known">
              <input value={quickAddWizard.manualSetName} onChange={(event) => updateQuickAddWizard({ manualSetName: event.target.value })} placeholder="Prismatic Evolutions, 151..." />
            </Field>
            <Field label="Card number / UPC / SKU if known">
              <input value={quickAddWizard.manualCardNumber} onChange={(event) => updateQuickAddWizard({ manualCardNumber: event.target.value })} placeholder="#247, UPC, SKU..." />
            </Field>
            <Field label="Variant if known">
              <input value={quickAddWizard.manualVariant} onChange={(event) => updateQuickAddWizard({ manualVariant: event.target.value })} placeholder="Normal, Holo, Reverse Holo, promo..." />
            </Field>
            <Field label="Quantity">
              <input type="number" min="1" value={quickAddWizard.manualQuantity} onChange={(event) => updateQuickAddWizard({ manualQuantity: event.target.value })} />
            </Field>
            <Field label="Destination">
              <select value={quickAddWizard.manualDestination} onChange={(event) => updateQuickAddWizard({ manualDestination: event.target.value })}>
                {destinationOptions.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.helper}</option>)}
              </select>
            </Field>
            <PurchaserSelect
              label="Owner / person optional"
              purchasers={sharedPeopleOptions}
              valueName={quickAddWizard.manualOwnerName || ""}
              onSelect={(purchaser) => updateQuickAddWizard({ manualOwnerName: purchaser?.name || "" })}
              onCreatePurchaser={(name, note, type) => addPurchaserName(name, { note, type, workspaceId: activeForgeWorkspace?.id || activeWorkspace?.id })}
              onManagePurchasers={() => openPurchaserManager(activeForgeWorkspace?.id || activeWorkspace?.id)}
            />
            <Field label="Amount paid optional">
              <input type="number" min="0" step="0.01" value={quickAddWizard.manualAmountPaid} onChange={(event) => updateQuickAddWizard({ manualAmountPaid: event.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Condition optional">
              <input value={quickAddWizard.manualCondition} onChange={(event) => updateQuickAddWizard({ manualCondition: event.target.value })} placeholder="Sealed, near mint, played..." />
            </Field>
          </div>
          <Field label="Note optional">
            <textarea value={quickAddWizard.manualNote} onChange={(event) => updateQuickAddWizard({ manualNote: event.target.value })} placeholder="Identifiers, location, receipt note, or details to finish later." />
          </Field>
          <div className="quick-add-inline-actions">
            <button type="submit">Review/Add</button>
            <button type="button" className="secondary-button" onClick={() => setQuickAddPath("search", { query: quickAddWizard.manualItemName })}>Try catalog search</button>
            <button type="button" className="ghost-button" onClick={openQuickAddMissingProduct}>Request Missing Item</button>
          </div>
          {quickAddWizard.message ? <p className="flow-inline-message is-warning">{quickAddWizard.message}</p> : null}
        </form>
      );
    }

    const openFindAction = (screen, subview = "") => {
      closeFlowModal({ force: true });
      window.setTimeout(() => openFlipScoutView(screen, subview), 0);
    };
    const entryOptions = [
      { key: "scan-listing", title: "Scan Listing", ariaLabel: "Scan Listing. Start a review-first scan or screenshot workflow.", icon: "scan", tone: "search", onClick: () => setQuickAddPath("scanAnything") },
      { key: "analyze-deal", title: "Analyze Deal", ariaLabel: "Analyze Deal. Review costs, resale assumptions, profit, and ROI.", icon: "find", tone: "search", onClick: () => openFindAction("appraise") },
      { key: "record-purchase", title: "Record Purchase", ariaLabel: "Record Purchase. Create a purchase and split it into lots or items.", icon: "clipboard", tone: "forge", onClick: () => openFindAction("records", "purchases") },
      { key: "add-collection-item", title: "Add Collection Item", ariaLabel: "Add Collection Item with a personal collection purpose.", icon: "inventory", tone: "vault", onClick: () => { closeFlowModal({ force: true }); window.setTimeout(() => openProductAddFlow({ source: "global-add-collection", seed: { ownedItemPurpose: OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION }, destinations: { vault: true } }), 0); } },
      { key: "record-sale", title: "Record Sale", ariaLabel: "Record Sale with proceeds, fees, shipping, and realized profit.", icon: "sell", tone: "forge", onClick: () => openFindAction("records", "sales") },
    ];
    const overflowEntryOptions = [
      { key: "add-auction", title: "Add Auction", ariaLabel: "Add Auction with timing, fees, risk, and a maximum bid.", icon: "calendar", tone: "search", onClick: () => openFindAction("auctions", "new") },
      { key: "add-resale-inventory", title: "Add Resale Inventory", ariaLabel: "Add Resale Inventory with cost basis and a resale purpose.", icon: "inventory", tone: "forge", onClick: () => { closeFlowModal({ force: true }); window.setTimeout(() => openProductAddFlow({ source: "global-add-resale", seed: { ownedItemPurpose: OWNED_ITEM_PURPOSES.FOR_RESALE }, destinations: { forge: Boolean(activeForgeWorkspace), vault: !activeForgeWorkspace } }), 0); } },
      { key: "add-expense", title: "Add Expense", ariaLabel: "Add Expense business record.", icon: "business", tone: "forge", onClick: () => openFindAction("records", "expenses") },
      { key: "add-mileage", title: "Add Mileage", ariaLabel: "Add Mileage for a sourcing, pickup, delivery, or event trip.", icon: "map", tone: "forge", onClick: () => openFindAction("records", "mileage") },
      { key: "add-receipt", title: "Add Receipt", ariaLabel: "Add Receipt and review it before linking records.", icon: "clipboard", tone: "forge", onClick: () => setQuickAddPath("receipt") },
      ownerFeatureControls.kidsCommunity ? { key: "add-kids-pack", title: "Add Kids Pack", ariaLabel: "Add a parent-guided Kids and Community pack record.", icon: "spark", tone: "spark", onClick: () => { closeFlowModal({ force: true }); window.setTimeout(() => openSparkKidPackFlow({ source: "global-add" }), 0); } } : null,
    ].filter(Boolean);

    return (
      <div className="add-anything-flow add-anything-entry">
        <div className="add-anything-option-grid">
          {entryOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`add-anything-option add-anything-option--${option.tone || option.key}`}
              onClick={option.onClick}
              aria-label={option.ariaLabel}
            >
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed={option.icon || option.key} /></span>
              <strong>{option.title}</strong>
            </button>
          ))}
        </div>
        {overflowEntryOptions.length ? (
          <details
            className="add-anything-more"
            onToggle={(event) => {
              if (!event.currentTarget.open) {
                return;
              }
              const detailsElement = event.currentTarget;
              window.requestAnimationFrame(() => {
                if (detailsElement && typeof detailsElement.scrollIntoView === "function") {
                  detailsElement.scrollIntoView({
                    block: "nearest",
                    behavior: "smooth",
                  });
                }
              });
            }}
          >
            <summary>More</summary>
            <div className="add-anything-option-grid add-anything-option-grid--more">
              {overflowEntryOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`add-anything-option add-anything-option--${option.tone || option.key}`}
                  onClick={option.onClick}
                    aria-label={option.ariaLabel}
                  >
                    <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed={option.icon || option.key} /></span>
                    <strong>{option.title}</strong>
                  </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    );
  }

  return renderAddAnythingFlowContent();
}
