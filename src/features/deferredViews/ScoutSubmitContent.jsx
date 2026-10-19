import { useEffect, useRef } from "react";
import { PrivateStorageImage } from "../../components/PrivateReceipt.jsx";
import StockScreenshotImport from "../../components/StockScreenshotImport.jsx";
import "./scout-submit.css";
import "./stock-report-easy.css";

// App owns state, authority and handlers; only this existing renderer is deferred.
export default function ScoutSubmitContent({ scope }) {
  const {
    DROP_RADAR_GUESS_LOCKED_MESSAGE,
    LazySmartCatalogSearchBox,
    MIN_SCOUT_POINTS_FOR_GUESS,
    SCOUT_PRODUCT_CATEGORY_OPTIONS,
    SCOUT_QUICK_PROOF_TYPES,
    SCOUT_QUICK_STOCK_LEFT_OPTIONS,
    SCOUT_REPORT_VISIBILITY_OPTIONS,
    adminEditModeActive,
    applyQuickScoutReportTimePreset,
    buildCatalogAutofillDetails,
    buildStoreProfileSummary,
    catalogExpansionName,
    catalogImage,
    catalogProductTypeLabel,
    catalogProducts,
    catalogTitle,
    closeFlowModal,
    currentUserCanSubmitScoutGuess,
    distanceMilesBetween,
    getCatalogPickerResults,
    getScoutQuickRetailer,
    getScoutQuickStoreId,
    getScoutQuickStoreRegion,
    getScoutQuickStoreZip,
    getScoutQuickStores,
    getScoutStoreDisplayName,
    getScoutWizardSteps,
    getStoreMapCoordinates,
    getStoreMapReports,
    getStoreMapStoreId,
    handleImageUpload,
    isSupabaseConfigured,
    locationSettings,
    mapCatalog,
    money,
    openQuickScoutReportDetails,
    openStoreProfile,
    parseManualLocationCoordinates,
    quickScoutConfidenceBadge,
    quickScoutDateLabel,
    quickScoutHasMeaningfulReportDetail,
    quickScoutProofLabel,
    quickScoutReportForm,
    quickScoutReportMessage,
    quickScoutReportReady,
    quickScoutReportSaved,
    quickScoutReportStep,
    quickScoutReportSubmitting,
    quickScoutReportTypeMeta,
    quickScoutStockLeftLabel,
    quickScoutStoreHasHistory,
    quickScoutStoreNeedsReviewConfirmation,
    quickScoutVisitDateTimeValue,
    quickScoutWizardTouchRef,
    renderProductImageFallback,
    resolveQuickScoutStoreSelection,
    scoutActiveAreaText,
    scoutForecastPreviewRows,
    scoutGuessPoints,
    scoutGuessRows,
    scoutReportConfidenceBadge,
    scoutReportDateTimeLabel,
    scoutReportRows,
    scoutStockStatusLabel,
    scoutStoreAliasDisplayValues,
    scoutStoreAreaScore,
    scoutStoreDistanceAreaLabel,
    scoutStoreLocationSummary,
    scoutStoreMatchesLookup,
    scoutStoreRecentSignalLabel,
    scoutStoreSearchScore,
    scoutVisibilityOptionLabel,
    scoutWizardStepError,
    selectQuickScoutReportStore,
    setQuickScoutReportForm,
    setQuickScoutReportMessage,
    setQuickScoutReportStep,
    submitQuickScoutReport,
    supabase,
    tidepoolPosts,
    updateLocationSettings,
    updateQuickScoutReportForm,
    updateQuickScoutVisitDateTime,
    validateScoutVisitDateTime,
  } = scope;

  const photoInputRef = useRef(null);
  const photoSelectionRef = useRef(0);

  useEffect(() => () => { photoSelectionRef.current += 1; }, []);

  const changeDraftPhoto = (event) => {
    const selection = ++photoSelectionRef.current;
    handleImageUpload(event, (url) => {
      if (photoSelectionRef.current === selection) updateQuickScoutReportForm("photoUrl", url);
    }, "scout-reports");
  };

  const removeDraftPhoto = () => {
    photoSelectionRef.current += 1;
    updateQuickScoutReportForm("photoUrl", "");
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
      const summary = photoInputRef.current.closest("details")?.querySelector("summary");
      (summary || photoInputRef.current).focus({ preventScroll: true });
    }
  };

  function renderScoutSubmitFlowContent() {
    const stores = getScoutQuickStores();
    const currentType = quickScoutReportTypeMeta();
    const storeSelection = resolveQuickScoutStoreSelection();
    const selectedStore = storeSelection.mode === "known" ? storeSelection.store : null;
    const selectedStoreContext = storeSelection.valid ? storeSelection.store : null;
    const normalizedStoreSearch = quickScoutReportForm.storeSearch.trim();
    const scoutAreaText = scoutActiveAreaText();
    const locationText = scoutAreaText;
    const locationAvailable = Boolean(locationSettings.trackingEnabled || locationText);
    const locationOrigin = parseManualLocationCoordinates(locationText);
    const productQuery = String(quickScoutReportForm.productName || "").trim();
    const productMatches = productQuery.length >= 2 ? getCatalogPickerResults(productQuery, 6) : [];
    const quickProductChips = [
      "Pokemon",
      "Prismatic Evolutions",
      "Elite Trainer Box",
      "Booster Bundle",
      "Mini Portfolio",
      "Collector Chest",
      "Tin",
      "Blister",
    ];
    const quickReportTypeOptions = currentType.isGuess
      ? [
          { value: "restock_guess", title: "Community guess", helper: currentUserCanSubmitScoutGuess ? "A planning note, not confirmed stock." : DROP_RADAR_GUESS_LOCKED_MESSAGE },
          { value: "employee_restock_coming", title: "Employee tip", helper: "Needs community review." },
          { value: "truck_vendor_seen", title: "Truck/vendor seen", helper: "Possible restock signal." },
          { value: "other_intel", title: "Other", helper: "Manual note or pattern." },
        ]
      : [
          { value: "stock_on_shelf", title: "Stock seen", helper: "Product was seen on shelf, display, or behind counter." },
          { value: "no_stock", title: "No stock", helper: "Nothing found where TCG usually sits." },
          { value: "low_stock", title: "Low stock", helper: "Some product remained, but selection looked thin." },
          { value: "restock_happening_now", title: "Vendor stocking now", helper: "Vendor or staff stocking now." },
          { value: "vendor_seen", title: "Vendor seen", helper: "Vendor nearby; stocking not confirmed." },
          { value: "limit_posted", title: "Limit posted", helper: "Limit sign, shelf tag, or printed policy." },
          { value: "behind_counter", title: "Behind counter", helper: "Product controlled by staff or checkout." },
          { value: "customer_service", title: "Customer service", helper: "Staff directed shoppers to a desk." },
          { value: "unsure", title: "Unsure", helper: "Useful signal, but status was unclear." },
        ];
    const storeRows = stores.map((store, index) => {
      const reports = getStoreMapReports(store);
      const coordinates = getStoreMapCoordinates(store);
      const computedDistance = Number(store.distanceMiles ?? store.distance_miles ?? store.distance ?? store.miles);
      const distance = Number.isFinite(computedDistance)
        ? computedDistance
        : distanceMilesBetween(locationOrigin, coordinates);
      return {
        id: getScoutQuickStoreId(store) || getStoreMapStoreId(store, index),
        store,
        name: getScoutStoreDisplayName(store),
        retailer: getScoutQuickRetailer(store),
        city: store.city || store.addressCity || store.region || "",
        state: store.state || "",
        zip: getScoutQuickStoreZip(store),
        region: getScoutQuickStoreRegion(store),
        address: store.address || store.streetAddress || "",
        distance,
        reports,
        latestReport: reports[0] || null,
        watchlisted: Boolean(store.favorite || store.priority || store.watchlisted || store.watchlist),
        windowLabel: store.bestCheckWindow || store.restockWindow || store.truckDays || "Unknown",
      };
    });
    const filteredStoreRows = storeRows
      .filter((row) => scoutStoreMatchesLookup(row, normalizedStoreSearch))
      .map((row) => ({
        ...row,
        searchScore: scoutStoreSearchScore(row, normalizedStoreSearch),
        areaScore: scoutStoreAreaScore(row, scoutAreaText, normalizedStoreSearch),
      }))
      .sort((a, b) => {
        if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
        if (b.areaScore !== a.areaScore) return b.areaScore - a.areaScore;
        if (locationAvailable && Number.isFinite(a.distance) && Number.isFinite(b.distance)) return a.distance - b.distance;
        if (b.watchlisted !== a.watchlisted) return Number(b.watchlisted) - Number(a.watchlisted);
        if (b.reports.length !== a.reports.length) return b.reports.length - a.reports.length;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
    const recommendedStoreRows = filteredStoreRows.slice(0, normalizedStoreSearch ? 6 : 3);
    const wizardSteps = getScoutWizardSteps().map((step) => ({
      ...step,
      title: step.key === "where"
        ? "Store and time"
        : step.key === "status"
          ? "Shelf status"
          : step.key === "details" && !currentType.isGuess
            ? "What you saw"
        : step.key === "where"
          ? "Select store/location"
          : step.key === "details"
            ? "Add guess context"
            : currentType.isGuess ? "Review note" : "Post report",
    }));
    const activeStepIndex = Math.max(0, wizardSteps.findIndex((step) => step.key === quickScoutReportStep));
    const activeWizardStep = wizardSteps[activeStepIndex] || wizardSteps[0];
    const whereStepError = scoutWizardStepError("where");
    const statusStepError = scoutWizardStepError("status");
    const detailsStepError = scoutWizardStepError("details");
    const reviewStepError = scoutWizardStepError("review");
    const scoutSubmitBlocked = quickScoutReportSubmitting || Boolean(reviewStepError) || (currentType.isGuess && !currentUserCanSubmitScoutGuess);
    const confidenceBadge = quickScoutConfidenceBadge(quickScoutReportForm, currentType, storeSelection);
    const visitValidationPreview = currentType.isGuess
      ? { ok: true }
      : validateScoutVisitDateTime(quickScoutReportForm, { allowFutureConfirmation: adminEditModeActive });
    const scoutRequiredChecklist = currentType.isGuess
      ? [
          { key: "store", label: "Store", ready: storeSelection.valid },
          { key: "context", label: "Guess context", ready: Boolean(quickScoutReportForm.reportType) },
          { key: "review", label: "Review", ready: quickScoutReportReady() },
        ]
      : [
          { key: "store", label: "Store", ready: storeSelection.valid && !quickScoutStoreNeedsReviewConfirmation() },
          { key: "time", label: "Observed time", ready: Boolean(visitValidationPreview.ok) },
          { key: "status", label: "Shelf status", ready: Boolean(quickScoutReportForm.reportType) },
          { key: "details", label: "Item/details", ready: quickScoutHasMeaningfulReportDetail() },
        ];
    const scoutPointsRemaining = Math.max(0, MIN_SCOUT_POINTS_FOR_GUESS - scoutGuessPoints);
    const scoutPointsProgress = Math.min(100, Math.round((scoutGuessPoints / Math.max(1, MIN_SCOUT_POINTS_FOR_GUESS)) * 100));
    const productDetailSummary = quickScoutReportForm.productName
      ? [quickScoutReportForm.productCategory, quickScoutReportForm.productName].filter(Boolean).join(" | ")
      : (quickScoutReportForm.productCategory || (quickScoutReportForm.note ? "Details added in note" : currentType.isGuess ? "Not selected" : "Missing item/category"));
    const summaryRows = [
      [currentType.isGuess ? "Planner type" : "Report type", currentType.label],
      ["Reporting at", storeSelection.valid ? storeSelection.storeName : "Store not selected"],
      ["Retailer", storeSelection.valid ? storeSelection.retailer : "Not selected"],
      ["Proof/source", quickScoutProofLabel()],
      ["Photo", quickScoutReportForm.photoUrl ? "Attached" : "No photo attached"],
      ["Trust state", confidenceBadge?.label || "Unverified"],
      ["Product details", productDetailSummary],
      ...(currentType.isGuess
        ? [
            ["Expected day", quickScoutDateLabel()],
            ["Expected window", quickScoutReportForm.guessedTimeWindow || "Unknown"],
            ["Self rating", `${quickScoutReportForm.confidenceSelfRating || 50}/100`],
            ["Scout point gate", currentUserCanSubmitScoutGuess ? `${scoutGuessPoints}/${MIN_SCOUT_POINTS_FOR_GUESS} points` : DROP_RADAR_GUESS_LOCKED_MESSAGE],
          ]
        : [
            ["Quantity", quickScoutReportForm.quantity || "Optional"],
            ["Stock left", quickScoutStockLeftLabel() || "Optional"],
            ["Visit date & time", quickScoutDateLabel()],
          ]),
      ["Visibility", scoutVisibilityOptionLabel(quickScoutReportForm.visibility || (currentType.isGuess ? "private" : "public"), currentType.isGuess)],
      ["Store follow", (quickScoutReportForm.storeFollowPreference || "verified_restocks").replace(/_/g, " ")],
    ];
    const selectedTypeOption = quickReportTypeOptions.find((option) => option.value === quickScoutReportForm.reportType);
    const screenshotSourceLabel = ({ facebook: "Facebook", discord: "Discord", other: "Community" })[quickScoutReportForm.screenshotSourcePlatform] || "Community";
    const commonReportTypes = ["stock_on_shelf", "low_stock", "no_stock", "restock_happening_now"];
    const primaryCategories = SCOUT_PRODUCT_CATEGORY_OPTIONS.slice(0, 5);
    const otherCategories = SCOUT_PRODUCT_CATEGORY_OPTIONS.slice(5);
    const renderReportTypeChoice = (option) => {
      const isSelected = quickScoutReportForm.reportType === option.value;
      return (
        <button
          key={option.value}
          type="button"
          className={`scout-report-choice-card ${isSelected ? "selected" : ""}`}
          aria-pressed={isSelected}
          data-selected={isSelected ? "true" : "false"}
          onClick={() => updateQuickScoutReportForm("reportType", option.value)}
        >
          <strong>{option.title}{isSelected ? renderScoutSelectionBadge("Selected") : null}</strong>
          <span>{option.helper}</span>
        </button>
      );
    };
    const selectedProductSummary = productDetailSummary || (currentType.isGuess ? "Product not selected" : "Item/category needed");
    const selectedStoreSummary = storeSelection.valid ? `${storeSelection.storeName} (${storeSelection.retailer})` : "Store not selected";
    const selectedStockSummary = currentType.isGuess ? quickScoutDateLabel() : (selectedTypeOption?.title || currentType.label);
    const selectedCatalogProduct = quickScoutReportForm.catalogProductId
      ? catalogProducts.find((product) => String(product.id) === String(quickScoutReportForm.catalogProductId))
      : null;
    const renderScoutSelectionBadge = (label = "Selected") => (
      <span className="scout-selection-badge" aria-hidden="true">{label}</span>
    );
    const clearScoutStoreSelection = () => setQuickScoutReportForm((current) => ({
      ...current,
      storeId: "", storeName: "", retailer: "", city: "", address: "", state: "", zip: "", region: "",
      manualLocation: "", manualLocationOpen: false, storeConfirmed: false,
    }));
    const selectScoutCatalogProduct = (product = {}) => {
      const known = buildCatalogAutofillDetails(product);
      setQuickScoutReportMessage("");
      setQuickScoutReportForm((current) => ({
        ...current,
        catalogProductId: product.id || "",
        catalogProductName: catalogTitle(product),
        productName: catalogTitle(product),
        productCategory: "Pokemon TCG",
        productType: known.productType || product.productType || product.product_type || "",
        productSetName: known.setName || catalogExpansionName(product) || "",
        productImageUrl: known.itemImage || catalogImage(product) || "",
      }));
    };
    const updateScoutProductName = (value) => {
      setQuickScoutReportMessage("");
      setQuickScoutReportForm((current) => ({
        ...current,
        productName: value,
        catalogProductId: "", catalogProductName: "", productImageUrl: "", productSetName: "", productType: "",
      }));
    };
    const clearScoutCatalogMatch = () => setQuickScoutReportForm((current) => ({
      ...current, catalogProductId: "", catalogProductName: "", productImageUrl: "", productSetName: "", productType: "",
    }));
    const updateScoutProductCategory = (value) => {
      setQuickScoutReportMessage("");
      setQuickScoutReportForm((current) => ({
        ...current, productCategory: value,
        ...(current.productCategory !== value ? { catalogProductId: "", catalogProductName: "", productImageUrl: "", productSetName: "", productType: "" } : {}),
      }));
    };
    const renderNotesField = () => (
      <label className="scout-report-notes-field">
        {currentType.isGuess ? "Details / notes" : "Useful details (optional)"}
        <textarea
          value={quickScoutReportForm.note}
          onChange={(event) => updateQuickScoutReportForm("note", event.target.value)}
          placeholder="Aisle, purchase limit, shelf condition, or anything useful..."
        />
      </label>
    );
    const renderScoutReferenceThumb = (product = {}, imageUrl = catalogImage(product)) => (
      <span key={imageUrl || "no-reference-image"} className="scout-report-catalog-thumb" aria-hidden="true">
        {imageUrl ? <PrivateStorageImage src={imageUrl} alt="" onError={(event) => {
          event.currentTarget.style.display = "none";
          event.currentTarget.nextElementSibling?.removeAttribute("hidden");
        }} /> : null}
        <svg className="scout-report-catalog-placeholder" hidden={Boolean(imageUrl)} viewBox="0 0 40 50" fill="none" focusable="false">
          <rect x="9" y="9" width="22" height="32" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="m20 18 6 7-6 7-6-7 6-7Z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
    );
    const selectScoutCatalogSuggestion = (suggestion = {}) => {
      const product = suggestion.product || catalogProducts.find((entry) => String(entry.id) === String(suggestion.productId || suggestion.id));
      if (product?.id || product?.name) {
        selectScoutCatalogProduct(product);
        return;
      }
      updateQuickScoutReportForm("productName", suggestion.searchValue || suggestion.label || quickScoutReportForm.productName);
    };
    const canAdvanceScoutWizard = (stepKey = activeWizardStep.key) => {
      return !scoutWizardStepError(stepKey);
    };
    const goToScoutWizardStep = (stepKey) => {
      const targetIndex = wizardSteps.findIndex((step) => step.key === stepKey);
      if (targetIndex < 0) return;
      const firstIncompleteIndex = wizardSteps.findIndex((step) => !canAdvanceScoutWizard(step.key));
      if (firstIncompleteIndex >= 0 && targetIndex > firstIncompleteIndex) {
        setQuickScoutReportStep(wizardSteps[firstIncompleteIndex].key);
        return;
      }
      setQuickScoutReportStep(stepKey);
    };
    const goNextScoutWizardStep = () => {
      const error = scoutWizardStepError(activeWizardStep.key);
      if (error) {
        setQuickScoutReportMessage(error);
        return;
      }
      setQuickScoutReportMessage("");
      setQuickScoutReportStep(wizardSteps[Math.min(activeStepIndex + 1, wizardSteps.length - 1)].key);
    };
    const goBackScoutWizardStep = () => {
      setQuickScoutReportStep(wizardSteps[Math.max(activeStepIndex - 1, 0)].key);
    };
    const handleScoutWizardTouchStart = (event) => {
      quickScoutWizardTouchRef.current = event.touches?.[0]?.clientX || 0;
    };
    const handleScoutWizardTouchEnd = (event) => {
      const startX = quickScoutWizardTouchRef.current;
      const endX = event.changedTouches?.[0]?.clientX || 0;
      const delta = endX - startX;
      quickScoutWizardTouchRef.current = 0;
      if (Math.abs(delta) < 56) return;
      if (delta < 0) goNextScoutWizardStep();
      if (delta > 0 && activeStepIndex > 0) goBackScoutWizardStep();
    };

    if (quickScoutReportStep === "submitted") {
      const savedProductName = quickScoutReportSaved?.productName || quickScoutReportSaved?.itemName || quickScoutReportForm.productName || quickScoutReportForm.productCategory || "Report detail saved";
      const savedStockStatus = scoutStockStatusLabel(quickScoutReportSaved?.stockStatus || quickScoutReportSaved?.stock_status || quickScoutReportForm.stockLeft)
        || quickScoutReportSaved?.quickReportLabel
        || quickScoutReportTypeMeta(quickScoutReportSaved?.quickReportType || quickScoutReportForm.reportType).label;
      const savedSubmittedTime = quickScoutReportSaved ? scoutReportDateTimeLabel(quickScoutReportSaved) : quickScoutDateLabel();
      const savedSignalType = currentType.isGuess
        ? "Community Guess (not confirmed stock)"
        : (quickScoutReportSaved?.confidenceLabel || quickScoutReportSaved?.confidence_label || scoutReportConfidenceBadge(quickScoutReportSaved || {}).label || "New Scout report");
      const savedToCloud = quickScoutReportSaved?.sourceStatus === "supabase";
      return (
        <section className="scout-quick-report-v2 scout-quick-report-sent">
          <div className="scout-quick-report-success">
            <span>{currentType.isGuess ? "Saved" : savedToCloud ? "Saved to your account" : "Saved locally"}</span>
            <h3 data-scout-step-heading={!currentType.isGuess || undefined} tabIndex={-1}>{currentType.isGuess ? "Scout note saved." : "Scout report saved."}</h3>
            <p>{currentType.isGuess ? "Your planning note stays separate from live stock reports." : savedToCloud ? "Your report is saved to your account. Add details now or return to your reports later." : "Your report is saved on this device. It has not been posted to the community."}</p>
            {quickScoutReportMessage ? <small>{quickScoutReportMessage}</small> : null}
          </div>
          <div className="scout-report-review-grid scout-submit-confirmation-grid" aria-label="Submitted Scout report confirmation">
            <div>
              <span>Store</span>
              <strong>{quickScoutReportSaved?.storeName || quickScoutReportForm.storeName || quickScoutReportForm.manualLocation || "Store not selected"}</strong>
            </div>
            <div>
              <span>Products seen</span>
              <strong>{savedProductName}</strong>
            </div>
            <div>
              <span>Stock status</span>
              <strong>{savedStockStatus}</strong>
            </div>
            <div>
              <span>Visit time</span>
              <strong>{savedSubmittedTime}</strong>
            </div>
            <div>
              <span>Saved as</span>
              <strong>{savedSignalType}</strong>
            </div>
          </div>
          <div className="quick-actions">
            <button type="button" className="secondary-button" onClick={openQuickScoutReportDetails}>Add details</button>
          </div>
        </section>
      );
    }

    return (
      <form
        id="quick-scout-report-form"
        className={`scout-report-flow scout-quick-report-v2 scout-report-wizard ${currentType.isGuess ? "" : "scout-report-quick stock-report-easy"}`}
        onSubmit={submitQuickScoutReport}
        onTouchStart={handleScoutWizardTouchStart}
        onTouchEnd={handleScoutWizardTouchEnd}
      >
        {quickScoutReportMessage ? <div className="form-error" role="alert">{quickScoutReportMessage}</div> : null}
        {currentType.isGuess ? <div className="scout-report-progress">
          <div>
            <strong>Step {activeStepIndex + 1} of {wizardSteps.length}</strong>
            <span>{activeWizardStep.title || activeWizardStep.label}</span>
          </div>
          <div className="scout-report-progress-track" aria-hidden="true">
            <i style={{ width: `${((activeStepIndex + 1) / wizardSteps.length) * 100}%` }} />
          </div>
        </div> : null}
        <div className="scout-report-stepper" aria-label="Scout report steps">
          {wizardSteps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              className={`scout-report-step-pill ${step.key === activeWizardStep.key ? "active" : ""} ${index < activeStepIndex ? "complete" : ""}`}
              aria-current={step.key === activeWizardStep.key ? "step" : undefined}
              aria-pressed={step.key === activeWizardStep.key}
              onClick={() => goToScoutWizardStep(step.key)}
            >
              <span className="scout-report-step-number">{index + 1}</span>
              <span className="scout-report-step-label">{step.label}</span>
              {currentType.isGuess ? (step.key === activeWizardStep.key ? <em>Current</em> : index < activeStepIndex ? <em>Done</em> : null) : null}
            </button>
          ))}
        </div>
        {!currentType.isGuess ? <p className="sr-only" role="status">Step {activeStepIndex + 1} of {wizardSteps.length}: {activeWizardStep.title || activeWizardStep.label}.</p> : null}
        {currentType.isGuess ? <>
        <div className="scout-current-selection-strip" aria-live="polite">
          <strong>Current choice</strong>
          <span>Type: {selectedTypeOption?.title || currentType.label}</span>
          <span>Store: {selectedStoreSummary}</span>
          <span>{currentType.isGuess ? "Timing" : "Status"}: {selectedStockSummary}</span>
          <span>Product: {selectedProductSummary}</span>
        </div>
        <div className="scout-required-checklist" aria-label="Required Scout report fields">
          {scoutRequiredChecklist.map((item) => (
            <span key={item.key} className={item.ready ? "is-ready" : "needs-review"}>
              {item.ready ? "Ready" : "Needed"}: {item.label}
            </span>
          ))}
        </div>
        <div className="scout-flow-guidance-card" aria-live="polite">
          <div>
            <strong>Scout Points</strong>
            <span>{scoutGuessPoints} / {MIN_SCOUT_POINTS_FOR_GUESS} points for community guesses</span>
          </div>
          <div className="scout-points-meter" aria-hidden="true">
            <i style={{ width: `${scoutPointsProgress}%` }} />
          </div>
          <p>
            {currentUserCanSubmitScoutGuess
              ? "Guess/planner notes stay separate from confirmed stock reports."
              : `${scoutPointsRemaining} more point${scoutPointsRemaining === 1 ? "" : "s"} unlock community guess notes. Accurate reports and photos help.`}
          </p>
        </div>

        </> : null}

        {!currentType.isGuess && ["where", "essentials"].includes(quickScoutReportStep) ? (
          <StockScreenshotImport
            stores={stores}
            reportDraft={quickScoutReportForm}
            onApply={(patch) => {
              setQuickScoutReportForm((current) => ({ ...current, ...patch }));
              setQuickScoutReportMessage("Screenshot details added to your draft. Confirm the store and observed time before posting.");
            }}
          />
        ) : null}

        {quickScoutReportStep === "essentials" ? (
          <section className="scout-report-step-card active scout-essentials-step">
            <div className="scout-report-step-header">
              <span>Step 1</span>
              <div>
                <h3 data-scout-step-heading={!currentType.isGuess || undefined} tabIndex={-1}>Post the restock essentials</h3>
                <p>Product details and extra proof can come after this report is posted.</p>
              </div>
            </div>
            <div className="scout-report-essential-grid">
              <div className="scout-report-essential-panel">
                <label className="scout-report-store-search-field">
                  <span>Store</span>
                  <input
                    value={quickScoutReportForm.storeSearch}
                    onChange={(event) => updateQuickScoutReportForm("storeSearch", event.target.value)}
                    placeholder="Search store, city, ZIP, or nickname"
                  />
                </label>
                <input
                  value={quickScoutReportForm.manualLocation}
                  onChange={(event) => updateQuickScoutReportForm("manualLocation", event.target.value)}
                  placeholder="Manual store/location if missing"
                />
                {selectedStoreContext ? (
                  <article className="scout-report-store-card selected scout-report-store-card--compact">
                    <div className="scout-report-store-main">
                      <div>
                        <strong>{getScoutStoreDisplayName(selectedStoreContext)}</strong>
                        <p>{getScoutQuickRetailer(selectedStoreContext)}{selectedStoreContext.city ? ` | ${selectedStoreContext.city}` : ""}{selectedStoreContext.address ? ` | ${selectedStoreContext.address}` : ""}</p>
                        {scoutStoreAliasDisplayValues(selectedStoreContext).length ? (
                          <small className="scout-store-alias-line">Also searchable as: {scoutStoreAliasDisplayValues(selectedStoreContext).join(", ")}</small>
                        ) : null}
                      </div>
                      <span className="scout-store-temperature scout-store-temperature-watching">{selectedStore ? "Store selected" : "Manual location"}</span>
                    </div>
                    <div className="scout-report-store-actions">
                      <button type="button" className="secondary-button" onClick={clearScoutStoreSelection}>Change</button>
                    </div>
                  </article>
                ) : (
                  <div className="scout-report-store-list scout-report-store-list--compact">
                    {recommendedStoreRows.slice(0, 2).map((row) => (
                      <button key={row.id || `${row.name}-${row.city}`} type="button" className="scout-report-store-pick" onClick={() => selectQuickScoutReportStore(row.store)}>
                        <strong>{row.name}</strong>
                        <span>{row.retailer}{row.city ? ` | ${row.city}` : ""}{Number.isFinite(row.distance) ? ` | ${row.distance.toFixed(1)} mi` : ""}</span>
                      </button>
                    ))}
                    {!recommendedStoreRows.length ? (
                      <div className="scout-report-empty-step">
                        <strong>No matching stores</strong>
                        <p>Enter a manual location and confirm it before saving.</p>
                      </div>
                    ) : null}
                  </div>
                )}
                {storeSelection.valid && storeSelection.needsStoreReview ? (
                  <label className="scout-confirm-location-row">
                    <input
                      type="checkbox"
                      checked={Boolean(quickScoutReportForm.storeConfirmed)}
                      onChange={(event) => updateQuickScoutReportForm("storeConfirmed", event.target.checked)}
                    />
                    <span>
                      <strong>I confirm this is the exact store/location.</strong>
                      <small>Manual or uncertain stores route to moderation if they look unusual.</small>
                    </span>
                  </label>
                ) : null}
              </div>
              <div className="scout-report-essential-panel">
                <label className="scout-visit-time-field">
                  <span>Visit date &amp; time</span>
                  <input
                    type="datetime-local"
                    value={quickScoutVisitDateTimeValue()}
                    onChange={(event) => updateQuickScoutVisitDateTime(event.target.value)}
                    required
                  />
                  <small>Use this if you are backfilling a store visit from earlier.</small>
                </label>
                <div className="scout-report-date-presets" role="group" aria-label="Quick report time presets">
                  <button type="button" className={quickScoutReportForm.dateMode === "today" || quickScoutReportForm.dateMode === "earlier_today" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "today" || quickScoutReportForm.dateMode === "earlier_today"} onClick={() => applyQuickScoutReportTimePreset("now")}>Today</button>
                  <button type="button" className={quickScoutReportForm.dateMode === "yesterday" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "yesterday"} onClick={() => applyQuickScoutReportTimePreset("yesterday")}>Yesterday</button>
                  <button type="button" className={quickScoutReportForm.dateMode === "pick_date" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "pick_date"} onClick={() => applyQuickScoutReportTimePreset("pick_date")}>Pick date</button>
                </div>
                <label className="scout-report-notes-field scout-report-notes-field--secondary">
                  Optional quick note
                  <textarea
                    value={quickScoutReportForm.note}
                    onChange={(event) => updateQuickScoutReportForm("note", event.target.value)}
                    placeholder="Aisle, limit sign, vendor cart, display location..."
                  />
                </label>
                <label className="scout-report-proof-text-field">
                  Proof note or link
                  <input
                    value={quickScoutReportForm.proofText}
                    onChange={(event) => updateQuickScoutReportForm("proofText", event.target.value)}
                    placeholder="Optional receipt detail, sign text, or link"
                  />
                </label>
                <details className="scout-optional-proof-panel">
                  <summary>Add proof/photo (optional)</summary>
                  <label>
                    Add proof/photo (optional)
                    <input ref={photoInputRef} type="file" accept="image/*" onChange={changeDraftPhoto} />
                    <small>Shelf photo, display photo, receipt, limit sign, vendor cart, or other proof.</small>
                  </label>
                </details>
                {quickScoutReportForm.photoUrl ? (
                  <div className="scout-photo-preview">
                    <PrivateStorageImage src={quickScoutReportForm.photoUrl} alt="" />
                    <div>
                      <strong>Image attached</strong>
                      <span>Proof is optional, but it improves confidence.</span>
                    </div>
                    <button type="button" className="secondary-button" onClick={removeDraftPhoto}>Remove photo</button>
                  </div>
                ) : null}
                <div className="scout-confidence-preview">
                  <span className={`scout-confidence-pill scout-confidence-pill--${confidenceBadge.key}`}>{confidenceBadge.label}</span>
                  <p>{confidenceBadge.helper}</p>
                </div>
              </div>
            </div>
            <div className="scout-report-status-panel">
              <span>Report status</span>
              <div className="scout-report-type-grid" role="group" aria-label="Report status">
                {quickReportTypeOptions.map((option) => {
                  const isSelected = quickScoutReportForm.reportType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`scout-report-choice-card ${isSelected ? "selected" : ""}`}
                      aria-pressed={isSelected}
                      data-selected={isSelected ? "true" : "false"}
                      onClick={() => updateQuickScoutReportForm("reportType", option.value)}
                    >
                      <strong>{option.title}{isSelected ? renderScoutSelectionBadge("Selected") : null}</strong>
                      <span>{option.helper}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {quickScoutReportStep === "product" ? (
          <section className="scout-report-step-card active">
            <div className="scout-report-step-header">
              <span>Step 1</span>
              <div>
                <h3 data-scout-step-heading={!currentType.isGuess || undefined} tabIndex={-1}>What did you see?</h3>
                <p>Search the catalog, pick a common product chip, or type a manual product. Status and quantity stay visible before you move on.</p>
              </div>
            </div>
            <div className="scout-report-product-search">
              <label>
                <span>Catalog search or manual product</span>
                <LazySmartCatalogSearchBox
                  value={quickScoutReportForm.productName}
                  onChange={(value) => updateQuickScoutReportForm("productName", value)}
                  onSearch={(value) => updateQuickScoutReportForm("productName", value)}
                  onSelectSuggestion={selectScoutCatalogSuggestion}
                  supabase={supabase}
                  isSupabaseConfigured={isSupabaseConfigured}
                  mapRow={mapCatalog}
                  productGroup="All"
                  dataFilter="All"
                  placeholder="Search product, set, UPC, SKU, or card name"
                  maxSuggestions={6}
                  localCatalogProducts={catalogProducts}
                  money={money}
                  autoFocus
                />
              </label>
              <div className="scout-product-chip-row" aria-label="Quick product searches">
                {quickProductChips.map((chip) => (
                  <button key={chip} type="button" className="secondary-button" onClick={() => updateQuickScoutReportForm("productName", chip)}>
                    {chip}
                  </button>
                ))}
              </div>
              {selectedCatalogProduct || quickScoutReportForm.productImageUrl ? (
                <article className="scout-selected-product-card">
                  {quickScoutReportForm.productImageUrl ? <PrivateStorageImage src={quickScoutReportForm.productImageUrl} alt="" /> : <span className="scout-selected-product-thumb">Item</span>}
                  <div className="scout-selected-product-copy">
                    <strong>{quickScoutReportForm.catalogProductName || quickScoutReportForm.productName}</strong>
                    <small>{[quickScoutReportForm.productSetName, quickScoutReportForm.productType].filter(Boolean).join(" | ") || "Catalog item selected"}</small>
                    <span className={`scout-confidence-pill scout-confidence-pill--${confidenceBadge.key}`}>{confidenceBadge.label}</span>
                  </div>
                  <div className="scout-selected-product-actions">
                    <button type="button" className="secondary-button" onClick={() => setQuickScoutReportForm((current) => ({ ...current, catalogProductId: "", catalogProductName: "", productImageUrl: "", productSetName: "", productType: "" }))}>
                      Clear match
                    </button>
                  </div>
                </article>
              ) : null}
              {productMatches.length ? (
                <div className="scout-catalog-result-strip" aria-label="Catalog matches">
                  {productMatches.map((product) => (
                    <button key={product.id || catalogTitle(product)} type="button" className="catalog-picker-card scout-catalog-mini-card" onClick={() => selectScoutCatalogProduct(product)}>
                      <span className="catalog-thumb">
                        {catalogImage(product) ? (
                          <>
                            <PrivateStorageImage
                              src={catalogImage(product)}
                              alt=""
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                                event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                              }}
                            />
                            {renderProductImageFallback(product, { hidden: true })}
                          </>
                        ) : (
                          renderProductImageFallback(product)
                        )}
                      </span>
                      <span className="catalog-picker-copy">
                        <strong>{catalogTitle(product)}</strong>
                        <small>{catalogProductTypeLabel(product)}{catalogExpansionName(product) ? ` | ${catalogExpansionName(product)}` : ""}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="scout-stock-status-grid">
              {SCOUT_PRODUCT_CATEGORY_OPTIONS.map((category) => {
                const isSelected = quickScoutReportForm.productCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    className={`scout-stock-status-button ${isSelected ? "selected" : ""}`}
                    aria-pressed={isSelected}
                    data-selected={isSelected ? "true" : "false"}
                    onClick={() => updateQuickScoutReportForm("productCategory", category)}
                  >
                    <span>{category}</span>
                    {isSelected ? renderScoutSelectionBadge("Selected") : null}
                  </button>
                );
              })}
            </div>
            <div className="scout-report-type-grid">
              {quickReportTypeOptions.map((option) => {
                const isSelected = quickScoutReportForm.reportType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`scout-report-choice-card ${isSelected ? "selected" : ""}`}
                    aria-pressed={isSelected}
                    data-selected={isSelected ? "true" : "false"}
                    onClick={() => updateQuickScoutReportForm("reportType", option.value)}
                  >
                    <strong>{option.title}{isSelected ? renderScoutSelectionBadge("Selected") : null}</strong>
                    <span>{option.helper}</span>
                  </button>
                );
              })}
            </div>
            <div className="scout-report-detail-grid">
              <label>
                Quantity/status detail
                <input value={quickScoutReportForm.quantity} onChange={(event) => updateQuickScoutReportForm("quantity", event.target.value)} placeholder="Optional qty or estimate" />
              </label>
              <label>
                Price / MSRP
                <input inputMode="decimal" value={quickScoutReportForm.price} onChange={(event) => updateQuickScoutReportForm("price", event.target.value)} placeholder="Optional" />
              </label>
            </div>
            <div className="scout-selected-store-confirmation">
              {renderScoutSelectionBadge("Item step")}
              <span>{selectedProductSummary === "Product not selected" ? "Pokemon category selected by default. Add exact product details when useful." : selectedProductSummary}</span>
            </div>
          </section>
        ) : null}

        {quickScoutReportStep === "where" ? (
          <section className="scout-report-step-card active scout-where-step">
            <div className="scout-report-step-header">
              <span>{currentType.isGuess ? "Store" : "Step 1"}</span>
              <div>
                <h3 data-scout-step-heading={!currentType.isGuess || undefined} tabIndex={-1}>{currentType.isGuess ? "Choose the store or location" : "Which store did you visit?"}</h3>
                <p>{currentType.isGuess ? "Choose where this planner note belongs. Guesses stay separate from confirmed reports." : "Choose the exact location and when you saw it."}</p>
              </div>
            </div>
            {selectedStoreContext ? (
              <article className="scout-report-store-card selected">
                <div className="scout-report-store-main">
                  <div>
                    <strong>{getScoutStoreDisplayName(selectedStoreContext)}</strong>
                    <p>{getScoutQuickRetailer(selectedStoreContext)}{selectedStoreContext.city ? ` | ${selectedStoreContext.city}` : ""}{getScoutQuickStoreZip(selectedStoreContext) ? ` | ${getScoutQuickStoreZip(selectedStoreContext)}` : ""}{selectedStoreContext.address ? ` | ${selectedStoreContext.address}` : ""}</p>
                    {scoutStoreAliasDisplayValues(selectedStoreContext).length ? (
                      <small className="scout-store-alias-line">Also searchable as: {scoutStoreAliasDisplayValues(selectedStoreContext).join(", ")}</small>
                    ) : null}
                  </div>
                  {currentType.isGuess ? <span className="scout-store-temperature scout-store-temperature-watching">{selectedStore ? "Store selected" : "Manual location selected"}</span> : (
                    <button type="button" className="secondary-button scout-store-change" aria-label="Change store" onClick={clearScoutStoreSelection}>Change</button>
                  )}
                </div>
                {currentType.isGuess ? <div className="scout-selected-store-confirmation">
                  {renderScoutSelectionBadge(selectedStore ? "Store selected" : "Manual selected")}
                  <span>Reporting at this exact location. Suggestions will not replace it.</span>
                </div> : null}
                {storeSelection.valid && storeSelection.needsStoreReview ? (
                  <label className="scout-confirm-location-row">
                    <input
                      type="checkbox"
                      checked={Boolean(quickScoutReportForm.storeConfirmed)}
                      onChange={(event) => updateQuickScoutReportForm("storeConfirmed", event.target.checked)}
                    />
                    <span>
                      <strong>I confirm this is the store/location.</strong>
                      <small>Manual locations are flagged for review if they look unusual.</small>
                    </span>
                  </label>
                ) : null}
                {currentType.isGuess ? <div className="scout-report-store-actions">
                  <button type="button" className="secondary-button" onClick={clearScoutStoreSelection}>Change store</button>
                </div> : null}
                {!currentType.isGuess ? <p className="stock-report-observed-summary">Observed: {quickScoutDateLabel()}</p> : null}
                {!currentType.isGuess ? (
                  <details className="scout-report-disclosure stock-report-time-disclosure" open={!visitValidationPreview.ok || undefined}>
                    <summary>Change observed time</summary>
                    <div className="scout-report-detail-grid scout-report-time-grid">
                      <label className="scout-visit-time-field">
                        <span>Observed time</span>
                        <input
                          type="datetime-local"
                          value={quickScoutVisitDateTimeValue()}
                          onChange={(event) => updateQuickScoutVisitDateTime(event.target.value)}
                          required
                        />
                        <small>Use when the stock was seen, rather than when the post or screenshot was made.</small>
                      </label>
                      <div className="scout-report-date-presets" role="group" aria-label="Quick report time presets">
                        <button type="button" className={quickScoutReportForm.dateMode === "today" || quickScoutReportForm.dateMode === "earlier_today" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "today" || quickScoutReportForm.dateMode === "earlier_today"} onClick={() => applyQuickScoutReportTimePreset("now")}>Today</button>
                        <button type="button" className={quickScoutReportForm.dateMode === "yesterday" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "yesterday"} onClick={() => applyQuickScoutReportTimePreset("yesterday")}>Yesterday</button>
                        <button type="button" className={quickScoutReportForm.dateMode === "pick_date" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "pick_date"} onClick={() => applyQuickScoutReportTimePreset("pick_date")}>Pick date</button>
                      </div>
                    </div>
                  </details>
                ) : null}
              </article>
            ) : (
              <>
                <label className="scout-report-store-tools">
                  <span>Find your store</span>
                  <input
                    value={quickScoutReportForm.storeSearch}
                    onChange={(event) => updateQuickScoutReportForm("storeSearch", event.target.value)}
                    placeholder="Search store, city, ZIP, or nickname"
                  />
                </label>
                <details className="scout-report-disclosure scout-area-disclosure">
                  <summary>{locationAvailable ? `Search area: ${scoutAreaText || "your location"}` : "Set an area to find nearby stores"}</summary>
                  <label className="scout-area-field">
                    <span>Scout area / ZIP</span>
                    <input
                      value={locationSettings.manualLocation}
                      onChange={(event) => updateLocationSettings({ mode: "manual", manualLocation: event.target.value, selectedSavedLocation: event.target.value, trackingEnabled: false })}
                      placeholder="ZIP, city, or Scout area"
                    />
                    <small>Used to sort nearby stores. We do not need your exact address.</small>
                  </label>
                </details>
                <div className="scout-report-store-list">
                  {recommendedStoreRows.length ? recommendedStoreRows.map((row) => {
                    const aliasValues = scoutStoreAliasDisplayValues(row.store);
                    return (
                      <article key={row.id || `${row.name}-${row.city}`} className="scout-report-store-card scout-report-store-card--result">
                        <div className="scout-report-store-top">
                          <div>
                            <strong>{row.name}</strong>
                            <p className="scout-store-location-copy">{row.address || scoutStoreLocationSummary(row.store)}</p>
                            {aliasValues.length ? <small className="scout-store-alias-line">Also searchable as: {aliasValues.join(", ")}</small> : null}
                          </div>
                          <span className="scout-store-type-badge">{row.retailer || "Store"}</span>
                        </div>
                        <div className="scout-report-store-meta scout-report-store-meta--friendly">
                          <span>{scoutStoreDistanceAreaLabel(row)}</span>
                          <span>{scoutStoreRecentSignalLabel(row)}</span>
                          <span>{row.latestReport ? scoutStockStatusLabel(row.latestReport.stockStatus || row.latestReport.stock_status || "") : "No recent signals"}</span>
                        </div>
                        <div className="scout-report-store-actions">
                          <button type="button" className="secondary-button" onClick={() => selectQuickScoutReportStore(row.store)}>Select store</button>
                          <button type="button" className="ghost-button" onClick={() => openStoreProfile({
                            ...row,
                            profile: buildStoreProfileSummary(row.store, {
                              reports: scoutReportRows,
                              guesses: scoutGuessRows,
                              predictions: scoutForecastPreviewRows,
                              tidepoolPosts,
                              admin: adminEditModeActive,
                            }),
                          })}>Open store details</button>
                        </div>
                      </article>
                    );
                  }) : (
                    <div className="scout-report-empty-step">
                      <strong>No matching stores</strong>
                      <p>Try a retailer, city, ZIP, nickname, or use the manual fallback.</p>
                    </div>
                  )}
                </div>
                {recommendedStoreRows.length && !quickScoutReportForm.manualLocationOpen && !quickScoutReportForm.manualLocation ? (
                  <button type="button" className="secondary-button scout-manual-store-toggle" onClick={() => updateQuickScoutReportForm("manualLocationOpen", true)}>Can't find store?</button>
                ) : null}
                {quickScoutReportForm.manualLocationOpen || quickScoutReportForm.manualLocation || !recommendedStoreRows.length ? (
                  <div className="scout-manual-store-panel">
                    <label>
                      Manual store/location fallback
                      <input
                        value={quickScoutReportForm.manualLocation}
                        onChange={(event) => updateQuickScoutReportForm("manualLocation", event.target.value)}
                        placeholder="Store name, city, or general location"
                      />
                    </label>
                    <small>Manual locations are posted with an unusual/needs review signal if the store is not in the directory.</small>
                  </div>
                ) : null}
                {!currentType.isGuess ? <p className="stock-report-observed-summary">Observed: {quickScoutDateLabel()}</p> : null}
                {!currentType.isGuess ? (
                  <details className="scout-report-disclosure stock-report-time-disclosure" open={!visitValidationPreview.ok || undefined}>
                    <summary>Change observed time</summary>
                    <div className="scout-report-detail-grid scout-report-time-grid">
                      <label className="scout-visit-time-field">
                        <span>Observed time</span>
                        <input
                          type="datetime-local"
                          value={quickScoutVisitDateTimeValue()}
                          onChange={(event) => updateQuickScoutVisitDateTime(event.target.value)}
                          required
                        />
                        <small>Use when the stock was seen, rather than when the post or screenshot was made.</small>
                      </label>
                      <div className="scout-report-date-presets" role="group" aria-label="Quick report time presets">
                        <button type="button" className={quickScoutReportForm.dateMode === "today" || quickScoutReportForm.dateMode === "earlier_today" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "today" || quickScoutReportForm.dateMode === "earlier_today"} onClick={() => applyQuickScoutReportTimePreset("now")}>Today</button>
                        <button type="button" className={quickScoutReportForm.dateMode === "yesterday" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "yesterday"} onClick={() => applyQuickScoutReportTimePreset("yesterday")}>Yesterday</button>
                        <button type="button" className={quickScoutReportForm.dateMode === "pick_date" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "pick_date"} onClick={() => applyQuickScoutReportTimePreset("pick_date")}>Pick date</button>
                      </div>
                    </div>
                  </details>
                ) : null}
              </>
            )}
            {whereStepError ? <p className="scout-field-error">{whereStepError}</p> : null}
          </section>
        ) : null}

        {quickScoutReportStep === "status" ? (
          <section className="scout-report-step-card active scout-status-step">
            <div className="scout-report-step-header">
              <span>Step 2</span>
              <div>
                <h3 data-scout-step-heading={!currentType.isGuess || undefined} tabIndex={-1}>Shelf status</h3>
                <p>Choose the closest public signal. This is about what you observed, not a prediction.</p>
              </div>
            </div>
            <div className="scout-report-type-grid scout-report-status-grid" role="group" aria-label="Shelf status">
              {quickReportTypeOptions.map((option) => {
                const isSelected = quickScoutReportForm.reportType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`scout-report-choice-card ${isSelected ? "selected" : ""}`}
                    aria-pressed={isSelected}
                    data-selected={isSelected ? "true" : "false"}
                    onClick={() => updateQuickScoutReportForm("reportType", option.value)}
                  >
                    <strong>{option.title}{isSelected ? renderScoutSelectionBadge("Selected") : null}</strong>
                    <span>{option.helper}</span>
                  </button>
                );
              })}
            </div>
            <div className="scout-location-trust-note">
              <strong>Item/category is next</strong>
              <span>Before saving, add a product category, item name, or useful shelf detail so the report is meaningful.</span>
            </div>
            {statusStepError ? <p className="scout-field-error">{statusStepError}</p> : null}
          </section>
        ) : null}

        {quickScoutReportStep === "details" ? (
          <section className="scout-report-step-card active scout-proof-step">
            <div className="scout-report-step-header">
              <span>Step {activeStepIndex + 1}</span>
              <div>
                <h3 data-scout-step-heading={!currentType.isGuess || undefined} tabIndex={-1}>{currentType.isGuess ? "Add guess context" : "What did you see?"}</h3>
                <p>{currentType.isGuess ? "Keep planner notes separate from observed reports." : "Choose the shelf status and a category or product. A photo is optional."}</p>
              </div>
            </div>
            {currentType.isGuess ? <div className="scout-confidence-preview">
              <span className={`scout-confidence-pill scout-confidence-pill--${confidenceBadge.key}`}>{confidenceBadge.label}</span>
              <p>{confidenceBadge.helper}</p>
            </div> : null}
            {!currentType.isGuess ? (
              <div className="scout-report-status-panel">
                <h4>Shelf status</h4>
                <div className="scout-report-type-grid scout-report-status-grid" role="group" aria-label="Shelf status">
                  {quickReportTypeOptions.filter((option) => commonReportTypes.includes(option.value)).map(renderReportTypeChoice)}
                </div>
                <details className="scout-report-disclosure" open={!commonReportTypes.includes(quickScoutReportForm.reportType) || undefined}>
                  <summary>Other shelf observations</summary>
                  <div className="scout-report-type-grid" role="group" aria-label="Other shelf observations">
                    {quickReportTypeOptions.filter((option) => !commonReportTypes.includes(option.value)).map(renderReportTypeChoice)}
                  </div>
                </details>
                {statusStepError ? <p className="scout-field-error">{statusStepError}</p> : null}
              </div>
            ) : null}
            {!currentType.isGuess ? (
              <div className="scout-report-required-detail-panel">
                <div className="scout-report-step-header scout-report-mini-header">
                  <div>
                    <h4>Which cards or products?</h4>
                    <p>A category is enough if you do not know the exact name.</p>
                  </div>
                </div>
                <div className="scout-product-chip-row scout-category-chip-row" role="group" aria-label="Scout report item category">
                  {primaryCategories.map((category) => {
                    const isSelected = quickScoutReportForm.productCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        className={`secondary-button ${isSelected ? "selected" : ""}`}
                        aria-pressed={isSelected}
                        onClick={() => updateScoutProductCategory(category)}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
                {otherCategories.length ? (
                  <details className="scout-report-disclosure stock-report-more-categories" open={otherCategories.includes(quickScoutReportForm.productCategory) || undefined}>
                    <summary>More categories</summary>
                    <div className="scout-product-chip-row scout-category-chip-row" role="group" aria-label="More item categories">
                      {otherCategories.map((category) => (
                        <button key={category} type="button" className={`secondary-button ${quickScoutReportForm.productCategory === category ? "selected" : ""}`} aria-pressed={quickScoutReportForm.productCategory === category} onClick={() => updateScoutProductCategory(category)}>{category}</button>
                      ))}
                    </div>
                  </details>
                ) : null}
                <details className="scout-report-disclosure stock-report-product-disclosure" open={Boolean(quickScoutReportForm.productName || quickScoutReportForm.catalogProductId) || undefined}>
                  <summary>Add product name <span>Optional</span></summary>
                <label className="scout-report-notes-field scout-report-product-field">
                  Product name (optional)
                  <input
                    value={quickScoutReportForm.productName}
                    onChange={(event) => updateScoutProductName(event.target.value)}
                    placeholder="e.g. Surging Sparks ETB or booster bundles"
                    autoComplete="off"
                    aria-describedby="scout-report-catalog-help"
                  />
                </label>
                <p id="scout-report-catalog-help" className="scout-report-catalog-help">Choose a catalog match or keep your own wording. A category alone is enough.</p>
                {quickScoutReportForm.catalogProductId ? (
                  <article className="scout-report-catalog-selection" aria-label="Selected catalog product">
                    {renderScoutReferenceThumb(selectedCatalogProduct || {}, quickScoutReportForm.productImageUrl)}
                    <div><span>Catalog reference image</span><strong>{quickScoutReportForm.catalogProductName || quickScoutReportForm.productName}</strong><small>{[quickScoutReportForm.productSetName, quickScoutReportForm.productType].filter(Boolean).join(" · ") || "Selected from the catalog"}</small></div>
                    <button type="button" className="secondary-button" onClick={clearScoutCatalogMatch}>Clear match</button>
                  </article>
                ) : productMatches.length ? (
                  <div className="scout-report-catalog-matches" role="group" aria-label="Catalog matches">
                    <span>From the catalog · reference images</span>
                    {productMatches.slice(0, 3).map((product) => (
                      <button key={product.id || catalogTitle(product)} type="button" className="scout-report-catalog-result" aria-label={`Use ${catalogTitle(product)}`} onClick={() => selectScoutCatalogProduct(product)}>
                        {renderScoutReferenceThumb(product)}
                        <span><strong>{catalogTitle(product)}</strong><small>{[catalogExpansionName(product), catalogProductTypeLabel(product)].filter(Boolean).join(" · ")}</small></span>
                        <span className="scout-report-catalog-use" aria-hidden="true">Use</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                </details>
              </div>
            ) : null}
            {currentType.isGuess ? renderNotesField() : (
              <details className="scout-report-disclosure stock-report-notes-disclosure" open={Boolean(quickScoutReportForm.note) || undefined}>
                <summary>Add useful details <span>Optional</span></summary>
                {renderNotesField()}
              </details>
            )}
            <details className="scout-report-disclosure scout-proof-disclosure" open={currentType.isGuess || Boolean(quickScoutReportForm.photoUrl || quickScoutReportForm.proofText || quickScoutReportForm.proofType !== "manual") || undefined}>
              <summary>Add photo or source <span>Optional</span></summary>
              <p>{currentType.isGuess ? "Add the source or context behind your planning note. This remains a guess, not confirmed stock." : "A shelf photo or source helps others assess the report. Share only what you observed."}</p>
            <div className="scout-stock-status-grid" role="group" aria-label="How you know this report">
              {SCOUT_QUICK_PROOF_TYPES.map((option) => {
                const isSelected = quickScoutReportForm.proofType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`scout-stock-status-button ${isSelected ? "selected" : ""}`}
                    aria-pressed={isSelected}
                    data-selected={isSelected ? "true" : "false"}
                    onClick={() => updateQuickScoutReportForm("proofType", option.value)}
                  >
                    <span>{option.label}</span>
                    {isSelected ? renderScoutSelectionBadge("Selected") : null}
                  </button>
                );
              })}
            </div>
            <div className="scout-report-detail-grid">
              <label>
                Add proof/photo (optional)
                <input ref={photoInputRef} type="file" accept="image/*" onChange={changeDraftPhoto} />
                <small>Shelf photo, display photo, receipt, limit sign, vendor cart, or other proof.</small>
              </label>
              <label>
                Proof text or link
                <input
                  value={quickScoutReportForm.proofText}
                  onChange={(event) => updateQuickScoutReportForm("proofText", event.target.value)}
                  placeholder="Receipt detail, screenshot note, site link..."
                />
              </label>
            </div>
            {!locationAvailable && quickScoutReportForm.proofType === "manual" ? (
              <div className="scout-report-empty-step">
                <strong>Proof recommended</strong>
                <p>Location is off, so a photo, receipt, shelf/sign photo, or extra detail will make this easier to trust.</p>
              </div>
            ) : null}
            {quickScoutReportForm.photoUrl ? (
              <div className="scout-photo-preview">
                <PrivateStorageImage src={quickScoutReportForm.photoUrl} alt="" />
                <div>
                  <strong>Image attached</strong>
                  <span>Check the image before saving.</span>
                </div>
                <button type="button" className="secondary-button" onClick={removeDraftPhoto}>Remove photo</button>
              </div>
            ) : null}
            </details>
            {!currentType.isGuess ? (
              <details className="scout-report-disclosure stock-report-extra-disclosure" open={Boolean(quickScoutReportForm.quantity || quickScoutReportForm.price) || undefined}>
                <summary>Price and extra details <span>Optional</span></summary>
                <div className="scout-report-detail-grid">
                  <label>
                    Quantity/status detail
                    <input value={quickScoutReportForm.quantity} onChange={(event) => updateQuickScoutReportForm("quantity", event.target.value)} placeholder="e.g. A few left" />
                  </label>
                  <label>
                    Price / MSRP
                    <input inputMode="decimal" value={quickScoutReportForm.price} onChange={(event) => updateQuickScoutReportForm("price", event.target.value)} placeholder="Optional" />
                  </label>
                </div>
                <p className="stock-report-small-note">Use a general stock description unless the shop has approved exact quantities.</p>
              </details>
            ) : null}
            {detailsStepError ? <p className="scout-field-error">{detailsStepError}</p> : null}
          </section>
        ) : null}

        {quickScoutReportStep === "details" && currentType.isGuess ? (
          <section className="scout-report-step-card active">
            <div className="scout-report-step-header">
              <span>Step 3</span>
              <div>
                <h3>Time and remaining stock</h3>
                <p>These details help Scout history without making weak forecasts sound certain.</p>
              </div>
            </div>
            <div className="scout-report-detail-grid">
              <label>
                Quantity estimate
                <input value={quickScoutReportForm.quantity} onChange={(event) => updateQuickScoutReportForm("quantity", event.target.value)} placeholder="Optional qty or estimate" />
              </label>
              <label>
                Price / MSRP
                <input inputMode="decimal" value={quickScoutReportForm.price} onChange={(event) => updateQuickScoutReportForm("price", event.target.value)} placeholder="Optional" />
              </label>
              <label className="scout-visit-time-field">
                <span>Visit date &amp; time</span>
                <input
                  type="datetime-local"
                  value={quickScoutVisitDateTimeValue()}
                  onChange={(event) => updateQuickScoutVisitDateTime(event.target.value)}
                  required
                />
                <small>Use this if you are backfilling a store visit from earlier.</small>
              </label>
            </div>
            <div className="scout-report-date-presets" role="group" aria-label="Quick report time presets">
              <button type="button" className={quickScoutReportForm.dateMode === "today" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "today"} onClick={() => applyQuickScoutReportTimePreset("now")}>Now{quickScoutReportForm.dateMode === "today" ? " ✓" : ""}</button>
              <button type="button" className={quickScoutReportForm.dateMode === "earlier_today" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "earlier_today"} onClick={() => applyQuickScoutReportTimePreset("earlier_today")}>Earlier today{quickScoutReportForm.dateMode === "earlier_today" ? " ✓" : ""}</button>
              <button type="button" className={quickScoutReportForm.dateMode === "yesterday" ? "selected" : ""} aria-pressed={quickScoutReportForm.dateMode === "yesterday"} onClick={() => applyQuickScoutReportTimePreset("yesterday")}>Yesterday{quickScoutReportForm.dateMode === "yesterday" ? " ✓" : ""}</button>
            </div>
            {!currentType.isGuess ? (
              <div className="scout-stock-status-grid" role="group" aria-label="Stock left after purchase">
                {SCOUT_QUICK_STOCK_LEFT_OPTIONS.map((option) => {
                  const isSelected = quickScoutReportForm.stockLeft === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`scout-stock-status-button ${isSelected ? "selected" : ""}`}
                      aria-label={option.helper || option.label}
                      aria-pressed={isSelected}
                      data-selected={isSelected ? "true" : "false"}
                      onClick={() => updateQuickScoutReportForm("stockLeft", option.value)}
                    >
                      <span>{option.label}{option.helper ? ` | ${option.helper}` : ""}</span>
                      {isSelected ? renderScoutSelectionBadge("Selected") : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {quickScoutReportStep === "review" ? (
          <section className="scout-report-step-card active">
            <div className="scout-report-step-header">
              <span>Step {activeStepIndex + 1}</span>
              <div>
                <h3 data-scout-step-heading={!currentType.isGuess || undefined} tabIndex={-1}>{currentType.isGuess ? "Review and save" : "Ready to share this report?"}</h3>
                <p>{currentType.isGuess ? "Nothing is saved until you submit this note." : "Review before saving. Nothing is saved until you tap Save Report."}</p>
              </div>
            </div>
            {!currentType.isGuess && quickScoutReportForm.screenshotImportReviewed ? (
              <p className="stock-report-source-note" role="note">From a community screenshot · needs review <span>{screenshotSourceLabel} source. The original image is not attached.</span></p>
            ) : null}
            <div className="scout-report-review-grid">
              {currentType.isGuess ? summaryRows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              )) : <>
                <div className="scout-review-group" role="group" aria-label="Store and time">
                  <div className="scout-review-group-heading">
                    <span>Store and time</span>
                    <button type="button" className="ghost-button" aria-label="Edit store and time" disabled={quickScoutReportSubmitting} onClick={() => goToScoutWizardStep("where")}>Edit</button>
                  </div>
                  <strong>{[storeSelection.storeName, storeSelection.address, storeSelection.city].filter(Boolean).join(", ") || selectedStoreSummary}</strong>
                  <span className="scout-review-observed-time">Observed: {quickScoutDateLabel()}</span>
                </div>
                <div className="scout-review-group" role="group" aria-label="Shelf status and products">
                  <div className="scout-review-group-heading">
                    <span>Shelf status and products</span>
                    <button type="button" className="ghost-button" aria-label="Edit shelf status and products" disabled={quickScoutReportSubmitting} onClick={() => goToScoutWizardStep("details")}>Edit</button>
                  </div>
                  <strong>{selectedStockSummary}</strong>
                  <div className={`scout-review-product ${quickScoutReportForm.catalogProductId ? "has-reference" : ""}`}>
                    {quickScoutReportForm.catalogProductId ? renderScoutReferenceThumb(selectedCatalogProduct || {}, quickScoutReportForm.productImageUrl) : null}
                    <div>
                      <span>{productDetailSummary}</span>
                      {quickScoutReportForm.catalogProductId ? <small>Catalog reference image · not report proof</small> : null}
                    </div>
                  </div>
                </div>
                <div className="scout-review-group">
                  <span>Shared with</span>
                  <strong>{scoutVisibilityOptionLabel(quickScoutReportForm.visibility || "public", false)}</strong>
                </div>
              </>}
            </div>
            {!currentType.isGuess ? (
              <details className="scout-report-disclosure stock-report-sharing-disclosure">
                <summary>Source and sharing details</summary>
                <label>
                  Who can see this report
                  <select value={quickScoutReportForm.visibility || "public"} onChange={(event) => updateQuickScoutReportForm("visibility", event.target.value)}>
                    {SCOUT_REPORT_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <small>{SCOUT_REPORT_VISIBILITY_OPTIONS.find((option) => option.value === quickScoutReportForm.visibility)?.helper}</small>
                </label>
                <div className="scout-report-review-grid">
                  {summaryRows.filter(([label]) => !["Report type", "Reporting at", "Product details", "Visit date & time"].includes(label)).map(([label, value]) => (
                    <div key={label}><span>{label}</span><strong>{value}</strong></div>
                  ))}
                </div>
                {quickScoutReportForm.note ? <p>{quickScoutReportForm.note}</p> : null}
                <div className="stock-report-review-context">
                  <strong>{confidenceBadge.label}</strong>
                  <p>{confidenceBadge.helper}</p>
                  {quickScoutStoreHasHistory(storeSelection) ? <p>This store already has recent reports. Save only if this is a fresh observation or adds useful context.</p> : null}
                  <p>Shared by store, not private address. Older reports remain in history and may no longer reflect current stock.</p>
                </div>
              </details>
            ) : null}
            {currentType.isGuess ? <div className={storeSelection.valid ? "scout-location-trust-note scout-review-location-card" : "form-error"}>
              <div>
                <strong>{storeSelection.valid ? `Reporting at: ${storeSelection.storeName}` : "Store required"}</strong>
                <span>{storeSelection.valid ? `${storeSelection.retailer}${storeSelection.city ? ` | ${storeSelection.city}` : ""}${storeSelection.address ? ` | ${storeSelection.address}` : ""}` : storeSelection.message}</span>
              </div>
              {storeSelection.valid ? (
                <button type="button" className="secondary-button" onClick={() => setQuickScoutReportStep("where")}>Change store</button>
              ) : null}
            </div> : null}
            {storeSelection.valid && storeSelection.needsStoreReview ? (
              <label className="scout-confirm-location-row">
                <input
                  type="checkbox"
                  checked={Boolean(quickScoutReportForm.storeConfirmed)}
                  onChange={(event) => updateQuickScoutReportForm("storeConfirmed", event.target.checked)}
                />
                <span>
                  <strong>I confirm this is the exact store/location.</strong>
                  <small>Manual or uncertain stores are flagged for review and will not be replaced by nearby suggestions.</small>
                </span>
              </label>
            ) : null}
            {currentType.isGuess && quickScoutReportForm.note ? (
              <div className="scout-report-review-items">
                <p>{quickScoutReportForm.note}</p>
              </div>
            ) : null}
            {currentType.isGuess ? <>
            <div className="scout-location-trust-note">
              <strong>{confidenceBadge.label}</strong>
              <span>{confidenceBadge.helper}</span>
            </div>
            {quickScoutStoreHasHistory(storeSelection) ? (
              <div className="scout-location-trust-note">
                <strong>Check for duplicates</strong>
                <span>This store already has current Scout activity. Save only if this is a fresh visit or adds useful context.</span>
              </div>
            ) : null}
            <div className="scout-location-trust-note">
              <strong>Privacy and freshness</strong>
              <span>Reports are shared by store, not private address. Old reports are kept for history and should not be treated as live stock.</span>
            </div>
            </> : null}
            {reviewStepError ? <div className="form-error" role="alert">{reviewStepError}</div> : null}
          </section>
        ) : null}

        <div className="flow-form-footer scout-wizard-footer">
          {quickScoutReportStep === "submitted" ? (
            <button type="button" onClick={() => closeFlowModal()}>Close</button>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={activeStepIndex <= 0 ? () => closeFlowModal() : goBackScoutWizardStep}>
                {activeStepIndex <= 0 ? "Cancel" : "Back"}
              </button>
              {quickScoutReportStep === "review" ? (
                <button type="button" disabled={scoutSubmitBlocked} onClick={submitQuickScoutReport}>
                  {quickScoutReportSubmitting ? "Saving..." : currentType.isGuess ? "Save Guess" : "Save Report"}
                </button>
              ) : (
                <button type="button" onClick={goNextScoutWizardStep}>{currentType.isGuess ? "Next" : quickScoutReportStep === "details" ? "Review report" : "Continue"}</button>
              )}
            </>
          )}
        </div>
      </form>
    );
  }

  return renderScoutSubmitFlowContent();
}
