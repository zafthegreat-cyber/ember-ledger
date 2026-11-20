// Moved out of App.jsx unchanged (Nov 15, 2026) to shrink the main component file.
import { lazy, useState, Suspense } from "react";
import { BRAND_CONFIG } from "../../config/brand";
import { PrivateStorageImage, PrivateReceiptLink, PrivateReceiptImage } from "../../components/PrivateReceipt.jsx";
import { buildGroupedInventoryValuation, buildInventoryMissingDataPrompts } from "../../utils/inventoryValuationUtils";
import { inventoryEntryIsSold, summarizeForgeGroupedInventoryStatus, deriveGradeAssistReadiness, GRADE_ASSIST_CHECK_FIELDS, normalizeGradeAssistChecklist, GRADE_ASSIST_DISCLAIMER, GRADE_ASSIST_CHECK_OPTIONS } from "../../utils/inventoryDetailUtils";
import { buildPriceReviewFields, priceConfidenceTone, formatPriceDisplay } from "../../utils/pricingReliabilityUtils";
import { FlowNextActionCard } from "../../components/command-system";
import OverflowMenu from "../../components/OverflowMenu";
import ExternalWebLink from "../../components/ExternalWebLink.jsx";
import { gradingDetails } from "../../utils/gradedCopies.mjs";
import GradingFields from "../../components/GradingFields.jsx";
import { MASTER_CARD_VARIANT_LABELS, MASTER_CARD_CONDITION_LABELS, INFO_TOOLTIP_COPY, PURCHASER_NAME_MAX_LENGTH, PERSON_TYPE_OPTIONS, normalizeCollectorShowcaseKind, COLLECTOR_SHOWCASE_KIND_LABELS, sealedProductFrameMeta, collectorShowcaseRarityLabel, collectorShowcaseRarityTone, collectorShowcaseInitials, COLLECTOR_SHOWCASE_RARITY_HELPER, inventoryGroupEntries, summarizeBreakdownRows, itemPurchaserName, hasValue, money, inventoryEntryLabel, shortDate, vaultItemDisplayImage, forgePhysicalLocationLabel, getCatalogImage, statusClass, gradeAssistRecordKey, loadGradeAssistDraft, isWishlistLikeVaultItem, vaultItemSetLabel, vaultItemTypeLabel, vaultItemLocationLabel, friendlyInventoryLabel, vaultCardNumberLabel, vaultVariantLabel, collectorVisualTypeLabel, detectCollectorItemVisualType, vaultStatusLabel, normalizeVaultStatus, vaultItemLastUpdatedLabel, gradeAssistValueComparison, saveGradeAssistDraft, isInventorySealedProduct, inferMasterCardVariantType, renderGenericProductImageFallback, getImageSourceLabel, VAULT_STATUS_OPTIONS, CATEGORIES, VAULT_CONDITIONS, VAULT_STORAGE_LOCATIONS, STATUSES, FORGE_PHYSICAL_LOCATION_OPTIONS, isCatalogCardProduct } from "./vaultItemHelpers.jsx";

const MarketPriceHistoryPanel = lazy(() => import("../../components/MarketPriceHistoryPanel"));
const CenteringCheck = lazy(() => import("../../components/CenteringCheck.jsx"));

function PremiumCardImage({ image, title, subtitle, variantType = "normal", className = "" }) {
  const tone = MASTER_CARD_VARIANT_LABELS[variantType] ? variantType : "other";
  return (
    <div className={`premium-card-image premium-card-image--${tone} ${image ? "has-image" : "is-placeholder"} ${className}`.trim()} aria-label={`${title || "Card"} visual`}>
      {image ? <PrivateStorageImage src={image} alt="" loading="lazy" /> : (
        <div className="premium-card-placeholder-art" aria-hidden="true">
          <span className="premium-card-crest" />
          <strong>{title || "Card"}</strong>
          <small>{subtitle || BRAND_CONFIG.shortName}</small>
        </div>
      )}
    </div>
  );
}

function MasterVariantRail({ masterCard, compact = false }) {
  if (!masterCard?.variants?.length) return null;
  return (
    <div className={`master-variant-rail${compact ? " master-variant-rail--compact" : ""}`} aria-label={`${masterCard.name} variants and copies`}>
      {masterCard.variants.slice(0, compact ? 4 : 8).map((variant) => {
        const countLabel = variant.ownedCount > 0
          ? `${variant.ownedCount} owned`
          : variant.wantedCount > 0
            ? `${variant.wantedCount} wanted`
            : "Tracked";
        const conditionLabel = variant.condition ? MASTER_CARD_CONDITION_LABELS[variant.condition] || "" : "";
        return (
          <span className={`master-variant-pill master-variant-pill--${variant.variantType}`} key={variant.id}>
            <b>{variant.label}</b>
            <small>{[countLabel, conditionLabel].filter(Boolean).join(" / ")}</small>
          </span>
        );
      })}
      {masterCard.variants.length > (compact ? 4 : 8) ? (
        <span className="master-variant-pill master-variant-pill--more">
          <b>+{masterCard.variants.length - (compact ? 4 : 8)}</b>
          <small>more</small>
        </span>
      ) : null}
    </div>
  );
}

function MasterCardFamilyNote({ masterCard }) {
  if (!masterCard) return null;
  return (
    <section className="master-card-family-note" aria-label="Master card grouping">
      <div>
        <span className="trust-badge trust-badge--secure">Master card</span>
        <h4>{masterCard.name}</h4>
        <p>{[masterCard.setName, masterCard.cardNumber ? `#${masterCard.cardNumber}` : ""].filter(Boolean).join(" - ") || "Grouped card identity"}</p>
      </div>
      <MasterVariantRail masterCard={masterCard} compact />
    </section>
  );
}

function InfoTooltip({ label = "More information", children }) {
  const [open, setOpen] = useState(false);
  if (!children) return null;
  return (
    <span className="info-tooltip">
      <button
        type="button"
        className="info-tooltip-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        &#9432;
      </button>
      {open ? (
        <span className="info-tooltip-bubble" role="tooltip">
          {children}
        </span>
      ) : null}
    </span>
  );
}

function Field({ label, children, error = "", fieldId = "", className = "", help = "" }) {
  const classes = [className, error ? "has-error" : ""].filter(Boolean).join(" ");
  if (help) {
    return (
      <div className={["field-help-wrapper", classes].filter(Boolean).join(" ")}>
        <div className="field-help-heading">
          <span>{label}</span>
          <InfoTooltip label="Field information">{help}</InfoTooltip>
        </div>
        <label className="field-control-label" data-validation-field={fieldId || undefined}>
          <span className="sr-only">{label}</span>
          {children}
          {error ? <span className="field-error" role="alert">{error}</span> : null}
        </label>
      </div>
    );
  }
  return (
    <label className={classes || undefined} data-validation-field={fieldId || undefined}>
      <span className="field-label-row">
        <span>{label}</span>
      </span>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </label>
  );
}

function PurchaserSelect({
  label = "Who paid?",
  purchasers = [],
  valueId = "",
  valueName = "",
  onSelect,
  onCreatePurchaser,
  onManagePurchasers,
  help = "",
  emptyCopy = "No purchasers yet. Add one to track who paid. People you add here are reusable across Vault, Business, receipts, mileage, sales, and Payout Assist.",
  addLabel = "Add person",
  manageLabel = "Manage People",
}) {
  const [showNewPurchaser, setShowNewPurchaser] = useState(false);
  const [newPurchaserName, setNewPurchaserName] = useState("");
  const [newPurchaserNote, setNewPurchaserNote] = useState("");
  const [newPurchaserType, setNewPurchaserType] = useState("Family");
  const currentActive = purchasers.find((purchaser) => String(purchaser.id) === String(valueId));
  const currentByName = purchasers.find((purchaser) => purchaser.name === valueName);
  const historicalName = valueName && !currentActive && !currentByName ? valueName : "";
  const currentValue = currentActive?.id || currentByName?.id || (historicalName ? "__historical__" : "");

  function handleChange(event) {
    const nextValue = event.target.value;
    if (nextValue === "__add__") {
      setShowNewPurchaser(true);
      return;
    }
    if (nextValue === "__manage__") {
      onManagePurchasers?.();
      return;
    }
    const purchaser = purchasers.find((candidate) => String(candidate.id) === String(nextValue));
    onSelect?.(purchaser || null);
  }

  function saveInlinePurchaser() {
    const created = onCreatePurchaser?.(newPurchaserName, newPurchaserNote, newPurchaserType);
    if (!created) return;
    onSelect?.(created);
    setNewPurchaserName("");
    setNewPurchaserNote("");
    setNewPurchaserType("Family");
    setShowNewPurchaser(false);
  }

  return (
    <div className="purchaser-select-field">
      <Field label={label} help={help || INFO_TOOLTIP_COPY.whoPaid}>
        <select value={currentValue} onChange={handleChange}>
          <option value="">No person selected</option>
          {historicalName ? <option value="__historical__" disabled>{historicalName} (historical)</option> : null}
          {purchasers.map((purchaser) => (
            <option key={purchaser.id} value={purchaser.id}>
              {purchaser.name}{purchaser.type ? ` - ${purchaser.type}` : ""}{purchaser.note ? ` - ${purchaser.note}` : ""}
            </option>
          ))}
          <option value="__add__">Add new person...</option>
          <option value="__manage__">{manageLabel}...</option>
        </select>
      </Field>
      {!purchasers.length ? (
        <div className="small-empty-state purchaser-empty-state">
          <p>{emptyCopy}</p>
          <button type="button" className="secondary-button" onClick={() => setShowNewPurchaser(true)}>
            {addLabel}
          </button>
        </div>
      ) : null}
      {showNewPurchaser ? (
        <div className="inline-form purchaser-inline-form">
          <input
            value={newPurchaserName}
            maxLength={PURCHASER_NAME_MAX_LENGTH}
            onChange={(event) => setNewPurchaserName(event.target.value)}
            placeholder="Display name"
          />
          <select value={newPurchaserType} onChange={(event) => setNewPurchaserType(event.target.value)}>
            {PERSON_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input
            value={newPurchaserNote}
            onChange={(event) => setNewPurchaserNote(event.target.value)}
            placeholder="Optional note, card, partner..."
          />
          <button type="button" onClick={saveInlinePurchaser}>Save Person</button>
          <button type="button" className="secondary-button" onClick={() => setShowNewPurchaser(false)}>Cancel</button>
        </div>
      ) : null}
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "Not listed"}</strong>
    </div>
  );
}

function CollectorShowcaseCard({
  title = "Collection item",
  subtitle = "",
  image = "",
  kind = "item",
  mode = "compact",
  valueLabel = "",
  rarity = "",
  meta = [],
  helper = "Image may be representative. Values stay manual or estimated when shown.",
  actionLabel = "",
  onClick = null,
  className = "",
  ariaLabel = "",
}) {
  const normalizedKind = normalizeCollectorShowcaseKind(kind);
  const kindLabel = COLLECTOR_SHOWCASE_KIND_LABELS[normalizedKind] || COLLECTOR_SHOWCASE_KIND_LABELS.item;
  const isSealedVisualKind = ["sealed", "pack", "booster-box", "tin", "bundle"].includes(normalizedKind);
  const metaList = (Array.isArray(meta) ? meta : [meta]).filter(Boolean);
  const sealedFrame = isSealedVisualKind ? sealedProductFrameMeta({
    name: title,
    productType: subtitle,
    kind,
    meta: metaList.join(" "),
  }) : null;
  const rarityLabel = normalizedKind === "card" ? collectorShowcaseRarityLabel(rarity, metaList) : "";
  const rarityTone = normalizedKind === "card" ? collectorShowcaseRarityTone(rarity, metaList) : "neutral";
  const Component = onClick ? "button" : "article";
  const componentProps = onClick
    ? { type: "button", onClick, "aria-label": ariaLabel || `Open ${title}` }
    : { "aria-label": ariaLabel || `${title} collector showcase` };
  const screenReaderHint = onClick
    ? "Visual display mode. Open item profile."
    : "Visual display mode. Card details are shown as text.";
  const fallbackNote = normalizedKind === "unknown" ? "Check details manually" : "Image not available";
  const metaItems = [...new Set([
    sealedFrame?.label || kindLabel,
    ...metaList,
  ])].slice(0, sealedFrame ? 4 : 3);
  return (
    <Component
      className={`collector-showcase-card collector-showcase-${normalizedKind} ${isSealedVisualKind ? "collector-showcase-sealed-like" : ""} collector-showcase-${mode} collector-rarity-${rarityTone} ${sealedFrame ? `collector-sealed-frame-${sealedFrame.key}` : ""} ${image ? "has-image" : "is-fallback collector-showcase-card--fallback"} ${className}`.trim()}
      {...componentProps}
    >
      <span className="collector-showcase-stage" aria-hidden="true">
        <span className="collector-showcase-shadow" />
        <span className="collector-showcase-object">
          <span className="collector-showcase-edge" />
          <span className="collector-showcase-face">
            {image ? (
              <PrivateStorageImage
                src={image}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                  event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                  event.currentTarget.closest(".collector-showcase-card")?.classList.add("is-fallback");
                  event.currentTarget.closest(".collector-showcase-card")?.classList.add("collector-showcase-card--fallback");
                  event.currentTarget.closest(".collector-showcase-card")?.classList.remove("has-image");
                }}
              />
            ) : null}
            <span className="collector-showcase-fallback" hidden={Boolean(image)}>
              <strong>{collectorShowcaseInitials(title)}</strong>
              <small>{sealedFrame?.label || kindLabel}</small>
              <span className="collector-showcase-fallback-note">{fallbackNote}</span>
            </span>
            <span className="collector-showcase-shine" />
          </span>
        </span>
      </span>
      <span className="collector-showcase-copy">
        <span className="sr-only">{screenReaderHint}</span>
        <span className="collector-showcase-kicker">3D Collector Showcase</span>
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
        {valueLabel ? <em>{valueLabel}</em> : null}
        <span className="collector-showcase-chip-row">
          {rarityLabel ? (
            <b
              className={`collector-rarity-chip collector-rarity-chip-${rarityTone}`}
              title={COLLECTOR_SHOWCASE_RARITY_HELPER}
            >
              {rarityLabel}
            </b>
          ) : null}
          {sealedFrame ? (
            <b className={`collector-sealed-chip collector-sealed-chip-${sealedFrame.key}`}>
              {sealedFrame.label}
            </b>
          ) : null}
          {metaItems.map((item) => <b key={item}>{item}</b>)}
        </span>
        {rarityLabel ? <small className="collector-showcase-rarity-note">{COLLECTOR_SHOWCASE_RARITY_HELPER}</small> : null}
        {helper ? <small className="collector-showcase-helper">{helper}</small> : null}
        {actionLabel ? <span className="collector-showcase-action">{actionLabel}</span> : null}
      </span>
    </Component>
  );
}

