import MultiCardScanner from "../../components/MultiCardScanner.jsx";
import { cardScanCopies } from "../../utils/cardScanRows.mjs";
import { COMMON_FINISHES, SPECIAL_PRINTINGS } from "../../utils/cardPrintings.mjs";
import "./add-anything.css";
import { useMemo } from "react";
import { PrivateReceiptImage, PrivateStorageImage } from "../../components/PrivateReceipt.jsx";
import { rankAdaptivePageItems } from "../../utils/adaptivePageItems";
import { resolveExperiencePresentation } from "../../utils/experiencePresentation.js";
import { createFlipScoutRepository } from "../flipScout/storageRepository";

// App owns state, authority and handlers; only this existing renderer is deferred.
export default function AddAnythingContent({ scope }) {
  const savedFindActivity = useMemo(() => createFlipScoutRepository().load(), []);
  const {
    adaptiveActivity,
    personalizationPreferences,
    experiencePresentation,
    showFamilyExperience,
    onOpenSellTrade,
    onOpenExperienceSettings,
    cardScanSetProgress,
    ADD_ITEM_QUICK_SEARCH_CHIPS,
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
    appendQuickAddCardScanRows,
    undoQuickAddCardScan,
    saveAllCardScanRows,
    cardScanSaving,
    createQuickAddWizardState,
    detectCollectorItemVisualType,
    findCatalogProductsByBarcode,
    onOpenBarcodeScanner,
    onOpenItemPhoto,
    onOpenCardPhoto,
    onOpenScannerMode,
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
    const upcResults = upcQuery ? findCatalogProductsByBarcode(catalogProducts, upcQuery).slice(0, 24) : [];
    const sellerQuickAddActive = quickAddSellerToolsEnabled();
    const presentation = experiencePresentation || resolveExperiencePresentation();
    const familyVisible = presentation.showAdminTools || (typeof showFamilyExperience === "boolean" ? showFamilyExperience : presentation.showFamilyTools);
    const destinationOptions = [
      { value: "vault", label: "Vault", helper: "Personal collection" },
      ...(sellerQuickAddActive && activeForgeWorkspace ? [{ value: "forge", label: "Business", helper: "Seller inventory" }] : []),
      ...(sellerQuickAddActive && activeForgeWorkspace ? [{ value: "both", label: "Both", helper: "Vault and Business" }] : []),
      { value: "wishlist", label: "Wishlist/Watch", helper: "Track for later" },
    ];
    // Built Nov 17 2026 (were "coming later"): each opens the scanner in its own mode.
    const liveScanModes = onOpenScannerMode ? [
      { key: "card", title: "Scan a card", helper: "Line a card up in the frame; the name and number are read for you.", icon: "scan", tone: "vault" },
      { key: "slab", title: "Graded slab", helper: "Reads the grader, grade and cert number from a PSA, CGC or Beckett label.", icon: "grade", tone: "vault" },
      { key: "listing", title: "Listing screenshot", helper: "eBay, Marketplace, Mercari or TCGplayer: title, price and shipping filled in.", icon: "scan", tone: "search" },
      { key: "receipt", title: "Scan a receipt", helper: "Read a receipt photo or PDF on this device, then check each line.", icon: "receipt", tone: "forge" },
      // Nov 19 2026
      { key: "price", title: "Price check", helper: "Scan anything to see its market price and trend. Nothing is saved.", icon: "search", tone: "search" },
      { key: "batch", title: "Scan several barcodes", helper: "Scan sealed boxes back to back with a running count, then save them all at once.", icon: "scan", tone: "vault" },
      { key: "trade", title: "Trade check", helper: "Scan both sides of a trade to see each side's value and whether it is fair.", icon: "inventory", tone: "search" },
    ] : [];
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
      const cardNumberText = product.cardNumber ? `#${product.cardNumber}` : "";
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
          <span className="quick-add-result-thumb">
            {catalogImage(product) ? (
              <PrivateStorageImage
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
    const renderLiveScanTile = (mode) => (
      <button
        key={mode.key}
        type="button"
        className={`add-anything-option add-anything-option--${mode.tone || mode.key}`}
        aria-label={`${mode.title}. ${mode.helper}`}
        onClick={() => onOpenScannerMode(mode.key)}
      >
        <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed={mode.icon || mode.key} /></span>
        <strong>{mode.title}</strong>
        <small>{mode.helper}</small>
      </button>
    );
    const openScoutScanSavedReportDetails = () => {
      const report = quickAddWizard.scoutScanSavedReport;
      if (!report) {
        updateQuickAddWizard({ message: "Saved report is not available. Open restock reports to find it." });
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
    // A row typed by hand is marked so it shows before it has a name (Nov 25 2026).
    const addCardScanRow = () => {
      const rows = Array.isArray(quickAddWizard.cardScanRows) ? quickAddWizard.cardScanRows : [];
      updateQuickAddWizard({ cardScanRows: [...rows, createQuickAddCardScanRow({ byHand: true })], message: "" });
    };
    const removeCardScanRow = (rowId) => {
      const rows = Array.isArray(quickAddWizard.cardScanRows) ? quickAddWizard.cardScanRows : [];
      updateQuickAddWizard({ cardScanRows: rows.filter((row) => String(row.id) !== String(rowId)), message: "" });
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
        note: "Scan several cards review. Rows read by the camera or from a binder page are checked before saving.",
      });
    };

    if (quickAddScreen === "scanAnything") {
      // Nov 25 2026 (owner: "more simple for the average idiot"): four everyday choices
      // up front; the other ten scan and entry tools sit under "More ways to add".
      const slabMode = liveScanModes.find((mode) => mode.key === "slab");
      const otherScanModes = liveScanModes.filter((mode) => mode.key !== "slab");
      return (
        <div className="add-anything-flow add-anything-scan-foundation">
          {renderFlowHeader("Scan", "Pick what you want to scan. You check everything before it is saved.")}
          <div className="add-anything-option-grid">
            <button type="button" className="add-anything-option add-anything-option--vault" aria-label="Scan cards. Point your camera at your cards; each one is matched with its price." onClick={() => setQuickAddPath("cardPageReview")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="vault" /></span>
              <strong>Scan cards</strong>
              <small>Point your camera at your cards. Each one is matched with its price.</small>
            </button>
            <button type="button" className="add-anything-option add-anything-option--search" aria-label="Scan barcode. Use the camera to look up a sealed product." onClick={onOpenBarcodeScanner}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="scan" /></span>
              <strong>Scan barcode</strong>
              <small>For sealed products like booster boxes and tins.</small>
            </button>
            {slabMode ? renderLiveScanTile(slabMode) : null}
            <button type="button" className="add-anything-option add-anything-option--search" aria-label="Search by name. Find cards, sets, sealed products, UPCs, or SKUs." onClick={() => setQuickAddPath("search")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="search" /></span>
              <strong>Search by name</strong>
              <small>Type a card or product name.</small>
            </button>
          </div>
          <details className="add-anything-more scan-anything-more">
            <summary>More ways to add</summary>
            <div className="add-anything-option-grid">
              <button type="button" className="add-anything-option add-anything-option--search" aria-label="Identify from a photo. Read printed text on a card or sealed product, then review catalog matches." onClick={onOpenItemPhoto}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="scan" /></span>
              <strong>Identify from a photo</strong>
              <small>Read printed text on a card or sealed product, then review catalog matches.</small>
            </button>
              {otherScanModes.map(renderLiveScanTile)}
              <button type="button" className="add-anything-option add-anything-option--scout" aria-label="Restocks screenshot or photo review. Try text extraction, then review before saving a restock report." onClick={() => setQuickAddPath("scoutScreenshotReview")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="scout" /></span>
              <strong>Restocks screenshot/photo review</strong>
              <small>Try text extraction, then review before saving a restock report.</small>
            </button>
              <button type="button" className="add-anything-option add-anything-option--search" aria-label="Type a barcode number. Look up sealed products by the number under the barcode (UPC or SKU)." onClick={() => setQuickAddPath("upc")}>
              <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="scan" /></span>
              <strong>Type a barcode number</strong>
              <small>Use the number under the barcode on sealed products.</small>
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
          </details>
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
          {renderFlowHeader("Review Restocks Scan", "We filled what we could. Review before saving. Nothing is saved yet.")}
          <div className="scan-anything-principle-card">
            <strong>Nothing is saved yet.</strong>
            <p>Browser text extraction and pasted text only prefill this draft. Confirm the store, observed time, items, and notes before saving a restock report.</p>
          </div>
          <div className="scout-scan-required-strip" aria-label="Required Restocks scan fields">
            {scanRequiredItems.map((item) => (
              <span key={item.key} className={item.ready ? "is-ready" : "needs-review"}>
                {item.ready ? "Ready" : "Needed"}: {item.label}
              </span>
            ))}
          </div>
          <div className="quick-add-photo-panel scout-scan-photo-panel">
            {quickAddWizard.scoutScanPhotoUrl ? (
              <div className="picture-lookup-preview quick-add-photo-preview">
                <PrivateStorageImage src={quickAddWizard.scoutScanPhotoUrl} alt="Restocks screenshot reference" />
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
            <strong>Restock report saved.</strong>
            <p>{quickAddWizard.message || "Opening the created restock report detail."}</p>
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
      // Nov 25 2026 (owner: "more simple"): no blank form before the first scan; a
      // matched card shows as one line with its price, and its details fold away.
      const rows = (Array.isArray(quickAddWizard.cardScanRows) ? quickAddWizard.cardScanRows : [])
        .filter((row) => row.byHand || String(row.cardName || "").trim() || String(row.cardNumber || "").trim());
      const copiesOf = cardScanCopies;
      const filledCount = rows.filter((row) => String(row.cardName || "").trim()).reduce((sum, row) => sum + copiesOf(row), 0);
      return (
        <div className="add-anything-flow add-anything-card-page-review">
          {renderFlowHeader("Scan cards", "Scan one card or a whole stack. Each card is matched with its price. Check the list, then tap Save.")}
          {appendQuickAddCardScanRows ? <MultiCardScanner onRows={appendQuickAddCardScanRows} autoStart={!rows.length} rows={rows} onUndo={undoQuickAddCardScan} money={money} /> : null}
          {cardScanSetProgress?.length ? (
            <section className="card-scan-set-progress" aria-label="Set progress">
              {cardScanSetProgress.map((set) => (
                <div className="card-scan-set-progress__set" key={set.key || set.setName}>
                  <div className="card-scan-set-progress__head">
                    <strong>{set.setName}</strong>
                    <span>{set.total ? `${set.after} of ${set.total}` : `${set.after} cards`}{set.adds ? ` · +${set.adds} new` : " · nothing new"}</span>
                  </div>
                  {set.percentAfter !== null ? (
                    <div className="card-scan-set-progress__bar" role="progressbar" aria-label={`${set.setName} completion after saving`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={set.percentAfter}>
                      <span style={{ width: `${set.percentAfter}%` }} />
                    </div>
                  ) : null}
                  <small>
                    {set.adds ? `Saving these adds ${set.adds} card${set.adds === 1 ? "" : "s"} you don't have yet (you have ${set.owned} now).` : "You already have every card from this set in this scan."}
                    {set.missingSupported && set.missingAfterCount !== null ? ` Still missing ${set.missingAfterCount}${set.missingPreview.length ? `: ${set.missingPreview.map((card) => [card.number, card.name].filter(Boolean).join(" ")).join(", ")}${set.missingAfterCount > set.missingPreview.length ? "…" : ""}` : ""}.` : ""}
                  </small>
                </div>
              ))}
            </section>
          ) : null}
          {(() => {
            const matched = rows.filter((row) => row.matchState === "matched" && row.matchedFor === `${row.cardName}|${row.cardNumber}`);
            const total = matched.reduce((sum, row) => sum + (Number(row.matchedValue) || 0) * copiesOf(row), 0);
            return matched.length ? (
              <p className="quick-add-card-scan-total" role="status">{matched.length} of {rows.length} card{rows.length === 1 ? "" : "s"} matched{total > 0 ? ` · about ${money(total)} market value` : ""}</p>
            ) : null;
          })()}
          <datalist id="card-scan-printings">{[...COMMON_FINISHES, "1st Edition", "1st Edition Holo", "Unlimited", ...SPECIAL_PRINTINGS.map((item) => item.label.replace(/ (.*)$/, ""))].map((value) => <option key={value} value={value} />)}</datalist>
          {!rows.length ? <p className="quick-add-card-scan-empty">Cards you scan show up here with their prices. You can also add a card by hand.</p> : null}
          <div className="quick-add-card-scan-list">
            {rows.map((row, index) => {
              const isMatched = row.matchState === "matched" && row.matchedFor === `${row.cardName}|${row.cardNumber}`;
              const title = [row.cardName, row.cardNumber].map((value) => String(value || "").trim()).filter(Boolean).join(" · ") || `Card ${index + 1}`;
              return (
              <div className={`quick-add-card-scan-row${isMatched ? " is-matched" : ""}`} key={row.id}>
                <div className="quick-add-row-heading">
                  <strong>{title}{copiesOf(row) > 1 ? ` ×${copiesOf(row)}` : ""}{row.pocket ? ` · ${row.pocket}` : ""}{row.scanNote ? <small className="quick-add-card-scan-note"> · {row.scanNote}</small> : null}</strong>
                  <div className="quick-add-row-actions">
                    <button type="button" className="secondary-button" onClick={() => openCardScanRowReview(row)}>{isMatched ? "Change" : "Pick the card"}</button>
                    <button type="button" className="ghost-button" onClick={() => removeCardScanRow(row.id)}>Remove</button>
                  </div>
                </div>
                {row.matchedFor === `${row.cardName}|${row.cardNumber}` && row.matchState === "matched" ? (
                  <p className="quick-add-card-scan-match">Matched: {row.matchedLabel}{row.matchedValue ? ` · ${money(row.matchedValue)}` : ""}{row.matchedOthers ? ` · ${row.matchedOthers} other printing${row.matchedOthers === 1 ? "" : "s"}: tap Change to pick another` : ""}</p>
                ) : row.matchedFor === `${row.cardName}|${row.cardNumber}` && row.matchState === "review" ? (
                  <p className="quick-add-card-scan-match quick-add-card-scan-match--review">Not sure which card this is. Tap Pick the card.</p>
                ) : null}
                <details className="quick-add-card-scan-edit" open={!isMatched && !String(row.cardName || "").trim()}>
                <summary>Edit details</summary>
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
                    <input list="card-scan-printings" value={row.variant} onChange={(event) => updateCardScanRow(row.id, { variant: event.target.value })} placeholder="Normal, Holo, Reverse Holo, Trick or Treat..." />
                  </Field>
                  <Field label="Condition">
                    <input value={row.condition} onChange={(event) => updateCardScanRow(row.id, { condition: event.target.value })} placeholder="Near mint, played..." />
                  </Field>
                  <Field label="How many">
                    <input type="number" min="1" step="1" inputMode="numeric" value={row.quantity ?? 1} onChange={(event) => updateCardScanRow(row.id, { quantity: event.target.value })} />
                  </Field>
                  <Field label="Save to">
                    <select value={row.destination || "vault"} onChange={(event) => updateCardScanRow(row.id, { destination: event.target.value })}>
                      <option value="vault">My collection</option>
                      {sellerQuickAddActive && activeForgeWorkspace ? <option value="forge">Selling inventory</option> : null}
                      <option value="wishlist">Wants list</option>
                    </select>
                  </Field>
                </div>
                </details>
              </div>
              );
            })}
          </div>
          {quickAddWizard.message ? <p className="flow-inline-message is-warning" role="alert">{quickAddWizard.message}</p> : null}
          <div className="quick-add-inline-actions quick-add-sticky-actions">
            {saveAllCardScanRows ? <button type="button" className="primary-button" disabled={cardScanSaving || !filledCount} onClick={saveAllCardScanRows}>{cardScanSaving ? "Saving…" : filledCount ? `Save ${filledCount} card${filledCount === 1 ? "" : "s"}` : "Save"}</button> : null}
            <button type="button" className="secondary-button" onClick={addCardScanRow}>Add a card by hand</button>
          </div>
          <details className="add-anything-more quick-add-card-scan-more">
            <summary>Can't find your card?</summary>
            <div className="quick-add-inline-actions">
              <button type="button" className="ghost-button" onClick={() => setQuickAddPath("manual")}>Type it in yourself</button>
              <button type="button" className="ghost-button" onClick={openQuickAddMissingProduct}>Ask us to add it</button>
            </div>
          </details>
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
          {renderFlowHeader("Type a barcode number", "Scan a package barcode, or enter a UPC, SKU or product ID. Choose the matching edition before adding.")}
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
            <button type="button" className="secondary-button" onClick={onOpenBarcodeScanner}>Scan barcode</button>
            <button type="button" className="secondary-button" onClick={onOpenItemPhoto}>Use item photo</button>
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
          {renderFlowHeader("Photo reference", "The photo is kept as a reference. To identify a card, slab, listing or receipt from a photo, use Scan.")}
          <div className="quick-add-photo-panel">
            {quickAddWizard.photoPreviewUrl ? (
              <div className="picture-lookup-preview quick-add-photo-preview">
                <PrivateStorageImage src={quickAddWizard.photoPreviewUrl} alt="Uploaded product reference" />
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
                <PrivateReceiptImage src={quickAddWizard.receiptPhotoUrl} alt="Receipt proof" />
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
    const defaultEntryOptions = [
      ...(onOpenCardPhoto ? [{ key: "scan-card", title: "Scan a card", ariaLabel: "Scan a card. Take a photo; the app reads the name and card number and shows matches to confirm.", icon: "scan", tone: "vault", onClick: () => { closeFlowModal({ force: true }); window.setTimeout(onOpenCardPhoto, 0); } }] : []),
      { key: "scan-listing", title: presentation.isCollector ? "Other scans" : "Scan Listing", ariaLabel: presentation.isCollector ? "Other scans. Barcodes, graded slabs, receipts, screenshots and more." : "Scan Listing. Start a review-first scan or screenshot workflow.", icon: "scan", tone: "search", onClick: () => setQuickAddPath("scanAnything") },
      { key: "analyze-deal", title: "Analyze Deal", ariaLabel: "Analyze Deal. Review costs, resale assumptions, profit, and ROI.", icon: "find", tone: "search", onClick: () => openFindAction("appraise") },
      { key: "record-purchase", title: "Record Purchase", ariaLabel: "Record Purchase. Create a purchase and split it into lots or items.", icon: "clipboard", tone: "forge", onClick: () => openFindAction("records", "purchases") },
      { key: "add-collection-item", title: "Add to my collection", ariaLabel: "Add to my collection with a personal collection purpose.", icon: "inventory", tone: "vault", onClick: () => { closeFlowModal({ force: true }); window.setTimeout(() => openProductAddFlow({ source: "global-add-collection", seed: { ownedItemPurpose: OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION }, destinations: { vault: true } }), 0); } },
      { key: "record-sale", title: "Record Sale", ariaLabel: "Record Sale with proceeds, fees, shipping, and realized profit.", icon: "sell", tone: "forge", onClick: () => openFindAction("records", "sales") },
      ...(onOpenSellTrade ? [{ key: "sell-or-trade", title: "Sell or trade", ariaLabel: "Sell or trade. Open your existing listing and trade tools.", icon: "sell", tone: "forge", onClick: () => { closeFlowModal({ force: true }); window.setTimeout(onOpenSellTrade, 0); } }] : []),
    ];
    const moreEntryOptions = [
      { key: "search-catalog", title: "Search cards & products", ariaLabel: "Search cards and products by name.", icon: "search", tone: "search", onClick: () => setQuickAddPath("search") },
      { key: "enter-upc", title: "Type a barcode number", ariaLabel: "Type a barcode number (UPC or SKU) to find a product.", icon: "scan", tone: "search", onClick: () => setQuickAddPath("upc") },
      { key: "scan-page", title: "Scan cards", ariaLabel: "Scan cards: point your camera at your cards; each one is matched with its price.", icon: "inventory", tone: "vault", onClick: () => setQuickAddPath("cardPageReview") },
      { key: "review-screenshot", title: "Review a restock screenshot", ariaLabel: "Review a restock screenshot before saving a report.", icon: "find", tone: "search", onClick: () => setQuickAddPath("scoutScreenshotReview") },
      { key: "request-missing-item", title: "Request Missing Item", ariaLabel: "Request a missing catalog item.", icon: "search", tone: "search", onClick: openQuickAddMissingProduct },
      { key: "add-auction", title: "Add Auction", ariaLabel: "Add Auction with timing, fees, risk, and a maximum bid.", icon: "calendar", tone: "search", onClick: () => openFindAction("auctions", "new") },
      { key: "add-resale-inventory", title: presentation.isStore ? "Add store inventory" : "Add selling inventory", ariaLabel: presentation.isStore ? "Add store inventory with cost basis and a resale purpose." : "Add selling inventory with cost basis and a resale purpose.", icon: "inventory", tone: "forge", onClick: () => { closeFlowModal({ force: true }); window.setTimeout(() => openProductAddFlow({ source: "global-add-resale", seed: { ownedItemPurpose: OWNED_ITEM_PURPOSES.FOR_RESALE }, destinations: { forge: Boolean(activeForgeWorkspace), vault: !activeForgeWorkspace } }), 0); } },
      { key: "add-expense", title: "Add Expense", ariaLabel: "Add Expense business record.", icon: "business", tone: "forge", onClick: () => openFindAction("records", "expenses") },
      { key: "add-mileage", title: "Add Mileage", ariaLabel: "Add Mileage for a sourcing, pickup, delivery, or event trip.", icon: "map", tone: "forge", onClick: () => openFindAction("records", "mileage") },
      { key: "add-receipt", title: "Add Receipt", ariaLabel: "Add Receipt and review it before linking records.", icon: "clipboard", tone: "forge", onClick: () => setQuickAddPath("receipt") },
      ownerFeatureControls.kidsCommunity && familyVisible ? { key: "add-kids-pack", title: "Add Kids Pack", ariaLabel: "Add a parent-guided Kids and Community pack record.", icon: "spark", tone: "spark", onClick: () => { closeFlowModal({ force: true }); window.setTimeout(() => openSparkKidPackFlow({ source: "global-add" }), 0); } } : null,
    ].filter(Boolean);

    const activityKeysByAction = {
      "scan-listing": ["reports"], "analyze-deal": ["watchlist", "deals"],
      "record-purchase": ["purchases"], "add-collection-item": ["collection"],
      "record-sale": ["sales"], "sell-or-trade": ["sales", "trades"], "add-auction": ["auctions"],
      "add-resale-inventory": ["inventory"], "add-expense": ["expenses"],
      "add-mileage": ["expenses"], "add-receipt": ["receipts"], "add-kids-pack": ["packs"],
      "search-catalog": ["watchlist"], "enter-upc": ["inventory"], "scan-page": ["collection"], "review-screenshot": ["reports"],
    };
    const preferenceActions = {
      scanCards: "scan-page", scanScreenshot: "review-screenshot", addVaultItem: "add-collection-item",
      searchCard: "search-catalog", scanUpc: "enter-upc", uploadReceipt: "add-receipt", requestMissingItem: "request-missing-item",
      addSale: "record-sale", addExpense: "add-expense", logMileage: "add-mileage",
      addInventoryCost: "add-resale-inventory", buildKidsPack: "add-kids-pack",
    };
    const addPreference = personalizationPreferences?.pagePreferences?.quickAdd;
    const preferredActions = (addPreference?.visibleKeys || []).map((key) => preferenceActions[key]).filter(Boolean);
    const businessActionKeys = new Set(["analyze-deal", "record-purchase", "record-sale", "add-auction", "add-resale-inventory", "add-expense", "add-mileage", "add-receipt"]);
    const personaDefaults = presentation.isCollector
      // Nov 25 2026: one "Scan cards" first for collectors (it handles one card or a stack).
      ? ["scan-page", "add-collection-item", "search-catalog", "scan-listing", "sell-or-trade", "scan-card", "enter-upc"]
      : presentation.isStore
        ? ["add-resale-inventory", "record-sale", "record-purchase", "search-catalog", "scan-listing"]
        : ["add-resale-inventory", "record-sale", "record-purchase", "analyze-deal", "scan-listing"];
    const eligibleOptions = [...defaultEntryOptions, ...moreEntryOptions]
      .filter((option) => !presentation.isCollector || !businessActionKeys.has(option.key))
      .filter((option) => presentation.isCollector || option.key !== "sell-or-trade")
      .sort((left, right) => {
        const leftIndex = personaDefaults.indexOf(left.key);
        const rightIndex = personaDefaults.indexOf(right.key);
        return (leftIndex < 0 ? Infinity : leftIndex) - (rightIndex < 0 ? Infinity : rightIndex);
      });
    const rankedActions = rankAdaptivePageItems(eligibleOptions.map((option) => ({
      ...option, activityKeys: activityKeysByAction[option.key],
    })), {
      activity: { ...savedFindActivity, ...adaptiveActivity,
        sales: [...savedFindActivity.sales, ...(adaptiveActivity?.sales || [])],
        inventory: [...savedFindActivity.inventory, ...(adaptiveActivity?.inventory || [])],
        expenses: [...savedFindActivity.expenses, ...(adaptiveActivity?.expenses || [])],
      },
      enabled: personalizationPreferences?.smartRecommendationsEnabled !== false,
      manualOrder: Boolean(addPreference?.updatedAt),
      preferredKeys: preferredActions,
    });
    const entryOptions = (addPreference?.updatedAt ? rankedActions.filter((option) => preferredActions.includes(option.key)) : rankedActions).slice(0, 5);
    const overflowEntryOptions = rankedActions.filter((option) => !entryOptions.includes(option));

    return (
      <div className="add-anything-flow add-anything-entry">
        <button type="button" className="add-anything-option add-anything-report" onClick={() => runAddSheetAction("storeReport")} aria-label="Report a restock. Share what you saw at a store.">
          <span className="command-icon" aria-hidden="true"><CommandGlyphIcon seed="find" /></span>
          <strong>Report a restock</strong>
          <small>Store, what you saw, and review. A photo is optional.</small>
        </button>
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
        {onOpenExperienceSettings ? <button type="button" className="secondary-button add-experience-settings" onClick={() => { closeFlowModal({ force: true }); window.setTimeout(onOpenExperienceSettings, 0); }}>Customize these shortcuts</button> : null}
      </div>
    );
  }

  return renderAddAnythingFlowContent();
}