function CollectorFlipDetailCard({
  title = "Collection item",
  subtitle = "",
  image = "",
  kind = "item",
  mode = "compact",
  valueLabel = "",
  rarity = "",
  meta = [],
  helper = "Visual display only. Images may be representative, and values are manual or saved estimates when shown.",
  noteRows = [],
  actions = [],
  className = "",
  ariaLabel = "",
}) {
  const normalizedKind = normalizeCollectorShowcaseKind(kind);
  const safeNoteRows = noteRows
    .filter(Boolean)
    .map((row) => Array.isArray(row) ? { label: row[0], value: row[1] } : row)
    .filter((row) => row?.label);
  const safeActions = actions.filter(Boolean);
  return (
    <details
      className={`collector-flip-card collector-flip-${normalizedKind} collector-flip-${mode} ${className}`.trim()}
      aria-label={ariaLabel || `${title} visual detail card`}
    >
      <summary aria-label={ariaLabel || `Flip details for ${title}`}>
        <span className="sr-only">Visual display mode. Open item profile details.</span>
        <CollectorShowcaseCard
          title={title}
          subtitle={subtitle}
          image={image}
          kind={normalizedKind}
        mode={mode}
        valueLabel={valueLabel}
        rarity={rarity}
        meta={meta}
          helper={helper}
          className="collector-flip-front"
        />
        <span className="collector-flip-summary-cue">Flip details</span>
      </summary>
      <div className="collector-flip-back" aria-label={`${title} back-side details`}>
        <span className="collector-flip-back-kicker">Back-side details</span>
        <h4>{title}</h4>
        <p>{helper}</p>
        {safeNoteRows.length ? (
          <dl className="collector-flip-detail-list">
            {safeNoteRows.slice(0, 4).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value || "Not saved yet"}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {safeActions.length ? (
          <div className="collector-flip-actions">
            {safeActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.variant === "primary" ? "" : "secondary-button"}
                disabled={Boolean(action.disabled)}
                title={action.title || ""}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onClick?.(event);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function RouteChunkFallback({ label = `Loading ${BRAND_CONFIG.shortName}...` }) {
  const normalizedLabel = String(label || "").toLowerCase();
  const routeKey = normalizedLabel.includes("scout")
    ? "scout"
    : normalizedLabel.includes("vault")
      ? "vault"
      : normalizedLabel.includes("exchange") || normalizedLabel.includes("forge")
        ? "exchange"
        : normalizedLabel.includes("spark") || normalizedLabel.includes("kids")
          ? "spark"
          : normalizedLabel.includes("market")
            ? "market"
            : "generic";
  return (
    <div className={`route-loading-card route-loading-card-${routeKey}`} role="status" aria-live="polite">
      <span className="route-loading-spinner" aria-hidden="true" />
      <strong>{label}</strong>
      <small>Preparing this workspace.</small>
    </div>
  );
}

function LazyToolBoundary({ label, children }) {
  return (
    <Suspense fallback={<RouteChunkFallback label={label} />}>
      {children}
    </Suspense>
  );
}

function InventoryBreakdownPanel({ item, variant = "forge", onEditEntry, onDeleteEntry, onEditSale, onMoveEntryToForge, onCopyEntryToForge }) {
  const entries = inventoryGroupEntries(item).filter(Boolean);
  const saleHistory = Array.isArray(item?.saleHistory) ? item.saleHistory : [];
  const purchaserBreakdown = item?.purchaserBreakdown?.length
    ? item.purchaserBreakdown
    : summarizeBreakdownRows(entries, { type: "purchaser" });
  const locationBreakdown = item?.locationBreakdown?.length
    ? item.locationBreakdown
    : summarizeBreakdownRows(entries, { type: "location" });
  const valuation = item?.valuationSummary || buildGroupedInventoryValuation(item, { context: variant });
  const valuationPrompts = buildInventoryMissingDataPrompts(valuation, { context: variant });
  const activityRows = [
    ...entries.map((entry) => {
      const date = entry.purchaseDate || entry.purchase_date || entry.createdAt || entry.created_at || "";
      const source = entry.store || entry.sourceLocation || entry.source_location || entry.externalProductSource || entry.external_product_source || entry.vendor || "";
      return {
        id: `purchase-${entry.id || date}`,
        type: "purchase",
        date,
        title: `Bought ${Number(entry.quantity || 0)}${source ? ` at ${source}` : ""}`,
        meta: [itemPurchaserName(entry), hasValue(entry.unitCost) ? `${money(entry.unitCost)} each` : "", entry.notes].filter(Boolean).join(" - "),
      };
    }),
    ...saleHistory.map((sale) => {
      const date = sale.activityDate || sale.saleDate || sale.sale_date || sale.createdAt || sale.created_at || "";
      return {
        id: `sale-${sale.id || date}`,
        type: "sale",
        date,
        title: `Sold ${Number(sale.quantitySold || sale.quantity_sold || 0)}${sale.platform ? ` on ${sale.platform}` : ""}`,
        meta: [
          hasValue(sale.finalSalePrice) ? `${money(sale.finalSalePrice)} each` : "",
          hasValue(sale.netProfit || sale.estimatedProfitLoss) ? `Profit ${money(sale.netProfit || sale.estimatedProfitLoss)}` : "",
          sale.referenceId ? `Ref ${sale.referenceId}` : "",
          sale.notes,
        ].filter(Boolean).join(" - "),
        sale,
      };
    }),
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  if (!entries.length) return null;

  return (
    <section className="inventory-breakdown-panel">
      <div className="compact-card-header">
        <div>
          <h4>Grouped inventory details</h4>
          <p className="compact-subtitle">
            {entries.length === 1
              ? "One saved entry powers this card."
              : `${entries.length} saved entries roll up into this one visible card.`}
          </p>
        </div>
        <span className="neon-chip">Total Qty {Number(item.quantity || 0)}</span>
      </div>

      <div className="inventory-valuation-strip" aria-label="Grouped item valuation">
        <div><span>Cost basis</span><strong>{money(valuation.totalCostBasis || 0)}</strong></div>
        <div><span>Market value</span><strong>{valuation.marketKnownQuantity ? money(valuation.estimatedMarketValue || 0) : "Unknown"}</strong></div>
        {variant === "forge" ? <div><span>Planned total</span><strong>{valuation.plannedKnownQuantity ? money(valuation.plannedSaleTotal || 0) : "Unknown"}</strong></div> : null}
        <div><span>{variant === "forge" ? "Est. profit" : "Est. gain/loss"}</span><strong>{(variant === "forge" ? valuation.estimatedProfitAtPlannedPrice : valuation.estimatedUnrealizedGainLoss) === null ? "Unknown" : money(variant === "forge" ? valuation.estimatedProfitAtPlannedPrice : valuation.estimatedUnrealizedGainLoss)}</strong></div>
      </div>
      {valuationPrompts.length ? (
        <div className="inventory-prompt-row compact">
          {valuationPrompts.slice(0, 4).map((prompt) => (
            <span className={`inventory-data-prompt ${prompt.tone}`} key={prompt.key}>
              {prompt.label}{prompt.count ? ` (${prompt.count})` : ""}
            </span>
          ))}
        </div>
      ) : null}

      <div className="breakdown-columns">
        <div>
          <h5>Purchased by</h5>
          <div className="breakdown-row-list">
            {purchaserBreakdown.map((row) => (
              <div className="breakdown-row" key={row.key}>
                <span>{row.name}</span>
                <strong>Qty {row.quantity}</strong>
                {row.costSummary ? <small>{row.costSummary} total</small> : null}
              </div>
            ))}
          </div>
        </div>
        {variant === "forge" ? (
          <div>
            <h5>Inventory locations</h5>
            <div className="breakdown-row-list">
              {locationBreakdown.map((row) => (
                <div className="breakdown-row" key={row.key}>
                  <span>{row.name}</span>
                  <strong>Qty {row.quantity}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <details className="individual-entry-details">
        <summary>Individual entries</summary>
        <div className="individual-entry-list">
          {entries.map((entry) => {
            const source = entry.store || entry.sourceLocation || entry.source_location || entry.externalProductSource || entry.external_product_source || entry.vendor || "Not listed";
            const quantity = Number(entry.quantity || 0);
            const unitCost = Number(entry.unitCost || entry.unit_cost || 0);
            const totalCost = quantity * unitCost;
            const entryDate = entry.purchaseDate || entry.purchase_date || entry.createdAt || entry.created_at || "";
            const variantText = [
              entry.conditionName || entry.condition_name || entry.condition,
              entry.finish,
              entry.language,
              entry.variant || entry.variantName || entry.productVariant,
              entry.sealedCondition || entry.sealed_condition,
            ].filter(Boolean).join(" / ");
            const plannedPrice = entry.salePrice || entry.plannedSalePrice || entry.planned_sale_price;
            const actualSalePrice = entry.actualSalePrice || entry.actual_sale_price || entry.soldPrice || entry.sold_price;
            const receiptUrl = entry.receiptImage || entry.receipt_image || entry.receiptImageUrl || entry.receipt_image_url;
            return (
            <div className="individual-entry-card" key={entry.id}>
              <div>
                <strong>{itemPurchaserName(entry)}</strong>
                <p>{inventoryEntryLabel(entry)}</p>
                {entryDate ? <small>{shortDate(entryDate)}</small> : null}
                <div className="entry-detail-grid">
                  <span><b>Date purchased</b>{entryDate ? shortDate(entryDate) : "Not set"}</span>
                  <span><b>Source</b>{source}</span>
                  <span><b>Quantity</b>{quantity}</span>
                  <span><b>Unit cost</b>{unitCost ? money(unitCost) : "Unknown"}</span>
                  <span><b>Total cost</b>{unitCost ? money(totalCost) : "Unknown"}</span>
                  <span><b>Variant</b>{variantText || "Standard"}</span>
                  <span><b>Planned price</b>{hasValue(plannedPrice) ? money(plannedPrice) : "Not set"}</span>
                  <span><b>Actual sale</b>{hasValue(actualSalePrice) ? money(actualSalePrice) : inventoryEntryIsSold(entry) ? "Sold record needed" : "Not sold"}</span>
                  {entry.saleDate || entry.sale_date ? <span><b>Sale date</b>{shortDate(entry.saleDate || entry.sale_date)}</span> : null}
                  {entry.listingPlatform || entry.platform ? <span><b>Platform</b>{entry.listingPlatform || entry.platform}</span> : null}
                  {entry.notes ? <span className="wide"><b>Notes</b>{entry.notes}</span> : null}
                  {receiptUrl ? <PrivateReceiptLink className="wide" href={receiptUrl}>Open receipt/photo reference</PrivateReceiptLink> : null}
                </div>
              </div>
              <div className="individual-entry-actions">
                {variant === "vault" ? (
                  <>
                    <button type="button" className="secondary-button" disabled={Number(entry.quantity || 0) < 1} onClick={() => onMoveEntryToForge?.(entry)}>Move</button>
                    <button type="button" className="secondary-button" onClick={() => onCopyEntryToForge?.(entry)}>Copy</button>
                  </>
                ) : null}
                <button type="button" className="secondary-button" onClick={() => onEditEntry?.(entry)}>Edit</button>
                <button type="button" className="ghost-button" onClick={() => onDeleteEntry?.(entry)}>Delete</button>
              </div>
            </div>
          );})}
        </div>
      </details>

      {variant === "forge" ? (
        <section className="forge-group-activity">
          <div className="compact-card-header">
            <div>
              <h5>Sale history & activity</h5>
              <p className="compact-subtitle">Each purchase and sale stays separate even though the parent card is grouped.</p>
            </div>
            <span className="neon-chip">{saleHistory.length} sale{saleHistory.length === 1 ? "" : "s"}</span>
          </div>
          {activityRows.length ? (
            <div className="forge-group-activity-list">
              {activityRows.map((row) => (
                <div className={`forge-group-activity-row is-${row.type}`} key={row.id}>
                  <time>{row.date ? shortDate(row.date) : "No date"}</time>
                  <div>
                    <strong>{row.title}</strong>
                    {row.meta ? <small>{row.meta}</small> : null}
                  </div>
                  {row.type === "sale" && row.sale ? (
                    <button type="button" className="secondary-button" onClick={() => onEditSale?.(row.sale)}>Edit sale</button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="compact-subtitle">No activity records are tied to this grouped item yet.</p>
          )}
        </section>
      ) : null}
    </section>
  );
}

function PriceReviewPanel({ item, variant = "forge", onReviewMarket, onReviewPlanned }) {
  if (!item) return null;
  const rows = buildPriceReviewFields(item, { context: variant, moneyFormatter: money });
  const marketRow = rows.find((row) => row.role === "market");
  const plannedRow = rows.find((row) => row.role === "planned");
  const showPlannedReview = Boolean(onReviewPlanned) && (variant === "forge" || plannedRow);
  const reliabilityCopy = variant === "forge"
    ? "Market value, MSRP, planned sale price, and sale records stay separate. Estimates are for planning and record review."
    : "Vault value only uses known market values. Missing or manual prices stay labeled so the collection total does not pretend to be perfect.";
  return (
    <section className="price-review-panel" aria-label="Price reliability and manual review">
      <div className="compact-card-header">
        <div>
          <h4>Price reliability</h4>
          <p className="compact-subtitle">{reliabilityCopy}</p>
        </div>
        <span className={`inventory-data-prompt ${priceConfidenceTone(marketRow?.confidence)}`}>{marketRow?.confidence || "Missing"}</span>
      </div>
      <div className="price-review-grid">
        {rows.map((row) => (
          <div className="price-review-card" key={row.key}>
            <div>
              <span>{row.label}</span>
              <strong>{variant === "vault" && row.role === "market" && row.isMissing ? "Price data unavailable" : row.displayValue}</strong>
            </div>
            <div className="price-review-meta">
              <span className={`inventory-data-prompt ${row.tone}`}>{row.confidence}</span>
              <small>Source: {row.sourceLabel}</small>
              <small>{row.reviewedAt ? `Reviewed ${shortDate(row.reviewedAt)}` : row.updatedAt ? `Updated ${shortDate(row.updatedAt)}` : "No review date"}</small>
            </div>
            <p>{row.helper}</p>
          </div>
        ))}
      </div>
      <div className="quick-actions price-review-actions">
        <button type="button" className="secondary-button" onClick={() => onReviewMarket?.(item)}>
          {marketRow?.isMissing ? "Add market value" : marketRow?.isStale ? "Review stale price" : "Review market value"}
        </button>
        {showPlannedReview ? <button type="button" className="secondary-button" onClick={() => onReviewPlanned?.(item)}>
          {plannedRow?.isMissing ? "Set planned sale price" : "Update planned sale price"}
        </button> : null}
      </div>
      {item.priceReviewNote ? <p className="compact-subtitle">Last review note: {item.priceReviewNote}</p> : null}
    </section>
  );
}

function ForgeItemDetail({ item, marketItem, masterCard, onClose, onEdit, onDelete, onEditSale, onSell, onCreateListing, onAttachReceipt, onQuickUpdateMarketValue, onQuickUpdateSalePrice, onStartTrade }) {
  if (!item) return null;
  const detailImage = item.itemImage || vaultItemDisplayImage(item);
  const setLabel = item.setName || item.expansion || "";
  const productType = item.productType || "Business inventory";
  const valuation = item.valuationSummary || buildGroupedInventoryValuation(item, { context: "forge" });
  const statusSummary = item.statusSummary || summarizeForgeGroupedInventoryStatus(inventoryGroupEntries(item), item.saleHistory || []);
  const primaryEntry = inventoryGroupEntries(item)[0] || item;
  const nextSellEntry = inventoryGroupEntries(item).find((entry) => Number(entry.quantity || 0) > 0 && !inventoryEntryIsSold(entry)) || primaryEntry;
  const valuationPrompts = buildInventoryMissingDataPrompts(valuation, { context: "forge" });
  const priceFields = buildPriceReviewFields(item, { context: "forge", moneyFormatter: money });
  const priceByRole = Object.fromEntries(priceFields.map((field) => [field.role, field]));
  const totalCost = valuation.totalCostBasis || 0;
  const totalMarket = valuation.estimatedMarketValue || 0;
  const plannedTotal = valuation.plannedSaleTotal || 0;
  const details = [
    ["Quantity", item.quantity],
    ["Cost Paid", priceByRole.cost?.displayValue],
    ["Total Cost", valuation.costKnownQuantity ? money(totalCost) : "Unknown"],
    ["MSRP", priceByRole.msrp?.displayValue],
    ["Market Value", priceByRole.market?.displayValue],
    ["Total Market", valuation.marketKnownQuantity ? money(totalMarket) : "Unknown"],
    ["Planned Sale Total", valuation.plannedKnownQuantity ? money(plannedTotal) : "Not set"],
    ["Saved Entries", item.groupedEntryCount || inventoryGroupEntries(item).length],
    ["Total Activity Qty", statusSummary.totalQuantity],
    ["Currently Held", statusSummary.currentQuantity],
    ["Listed Qty", statusSummary.listedQuantity],
    ["Sold Qty", statusSummary.soldQuantity],
    ["Most Recent Activity", item.updatedAt ? shortDate(item.updatedAt) : ""],
    ["Product Type", productType],
    ["Set / Collection", setLabel],
    ["Release Year", item.releaseYear],
    ["Pack Count", item.packCount],
    ["UPC / Barcode", item.barcode],
    ["SKU", item.sku],
    ["Purchase Date", item.purchaseDate ? String(item.purchaseDate).slice(0, 10) : ""],
    ["Store", item.store],
    ["Physical Location", forgePhysicalLocationLabel(item)],
    ["Location Notes", item.physicalLocationNotes],
    ["Purchaser", itemPurchaserName(item)],
    ["Notes", item.notes],
    ["Planned Selling Price", priceByRole.planned?.displayValue],
    ["Source", item.sourceLocation || item.externalProductSource],
    ["Original Vault Item", item.originalVaultItemId],
    ["Moved From Vault", item.movedFromVaultAt || item.dateMovedToForge],
    ["Catalog Link", item.catalogProductName],
  ].filter(([, value]) => hasValue(value));
  const primaryDetails = [
    ["Status", item.status || "In Stock"],
    ["Available", statusSummary.currentQuantity || item.quantity || 0],
    ["Value", valuation.marketKnownQuantity ? money(totalMarket) : "Value unavailable"],
    ["Condition", item.condition || item.grade || "Not set"],
    ["Location", forgePhysicalLocationLabel(item) || "No location assigned"],
    ["Receipt / Proof", item.receiptImage || item.receiptUrl || item.proofUrl ? "Attached" : "Not attached"],
  ].filter(([, value]) => hasValue(value));

  return (
    <div className="vault-detail-card forge-detail-card">
      <div className="compact-card-header">
        <div>
          <h3>{item.name}</h3>
          <p className="compact-subtitle">Business is private business inventory for pricing, selling, and fulfillment prep.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>
      <div className="inventory-detail-hero">
        <div className={detailImage ? "inventory-detail-image-frame" : "inventory-detail-image-frame placeholder"}>
          {detailImage ? <PrivateStorageImage src={detailImage} alt={item.name} /> : <span>Photo needed</span>}
        </div>
        <div className="inventory-detail-summary">
          <span className="trust-badge trust-badge--secure">Private Business</span>
          <h4>{item.name}</h4>
          <p>{[setLabel, productType].filter(Boolean).join(" - ") || "Business inventory"}</p>
          <div className="inventory-detail-metrics">
            <div><span>Qty</span><strong>{item.quantity || 0}</strong></div>
            <div><span>Total</span><strong>{statusSummary.totalQuantity || item.quantity || 0}</strong></div>
            <div><span>Sold</span><strong>{statusSummary.soldQuantity || 0}</strong></div>
            <div><span>Market</span><strong>{valuation.marketKnownQuantity ? money(totalMarket) : "Unknown"}</strong></div>
            <div><span>Planned</span><strong>{valuation.plannedKnownQuantity ? money(plannedTotal) : "Unknown"}</strong></div>
            <div><span>Cost Basis</span><strong>{money(totalCost)}</strong></div>
            <div><span>Est. Profit</span><strong>{valuation.estimatedProfitAtPlannedPrice === null ? "Unknown" : money(valuation.estimatedProfitAtPlannedPrice)}</strong></div>
          </div>
          {item.purchaserSummary ? <span className="neon-chip purchaser-summary-pill">{item.purchaserSummary}</span> : null}
          {valuationPrompts.length ? (
            <div className="inventory-prompt-row compact">
              {valuationPrompts.slice(0, 4).map((prompt) => (
                <span className={`inventory-data-prompt ${prompt.tone}`} key={prompt.key}>
                  {prompt.label}{prompt.count ? ` (${prompt.count})` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <MasterCardFamilyNote masterCard={masterCard} />
      {masterCard ? (
        <div className="forge-exact-copy-note">
          <strong>Listing and trade actions use this exact copy.</strong>
          <span>Choose the raw, graded, sealed-related, promo, or duplicate entry before creating a draft listing, trade review, or sale record. Parent approval still applies to kid-owned items.</span>
        </div>
      ) : null}
      <div className="vault-detail-primary-actions forge-detail-primary-actions">
        <button type="button" disabled={Number(nextSellEntry?.quantity || 0) < 1} onClick={() => onSell(nextSellEntry)}>Mark sold / add sale</button>
        <button type="button" className="secondary-button" onClick={() => onStartTrade?.(primaryEntry)}>Start Trade</button>
        <button type="button" className="secondary-button" onClick={() => onEdit(primaryEntry)}>Edit / add details</button>
        <button type="button" className="secondary-button" onClick={() => onAttachReceipt?.(primaryEntry)}>Attach receipt</button>
        <button type="button" className="secondary-button" onClick={() => onQuickUpdateMarketValue?.(item)}>Review value</button>
      </div>
      <div className="catalog-detail-grid vault-detail-basics forge-detail-basics">
        {primaryDetails.map(([label, value]) => (
          <DetailItem key={label} label={label} value={value} />
        ))}
      </div>
      <div className="vault-detail-advanced-stack forge-detail-advanced-stack">
        <details className="vault-detail-disclosure">
          <summary>Advanced business details</summary>
          <div className="catalog-detail-grid">
            {details.map(([label, value]) => (
              <DetailItem key={label} label={label} value={value} />
            ))}
          </div>
        </details>
        <details className="vault-detail-disclosure">
          <summary>Market data and pricing</summary>
          <PriceReviewPanel
            item={item}
            variant="forge"
            onReviewMarket={onQuickUpdateMarketValue}
            onReviewPlanned={onQuickUpdateSalePrice}
          />
          <LazyToolBoundary label="Loading price history...">
            <MarketPriceHistoryPanel
              compact
              marketItem={marketItem || item}
              catalogProductId={item.catalogProductId || item.catalogItemId}
              tcgplayerProductId={item.tcgplayerProductId || item.tcgplayer_product_id}
              externalProductId={item.externalProductId || item.external_product_id}
              productName={item.name}
              currentMarketPrice={item.marketPrice}
              currentLowPrice={item.lowPrice}
              currentMidPrice={item.midPrice}
              currentHighPrice={item.highPrice}
              lastPriceChecked={item.lastPriceChecked || item.marketLastUpdated}
              money={money}
            />
          </LazyToolBoundary>
        </details>
        <details className="vault-detail-disclosure">
          <summary>Inventory and sale history</summary>
          <InventoryBreakdownPanel
            item={item}
            variant="forge"
            onEditEntry={onEdit}
            onDeleteEntry={onDelete}
            onEditSale={onEditSale}
          />
        </details>
        <details className="vault-detail-disclosure">
          <summary>More actions</summary>
          <div className="quick-actions">
            <button type="button" className="secondary-button" onClick={() => onCreateListing?.(item)}>Create Listing</button>
            <button type="button" className="secondary-button" onClick={() => onStartTrade?.(primaryEntry)}>Start Trade</button>
            <button type="button" className="secondary-button" onClick={() => onAttachReceipt?.(primaryEntry)}>Attach receipt</button>
            <button type="button" className="secondary-button" onClick={() => onQuickUpdateSalePrice?.(item)}>Update Planned Price</button>
            <button type="button" className="secondary-button" onClick={() => onDelete(primaryEntry)}>Delete primary entry</button>
          </div>
        </details>
      </div>
    </div>
  );
}

function VaultSetCardRow({ row, onOpen, onAddOwned, onAddWishlist, onOpenMarket }) {
  if (!row) return null;
  const image = getCatalogImage(row.imageRecord || row.primaryRecord || {}) || vaultItemDisplayImage(row.imageRecord || row.primaryRecord || {});
  const statusCopy = row.ownedQuantity > 0 ? "Owned" : row.wishlistQuantity > 0 ? "Wishlist" : row.missing ? "Missing" : "Tracked";
  const variantCopy = row.variantCount === 1 ? "1 variant" : `${row.variantCount || 0} variants`;
  const primaryActionLabel = row.ownedQuantity > 0 ? "Add variant" : row.wishlistQuantity > 0 ? "Mark owned" : "Add to wishlist";
  const primaryAction = row.ownedQuantity > 0 || row.wishlistQuantity > 0 ? onAddOwned : onAddWishlist;
  return (
    <article className="vault-set-card-row">
      <div className={image ? "vault-set-card-row-image" : "vault-set-card-row-image placeholder"}>
        {image ? <PrivateStorageImage src={image} alt="" /> : <span>Card</span>}
      </div>
      <div className="vault-set-card-row-body">
        <span className={statusClass(statusCopy)}>{statusCopy}</span>
        <h4>{row.title}</h4>
        <p>{[`#${row.cardNumber || "?"}`, row.rarity || "", row.setName || ""].filter(Boolean).join(" - ")}</p>
        <div className="vault-card-facts vault-set-card-row-facts">
          <p><span>Owned</span><strong>{row.ownedQuantity || 0}</strong></p>
          <p><span>Wishlist</span><strong>{row.wishlistQuantity || 0}</strong></p>
          <p><span>Variants</span><strong>{variantCopy}</strong></p>
        </div>
      </div>
      <div className="vault-set-mini-actions">
        <button type="button" className="secondary-button" onClick={onOpen}>View variants</button>
        <button type="button" className="secondary-button" onClick={primaryAction}>
          {primaryActionLabel}
        </button>
        <button type="button" className="secondary-button" onClick={onOpenMarket}>Market Watch</button>
      </div>
    </article>
  );
}

function VaultGroupedCardDetail({ cardGroup, setSummary, onClose, onViewSet, onAddVariant, onAddWishlist, onMarkOwned, onOpenMarket, onOpenRecord, showSellerTools = false }) {
  if (!cardGroup) return null;
  const image = getCatalogImage(cardGroup.imageRecord || cardGroup.primaryRecord || {}) || vaultItemDisplayImage(cardGroup.imageRecord || cardGroup.primaryRecord || {});
  const primaryRecord = cardGroup.primaryRecord || cardGroup.records?.[0] || {};
  return (
    <section className="vault-grouped-card-detail" aria-label={`${cardGroup.title} variants`}>
      <div className="compact-card-header">
        <div>
          <span className="trust-badge trust-badge--verified">Card detail</span>
          <h3>{cardGroup.title}</h3>
          <p>{[setSummary?.name || cardGroup.setName, cardGroup.cardNumber ? `#${cardGroup.cardNumber}` : "", cardGroup.rarity].filter(Boolean).join(" - ") || "Canonical card identity"}</p>
        </div>
        <button type="button" className="secondary-button" onClick={onClose}>Close card</button>
      </div>
      <div className="inventory-detail-hero vault-card-identity-hero">
        <div className={image ? "inventory-detail-image-frame" : "inventory-detail-image-frame placeholder"}>
          {image ? <PrivateStorageImage src={image} alt={cardGroup.title} /> : <span>Photo needed</span>}
        </div>
        <div className="inventory-detail-summary">
          <h4>{cardGroup.ownedQuantity ? `${cardGroup.ownedQuantity} owned` : cardGroup.wishlistQuantity ? `${cardGroup.wishlistQuantity} wanted` : "Not owned yet"}</h4>
          <p>{cardGroup.variantCompletionLabel || "Variant checklist unavailable."}</p>
          <div className="inventory-detail-metrics">
            <div><span>Variants</span><strong>{cardGroup.variantCount || 0}</strong></div>
            <div><span>Owned variants</span><strong>{cardGroup.variantOwnedCount || 0}</strong></div>
            <div><span>Wishlist</span><strong>{cardGroup.variantWishlistCount || 0}</strong></div>
          </div>
          <p className="vault-detail-action-note">Interactive card preview coming later.</p>
        </div>
      </div>
      <div className="vault-master-detail-note">
        <strong>Master card model</strong>
        <span>This is the card identity. Exact variants, duplicates, graded copies, and wishlist wants are listed below so families do not have to hunt through scattered records.</span>
      </div>
      <div className="vault-detail-primary-actions">
        {setSummary ? <button type="button" className="secondary-button" onClick={() => onViewSet?.(setSummary)}>View Set</button> : null}
        <button type="button" onClick={() => onAddVariant?.(cardGroup)}>Add another variant</button>
        <button type="button" className="secondary-button" onClick={() => onAddWishlist?.(cardGroup)}>Add to wishlist</button>
        <button type="button" className="secondary-button" onClick={() => onOpenMarket?.(primaryRecord)}>Open Market Watch</button>
      </div>
      <div className="vault-variant-list">
        {cardGroup.variants.map((variant) => {
          const firstOwned = variant.ownedRecords[0];
          const firstWishlist = variant.wishlistRecords[0];
          const firstRecord = firstOwned || firstWishlist || variant.catalogRecords[0] || variant.records[0] || {};
          return (
            <article className="vault-variant-card" key={variant.key}>
              <div>
                <span className="status-badge">{variant.label}</span>
                <h4>{variant.ownedQuantity ? `${variant.ownedQuantity} owned` : variant.wishlistQuantity ? `${variant.wishlistQuantity} wanted` : "Not owned"}</h4>
                <p>{[itemPurchaserName(firstRecord), firstRecord.condition || firstRecord.conditionName, firstRecord.notes].filter(Boolean).join(" - ") || "Variant details can be added later."}</p>
              </div>
              <div className="vault-set-mini-actions">
                {firstOwned ? <button type="button" className="secondary-button" onClick={() => onOpenRecord?.(firstOwned)}>View item</button> : null}
                {firstWishlist ? <button type="button" className="secondary-button" onClick={() => onMarkOwned?.(firstWishlist)}>Mark owned</button> : null}
                {showSellerTools && firstOwned ? <span className="status-badge">Business actions in item detail</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VaultItemDetail(props) {
  return <VaultItemDetailContent key={gradeAssistRecordKey(props.item || {})} {...props} />;
}

function VaultItemDetailContent({ item, marketItem, masterCard, setSummary, linkedTrades = [], collectionSets = [], onClose, onEdit, onDelete, onViewSet, onMarkOwned, onMoveToForge, onCopyToForge, onCreateListing, onDuplicate, onAttachReceipt, onCheckMarket, onSavePriceMemory, onAddToDisplayCase, onAddToCompare, onQuickUpdateMarketValue, onQuickUpdateSalePrice, onStartTrade, showSellerTools = false }) {
  const [gradeAssistDraft, setGradeAssistDraft] = useState(() => loadGradeAssistDraft(item || {}));
  const [gradeAssistMessage, setGradeAssistMessage] = useState("");

  if (!item) return null;
  const showVaultSellerTools = Boolean(showSellerTools);
  const itemIsWishlist = isWishlistLikeVaultItem(item);
  const detailImage = vaultItemDisplayImage(item);
  const setLabel = vaultItemSetLabel(item);
  const itemType = vaultItemTypeLabel(item);
  const locationLabel = item.locationSummary || vaultItemLocationLabel(item) || "No location assigned";
  const conditionLabel = item.conditionName || item.condition || item.grade || "";
  const manualConditionNotes = item.conditionNotes || item.condition_notes || "";
  const storageCareNotes = item.storageCareNotes || item.storage_care_notes || "";
  const conditionCheckedAt = item.conditionCheckedAt || item.condition_checked_at || "";
  const proofStatus = item.receiptImage || item.receiptUrl || item.proofUrl || item.photoProofUrl ? "Proof attached" : "No proof attached";
  const purchaserSummaryLabel = friendlyInventoryLabel(item.purchaserSummary, "No purchaser assigned");
  const showPurchaserSummary = Boolean(purchaserSummaryLabel && purchaserSummaryLabel !== "No purchaser assigned");
  const groupedEntries = inventoryGroupEntries(item);
  const purchaserDetailRows = summarizeBreakdownRows(groupedEntries, { type: "purchaser" })
    .filter((entry) => friendlyInventoryLabel(entry.name, "No purchaser assigned") !== "No purchaser assigned");
  const valuation = item.valuationSummary || buildGroupedInventoryValuation(item, { context: "vault" });
  const valuationPrompts = buildInventoryMissingDataPrompts(valuation, { context: "vault" });
  const priceFields = buildPriceReviewFields(item, { context: "vault", moneyFormatter: money });
  const priceByRole = Object.fromEntries(priceFields.map((field) => [field.role, field]));
  const totalCost = valuation.totalCostBasis || 0;
  const totalMarket = valuation.estimatedMarketValue || 0;
  const plannedTotal = valuation.plannedSaleTotal || 0;
  const marketDisplay = priceByRole.market?.isMissing ? "Price data unavailable" : priceByRole.market?.displayValue;
  const itemCardNumber = vaultCardNumberLabel(item);
  const itemVariantLabel = vaultVariantLabel(item);
  const itemSetName = setSummary?.name || setLabel || "Set unknown";
  const itemSetKnown = Boolean(setSummary && !setSummary.unknownSet && itemSetName !== "Set unknown");
  const itemProfileKind = collectorVisualTypeLabel(detectCollectorItemVisualType(item));
  const profileEstimatedValue = valuation.marketKnownQuantity ? money(totalMarket) : "";
  const profileValueSource = item.marketSource || item.market_source || item.externalProductSource || item.sourceType || item.source || "";
  const profileValueSourceCopy = valuation.marketKnownQuantity
    ? `Estimated Value uses saved local item fields${profileValueSource ? ` from ${profileValueSource}` : ""}. It is not live pricing or a guarantee.`
    : "No value saved yet. Add a manual estimate or check Market when you are ready.";
  const languageLabel = item.language || item.cardLanguage || item.card_language || item.printLanguage || item.print_language || "Language not set yet.";
  const collectorNotes = item.collectorNotes || item.collector_notes || item.notes || item.note || "";
  const memoryStory = item.memoryStory || item.memory_story || item.story || item.memory || item.actionNotes || item.action_notes || "";
  const kidSafeNotes = item.kidSafeNotes || item.kid_safe_notes || item.familyNotes || item.family_notes || "";
  const profileDateAdded = item.dateAdded || item.addedAt || item.createdAt || item.created_at || "";
  const profileQuickDetails = [
    ["Vault Item", item.name],
    ["Type", itemProfileKind],
    ["Condition Notes", manualConditionNotes || conditionLabel || "Condition not set yet."],
    ["Estimated Value", profileEstimatedValue || "No value saved yet. Add an estimate when you are ready."],
    ["Quantity", item.quantity || 1],
    ["Date Added", profileDateAdded ? shortDate(profileDateAdded) : "Date added not saved yet."],
  ];
  const setMasteryCopy = setSummary
    ? setSummary.checklistAvailable
      ? setSummary.progressCopy
      : "Missing count needs checklist data."
    : "Set checklist unavailable.";
  const setMasteryDetails = [
    ["Set", itemSetName],
    ["Card Number", itemCardNumber || "Not set"],
    ["Variant", itemVariantLabel || "Variant unknown"],
    ["Progress", setSummary?.completionLabel || "Tracked item"],
    ["Checklist", setSummary?.checklistStatus || "Set checklist unavailable"],
  ].filter(([, value]) => hasValue(value));
  const primaryDetails = [
    ["Status", vaultStatusLabel(normalizeVaultStatus(item))],
    ["Condition", conditionLabel || "Not set"],
    ["Location", locationLabel],
    ["Receipt / Proof", proofStatus],
    ["Last Updated", vaultItemLastUpdatedLabel(item)],
  ].filter(([, value]) => hasValue(value));
  const advancedDetails = [
    ["Quantity", item.quantity],
    ["Owner / Purchaser", showPurchaserSummary ? purchaserSummaryLabel : itemPurchaserName(item)],
    ["Vault Location", locationLabel],
    ["MSRP", priceByRole.msrp?.displayValue],
    ["Market Value", marketDisplay],
    ["Set / Collection", setLabel],
    ["Product Type", itemType],
    ...(showVaultSellerTools ? [
      ["Cost Paid", priceByRole.cost?.displayValue],
      ["Total Cost", valuation.costKnownQuantity ? money(totalCost) : "Unknown"],
      ["Planned Sale Total", valuation.plannedKnownQuantity ? money(plannedTotal) : "Not set"],
      ["Planned Selling Price", priceByRole.planned?.displayValue],
    ] : []),
    ["Source", item.sourceType || item.source || item.sourceLocation || item.externalProductSource],
    ["SKU", item.sku],
    ["UPC / Barcode", item.barcode],
    ["Last Updated", vaultItemLastUpdatedLabel(item)],
    ["Status", vaultStatusLabel(normalizeVaultStatus(item))],
  ].filter(([, value]) => hasValue(value));
  const ownershipDetails = [
    ["Quantity", item.quantity],
    ["Owner / Purchaser", showPurchaserSummary ? purchaserSummaryLabel : itemPurchaserName(item)],
    ["Vault Location", locationLabel],
    ["Status", vaultStatusLabel(normalizeVaultStatus(item))],
  ].filter(([, value]) => hasValue(value));
  const valueDetails = [
    ["MSRP", priceByRole.msrp?.displayValue],
    ["Market Value", marketDisplay],
    ...(showVaultSellerTools ? [
      ["Cost Paid", priceByRole.cost?.displayValue],
      ["Total Cost", valuation.costKnownQuantity ? money(totalCost) : "Unknown"],
      ["Planned Sale Total", valuation.plannedKnownQuantity ? money(plannedTotal) : "Not set"],
      ["Planned Selling Price", priceByRole.planned?.displayValue],
    ] : []),
  ].filter(([, value]) => hasValue(value));
  const photoReceiptDetails = [
    ["Receipt / Proof", proofStatus],
    ["Receipt URL", item.receiptUrl || item.receipt_url],
    ["Photo Proof", item.photoProofUrl || item.photo_proof_url || item.proofUrl || item.proof_url],
  ].filter(([, value]) => hasValue(value));
  const noteDetails = [
    ["Collector Notes", collectorNotes],
    ["Memory / Story", memoryStory],
    ["Kid Safe Notes", kidSafeNotes],
    ["Action Notes", item.actionNotes || item.action_notes],
    ["Source", item.sourceType || item.source || item.sourceLocation || item.externalProductSource],
  ].filter(([, value]) => hasValue(value));
  const identifierDetails = [
    ["Set / Collection", setLabel],
    ["Product Type", itemType],
    ["Card Number", vaultCardNumberLabel(item)],
    ["Variant / Finish", vaultVariantLabel(item)],
    ["SKU", item.sku],
    ["UPC / Barcode", item.barcode],
    ["Catalog Link", item.catalogProductName],
    ["Last Updated", vaultItemLastUpdatedLabel(item)],
  ].filter(([, value]) => hasValue(value));
  const conditionDetails = [
    ["Manual condition", conditionLabel || "Not set"],
    ["Condition Notes", manualConditionNotes || "No condition notes yet."],
    ["Sleeve / toploader / storage notes", storageCareNotes || "No storage care notes yet."],
    ["Date checked", conditionCheckedAt ? shortDate(conditionCheckedAt) : "Not checked yet."],
    ["Condition mode", item.conditionMode === "manual_collector_note" ? "Manual collector note" : "Manual collector note"],
    ["Grade disclaimer", "Not a professional grade"],
    ["Grade Company", item.gradingCompany || item.grading_company],
    ["Grade", item.grade],
    ["Certification", item.certNumber || item.cert_number || item.certificationNumber || item.certification_number],
  ].filter(([, value]) => hasValue(value));
  const gradeAssistReadiness = deriveGradeAssistReadiness(gradeAssistDraft);
  const gradeAssistCheckedCount = GRADE_ASSIST_CHECK_FIELDS.filter((field) => (
    (gradeAssistDraft.checks?.[field.key] || "not_checked") !== "not_checked"
  )).length;
  const gradeAssistEmpty = gradeAssistCheckedCount === 0 && !String(gradeAssistDraft.notes || "").trim();
  const gradeAssistValue = gradeAssistValueComparison(item, money);
  const linkedTradePreview = Array.isArray(linkedTrades) ? linkedTrades.slice(0, 3) : [];
  const collectionSetCount = Array.isArray(collectionSets) ? collectionSets.length : 0;
  const profileConditionVariantRows = [
    ["Condition Notes", manualConditionNotes || conditionLabel || "Condition not set yet."],
    ["Storage care", storageCareNotes || "No storage care note yet."],
    ["Date checked", conditionCheckedAt ? shortDate(conditionCheckedAt) : "Not checked yet."],
    ["Language", languageLabel],
    ["Variant", itemVariantLabel || "Variant unknown"],
    ["Card Number", itemCardNumber || "Card number not set"],
    ["Type", itemProfileKind],
    ["Set", itemSetName],
  ];
  const updateGradeAssistField = (fieldKey, value) => {
    setGradeAssistDraft((current) => normalizeGradeAssistChecklist({
      ...current,
      checks: {
        ...(current.checks || {}),
        [fieldKey]: value,
      },
    }));
    setGradeAssistMessage("");
  };
  const updateGradeAssistNotes = (value) => {
    setGradeAssistDraft((current) => normalizeGradeAssistChecklist({
      ...current,
      notes: value,
    }));
    setGradeAssistMessage("");
  };
  const saveGradeAssist = () => {
    const result = saveGradeAssistDraft(item, gradeAssistDraft);
    setGradeAssistDraft(result.checklist);
    setGradeAssistMessage(
      result.mode === "local"
        ? "Checklist saved on this device. Cloud sync needs backend Grade Assist storage."
        : "Checklist updated for this session. Cloud sync needs backend Grade Assist storage.",
    );
  };
  const detailMetricRows = [
    ["Qty", item.quantity || 0],
    ["Market", valuation.marketKnownQuantity ? money(totalMarket) : "Price data unavailable"],
    ["Condition", conditionLabel || "Not set"],
    ["Location", locationLabel],
    ...(showVaultSellerTools ? [
      ["Planned", valuation.plannedKnownQuantity ? money(plannedTotal) : "Unknown"],
      ["Cost Basis", money(totalCost)],
      ["Est. Gain/Loss", valuation.estimatedUnrealizedGainLoss === null ? "Unknown" : money(valuation.estimatedUnrealizedGainLoss)],
    ] : []),
  ];
  const profileHasPhoto = Boolean(detailImage);
  const profileHasCondition = Boolean(conditionLabel);
  const profileHasLocation = Boolean(locationLabel && locationLabel !== "No location assigned");
  const profileHasValue = Boolean(valuation.marketKnownQuantity && totalMarket > 0);
  const profileConfidenceScore = [profileHasPhoto, profileHasCondition, profileHasLocation, profileHasValue, Boolean(collectorNotes || manualConditionNotes)].filter(Boolean).length;
  const profileConfidenceLabel = profileConfidenceScore >= 4
    ? "Strong"
    : profileConfidenceScore >= 3
      ? "Moderate"
      : profileConfidenceScore >= 1
        ? "Low"
        : "Not enough data";
  const profileLiquidityLabel = itemIsWishlist
    ? "Watch only"
    : isInventorySealedProduct(item)
      ? "Medium demand"
      : profileHasValue && profileHasCondition
        ? "Easy to sell"
        : "Collector hold";
  const profileDecision = itemIsWishlist
    ? {
      label: "Recommendation: Watch",
      title: "Watch before buying.",
      detail: "This is a wishlist item. Track target price and availability before turning it into an owned Vault record.",
      action: () => onCheckMarket?.(item),
      cta: "Check in Market",
    }
    : !profileHasPhoto
      ? {
        label: "Recommendation: Add proof",
        title: "Add photos before moving this.",
        detail: "A reference photo makes selling, trading, donations, and condition review safer.",
        action: () => onAttachReceipt?.(item),
        cta: "Attach proof",
      }
      : !profileHasCondition
        ? {
          label: "Recommendation: Review",
          title: "Add condition notes first.",
          detail: "Condition changes value. Add manual condition context before a trade, sale, or compare decision.",
          action: () => onEdit(item),
          cta: "Edit Profile",
        }
        : !profileHasValue
          ? {
            label: "Recommendation: Price check",
            title: "Save a value estimate.",
            detail: "Vault needs a saved estimate before it can compare hold, sell, and trade paths honestly.",
            action: () => onCheckMarket?.(item),
            cta: "Check in Market",
          }
          : {
            label: "Recommendation: Hold",
            title: "Hold and watch demand.",
            detail: "Photo, condition, location, and value are present. Compare before listing or trading.",
            action: () => onAddToCompare?.(item),
            cta: "Compare",
          };
  const profileRangeValue = profileHasValue ? totalMarket : Number(item.marketPrice || item.marketValue || item.currentValue || 0);
  const profileValueRange = profileRangeValue > 0
    ? {
      low: money(profileRangeValue * 0.84),
      fair: money(profileRangeValue),
      high: money(profileRangeValue * 1.18),
      current: money(profileRangeValue),
    }
    : {
      low: "Pending",
      fair: "Pending",
      high: "Pending",
      current: "Pending",
    };
  const profileProofBadges = [
    { key: "photo", label: profileHasPhoto ? "Photos saved" : "Photos missing", tone: profileHasPhoto ? "ready" : "warning" },
    { key: "condition", label: profileHasCondition ? "Condition saved" : "Condition missing", tone: profileHasCondition ? "ready" : "warning" },
    { key: "location", label: profileHasLocation ? "Location saved" : "Location missing", tone: profileHasLocation ? "ready" : "warning" },
    { key: "value", label: profileHasValue ? "Value saved" : "Value missing", tone: profileHasValue ? "ready" : "warning" },
  ];
  const vaultIntelligenceNumber = (value) => {
    if (value === undefined || value === null || value === "") return 0;
    const number = Number.parseFloat(String(value).replace(/[$,%\s,]/g, ""));
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  const profileUnitBasis = vaultIntelligenceNumber(item.purchasePrice || item.purchase_price || item.costBasis || item.cost_basis || item.unitCost || item.unit_cost);
  const profileQuantity = Math.max(1, Number(item.quantity || item.ownedQuantity || item.quantityOwned || 1));
  const profileBasisValue = totalCost > 0 ? totalCost : profileUnitBasis > 0 ? profileUnitBasis * profileQuantity : 0;
  const profileValueDelta = profileRangeValue > 0 && profileBasisValue > 0 ? profileRangeValue - profileBasisValue : 0;
  const profileValueDeltaPercent = profileRangeValue > 0 && profileBasisValue > 0
    ? Math.round((profileValueDelta / profileBasisValue) * 100)
    : 0;
  const profileValueMovementLabel = profileBasisValue > 0
    ? `${profileValueDelta >= 0 ? "+" : ""}${money(profileValueDelta)} (${profileValueDeltaPercent >= 0 ? "+" : ""}${profileValueDeltaPercent}%)`
    : "Add cost basis";
  const profileConfidencePercent = Math.max(12, Math.min(100, profileConfidenceScore * 20));
  const profileConditionScore = Math.min(100, Math.round(
    (profileHasPhoto ? 18 : 0) +
    (profileHasCondition ? 22 : 0) +
    (manualConditionNotes ? 14 : 0) +
    (conditionCheckedAt ? 10 : 0) +
    ((gradeAssistCheckedCount / Math.max(1, GRADE_ASSIST_CHECK_FIELDS.length)) * 36)
  ));
  const profileConditionReadinessLabel = profileConditionScore >= 78
    ? "Ready to review"
    : profileConditionScore >= 48
      ? "Partially reviewed"
      : "Needs review";
  const profileDemandLabel = itemIsWishlist
    ? "Watchlist demand"
    : /easy|medium|local demand/i.test(profileLiquidityLabel)
      ? profileLiquidityLabel
      : "Collector hold";
  const profileDecisionShortLabel = String(profileDecision.label || "Recommendation")
    .replace(/^Recommendation:\s*/i, "")
    .trim() || "Review";
  const vaultIntelligenceSparkBars = [28, 42, 38, 54, 68, 76].map((base, index) => (
    Math.max(12, Math.min(96, base + profileValueDeltaPercent * (index - 2) * 0.35))
  ));
  const vaultIntelligenceProofSteps = [
    { key: "photo", label: "Photos", detail: profileHasPhoto ? "Saved" : "Missing", ready: profileHasPhoto },
    { key: "condition", label: "Condition", detail: profileHasCondition ? "Saved" : "Missing", ready: profileHasCondition },
    { key: "value", label: "Value", detail: profileHasValue ? "Saved" : "Missing", ready: profileHasValue },
    { key: "location", label: "Location", detail: profileHasLocation ? "Saved" : "Missing", ready: profileHasLocation },
    { key: "grade", label: "Grade Assist", detail: `${gradeAssistCheckedCount}/${GRADE_ASSIST_CHECK_FIELDS.length}`, ready: gradeAssistCheckedCount > 0 },
  ];
  const vaultIntelligenceRouteCards = [
    { key: "market", label: "Market", detail: "Check value context", action: () => onCheckMarket?.(item) },
    { key: "compare", label: "Compare", detail: "Raw, graded, or sealed options", action: () => onAddToCompare?.(item) },
    itemIsWishlist
      ? { key: "owned", label: "Mark owned", detail: "Move from want to Vault", action: () => onMarkOwned?.(item) }
      : { key: "forge", label: "Business", detail: "Trade or seller review", action: () => onStartTrade?.(item) },
  ];

  return (
    <div className="vault-detail-card">
      <div className="compact-card-header">
        <div>
          <span className="section-kicker">Item Profile</span>
          <h3>{item.name}</h3>
          <p className="compact-subtitle">
            {showVaultSellerTools
              ? "Vault keeps collection records protected. Move or copy to Business when this becomes business stock."
              : "Vault keeps collection records protected, readable, and separate from seller tools."}
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>
      <div className="inventory-detail-hero">
        <CollectorFlipDetailCard
          title={masterCard?.name || item.name}
          subtitle={masterCard?.setName || setLabel || itemType || "Vault item"}
          image={detailImage}
          kind={itemProfileKind}
          mode="hero"
          valueLabel={profileEstimatedValue ? `${profileEstimatedValue} saved estimate` : "No value saved yet"}
          rarity={item.rarity || itemVariantLabel || item.finish || ""}
          meta={[itemIsWishlist ? "Wishlist" : "Owned", itemVariantLabel || "Variant pending", conditionLabel || "Condition pending"]}
          helper="Visual treatment is based on available app metadata. Not a grading or authenticity claim."
          className="vault-item-profile-showcase"
          noteRows={[
            ["Collector notes", collectorNotes || "No collector notes yet."],
            ["Source / value", profileEstimatedValue ? `${profileEstimatedValue} saved estimate. ${profileValueSourceCopy}` : "No value saved yet. Add an estimate when you are ready."],
            ["Condition / status", [conditionLabel || "Condition pending", itemIsWishlist ? "Wishlist" : "Owned"].join(" | ")],
            ["Memory / Story", memoryStory || "Story waiting"],
          ]}
          actions={[
            { label: "Open Profile", variant: "primary", onClick: () => document.querySelector(".vault-item-profile-panel")?.scrollIntoView?.({ block: "start", behavior: "smooth" }) },
            { label: "Add to Display Case", onClick: () => onAddToDisplayCase?.(item) },
            !itemIsWishlist ? { label: "Add to Trade Binder", onClick: () => onStartTrade?.(item) } : null,
            { label: "Save Price", onClick: () => onSavePriceMemory?.(item) },
            { label: "Compare", onClick: () => onAddToCompare?.(item) },
          ]}
        />
        <PremiumCardImage
          image={detailImage}
          title={masterCard?.name || item.name}
          subtitle={masterCard?.setName || setLabel || itemType}
          variantType={masterCard?.variants?.[0]?.variantType || inferMasterCardVariantType(item)}
          className="inventory-detail-image-frame"
        />
        <div className="inventory-detail-summary">
          <span className="trust-badge trust-badge--verified">Vault collection</span>
          <h4>{item.name}</h4>
          <p>{[setLabel, itemType, itemIsWishlist ? "Tracked wishlist item" : ""].filter(Boolean).join(" - ") || "Collection item"}</p>
          <div className="inventory-detail-metrics">
            {detailMetricRows.map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
          {showPurchaserSummary ? <span className="neon-chip purchaser-summary-pill">{purchaserSummaryLabel}</span> : null}
          {valuationPrompts.length ? (
            <div className="inventory-prompt-row compact">
              {valuationPrompts.slice(0, 4).map((prompt) => (
                <span className={`inventory-data-prompt ${prompt.tone}`} key={prompt.key}>
                  {prompt.label}{prompt.count ? ` (${prompt.count})` : ""}
                </span>
              ))}
            </div>
          ) : null}
          <div className="vault-profile-smart-decision-card" aria-label="Hold sell trade recommendation">
            <span className="trust-badge trust-badge--verified">{profileDecision.label}</span>
            <h4>{profileDecision.title}</h4>
            <p>{profileDecision.detail}</p>
            <div className="vault-profile-value-ribbon" aria-label="Value range">
              <span>Low {profileValueRange.low}</span>
              <span>Fair {profileValueRange.fair}</span>
              <span>High {profileValueRange.high}</span>
              <b>{profileValueRange.current}</b>
            </div>
            <div className="vault-profile-proof-row" aria-label="Proof badges">
              {profileProofBadges.map((badge) => (
                <span className={`vault-profile-proof-badge vault-profile-proof-badge--${badge.tone}`} key={badge.key}>{badge.label}</span>
              ))}
            </div>
            <div className="vault-profile-smart-meta">
              <span>{profileConfidenceLabel} confidence</span>
              <span>{profileLiquidityLabel}</span>
              <span>{profileHasValue ? "Saved estimate" : "No saved estimate"}</span>
            </div>
            <button type="button" className="secondary-button" onClick={profileDecision.action}>{profileDecision.cta}</button>
          </div>
        </div>
      </div>
      <section className="vault-item-intelligence-board" aria-label="Vault item intelligence">
        <div className="vault-item-intelligence-heading">
          <div>
            <span className="trust-badge trust-badge--verified">Vault Intelligence</span>
            <h4>Hold, sell, trade, or clean up first.</h4>
            <p>Item-specific condition, value, liquidity, confidence, and proof readiness. Manual saved data only; not grading, authentication, or live pricing.</p>
          </div>
          <div className="vault-item-confidence-score" aria-label={`Data confidence ${profileConfidenceLabel}`}>
            <span>Data confidence</span>
            <strong>{profileConfidenceLabel}</strong>
            <i><b style={{ width: `${profileConfidencePercent}%` }} /></i>
          </div>
        </div>

        <div className="vault-item-intelligence-grid">
          <article className="vault-item-decision-panel">
            <span className="section-kicker">Hold / Sell / Trade</span>
            <h4>{profileDecisionShortLabel}</h4>
            <p>{profileDecision.detail}</p>
            <div className="vault-profile-value-ribbon" aria-label="Vault item value range">
              <span>Low {profileValueRange.low}</span>
              <span>Fair {profileValueRange.fair}</span>
              <span>High {profileValueRange.high}</span>
              <b>{profileValueRange.current}</b>
            </div>
            <div className="vault-item-decision-metrics">
              <div>
                <span>Movement</span>
                <strong className={profileValueDelta >= 0 ? "is-positive" : "is-negative"}>{profileValueMovementLabel}</strong>
                <small>{profileBasisValue ? `Cost basis ${money(profileBasisValue)}` : "Add purchase price for gain/loss."}</small>
              </div>
              <div>
                <span>Liquidity</span>
                <strong>{profileDemandLabel}</strong>
                <small>{profileHasValue ? "Value saved" : "Needs value context"}</small>
              </div>
            </div>
            <div className="vault-item-mini-sparkline" aria-hidden="true">
              {vaultIntelligenceSparkBars.map((height, index) => <i key={`vault-intel-spark-${index}`} style={{ "--spark-y": `${height}%` }} />)}
              <b className={profileValueDelta >= 0 ? "is-positive" : "is-negative"}>{profileValueDeltaPercent ? `${profileValueDeltaPercent > 0 ? "+" : ""}${profileValueDeltaPercent}%` : "trend"}</b>
            </div>
            <div className="vault-item-intelligence-actions">
              <button type="button" onClick={profileDecision.action}>{profileDecision.cta}</button>
              <button type="button" className="secondary-button" onClick={() => onCheckMarket?.(item)}>Check Market</button>
              <button type="button" className="secondary-button" onClick={() => onAddToCompare?.(item)}>Compare</button>
            </div>
          </article>

          <article className="vault-item-condition-panel">
            <span className="section-kicker">Condition Center</span>
            <div className="vault-item-condition-score-row">
              <div
                className="vault-item-condition-ring"
                style={{ "--vault-item-condition-score": `${Math.max(8, profileConditionScore)}%` }}
                aria-label={`Condition readiness ${profileConditionScore}%`}
              >
                <b>{profileConditionScore}%</b>
              </div>
              <div>
                <h4>{profileConditionReadinessLabel}</h4>
                <p>{gradeAssistCheckedCount ? `${gradeAssistCheckedCount} Grade Assist checks filled. ${gradeAssistReadiness.label}.` : "Add photos, condition notes, and Grade Assist checks before using this item in bigger decisions."}</p>
              </div>
            </div>
            <div className="vault-item-proof-stepper" aria-label="Proof readiness timeline">
              {vaultIntelligenceProofSteps.map((step, index) => (
                <div className={step.ready ? "is-ready" : "is-missing"} key={step.key}>
                  <span>{index + 1}</span>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="vault-item-route-panel">
            <span className="section-kicker">Connected Routes</span>
            <h4>Move from this item to the right tool.</h4>
            <div className="vault-item-route-grid">
              {vaultIntelligenceRouteCards.map((route) => (
                <button type="button" key={route.key} onClick={route.action}>
                  <span>{route.label}</span>
                  <strong>{route.detail}</strong>
                </button>
              ))}
            </div>
            <div className="vault-profile-smart-meta">
              <span>{profileConfidenceLabel} confidence</span>
              <span>{profileLiquidityLabel}</span>
              <span>{profileConditionReadinessLabel}</span>
            </div>
          </article>
        </div>
      </section>
      <section className="vault-item-profile-panel" aria-label="Vault Item Profile">
        <div className="vault-item-profile-heading">
          <div>
            <span className="trust-badge trust-badge--secure">Vault Item</span>
            <h4>Item Profile</h4>
            <p>Family View keeps the item details, notes, and next actions in one safe collector record.</p>
          </div>
          <div className="summary-pill-row">
            <span className="neon-chip">{itemProfileKind}</span>
            <span className="neon-chip">{itemIsWishlist ? "Wishlist" : "Owned"}</span>
            <span className="neon-chip">{itemVariantLabel || "Variant pending"}</span>
          </div>
        </div>
        <div className="catalog-detail-grid vault-item-profile-grid">
          {profileQuickDetails.map(([label, value]) => (
            <DetailItem key={label} label={label} value={value} />
          ))}
        </div>
        <div className="vault-manual-condition-panel" aria-label="Manual condition note">
          <div>
            <span className="trust-badge trust-badge--secure">Manual collector note</span>
            <h4>{conditionLabel || "Condition unknown"}</h4>
            <p>{manualConditionNotes || "No condition notes yet. Add corner, edge, wrap, storage, or handling details when you review this item."}</p>
            <small className="vault-manual-condition-helper">Manual collector note, not a professional grade. Use Grade Assist below for centering, corners, edges, surface, and print-quality checks.</small>
          </div>
          <div className="vault-manual-condition-chip-row">
            <span>Manual collector note</span>
            <span>Not a professional grade</span>
            <span>Condition can affect price</span>
            <span>Verify before trading or buying</span>
          </div>
          {storageCareNotes || conditionCheckedAt ? (
            <small>{[storageCareNotes, conditionCheckedAt ? `Checked ${shortDate(conditionCheckedAt)}` : ""].filter(Boolean).join(" | ")}</small>
          ) : null}
        </div>
      </section>
      <section className="vault-profile-usefulness-grid" aria-label="Vault Item usefulness">
        <article className="vault-profile-usefulness-card">
          <span>Profile details</span>
          <h4>Condition / language / variant</h4>
          <div className="vault-profile-mini-list">
            {profileConditionVariantRows.map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="vault-profile-usefulness-card">
          <span>Value source</span>
          <h4>{profileEstimatedValue || "No value saved yet"}</h4>
          <p>{profileValueSourceCopy}</p>
          <button type="button" className="secondary-button" onClick={() => onCheckMarket?.(item)}>Check in Market</button>
        </article>
        <article className="vault-profile-usefulness-card vault-profile-trade-preview">
          <span>Linked trade history preview</span>
          <h4>{linkedTradePreview.length ? `${linkedTradePreview.length} linked trade${linkedTradePreview.length === 1 ? "" : "s"}` : "No linked trades yet"}</h4>
          <p>{linkedTradePreview.length ? "Trade Ledger memories linked to this Vault item appear here." : "Choose this Vault item as Trade Source in Business to link a future Trade Memory. Vault items are never deleted automatically."}</p>
          {linkedTradePreview.length ? (
            <div className="vault-profile-linked-trade-list">
              {linkedTradePreview.map((trade) => (
                <div key={trade.id || `${trade.sourceItemName}-${trade.receivedName}`}>
                  <strong>{trade.sourceItemName || "What You Gave"} for {trade.receivedName || trade.receivedItemName || "What You Got"}</strong>
                  <small>{trade.resultLabel || trade.guidance || "Trade saved locally"} | {trade.tradeDate ? shortDate(trade.tradeDate) : "No date"}</small>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </section>
      <section className="vault-profile-story-grid" aria-label="Collector notes and story">
        <article className="vault-profile-story-card">
          <span>Collector Notes</span>
          <strong>{collectorNotes || "No collector notes yet."}</strong>
          <p>{collectorNotes ? "Keep the collection context close to the item." : "No collector notes yet. Add why this item matters, where it came from, or what makes it special."}</p>
        </article>
        <article className="vault-profile-story-card">
          <span>Memory / Story</span>
          <strong>{memoryStory || "Story waiting"}</strong>
          <p>{memoryStory ? "A saved memory helps this feel like part of the collection, not just inventory." : "Add the pull, trade, gift, event, or family memory when you are ready."}</p>
        </article>
        <article className="vault-profile-story-card">
          <span>Kid Safe Notes</span>
          <strong>{kidSafeNotes || "Family View"}</strong>
          <p>{kidSafeNotes ? "Keep notes simple, safe, and parent-friendly." : "Use Kid Safe Notes for simple, non-private context a family member can understand."}</p>
        </article>
      </section>
      <MasterCardFamilyNote masterCard={masterCard} />
      {masterCard ? (
        <div className="vault-master-detail-note vault-master-detail-note--copy">
          <strong>Exact copy under a master card</strong>
          <span>{[itemVariantLabel || "Variant pending", conditionLabel || "Condition not set"].join(" / ")}</span>
          <span>{masterCard.ownedTotal || 0} owned across {masterCard.variantCount || masterCard.variants?.length || 0} grouped variant{(masterCard.variantCount || masterCard.variants?.length || 0) === 1 ? "" : "s"}.</span>
        </div>
      ) : null}
      <section className="vault-profile-actions-panel" aria-label="Vault Item actions">
        <div>
          <span className="trust-badge trust-badge--secure">Actions</span>
          <h4>Next safe actions</h4>
          <p>Bring this item into Business when you want to compare, trade, or think through its value. Set assignment is still local-preview planning and will not change this item automatically.</p>
        </div>
        <div className="vault-detail-primary-actions">
          <button type="button" onClick={() => onEdit(item)}>Edit profile</button>
          <button type="button" className="secondary-button" onClick={() => onAddToDisplayCase?.(item)}>Add to Display Case</button>
          <button type="button" className="secondary-button" onClick={() => onEdit(item)}>Add note</button>
          {!itemIsWishlist ? <button type="button" className="secondary-button" onClick={() => onStartTrade?.(item)}>Add to trade</button> : null}
          {!itemIsWishlist ? <button type="button" className="secondary-button" onClick={() => onStartTrade?.(item)}>Use in Business</button> : null}
          <button type="button" className="secondary-button" onClick={() => onCheckMarket?.(item)}>Check in Market</button>
          <button type="button" className="secondary-button" onClick={() => onAddToCompare?.(item)}>Compare</button>
          {itemIsWishlist ? <button type="button" onClick={() => onMarkOwned?.(item)}>Mark owned</button> : null}
          {setSummary ? <button type="button" className="secondary-button" onClick={() => onViewSet?.(setSummary)}>View Set</button> : null}
          <button type="button" className="secondary-button" onClick={() => onAttachReceipt?.(item)}>Attach receipt</button>
          <button type="button" className="secondary-button" onClick={() => onQuickUpdateMarketValue?.(item)}>Review value</button>
          {showVaultSellerTools ? <button type="button" className="secondary-button" disabled={Number(item.quantity || 0) < 1} onClick={() => onMoveToForge(item)}>Move to Business</button> : null}
        </div>
        <small>{collectionSetCount ? `${collectionSetCount} Set Shelf group${collectionSetCount === 1 ? "" : "s"} available.` : "Create a Set Shelf to group items by set."}</small>
      </section>
      {purchaserDetailRows.length ? (
        <div className="vault-detail-group-summary" aria-label="Grouped inventory details">
          <strong>Grouped inventory details</strong>
          <div>
            {purchaserDetailRows.slice(0, 4).map((entry) => (
              <span key={entry.key || entry.name}>
                {friendlyInventoryLabel(entry.name, "No purchaser assigned")}
                <b>{entry.quantity}</b>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <section className="vault-detail-set-summary" aria-label="Set Mastery connection">
        <div>
          <span className={itemSetKnown ? "trust-badge trust-badge--verified" : "trust-badge trust-badge--unconfirmed"}>
            {itemSetKnown ? "Set matched" : "Set unknown"}
          </span>
          <h4>{itemSetName}</h4>
          <p>{setMasteryCopy}</p>
        </div>
        <div className="catalog-detail-grid">
          {setMasteryDetails.map(([label, value]) => (
            <DetailItem key={label} label={label} value={value} />
          ))}
        </div>
        {setSummary ? (
          <button type="button" className="secondary-button" onClick={() => onViewSet?.(setSummary)}>
            View Set
          </button>
        ) : (
          <p className="vault-detail-action-note">Add a set name or catalog match before treating this item as part of a set.</p>
        )}
      </section>
      <div className="vault-detail-advanced-stack">
        <details className="vault-detail-disclosure" open>
          <summary>Overview</summary>
          <div className="catalog-detail-grid">
            {primaryDetails.map(([label, value]) => (
              <DetailItem key={label} label={label} value={value} />
            ))}
          </div>
        </details>
        <details className="vault-detail-disclosure">
          <summary>Ownership</summary>
          <div className="catalog-detail-grid">
            {ownershipDetails.map(([label, value]) => (
              <DetailItem key={label} label={label} value={value} />
            ))}
          </div>
        </details>
        <details className="vault-detail-disclosure">
          <summary>Value</summary>
          {valueDetails.length ? (
            <div className="catalog-detail-grid">
              {valueDetails.map(([label, value]) => (
                <DetailItem key={label} label={label} value={value} />
              ))}
            </div>
          ) : null}
          <PriceReviewPanel
            item={item}
            variant="vault"
            onReviewMarket={onQuickUpdateMarketValue}
            onReviewPlanned={showVaultSellerTools ? onQuickUpdateSalePrice : undefined}
          />
          <LazyToolBoundary label="Loading price history...">
            <MarketPriceHistoryPanel
              compact
              marketItem={marketItem || item}
              catalogProductId={item.catalogProductId || item.catalogItemId}
              tcgplayerProductId={item.tcgplayerProductId || item.tcgplayer_product_id}
              externalProductId={item.externalProductId || item.external_product_id}
              productName={item.name}
              currentMarketPrice={item.marketPrice}
              currentLowPrice={item.lowPrice}
              currentMidPrice={item.midPrice}
              currentHighPrice={item.highPrice}
              lastPriceChecked={item.lastPriceChecked || item.marketLastUpdated}
              money={money}
            />
          </LazyToolBoundary>
        </details>
        <details className="vault-detail-disclosure">
          <summary>Set Mastery</summary>
          <div className="catalog-detail-grid">
            {setMasteryDetails.map(([label, value]) => (
              <DetailItem key={label} label={label} value={value} />
            ))}
          </div>
          <p className="vault-detail-action-note">
            {setSummary?.missingSupported ? "Owned and missing counts use available checklist data." : "Missing count needs checklist data."}
          </p>
          {setSummary ? (
            <div className="quick-actions">
              <button type="button" className="secondary-button" onClick={() => onViewSet?.(setSummary)}>View Set</button>
            </div>
          ) : null}
        </details>
        <details className="vault-detail-disclosure">
          <summary>Photos / Receipts</summary>
          <div className="catalog-detail-grid">
            {photoReceiptDetails.map(([label, value]) => (
              <DetailItem key={label} label={label} value={label === "Receipt URL" || label === "Photo Proof" ? <PrivateReceiptLink href={value}>Open saved proof</PrivateReceiptLink> : value} />
            ))}
          </div>
          <div className="quick-actions">
            <button type="button" className="secondary-button" onClick={() => onAttachReceipt?.(item)}>Attach receipt</button>
          </div>
        </details>
        <details className="vault-detail-disclosure">
          <summary>Notes</summary>
          {noteDetails.length ? (
            <div className="catalog-detail-grid">
              {noteDetails.map(([label, value]) => (
                <DetailItem key={label} label={label} value={value} />
              ))}
            </div>
          ) : (
            <p className="vault-detail-action-note">No collector notes yet. Add why this item matters, where it came from, or what makes it special.</p>
          )}
        </details>
        <details className="vault-detail-disclosure">
          <summary>Activity</summary>
          <InventoryBreakdownPanel
            item={item}
            variant="vault"
            onEditEntry={onEdit}
            onDeleteEntry={onDelete}
            onMoveEntryToForge={onMoveToForge}
            onCopyEntryToForge={onCopyToForge}
          />
        </details>
        <details className="vault-detail-disclosure grade-assist-disclosure" open>
          <summary>Condition / Grade Assist</summary>
          <div className="catalog-detail-grid">
            {(conditionDetails.length ? conditionDetails : [["Condition", "Not set"]]).map(([label, value]) => (
              <DetailItem key={label} label={label} value={value} />
            ))}
          </div>
          <section className="grade-assist-panel" aria-label="Manual Grade Assist checklist">
            <div className="grade-assist-header">
              <div>
                <span className="trust-badge trust-badge--secure">Estimate only</span>
                <h4>Grade Assist</h4>
                <p>{GRADE_ASSIST_DISCLAIMER}</p>
              </div>
              <div className={`grade-assist-readiness ${gradeAssistReadiness.tone}`} role="status" aria-live="polite" aria-label={`Grade Assist readiness status: ${gradeAssistReadiness.label}`}>
                <span>Grade readiness</span>
                <strong>{gradeAssistReadiness.label}</strong>
                <p>{gradeAssistReadiness.helper}</p>
                <small>{gradeAssistCheckedCount} of {GRADE_ASSIST_CHECK_FIELDS.length} manual checks filled</small>
              </div>
            </div>
            <div className="grade-assist-safety-strip" aria-label="Grade Assist safety limits">
              <span>Manual checklist</span>
              <span>Saved on this device only</span>
              <span>No AI, authentication, or grading-company guarantee</span>
              <span>Centering is measured from your photo on this device</span>
            </div>
            {gradeAssistEmpty ? (
              <div className="grade-assist-empty-guide" aria-label="Grade Assist starter guide">
                <span>Before you start</span>
                <strong>Use Grade Assist as a manual review checklist.</strong>
                <p>Check the card under good light, look at the front and back if you have photos, then mark only what you personally reviewed.</p>
              </div>
            ) : null}
            <div className="grade-assist-photo-grid" aria-label="Grade Assist photo references">
              <div className={detailImage ? "grade-assist-photo-card has-image" : "grade-assist-photo-card"}>
                <span>Front/reference photo</span>
                {detailImage ? <PrivateStorageImage src={detailImage} alt={`${item.name || "Vault item"} front reference for Grade Assist`} /> : <strong>No photo yet</strong>}
                <p>{detailImage ? "Using the current item image for manual review." : "Add an item photo from Edit / Add details when available."}</p>
              </div>
              <div className="grade-assist-photo-card">
                <span>Back photo</span>
                <strong>No back photo yet</strong>
                <p>Dedicated front/back photo storage needs backend Grade Assist support.</p>
              </div>
            </div>
            <div className="grade-assist-checklist" aria-label="Manual condition checklist">
              {GRADE_ASSIST_CHECK_FIELDS.map((field) => (
                <label className="grade-assist-field" key={field.key}>
                  <span>{field.label}</span>
                  <select
                    aria-label={`Grade Assist ${field.label}`}
                    value={gradeAssistDraft.checks?.[field.key] || "not_checked"}
                    onChange={(event) => updateGradeAssistField(field.key, event.target.value)}
                  >
                    {GRADE_ASSIST_CHECK_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {/* Nov 19 2026: measured centering from a photo; adds the result to the notes. */}
            <Suspense fallback={null}>
              <CenteringCheck onUseResult={(text) => updateGradeAssistNotes([gradeAssistDraft.notes, text].filter(Boolean).join("\n"))} />
            </Suspense>
            <label className="grade-assist-notes">
              <span>Notes</span>
              <textarea
                aria-label="Grade Assist Notes"
                value={gradeAssistDraft.notes || ""}
                onChange={(event) => updateGradeAssistNotes(event.target.value)}
                placeholder="Manual notes only: centering, whitening, print lines, dents, surface marks, or anything to review before deciding."
                rows={3}
              />
            </label>
            <div className="grade-assist-value-card">
              <span>Value comparison</span>
              <strong>{gradeAssistValue.label}</strong>
              <p>{gradeAssistValue.helper}</p>
            </div>
            {showVaultSellerTools ? (
              <p className="vault-detail-action-note">Seller context: use this as pre-listing review notes only. It does not change Business pricing or listing status.</p>
            ) : null}
            <div className="quick-actions grade-assist-actions">
              <button type="button" onClick={saveGradeAssist}>Save notes / Update checklist</button>
              <button type="button" className="secondary-button" onClick={() => onQuickUpdateMarketValue?.(item)}>Open value review</button>
            </div>
            <p className="vault-detail-action-note">
              {gradeAssistMessage || "Checklist storage is local to this browser for now. Cloud sync needs backend Grade Assist storage."}
            </p>
          </section>
        </details>
        <FlowNextActionCard
          eyebrow="After Grade Assist"
          title="Choose the next safe collector step."
          detail="Use the manual checklist as a prompt, not a grade. Then review value, notes, or trade context before making a decision."
          tone="vault"
          actions={[
            { label: "Check in Market", onClick: () => onCheckMarket?.(item) },
            !itemIsWishlist ? { label: "Use in Business", onClick: () => onStartTrade?.(item) } : null,
            { label: "Add note", onClick: () => onEdit(item) },
          ]}
        />
        <details className="vault-detail-disclosure">
          <summary>Identifiers</summary>
          <div className="catalog-detail-grid">
            {(identifierDetails.length ? identifierDetails : advancedDetails).map(([label, value]) => (
              <DetailItem key={label} label={label} value={value} />
            ))}
          </div>
        </details>
        <details className="vault-detail-disclosure">
          <summary>More actions</summary>
          <div className="quick-actions">
            {showVaultSellerTools ? <button type="button" className="secondary-button" onClick={() => onCopyToForge(item)}>Copy to Resale Inventory</button> : null}
            {showVaultSellerTools ? <button type="button" className="secondary-button" onClick={() => onCreateListing?.(item)}>Create Listing</button> : null}
            {!itemIsWishlist ? <button type="button" className="secondary-button" onClick={() => onStartTrade?.(item)}>Start Trade</button> : null}
            {showVaultSellerTools ? <button type="button" className="secondary-button" onClick={() => onQuickUpdateSalePrice?.(item)}>Update Planned Price</button> : null}
            <button type="button" className="secondary-button" onClick={() => onAttachReceipt?.(item)}>Attach receipt</button>
            <button type="button" className="secondary-button" onClick={() => onDuplicate?.(item)}>Duplicate Item</button>
            <button type="button" className="secondary-button" onClick={() => onDelete(item)}>Remove Collection Item</button>
          </div>
          {showVaultSellerTools ? (
            <p className="vault-detail-action-note">Collection is for owned-item tracking. Move or copy to Resale Inventory when this item becomes business inventory.</p>
          ) : null}
        </details>
      </div>
    </div>
  );
}

function CompactInventoryCard({
  item,
  masterCard,
  variant = "forge",
  onRestock,
  onViewDetails,
  onEdit,
  onDelete,
  onStatusChange,
  onMoveToForge,
  onCopyToForge,
  onDuplicate,
  onQuickUpdateMarketValue,
  onQuickUpdateSalePrice,
  onSell,
  onCreateListing,
  onStartTrade,
  showSellerTools = false,
}) {
  const isVault = variant === "vault";
  const valuation = item.valuationSummary || buildGroupedInventoryValuation(item, { context: isVault ? "vault" : "forge" });
  const valuationPrompts = buildInventoryMissingDataPrompts(valuation, { context: isVault ? "vault" : "forge" });
  const quantity = valuation.totalQuantity || Number(item.quantity || 0);
  const unitCost = Number(item.unitCost || 0);
  const marketPrice = Number(item.marketPrice || 0);
  const displayedProfitEstimate = valuation.estimatedProfitAtPlannedPrice ?? valuation.estimatedUnrealizedGainLoss;

  const roiPercent =
    unitCost > 0 ? ((marketPrice - unitCost) / unitCost) * 100 : 0;
  const packCount = Number(item.packCount || 0);
  const physicalLocation = forgePhysicalLocationLabel(item);
  if (isVault) {
    const showVaultSellerTools = Boolean(showSellerTools);
    const image = vaultItemDisplayImage(item);
    const itemType = vaultItemTypeLabel(item);
    const setLabel = vaultItemSetLabel(item);
    const totalMarket = valuation.estimatedMarketValue || 0;
    const statusLabel = vaultStatusLabel(normalizeVaultStatus(item));
    const conditionLabel = item.conditionName || item.condition || item.grade || "";
    const manualConditionNotes = item.conditionNotes || item.condition_notes || item.conditionNote || item.condition_note || "";
    const conditionCheckedAt = item.conditionCheckedAt || item.condition_checked_at || "";
    const ownerLabel = item.purchaserSummary || itemPurchaserName(item);
    const showOwnerLabel = ownerLabel && !/no purchaser assigned/i.test(String(ownerLabel));
    const showManualConditionCard = Boolean(manualConditionNotes || conditionCheckedAt);
    const vaultFactRows = [
      ["Qty", quantity || 1],
      ["Value", valuation.marketKnownQuantity ? money(totalMarket) : "Value unavailable"],
      ...(showOwnerLabel ? [["Owner", ownerLabel]] : []),
      ...(conditionLabel ? [["Condition", conditionLabel]] : []),
      ...(packCount > 0 ? [["Packs", packCount]] : []),
    ];
    const vaultOverflowActions = [
      { label: "Edit", onClick: () => onEdit?.(item) },
      { label: "Review Market Value", onClick: () => onQuickUpdateMarketValue?.(item) },
      { label: "Start Trade Review", onClick: () => onStartTrade?.(item), disabled: quantity < 1 },
      ...(showVaultSellerTools ? [
        { label: "Move to Resale Inventory", onClick: () => onMoveToForge?.(item), disabled: quantity < 1 },
        { label: "Update Planned Price", onClick: () => onQuickUpdateSalePrice?.(item) },
        { label: "Copy to Resale Inventory", onClick: () => onCopyToForge?.(item) },
        ...(onCreateListing ? [{ label: "Create Listing", onClick: () => onCreateListing?.(item) }] : []),
      ] : []),
      { label: "Duplicate Item", onClick: () => onDuplicate?.(item) },
      { label: "Mark Traded", onClick: () => onStatusChange?.(item, "traded") },
      { label: "Change Status", onClick: () => onEdit(item) },
    ];
    return (
      <div className="inventory-card compact-card vault-item-card">
        <div className="compact-card-header vault-card-topline">
          <div className="compact-title-block">
            <h3>{item.name}</h3>
            <p className="compact-subtitle">{setLabel || itemType || "Collection item"}</p>
          </div>
          <span className={statusClass(statusLabel)}>{statusLabel}</span>
        </div>

        <div className="vault-card-main">
          <PremiumCardImage
            image={image}
            title={masterCard?.name || item.name}
            subtitle={masterCard?.setName || setLabel || itemType || "Vault item"}
            variantType={masterCard?.variants?.[0]?.variantType || inferMasterCardVariantType(item)}
            className="compact-image-wrap vault-image-wrap"
          />

          <div className="vault-card-facts">
            {vaultFactRows.map(([label, value]) => (
              <p key={label}><span>{label}</span>{" "}<strong>{value}</strong></p>
            ))}
          </div>
        </div>
        {showManualConditionCard ? (
          <div className="vault-card-condition-note" aria-label="Manual condition note">
            <span>Manual collector note</span>
            <strong>{conditionLabel || "Condition pending"}</strong>
            <small>{manualConditionNotes || "Review notes saved locally."}</small>
            {conditionCheckedAt ? <em>Checked {shortDate(conditionCheckedAt)}</em> : null}
          </div>
        ) : null}
        <MasterVariantRail masterCard={masterCard} compact />

        {showVaultSellerTools && valuationPrompts.length ? (
          <div className="inventory-prompt-row compact">
            {valuationPrompts.slice(0, 3).map((prompt) => (
              <span className={`inventory-data-prompt ${prompt.tone}`} key={prompt.key}>
                {prompt.label}{prompt.count ? ` (${prompt.count})` : ""}
              </span>
            ))}
          </div>
        ) : null}

        <div className="compact-actions vault-card-actions">
          <button type="button" className="secondary-button" aria-label={`Open Item Profile for ${item.name}`} onClick={() => onViewDetails?.(item)}>Item Profile</button>
          <button type="button" className="secondary-button trade-card-action" onClick={() => onStartTrade?.(item)} disabled={quantity < 1}>Trade</button>
          <OverflowMenu
            buttonLabel="More"
            actions={vaultOverflowActions}
            onDelete={() => onDelete(item.id)}
            deleteLabel="Remove from Collection"
          />
        </div>
      </div>
    );
  }
  const statusSummary = item.statusSummary || summarizeForgeGroupedInventoryStatus(inventoryGroupEntries(item), item.saleHistory || []);
  const forgeImage = item.itemImage || vaultItemDisplayImage(item);
  const lastActivity = item.updatedAt || item.createdAt || item.created_at || "";
  const primaryEntry = inventoryGroupEntries(item)[0] || item;
  const nextSellEntry = inventoryGroupEntries(item).find((entry) => Number(entry.quantity || 0) > 0 && !inventoryEntryIsSold(entry)) || primaryEntry;
  const openGroupedCard = (event) => {
    if (event.target.closest("button, a, input, select, textarea, summary, [role='button']")) return;
    onViewDetails?.(item);
  };
  return (
    <div
      className={`inventory-card compact-card forge-inventory-card ${item.isGroupedInventory ? "is-grouped" : ""}`}
      onClick={openGroupedCard}
    >
      <div className="compact-card-header">
        <div className="compact-title-block">
          <h3>{item.name}</h3>
          <div className="forge-card-facts">
            <span className="forge-card-quantity">Available {statusSummary.currentQuantity || item.quantity || 0}</span>
            <span className="forge-card-quantity">Total {statusSummary.totalQuantity || item.quantity || 0}</span>
            {item.locationSummary || physicalLocation ? <span className="neon-chip forge-location-pill">{item.locationSummary || physicalLocation}</span> : null}
          </div>
          <p className="compact-subtitle forge-card-meta-legacy">
            {item.category} | {item.buyer} | Qty {item.quantity}
          </p>
        </div>
        <div className="forge-card-status-stack">
          <span className={statusClass(item.status)}>{item.status || "In Stock"}</span>
        </div>
      </div>

      {forgeImage ? (
        <div className="compact-image-wrap">
          <PrivateStorageImage
            src={forgeImage}
            alt={item.name}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              event.currentTarget.nextElementSibling?.removeAttribute("hidden");
            }}
          />
          {renderGenericProductImageFallback({ ...item, productName: item.name, setName: item.expansion, productType: item.productType }, { hidden: true })}
          <span>{getImageSourceLabel(item)}{item.itemImageNeedsReview ? " | Needs review" : ""}</span>
        </div>
      ) : (
        <div className="compact-image-wrap placeholder">
          <strong>{item.name}</strong>
          <small>{item.expansion || item.productType || "Item photo"}</small>
          <b>Image needed</b>
        </div>
      )}
      <MasterVariantRail masterCard={masterCard} compact />

      <div className="forge-group-status-row" aria-label="Grouped Business status summary">
        <span>{statusSummary.currentQuantity || item.quantity || 0} held</span>
        <span>{statusSummary.listedQuantity || 0} listed</span>
        <span>{statusSummary.soldQuantity || 0} sold</span>
        {lastActivity ? <span>Updated {shortDate(lastActivity)}</span> : null}
      </div>

  <div className="compact-metrics">
    <div>
      <span>Avg Cost</span>
      <strong>{valuation.averageCostPerItem === null ? "Unknown" : money(valuation.averageCostPerItem)}</strong>
    </div>
    <div>
      <span>Total Market</span>
      <strong>{valuation.marketKnownQuantity ? money(valuation.estimatedMarketValue) : "Unknown"}</strong>
    </div>
    <div>
      <span>Planned Total</span>
      <strong>{valuation.plannedKnownQuantity ? money(valuation.plannedSaleTotal) : "Unknown"}</strong>
    </div>
    <div>
      <span>Profit Est.</span>
      <strong>{displayedProfitEstimate === null ? "Unknown" : money(displayedProfitEstimate)}</strong>
    </div>
  </div>

      {valuationPrompts.length ? (
        <div className="inventory-prompt-row compact">
          {valuationPrompts.slice(0, 4).map((prompt) => (
            <span className={`inventory-data-prompt ${prompt.tone}`} key={prompt.key}>
              {prompt.label}{prompt.count ? ` (${prompt.count})` : ""}
            </span>
          ))}
        </div>
      ) : null}

      <div className="compact-details">
        <p><strong>SKU:</strong> {item.sku}</p>
        <p><strong>Store:</strong> {item.store || "Not listed"}</p>
        <p><strong>Physical Location:</strong> {item.locationSummary || physicalLocation || "No location assigned"}</p>
        {item.physicalLocationNotes ? <p><strong>Location Notes:</strong> {item.physicalLocationNotes}</p> : null}
        <p><strong>Purchased By:</strong> {item.purchaserSummary || itemPurchaserName(item)}</p>
        <p><strong>Type:</strong> {item.productType || "Not listed"}</p>
        <p><strong>Expansion:</strong> {item.expansion || "Not listed"}</p>
        <p><strong>Set Code:</strong> {item.setCode || "Not listed"}</p>
        <p><strong>Pack Count:</strong> {item.packCount || "Not listed"}</p>
        <p><strong>Barcode:</strong> {item.barcode || "Not listed"}</p>
        <p><strong>Total Cost:</strong> {valuation.costKnownQuantity ? money(valuation.totalCostBasis) : "Unknown"}</p>
        <p><strong>Total MSRP:</strong> {valuation.msrpKnownQuantity ? money(valuation.msrpTotal) : "Unknown"}</p>
        <p><strong>ROI:</strong> {roiPercent.toFixed(1)}%</p>
        <p><strong>Total Market:</strong> {valuation.marketKnownQuantity ? money(valuation.estimatedMarketValue) : "Unknown"}</p>
        <p><strong>Planned Profit:</strong> {valuation.estimatedProfitAtPlannedPrice === null ? "Unknown" : money(valuation.estimatedProfitAtPlannedPrice)}</p>
        {item.listingPlatform && <p><strong>Listing:</strong> {item.listingPlatform}</p>}
        {item.listedPrice > 0 && <p><strong>Listed Price:</strong> {money(item.listedPrice)}</p>}
        {item.actionNotes && <p><strong>Action:</strong> {item.actionNotes}</p>}
      </div>

      <div className="compact-links">
        {physicalLocation ? <span className="neon-chip forge-location-pill">{physicalLocation}</span> : null}
        {item.tideTradrUrl && <ExternalWebLink href={item.tideTradrUrl}>Market Watch</ExternalWebLink>}
        {item.listingUrl && <ExternalWebLink href={item.listingUrl}>Listing</ExternalWebLink>}
        {item.receiptImage && <PrivateReceiptLink href={item.receiptImage}>Receipt</PrivateReceiptLink>}
      </div>

      <div className="compact-actions forge-card-actions">
        <button type="button" className="secondary-button" onClick={() => onViewDetails?.(item)}>View / Edit</button>
        <button type="button" className="secondary-button trade-card-action" onClick={() => onStartTrade?.(primaryEntry)} disabled={Number(nextSellEntry?.quantity || 0) < 1}>Trade</button>
        <OverflowMenu
          buttonLabel="More"
          actions={[
            { label: "Mark sold / add sale", onClick: () => onSell?.(nextSellEntry), disabled: Number(nextSellEntry?.quantity || 0) < 1 },
            { label: "Edit primary entry", onClick: () => onEdit?.(primaryEntry) },
            { label: "Review Market Value", onClick: () => onQuickUpdateMarketValue?.(item) },
            { label: "Start Trade Review", onClick: () => onStartTrade?.(primaryEntry), disabled: Number(nextSellEntry?.quantity || 0) < 1 },
            { label: "Update Planned Price", onClick: () => onQuickUpdateSalePrice?.(item) },
            { label: "List", onClick: () => onCreateListing?.(item) },
            { label: "Restock", onClick: () => onRestock?.(item) },
            { label: "Change Status", onClick: () => onEdit?.(primaryEntry) },
          ]}
          onDelete={() => onDelete?.(primaryEntry.id)}
          deleteLabel="Delete resale inventory item"
        />
      </div>
    </div>
  );
}

function VaultEditForm({
  form,
  setForm,
  item,
  purchasers = [],
  onCreatePurchaser,
  onManagePurchasers,
  handleImageUpload,
  onSubmit,
  onCancel,
  onMoveToForge,
}) {
  const [sections, setSections] = useState({
    basic: true,
    pricing: true,
    market: false,
    photos: false,
    forge: false,
    notes: false,
    advanced: false,
  });
  const quantity = Number(form.quantity || 0);
  const unitCost = Number(form.unitCost || 0);
  const msrpPrice = Number(form.msrpPrice || 0);
  const marketPrice = Number(form.marketPrice || 0);
  const salePrice = Number(form.salePrice || 0);
  const totalPaid = quantity * unitCost;
  const totalMarket = quantity * marketPrice;
  const totalPlannedSale = quantity * salePrice;
  const estimatedMarketProfit = totalMarket - totalPaid;
  const estimatedPlannedProfit = totalPlannedSale - totalPaid;

  const currentPurchaserId =
    form.purchaserId ||
    purchasers.find((purchaser) => purchaser.name === form.purchaserName || purchaser.name === form.buyer)?.id ||
    "";
  function toggle(section) {
    setSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function selectPurchaser(purchaser) {
    setForm("purchaserId", purchaser?.id || "");
    setForm("purchaserName", purchaser?.name || "");
    setForm("buyer", purchaser?.name || "");
  }

  function setVaultStatus(value) {
    setForm("vaultStatus", value);
    setForm("status", vaultStatusLabel(value));
  }

  function setCollection(value) {
    setForm("expansion", value);
    setForm("setName", value);
  }

  function renderSection(key, title, children) {
    return (
      <div className="vault-form-section" key={key}>
        <button type="button" className="vault-section-toggle" onClick={() => toggle(key)}>
          <span>{title}</span>
          <b>{sections[key] ? "Hide" : "Show"}</b>
        </button>
        {sections[key] ? children : null}
      </div>
    );
  }

  return (
    <section className="panel vault-edit-panel">
      <div className="compact-card-header">
        <div>
          <h2>Edit Vault Item</h2>
          <p>Vault is for personal collection and held items. Move to Business when it becomes selling inventory.</p>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="vault-collapsible-form vault-edit-form"
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") event.preventDefault();
        }}
      >
        {renderSection("basic", "Basic Info", (
          <div className="form vault-form-grid">
            <Field label="Vault Status">
              <select value={form.vaultStatus || normalizeVaultStatus(form)} onChange={(event) => setVaultStatus(event.target.value)}>
                {VAULT_STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Item Name">
              <input value={form.name || ""} onChange={(event) => setForm("name", event.target.value)} />
            </Field>
            <Field label="Category">
              <select value={form.category || "Pokemon"} onChange={(event) => setForm("category", event.target.value)}>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Product Type">
              <input value={form.productType || ""} onChange={(event) => setForm("productType", event.target.value)} />
            </Field>
            <Field label="Set / Collection">
              <input value={form.expansion || form.setName || ""} onChange={(event) => setCollection(event.target.value)} />
            </Field>
            <Field label="Quantity">
              <input type="number" min="1" value={form.quantity || 1} onChange={(event) => setForm("quantity", event.target.value)} />
            </Field>
            <Field label="Barcode / UPC">
              <input value={form.barcode || form.upc || ""} onChange={(event) => { setForm("barcode", event.target.value); setForm("upc", event.target.value); }} />
            </Field>
            <Field label="Store / Source">
              <input value={form.store || ""} onChange={(event) => setForm("store", event.target.value)} />
            </Field>
            <PurchaserSelect
              label="Who paid?"
              purchasers={purchasers}
              valueId={currentPurchaserId}
              valueName={form.purchaserName || form.buyer || ""}
              onSelect={selectPurchaser}
              onCreatePurchaser={onCreatePurchaser}
              onManagePurchasers={onManagePurchasers}
            />
          </div>
        ))}

        {renderSection("pricing", "Pricing", (
          <div className="form vault-form-grid">
            <Field label="Unit Cost">
              <input type="number" step="0.01" value={form.unitCost || ""} onChange={(event) => setForm("unitCost", event.target.value)} />
            </Field>
            <Field label="MSRP">
              <input type="number" step="0.01" value={form.msrpPrice || ""} onChange={(event) => setForm("msrpPrice", event.target.value)} />
            </Field>
            <Field label="Market Price">
              <input type="number" step="0.01" value={form.marketPrice || ""} onChange={(event) => setForm("marketPrice", event.target.value)} />
            </Field>
            <Field label="Planned Sale Price">
              <input type="number" step="0.01" value={form.salePrice || ""} onChange={(event) => setForm("salePrice", event.target.value)} />
            </Field>
            <div className="profit-preview vault-profit-preview">
              <h3>Profit Preview</h3>
              <div className="preview-grid">
                <div><span>Total Paid</span><strong>{money(totalPaid)}</strong></div>
                <div><span>Total Market</span><strong>{money(totalMarket)}</strong></div>
                <div><span>Market Profit</span><strong>{money(estimatedMarketProfit)}</strong></div>
                <div><span>Planned Profit</span><strong>{money(estimatedPlannedProfit)}</strong></div>
                <div><span>Planned Sale Total</span><strong>{money(totalPlannedSale)}</strong></div>
                <div><span>MSRP Each</span><strong>{money(msrpPrice)}</strong></div>
              </div>
            </div>
          </div>
        ))}

        {renderSection("market", "Market Data", (
          <div className="form vault-form-grid">
            <Field label="Market Source">
              <input value={form.marketSource || form.sourceType || "Manual"} onChange={(event) => setForm("marketSource", event.target.value)} />
            </Field>
            <Field label="Market Last Updated">
              <input value={form.marketLastUpdated || form.lastPriceChecked || "Unknown"} readOnly />
            </Field>
            <div className="small-empty-state">
              Market refresh is not connected yet. Current values are manually entered or estimated beta data.
            </div>
          </div>
        ))}

        {renderSection("photos", "Photos", (
          <div className="form vault-form-grid">
            <Field label="Product Photo">
              <input type="file" accept="image/*" onChange={(event) => handleImageUpload(event, (url) => {
                setForm("itemImage", url);
                setForm("itemImageSource", "user");
                setForm("itemImageStatus", "user");
                setForm("itemImageLastUpdated", new Date().toISOString());
              }, "vault-items")} />
            </Field>
            <Field label="Manual Image URL">
              <input value={form.itemImage || ""} onChange={(event) => {
                setForm("itemImage", event.target.value);
                setForm("itemImageSource", event.target.value ? "manual" : "placeholder");
                setForm("itemImageStatus", event.target.value ? "manual" : "placeholder");
              }} />
            </Field>
            {form.itemImage ? (
              <div className="receipt-preview">
                <p>Product Photo</p>
                <PrivateStorageImage src={form.itemImage} alt="Product" />
                <button type="button" className="secondary-button" onClick={() => setForm("itemImage", "")}>Remove Product Photo</button>
              </div>
            ) : null}
            <Field label="Receipt / Screenshot">
              <input type="file" accept="image/*" onChange={(event) => handleImageUpload(event, (url) => setForm("receiptImage", url), "vault-receipts")} />
            </Field>
            {form.receiptImage ? (
              <div className="receipt-preview">
                <p>Receipt / Screenshot</p>
                <PrivateReceiptImage src={form.receiptImage} alt="Receipt" />
                <button type="button" className="secondary-button" onClick={() => setForm("receiptImage", "")}>Remove Receipt</button>
              </div>
            ) : null}
          </div>
        ))}

        {renderSection("forge", "Selling / Business", (
          <div className="form vault-form-grid">
            <Field label="Planned Sale Price">
              <input type="number" step="0.01" value={form.salePrice || ""} onChange={(event) => setForm("salePrice", event.target.value)} />
            </Field>
            <Field label="Listing Platform">
              <input value={form.listingPlatform || ""} onChange={(event) => setForm("listingPlatform", event.target.value)} />
            </Field>
            <Field label="Listing URL">
              <input value={form.listingUrl || ""} onChange={(event) => setForm("listingUrl", event.target.value)} />
            </Field>
            <Field label="Listed Price">
              <input type="number" step="0.01" value={form.listedPrice || ""} onChange={(event) => setForm("listedPrice", event.target.value)} />
            </Field>
            <Field label="Action Notes">
              <input value={form.actionNotes || ""} onChange={(event) => setForm("actionNotes", event.target.value)} />
            </Field>
            <button type="button" className="secondary-button" disabled={!item} onClick={() => item && onMoveToForge(item)}>Move to Business</button>
          </div>
        ))}

        {renderSection("notes", "Notes", (
          <div className="form vault-form-grid">
            <div className="vault-condition-helper-card">
              <strong>Manual collector note</strong>
              <span>Not a professional grade. Condition can affect price; verify before trading or buying.</span>
            </div>
            <Field label="Personal Notes">
              <textarea value={form.notes || ""} onChange={(event) => setForm("notes", event.target.value)} />
            </Field>
            <Field label="Manual condition">
              <select value={form.conditionName || form.condition || "Unknown"} onChange={(event) => {
                setForm("conditionName", event.target.value);
                setForm("condition", event.target.value);
              }}>
                {VAULT_CONDITIONS.map((condition) => <option key={condition || "blank"} value={condition}>{condition || "Not set"}</option>)}
              </select>
            </Field>
            <Field label="Condition Notes">
              <textarea value={form.conditionNotes || ""} onChange={(event) => setForm("conditionNotes", event.target.value)} placeholder="Corner wear, box dents, whitening, wrap condition, or anything to review manually." />
            </Field>
            <Field label="Sleeve / toploader / storage notes">
              <textarea value={form.storageCareNotes || ""} onChange={(event) => setForm("storageCareNotes", event.target.value)} placeholder="Sleeved, top loaded, binder page, team bag, shelf location, or storage care note." />
            </Field>
            <Field label="Date checked">
              <input type="date" value={form.conditionCheckedAt || ""} onChange={(event) => setForm("conditionCheckedAt", event.target.value)} />
            </Field>
            <Field label="Storage Location">
              <select value={form.storageLocation || ""} onChange={(event) => setForm("storageLocation", event.target.value)}>
                {VAULT_STORAGE_LOCATIONS.map((location) => <option key={location || "blank"} value={location}>{location || "Not set"}</option>)}
              </select>
            </Field>
            <Field label="Sealed Condition">
              <select value={form.sealedCondition || ""} onChange={(event) => setForm("sealedCondition", event.target.value)}>
                {VAULT_CONDITIONS.map((condition) => <option key={condition || "blank"} value={condition}>{condition || "Not set"}</option>)}
              </select>
            </Field>
          </div>
        ))}

        {renderSection("advanced", "Advanced", (
          <div className="form vault-form-grid">
            <Field label="Market Watch Product ID">
              <input value={form.externalProductId || form.tideTradrProductId || ""} onChange={(event) => { setForm("externalProductId", event.target.value); setForm("tideTradrProductId", event.target.value); }} />
            </Field>
            <Field label="Market Source URL">
              <input value={form.tideTradrUrl || ""} onChange={(event) => setForm("tideTradrUrl", event.target.value)} />
            </Field>
            <Field label="Product Line">
              <input value={form.productLine || ""} onChange={(event) => setForm("productLine", event.target.value)} />
            </Field>
            <Field label="Expansion">
              <input value={form.expansion || ""} onChange={(event) => setForm("expansion", event.target.value)} />
            </Field>
            <Field label="Pack Count">
              <input type="number" min="0" value={form.packCount || ""} onChange={(event) => setForm("packCount", event.target.value)} />
            </Field>
            <Field label="Low Price">
              <input type="number" step="0.01" value={form.lowPrice || ""} onChange={(event) => setForm("lowPrice", event.target.value)} />
            </Field>
            <Field label="Mid Price">
              <input type="number" step="0.01" value={form.midPrice || ""} onChange={(event) => setForm("midPrice", event.target.value)} />
            </Field>
            <Field label="High Price">
              <input type="number" step="0.01" value={form.highPrice || ""} onChange={(event) => setForm("highPrice", event.target.value)} />
            </Field>
          </div>
        ))}

        <div className="vault-form-actions">
          <button type="submit">Save changes</button>
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

function InventoryForm({
  form,
  setForm,
  catalogProducts,
  purchasers = [],
  onCreatePurchaser,
  onManagePurchasers,
  applyCatalogProduct,
  handleImageUpload,
  onSubmit,
  submitLabel,
  statusOptions = STATUSES,
  allowGrading = false,
}) {
  const quantity = Number(form.quantity || 0);
  const unitCost = Number(form.unitCost || 0);
  const msrpPrice = Number(form.msrpPrice || 0);
  const marketPrice = Number(form.marketPrice || 0);
  const salePrice = Number(form.salePrice || 0);

  const totalPaid = quantity * unitCost;
  const totalMsrp = quantity * msrpPrice;
  const totalMarket = quantity * marketPrice;
  const totalPlannedSale = quantity * salePrice;

  const estimatedMarketProfit = totalMarket - totalPaid;
  const estimatedPlannedProfit = totalPlannedSale - totalPaid;

  const marketRoi =
    totalPaid > 0 ? (estimatedMarketProfit / totalPaid) * 100 : 0;

  const plannedRoi =
    totalPaid > 0 ? (estimatedPlannedProfit / totalPaid) * 100 : 0;

  const currentPurchaserId =
    form.purchaserId ||
    purchasers.find((purchaser) => purchaser.name === form.purchaserName || purchaser.name === form.buyer)?.id ||
    "";
  const selectedCatalogProduct = catalogProducts.find((product) => String(product.id) === String(form.catalogProductId));
  const selectedCatalogImage = selectedCatalogProduct ? getCatalogImage(selectedCatalogProduct) : "";
  const selectedCatalogName = selectedCatalogProduct
    ? selectedCatalogProduct.name || selectedCatalogProduct.productName || selectedCatalogProduct.cardName || "Catalog product"
    : "";
  const selectedCatalogVariants = Array.isArray(selectedCatalogProduct?.variants)
    ? selectedCatalogProduct.variants.filter((variant) => variant.variantName || variant.variant_name)
    : [];

  function selectPurchaser(purchaser) {
    setForm("purchaserId", purchaser?.id || "");
    setForm("purchaserName", purchaser?.name || "");
    setForm("buyer", purchaser?.name || "");
  }

  return (
    <form onSubmit={onSubmit} className="form forge-inventory-form">
      <section className="forge-form-step forge-product-step">
        <div className="forge-step-heading">
          <span>Step 1</span>
          <div>
            <h3>Product</h3>
            <p>Start from Market Watch when possible, or enter the item manually.</p>
          </div>
        </div>
      <Field label="Choose Saved Catalog Product">
        <select value={form.catalogProductId} onChange={(e) => applyCatalogProduct(e.target.value)}>
          <option value="">No catalog product selected</option>
          {catalogProducts.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatPriceDisplay(p.marketPrice || p.marketValue, { moneyFormatter: money, missingLabel: "Market unknown" })}</option>)}
        </select>
      </Field>
      {selectedCatalogProduct ? (
        <div className="forge-selected-product-card">
          <div className="catalog-thumb">
            {selectedCatalogImage ? (
              <>
                <PrivateStorageImage
                  src={selectedCatalogImage}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                    event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                  }}
                />
                {renderGenericProductImageFallback(selectedCatalogProduct, { hidden: true })}
              </>
            ) : (
              renderGenericProductImageFallback(selectedCatalogProduct)
            )}
          </div>
          <div>
            <strong>{selectedCatalogName}</strong>
            <span>{selectedCatalogProduct.setName || selectedCatalogProduct.expansion || selectedCatalogProduct.productType || "Catalog product"}</span>
            <span>Market: {formatPriceDisplay(selectedCatalogProduct.marketPrice || selectedCatalogProduct.marketValue, { moneyFormatter: money, missingLabel: "Market unknown" })} | MSRP: {formatPriceDisplay(selectedCatalogProduct.msrpPrice || selectedCatalogProduct.msrp, { moneyFormatter: money, missingLabel: "Unknown" })}</span>
          </div>
        </div>
      ) : null}
      {selectedCatalogVariants.length ? (
        <div className="form compact-form-grid">
          <Field label="Version / Finish">
            <select
              value={form.catalogVariantId || ""}
              onChange={(event) => {
                const variant = selectedCatalogVariants.find((candidate) => String(candidate.id) === String(event.target.value));
                setForm("catalogVariantId", event.target.value);
                setForm("finish", variant?.finish || "");
                setForm("printing", variant?.printing || "");
                setForm("language", variant?.language || "English");
              }}
            >
              <option value="">Choose version</option>
              {selectedCatalogVariants.map((variant) => (
                <option key={variant.id || variant.variantName || variant.variant_name} value={variant.id || ""}>
                  {variant.variantName || variant.variant_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select value={form.conditionName || "Near Mint"} onChange={(event) => {
              setForm("conditionName", event.target.value);
              setForm("condition", event.target.value);
            }}>
              {["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"].map((condition) => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
      <Field label="Item Name"><input value={form.name} onChange={(e) => setForm("name", e.target.value)} /></Field>
      <Field label="Product Type"><input value={form.productType} onChange={(e) => setForm("productType", e.target.value)} /></Field>
      <Field label="Pack Count"><input type="number" value={form.packCount} onChange={(e) => setForm("packCount", e.target.value)} /></Field>
      <Field label="Product Photo"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => {
        setForm("itemImage", url);
        setForm("itemImageSource", "user");
        setForm("itemImageStatus", "user");
        setForm("itemImageLastUpdated", new Date().toISOString());
        setForm("itemImageNeedsReview", false);
      }, "item-photos")} /></Field>
      <Field label="Manual Image URL"><input value={form.itemImage || ""} onChange={(e) => {
        setForm("itemImage", e.target.value);
        setForm("itemImageSource", e.target.value ? "manual" : "placeholder");
        setForm("itemImageStatus", e.target.value ? "manual" : "placeholder");
        setForm("itemImageLastUpdated", e.target.value ? new Date().toISOString() : "");
      }} placeholder="Paste image URL" /></Field>
      {form.itemImage && (
        <div className="receipt-preview">
          <p>Product Photo • {getImageSourceLabel(form)}</p>
          <PrivateStorageImage src={form.itemImage} alt="Product" />
          <button type="button" className="secondary-button" onClick={() => {
            setForm("itemImage", "");
            setForm("itemImageSource", "placeholder");
            setForm("itemImageStatus", "placeholder");
            setForm("itemImageNeedsReview", false);
          }}>Remove Image</button>
        </div>
      )}
      </section>
      <section className="forge-form-step forge-quantity-step">
        <div className="forge-step-heading">
          <span>Step 2</span>
          <div>
            <h3>Quantity & Cost</h3>
            <p>Track quantity, cost, source, and purchaser.</p>
          </div>
        </div>
      <PurchaserSelect
        label="Who paid?"
        purchasers={purchasers}
        valueId={currentPurchaserId}
        valueName={form.purchaserName || form.buyer || ""}
        onSelect={selectPurchaser}
        onCreatePurchaser={onCreatePurchaser}
        onManagePurchasers={onManagePurchasers}
      />
      <Field label="Category"><select value={form.category} onChange={(e) => setForm("category", e.target.value)}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Store / Source"><input value={form.store} onChange={(e) => setForm("store", e.target.value)} /></Field>
      <Field label="Barcode / UPC"><input value={form.barcode} onChange={(e) => setForm("barcode", e.target.value)} /></Field>
      <Field label="Quantity Purchased"><input type="number" min="0" value={form.quantity} onChange={(e) => setForm("quantity", e.target.value)} /></Field>
      <Field label="Unit Cost" help={INFO_TOOLTIP_COPY.costBasis}><input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm("unitCost", e.target.value)} /></Field>
      </section>
      <section className="forge-form-step forge-selling-step">
        <div className="forge-step-heading">
          <span>Step 3</span>
          <div>
            <h3>Selling Plan</h3>
            <p>Set a status, planned sale price, and profit expectation.</p>
          </div>
        </div>
      <Field label="Planned Sale Price" help={INFO_TOOLTIP_COPY.plannedSalePrice}><input type="number" step="0.01" value={form.salePrice} onChange={(e) => setForm("salePrice", e.target.value)} /></Field>
      <Field label="Status"><select value={form.status} onChange={(e) => setForm("status", e.target.value)}>{statusOptions.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Listing Platform"><input value={form.listingPlatform} onChange={(e) => setForm("listingPlatform", e.target.value)} placeholder="eBay, Whatnot, Marketplace..." /></Field>
      <Field label="Market Watch Price"><input type="number" step="0.01" value={form.marketPrice} onChange={(e) => setForm("marketPrice", e.target.value)} /></Field>
      <Field label="MSRP Price">
  <input
    type="number"
    step="0.01"
    value={form.msrpPrice}
    onChange={(e) => setForm("msrpPrice", e.target.value)}
  />
</Field>
      <div className="profit-preview">
        <h3>Profit Preview</h3>

        <div className="preview-grid">
          <div>
            <span>Total Paid</span>
            <strong>{money(totalPaid)}</strong>
          </div>

          <div>
            <span>Total MSRP</span>
            <strong>{money(totalMsrp)}</strong>
          </div>

          <div>
            <span>Total Market</span>
            <strong>{money(totalMarket)}</strong>
          </div>

          <div>
            <span>Planned Sale Total</span>
            <strong>{money(totalPlannedSale)}</strong>
          </div>

          <div>
            <span>Market Profit</span>
            <strong>{money(estimatedMarketProfit)}</strong>
          </div>

          <div>
            <span>Planned Profit</span>
            <strong>{money(estimatedPlannedProfit)}</strong>
          </div>

          <div>
            <span>Market ROI</span>
            <strong>{marketRoi.toFixed(1)}%</strong>
          </div>

          <div>
            <span>Planned ROI</span>
            <strong>{plannedRoi.toFixed(1)}%</strong>
          </div>
        </div>
      </div>
      </section>
      <details className="forge-form-step forge-optional-details">
        <summary>Step 4: Optional Details</summary>
      <Field label="Inventory location">
        <select value={form.physicalLocation || ""} onChange={(e) => setForm("physicalLocation", e.target.value)}>
          <option value="">No location assigned</option>
          {FORGE_PHYSICAL_LOCATION_OPTIONS.map((location) => (
            <option key={location} value={location}>{location}</option>
          ))}
        </select>
      </Field>
      {form.physicalLocation === "Other" ? (
        <Field label="Custom physical location notes">
          <input value={form.physicalLocationNotes || ""} onChange={(e) => setForm("physicalLocationNotes", e.target.value)} placeholder="Black tote 2, partner shelf, back office..." />
        </Field>
      ) : null}
      <Field label="Shelf / bin label"><input value={form.storageLocation || ""} onChange={(e) => setForm("storageLocation", e.target.value)} placeholder="Shelf, tote, case, storage bin..." /></Field>
      <Field label="Notes"><input value={form.notes || ""} onChange={(e) => setForm("notes", e.target.value)} /></Field>
      <Field label="Condition"><input value={form.condition || ""} onChange={(e) => setForm("condition", e.target.value)} placeholder="Sealed, damaged box, NM, LP..." /></Field>
      {allowGrading && (isCatalogCardProduct(form) || form.graded || Object.values(gradingDetails(form)).some(Boolean)) ? <GradingFields record={form} onChange={patch => Object.entries(patch).forEach(([key,value]) => setForm(key,value))} /> : null}
      <Field label="Tags"><input value={form.tags || ""} onChange={(e) => setForm("tags", e.target.value)} placeholder="restock, promo, hold, bundle..." /></Field>
      <Field label="Market Watch Product ID"><input value={form.externalProductId} onChange={(e) => setForm("externalProductId", e.target.value)} /></Field>
      <Field label="Market Source URL"><input value={form.tideTradrUrl} onChange={(e) => setForm("tideTradrUrl", e.target.value)} /></Field>
      <Field label="MSRP Reference">
  <input
    type="number"
    step="0.01"
    value={form.msrpPrice}
    onChange={(e) => setForm("msrpPrice", e.target.value)}
  />
</Field>

<Field label="Product Type Detail">
  <input
    value={form.productType}
    onChange={(e) => setForm("productType", e.target.value)}
  />
</Field>

<Field label="Set Code">
  <input
    value={form.setCode}
    onChange={(e) => setForm("setCode", e.target.value)}
  />
</Field>

<Field label="Expansion">
  <input
    value={form.expansion}
    onChange={(e) => setForm("expansion", e.target.value)}
  />
</Field>

<Field label="Product Line">
  <input
    value={form.productLine}
    onChange={(e) => setForm("productLine", e.target.value)}
  />
</Field>

<Field label="Pack Count Detail">
  <input
    type="number"
    value={form.packCount}
    onChange={(e) => setForm("packCount", e.target.value)}
  />
</Field>
      <Field label="Market Price Detail"><input type="number" step="0.01" value={form.marketPrice} onChange={(e) => setForm("marketPrice", e.target.value)} /></Field>
      <Field label="Low Price"><input type="number" step="0.01" value={form.lowPrice} onChange={(e) => setForm("lowPrice", e.target.value)} /></Field>
      <Field label="Mid Price"><input type="number" step="0.01" value={form.midPrice} onChange={(e) => setForm("midPrice", e.target.value)} /></Field>
      <Field label="High Price"><input type="number" step="0.01" value={form.highPrice} onChange={(e) => setForm("highPrice", e.target.value)} /></Field>
      <Field label="Listing URL"><input value={form.listingUrl} onChange={(e) => setForm("listingUrl", e.target.value)} /></Field>
      <Field label="Listed Price"><input type="number" step="0.01" value={form.listedPrice} onChange={(e) => setForm("listedPrice", e.target.value)} /></Field>
      <Field label="Action Notes"><input value={form.actionNotes} onChange={(e) => setForm("actionNotes", e.target.value)} /></Field>
      <Field label="Receipt / Screenshot"><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => setForm("receiptImage", url), "inventory")} /></Field>
      {form.receiptImage && <div className="receipt-preview"><p>Receipt</p><PrivateReceiptImage src={form.receiptImage} alt="Receipt" /></div>}
      </details>
      <div className="forge-form-footer">
        <button type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}

function ListPanel({ title, emptyText, children }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {!hasChildren ? <p>{emptyText}</p> : <div className="inventory-list">{children}</div>}
    </section>
  );
}

function ReportList({ title, data, moneyValues = false }) {
  const entries = Object.entries(data);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {entries.length === 0 ? <p>No data yet.</p> : entries.map(([key, value]) => <p key={key}>{key}: {moneyValues ? money(value) : `${value} units`}</p>)}
    </section>
  );
}

function ActionReport({ title, items, button, action, secondaryButton = "", secondaryAction = null }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {items.length === 0 ? <p>No items.</p> : (
        <div className="inventory-list compact-inventory-list">
          {items.map((item) => (
            <div className="inventory-card compact-card" key={item.id}>
              <div className="compact-card-header">
                <div>
                  <h3>{item.name}</h3>
                  <p className="compact-subtitle">Qty {item.quantity} • {item.category}</p>
                </div>
                <span className={statusClass(item.status)}>{item.status || "In Stock"}</span>
              </div>
              <div className="compact-metrics">
                <div><span>Cost</span><strong>{money(item.unitCost)}</strong></div>
                <div><span>Market Watch</span><strong>{money(item.marketPrice)}</strong></div>
                <div><span>Planned Sale</span><strong>{money(item.salePrice || item.plannedSalePrice || 0)}</strong></div>
                <div><span>Profit</span><strong>{money(item.quantity * item.marketPrice - item.quantity * item.unitCost)}</strong></div>
              </div>
              <div className="drawer-inline-actions">
                <button className="edit-button" onClick={() => action(item)}>{button}</button>
                {secondaryAction ? <button type="button" className="secondary-button" onClick={() => secondaryAction(item)}>{secondaryButton || "Quick Update"}</button> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export { MarketPriceHistoryPanel, PremiumCardImage, MasterVariantRail, MasterCardFamilyNote, InfoTooltip, Field, PurchaserSelect, DetailItem, CollectorShowcaseCard, CollectorFlipDetailCard, RouteChunkFallback, LazyToolBoundary, InventoryBreakdownPanel, PriceReviewPanel, ForgeItemDetail, VaultSetCardRow, VaultGroupedCardDetail, VaultItemDetail, VaultItemDetailContent, CompactInventoryCard, VaultEditForm, InventoryForm, ListPanel, ReportList, ActionReport };
