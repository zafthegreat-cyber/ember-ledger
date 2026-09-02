import { useEffect, useRef, useState } from "react";
import {
  ConfidenceIndicator,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  PrimaryButton,
  QuietButton,
  RecordCard,
  SecondaryButton,
  SectionHeader,
  SourceBadge,
  StatusBadge,
  Toast,
} from "../../components/operations/OperationsUI.jsx";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import { PURCHASE_EVENT_TYPES, RECEIVING_DISCREPANCIES } from "./constants.js";
import { INVENTORY_CREATION_PRODUCT_CLASSIFICATIONS } from "./inventoryCreation/constants.js";
import {
  deriveEffectiveInventoryAdjustmentIds,
  isPhysicalInventoryReturnAdjustment,
} from "./inventoryCreation/contracts.js";
import {
  INVENTORY_CORRECTION_CATEGORIES,
  INVENTORY_QUANTITY_CORRECTION_REASONS,
} from "./inventoryCorrection/constants.js";
import { INVENTORY_RECONCILIATION_CATEGORIES } from "./inventoryReconciliation/constants.js";
import { createPurchaseReceivingService } from "./service.js";
import "./purchase-receiving.css";

const SECTIONS = Object.freeze([
  { key: "drafts", label: "Drafts" },
  { key: "purchases", label: "Purchases" },
  { key: "receiving", label: "Receiving" },
  { key: "corrections", label: "Corrections & Returns" },
]);

const CORRECTION_CATEGORY_OPTIONS = Object.freeze([
  INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION,
  INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING,
  INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION,
  INVENTORY_CORRECTION_CATEGORIES.WRONG_ITEM_RESOLUTION,
  INVENTORY_CORRECTION_CATEGORIES.SUBSTITUTION_RESOLUTION,
  INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER,
  INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN,
  INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION,
  INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION,
  INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION,
]);

const EMPTY_SNAPSHOT = Object.freeze({
  purchaseDrafts: Object.freeze([]),
  purchases: Object.freeze([]),
  purchaseEvents: Object.freeze([]),
  receivingEvents: Object.freeze([]),
  activity: Object.freeze([]),
});

const DISCREPANCY_OPTIONS = Object.freeze(Object.values(RECEIVING_DISCREPANCIES));

function words(value = "") {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function dateLabel(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function moneyLabel(value, fallbackCurrency = "USD") {
  if (!value || !Number.isSafeInteger(value.minorUnits)) return "Not recorded";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: value.currency || fallbackCurrency,
    }).format(value.minorUnits / 100);
  } catch {
    return `${value.minorUnits} ${value.currency || fallbackCurrency} minor units`;
  }
}

function signedMoneyLabel(minorUnits, currency = "USD") {
  if (!Number.isSafeInteger(minorUnits)) return "Not available";
  if (minorUnits === 0) return moneyLabel({ minorUnits: 0, currency });
  const sign = minorUnits > 0 ? "+" : "−";
  return `${sign}${moneyLabel({ minorUnits: Math.abs(minorUnits), currency })}`;
}

function recordMoney(record, field) {
  return record?.[field]
    || record?.money?.[field]
    || record?.moneySummary?.[field]
    || (field === "total" ? record?.grandTotal || record?.money?.grandTotal || record?.moneySummary?.grandTotal : null);
}

function recordVersion(record) {
  return record?.recordVersion ?? record?.version ?? 1;
}

function retailerLabel(record) {
  return record?.retailerLabel || record?.vendorName || record?.vendorLabel || record?.retailerId || record?.vendorId || "Retailer not recorded";
}

function orderLabel(record) {
  return record?.externalOrderId || record?.externalReferenceId || "No external order reference";
}

function statusTone(status) {
  if (/FULLY|CONFIRMED|READY/.test(status || "")) return "success";
  if (/REJECTED|CANCELLED|DAMAGED|MISSING|WRONG/.test(status || "")) return "danger";
  if (/NEEDS|PARTIALLY|AMBIGUOUS|UNRESOLVED/.test(status || "")) return "warning";
  return "neutral";
}

function receivedQuantityForLine(events, lineItemId) {
  return (events || []).flatMap((event) => event.entries || event.lineReceipts || []).filter((entry) => entry.lineItemId === lineItemId).reduce((sum, entry) => sum + (Number.isSafeInteger(entry.quantityReceived) ? entry.quantityReceived : 0), 0);
}

function lineRemaining(line, events = []) {
  const ordered = Number.isSafeInteger(line?.quantityOrdered) ? line.quantityOrdered : 0;
  const cancelled = Number.isSafeInteger(line?.cancellationQuantity) ? line.cancellationQuantity : 0;
  const eventReceived = receivedQuantityForLine(events, lineId(line));
  if (!events.length && Number.isSafeInteger(line?.remainingQuantity)) return Math.max(0, line.remainingQuantity);
  const received = eventReceived || (Number.isSafeInteger(line?.receivedQuantity) ? line.receivedQuantity : 0);
  return Math.max(0, ordered - cancelled - received);
}

function lineId(line, index = 0) {
  return line?.lineItemId || line?.id || `line-${index}`;
}

function Facts({ rows }) {
  return (
    <dl className="purchase-receiving-facts">
      {rows.filter((row) => row.value !== undefined && row.value !== null && row.value !== "").map((row) => (
        <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
      ))}
    </dl>
  );
}

function LineItems({ items = [], receiving = false, events = [] }) {
  return (
    <div className="purchase-receiving-lines" aria-label="Purchase line items">
      {items.map((line, index) => (
        <div className="purchase-receiving-line" key={lineId(line, index)}>
          <div><strong>{line.title || "Unresolved product"}</strong><small>{line.sku || line.upc || line.gtin || line.tcin || line.retailerItemId || "No product identifier"}</small></div>
          <span>{receiving ? `${lineRemaining(line, events)} remaining` : `Qty ${line.quantityOrdered ?? "—"}`}</span>
          <span>{moneyLabel(line.unitPrice || line.unitPriceMoney, line.currency)}</span>
          <StatusBadge tone={statusTone(line.productMatchStatus || line.productMatch?.status)}>{words(line.productMatchStatus || line.productMatch?.status || "UNRESOLVED")}</StatusBadge>
        </div>
      ))}
    </div>
  );
}

function DraftCard({ draft, busy, onCorrect, onReject, onConfirm }) {
  const draftStatus = draft.status || draft.reviewState || "DRAFT";
  const canConfirm = !["CONFIRMED", "REJECTED", "CANCELLED"].includes(draftStatus);
  return (
    <RecordCard className="purchase-receiving-card" data-record-kind="purchase-draft">
      <div className="purchase-receiving-card__heading">
        <div><SourceBadge>{words(draft.sourceType || "MANUAL")}</SourceBadge><h3>{retailerLabel(draft)}</h3><p>{orderLabel(draft)}</p></div>
        <StatusBadge tone={statusTone(draftStatus)}>{words(draftStatus)}</StatusBadge>
      </div>
      <Facts rows={[
        { label: "Order date", value: dateLabel(draft.orderedAt || draft.orderDate || draft.purchasedAt || draft.purchaseDate) },
        { label: "Total", value: moneyLabel(recordMoney(draft, "total"), draft.currency) },
        { label: "Fulfillment", value: words(draft.fulfillmentType || "UNKNOWN") },
        { label: "Warnings", value: (draft.warnings || []).length },
      ]} />
      <LineItems items={draft.lineItems || []} />
      <div className="purchase-receiving-meta"><ConfidenceIndicator value={draft.confidence || "INSUFFICIENT"} /><span>Purchase Draft != Purchase</span></div>
      <div className="purchase-receiving-actions">
        <SecondaryButton onClick={() => onCorrect(draft)} disabled={busy || !canConfirm}>Correct</SecondaryButton>
        <QuietButton onClick={() => onReject(draft)} disabled={busy || !canConfirm}>Reject</QuietButton>
        <PrimaryButton onClick={() => onConfirm(draft)} disabled={busy || !canConfirm}>Confirm Purchase</PrimaryButton>
      </div>
    </RecordCard>
  );
}

function PurchaseCard({ purchase, events = [], busy, onReceive, onPreview }) {
  const purchaseEvents = events.filter((event) => event.purchaseId === purchase.id);
  const receivingStatus = purchase.receivingStatus || purchase.status || "NOT_RECEIVED";
  return (
    <RecordCard className="purchase-receiving-card" data-record-kind="purchase">
      <div className="purchase-receiving-card__heading">
        <div><SourceBadge>Owner-confirmed Purchase</SourceBadge><h3>{retailerLabel(purchase)}</h3><p>{orderLabel(purchase)}</p></div>
        <StatusBadge tone={statusTone(receivingStatus)}>{words(receivingStatus)}</StatusBadge>
      </div>
      <Facts rows={[
        { label: "Purchase date", value: dateLabel(purchase.purchasedAt || purchase.purchaseDate || purchase.orderedAt || purchase.orderDate) },
        { label: "Total", value: moneyLabel(recordMoney(purchase, "total"), purchase.currency) },
        { label: "Line items", value: (purchase.lineItems || []).length },
        { label: "Receiving events", value: purchaseEvents.length },
      ]} />
      <LineItems items={purchase.lineItems || []} receiving events={purchaseEvents} />
      <div className="purchase-receiving-actions">
        <PrimaryButton onClick={() => onReceive(purchase)} disabled={busy || receivingStatus === "FULLY_RECEIVED"}>Receive Items</PrimaryButton>
        <SecondaryButton onClick={() => onPreview(purchase)} disabled={busy}>Preview Inventory Handoff</SecondaryButton>
      </div>
    </RecordCard>
  );
}

function InventoryHandoff({ preview, purchase, candidates = [], reviews = {}, busy, onReview, onConfirm, onClose }) {
  if (!preview || !purchase) return null;
  const rows = preview.rows || preview.items || preview.lineItems || preview.inventoryItems || [];
  return (
    <section className="purchase-receiving-handoff" aria-labelledby="inventory-handoff-title" data-inventory-writer="owner-confirmed-only">
      <SectionHeader
        eyebrow="Preview only"
        title="Inventory Handoff Preview"
        description="The handoff remains a preview. A separate candidate must pass review before explicit Inventory creation."
        actions={<QuietButton onClick={onClose}>Close Preview</QuietButton>}
      />
      {rows.length ? <div className="purchase-receiving-grid">{rows.map((row, index) => <RecordCard key={row.id || row.lineItemId || index}><h3>{row.title || row.productTitle || "Unresolved product"}</h3><Facts rows={[{ label: "Quantity", value: row.quantity ?? row.quantityReceived }, { label: "Allocated cost", value: moneyLabel(row.allocatedAcquisitionCost || row.allocatedCost || row.acquisitionCost, purchase.currency) }, { label: "Condition", value: words(row.condition || "UNKNOWN") }, { label: "Product match", value: words(row.productMatchStatus || row.productMatch?.status || row.matchStatus || "UNRESOLVED") }]} /></RecordCard>)}</div> : <EmptyState title="Nothing is ready for inventory">Only owner-confirmed receiving can appear in this preview. No inventory record was created.</EmptyState>}
      {(preview.warnings || []).length ? <ul className="purchase-receiving-warnings">{preview.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{typeof warning === "string" ? words(warning) : warning.message || "Review required"}</li>)}</ul> : null}
      <SectionHeader eyebrow="Owner confirmation" title="Inventory Creation Candidates" description="Quantity and cost are re-derived from the confirmed Purchase and physical Receiving records when you confirm." />
      {candidates.length ? <div className="purchase-receiving-grid">{candidates.map((candidate) => {
        const review = reviews[candidate.candidateId] || {};
        return <RecordCard className="inventory-creation-candidate" key={candidate.candidateId} data-candidate-state={candidate.alreadyConfirmed ? "confirmed" : candidate.eligible ? "eligible" : "blocked"}>
          <div className="purchase-receiving-card__heading"><div><SourceBadge>Receiving evidence</SourceBadge><h3>{candidate.productTitle || candidate.productReference || "Unresolved product"}</h3><p>{candidate.receivingEventReferences.join(" · ")}</p></div><StatusBadge tone={candidate.alreadyConfirmed || candidate.eligible ? "success" : "warning"}>{candidate.alreadyConfirmed ? "Inventory created" : candidate.eligible ? "Ready for review" : "Review required"}</StatusBadge></div>
          <Facts rows={[{ label: "Quantity", value: candidate.quantityEligible }, { label: "Allocated cost", value: moneyLabel(candidate.totalAcquisitionCost, candidate.currency) }, { label: "Unit costs", value: candidate.unitAcquisitionCostsMinorUnits.map((value) => moneyLabel({ minorUnits: value, currency: candidate.currency })).join(" · ") }, { label: "Product match", value: words(candidate.productMatchState) }, { label: "Classification", value: candidate.productClassification || "Review required" }, { label: "Existing product lots", value: candidate.existingInventoryReferences.length }, { label: "Condition", value: words(candidate.condition) }]} />
          {!candidate.alreadyConfirmed ? <div className="inventory-creation-review" aria-label={`Review ${candidate.productTitle || "Inventory candidate"}`}>
            <label><span>Product classification</span><select value={review.productClassification || candidate.productClassification || ""} onChange={(event) => onReview(candidate, { productClassification: event.target.value || null })}><option value="">Choose classification</option>{Object.values(INVENTORY_CREATION_PRODUCT_CLASSIFICATIONS).map((classification) => <option key={classification} value={classification}>{classification}{["Raw card", "Graded card"].includes(classification) ? " (future condition workflow)" : ""}</option>)}</select></label>
            <label><span>Condition</span><select value={review.condition || candidate.condition} onChange={(event) => onReview(candidate, { condition: event.target.value })}><option value="NEW">New</option><option value="SEALED">Sealed</option><option value="OPEN_BOX">Open box</option><option value="DAMAGED">Damaged</option><option value="USED">Used</option><option value="UNKNOWN">Unknown</option></select></label>
            <label><span>Disposition</span><select value={review.disposition || candidate.disposition} onChange={(event) => onReview(candidate, { disposition: event.target.value })}><option value="ADD_TO_INVENTORY">Add to inventory</option><option value="ADD_AS_DAMAGED">Add as damaged</option><option value="HOLD_FOR_RETURN">Hold for return</option><option value="HOLD_FOR_CLAIM">Hold for claim</option><option value="EXCLUDE">Exclude</option></select></label>
            <label className="purchase-receiving-form__wide"><span>Resolved product reference</span><input value={review.productReference ?? candidate.productReference ?? ""} onChange={(event) => onReview(candidate, { productReference: event.target.value, resolutionReason: "Owner reviewed the actual received product." })} maxLength={500} /></label>
          </div> : null}
          {candidate.blockers.length ? <ul className="purchase-receiving-warnings">{candidate.blockers.map((blocker) => <li key={blocker}>{words(blocker)}</li>)}</ul> : null}
          {candidate.warnings.length ? <ul className="purchase-receiving-warnings">{candidate.warnings.map((warning) => <li key={warning}>{words(warning)}</li>)}</ul> : null}
          {!candidate.alreadyConfirmed ? <PrimaryButton onClick={() => onConfirm(candidate)} disabled={busy || !candidate.eligible}>Confirm Inventory Creation</PrimaryButton> : null}
        </RecordCard>;
      })}</div> : <EmptyState title="No Inventory Creation Candidates">Only positive, owner-confirmed Receiving quantities produce an ephemeral candidate.</EmptyState>}
      <p className="purchase-receiving-invariant">Receiving != Inventory · Inventory Handoff Preview != Inventory · Inventory Creation Candidate != Inventory</p>
    </section>
  );
}

function ReceivingDialog({ purchase, receivingEvents = [], form, onChange, onClose, onSubmit, busy }) {
  if (!purchase) return null;
  const purchaseEvents = receivingEvents.filter((event) => event.purchaseId === purchase.id);
  return (
    <Dialog
      open
      title="Record Receiving"
      description="Confirm only items physically received. Delivery evidence alone does not prove receipt."
      onClose={onClose}
      actions={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={onSubmit} disabled={busy}>Record Receiving</PrimaryButton></>}
    >
      <div className="purchase-receiving-form">
        <label><span>Receiving location</span><input value={form.locationReference || ""} onChange={(event) => onChange({ ...form, locationReference: event.target.value })} maxLength={256} /></label>
        {(purchase.lineItems || []).map((line) => {
          const id = lineId(line);
          const current = form.lines?.[id] || {};
          const updateLine = (patch) => onChange({ ...form, lines: { ...form.lines, [id]: { ...current, ...patch } } });
          return <fieldset key={id} className="purchase-receiving-line-form"><legend>{line.title || "Purchase line"}</legend><small>{lineRemaining(line, purchaseEvents)} remaining</small><label><span>Quantity received</span><input type="number" inputMode="numeric" min="0" max={lineRemaining(line, purchaseEvents)} step="1" value={current.quantityReceived ?? 0} onChange={(event) => updateLine({ quantityReceived: event.target.value })} /></label><label><span>Condition</span><select value={current.condition || "NEW"} onChange={(event) => updateLine({ condition: event.target.value })}><option value="NEW">New</option><option value="OPEN_BOX">Open box</option><option value="DAMAGED">Damaged</option><option value="UNKNOWN">Unknown</option></select></label><label><span>Discrepancy</span><select value={current.discrepancy || "NONE"} onChange={(event) => updateLine({ discrepancy: event.target.value })}>{DISCREPANCY_OPTIONS.map((value) => <option key={value} value={value}>{words(value)}</option>)}</select></label><label className="purchase-receiving-form__wide"><span>Notes</span><textarea value={current.notes || ""} onChange={(event) => updateLine({ notes: event.target.value })} maxLength={1000} /></label></fieldset>;
        })}
      </div>
    </Dialog>
  );
}

function InventoryCorrectionCard({ item, adjustments = [], reconciliationEvents = [], effectiveAdjustmentIds = new Set(), replacementReceivedSourceIds = new Set(), busy, onReview, onReplacement, onReconcile }) {
  const itemAdjustments = adjustments.filter((entry) => entry.inventoryItemId === item.id);
  const itemReconciliations = reconciliationEvents.filter((entry) => entry.inventoryItemId === item.id);
  const replacementEligible = itemAdjustments.find((entry) => isPhysicalInventoryReturnAdjustment(entry)
    && effectiveAdjustmentIds.has(entry.id)
    && !replacementReceivedSourceIds.has(entry.id));
  return (
    <RecordCard className="inventory-correction-card" data-record-kind="inventory-correction-source">
      <div className="purchase-receiving-card__heading">
        <div><SourceBadge>Canonical local Inventory</SourceBadge><h3>{item.productTitle || item.name || item.productReference}</h3><p>{item.inventoryLotId}</p></div>
        <StatusBadge tone={item.quantity > 0 ? "success" : "neutral"}>{words(item.inventoryDispositionState || item.status)}</StatusBadge>
      </div>
      <Facts rows={[
        { label: "Current quantity", value: item.quantity },
        { label: "Condition", value: words(item.condition) },
        { label: "Exact acquisition cost", value: moneyLabel({ minorUnits: item.acquisitionCostMinorUnits, currency: item.currency }) },
        { label: "Append-only events", value: itemAdjustments.length },
        { label: "Historical reconciliations", value: itemReconciliations.length },
      ]} />
      <p className="purchase-receiving-invariant">Inventory Correction Candidate != Inventory Mutation</p>
      <div className="purchase-receiving-actions">
        <PrimaryButton onClick={() => onReview(item, itemAdjustments)} disabled={busy}>Review Correction or Return</PrimaryButton>
        {itemReconciliations.length ? <SecondaryButton onClick={() => onReconcile(item, itemReconciliations)} disabled={busy}>Review Reconciliation Reversal</SecondaryButton> : null}
        {replacementEligible ? <SecondaryButton onClick={() => onReplacement(item, replacementEligible)} disabled={busy}>Record Replacement Receiving</SecondaryButton> : null}
      </div>
    </RecordCard>
  );
}

function ReplacementReceivingDialog({ source, form, busy, onChange, onClose, onConfirm }) {
  if (!source) return null;
  const { item, adjustment } = source;
  return <Dialog
    open
    title="Record Replacement Receiving"
    description="Link a physically received replacement to the exact owner-confirmed return. This records new Receiving evidence; Inventory still requires a separate creation confirmation."
    onClose={busy ? undefined : onClose}
    actions={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton><PrimaryButton onClick={onConfirm} disabled={busy || !String(form.replacementReference || "").trim()}>Record Replacement Receiving</PrimaryButton></>}
  >
    <div className="purchase-receiving-form" data-replacement-boundary="return-then-receiving-then-inventory">
      <Facts rows={[
        { label: "Purchase", value: item.purchaseId },
        { label: "Purchase line", value: item.purchaseLineItemId },
        { label: "Returned quantity", value: adjustment.quantity },
        { label: "Exact returned cost", value: moneyLabel({ minorUnits: adjustment.totalCostMinorUnits, currency: adjustment.currency }) },
      ]} />
      <label><span>Replacement reference</span><input value={form.replacementReference || ""} onChange={(event) => onChange({ ...form, replacementReference: event.target.value })} maxLength={500} /></label>
      <label><span>Condition physically received</span><select value={form.condition || item.condition || "UNKNOWN"} onChange={(event) => onChange({ ...form, condition: event.target.value })}><option value="NEW">New</option><option value="SEALED">Sealed</option><option value="OPEN_BOX">Open box</option><option value="DAMAGED">Damaged</option><option value="USED">Used</option><option value="UNKNOWN">Unknown</option></select></label>
      <p className="purchase-receiving-form__wide purchase-receiving-invariant">Replacement Receiving != Inventory · the original acquisition and return remain append-only.</p>
    </div>
  </Dialog>;
}

function CorrectionState({ title, state }) {
  if (!state) return null;
  return <div className="inventory-correction-state"><strong>{title}</strong><Facts rows={[
    { label: "Product", value: state.productTitle || state.productReference },
    { label: "Condition", value: words(state.condition) },
    { label: "Disposition", value: words(state.inventoryDispositionState) },
    { label: "Quantity", value: state.quantity },
    { label: "Exact cost", value: moneyLabel({ minorUnits: state.acquisitionCostMinorUnits, currency: state.currency }) },
  ]} /></div>;
}

function correctionNeedsHistoricalReconciliation(candidate) {
  const returnAfterSale = Number(candidate?.soldQuantity || 0) > 0 && [
    INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER,
    INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN,
  ].includes(candidate?.category);
  return returnAfterSale || (candidate?.blockers || []).some((blocker) => /COGS|SALE|TRANSFER|RECONCILIATION/.test(String(blocker || "")));
}

function reconciliationConfirmLabel(candidate) {
  const category = String(candidate?.category || "");
  if (/TRANSFER/.test(category)) return "Confirm Transfer Reconciliation";
  if (/COGS|SALE_COST|ACCOUNTING/.test(category)) return "Confirm COGS Adjustment";
  if (/PRIOR_CORRECTION_REVERSAL/.test(category)) return "Confirm Reconciliation Reversal";
  return "Confirm Reconciliation";
}

function HistoricalReconciliationPreview({ candidate, busy, onConfirm }) {
  if (!candidate) return null;
  const currency = candidate.current?.currency || candidate.proposed?.currency || "USD";
  const sales = candidate.affectedSales || [];
  const transfers = candidate.affectedTransfers || [];
  const transferBlocked = (candidate.blockers || []).some((entry) => /TRANSFER/.test(String(entry || "")));
  return (
    <section className="inventory-reconciliation-preview" aria-labelledby="inventory-reconciliation-title" aria-busy={busy ? "true" : "false"} data-reconciliation-status={candidate.status || (candidate.eligible ? "READY_TO_CONFIRM" : "NEEDS_REVIEW")}>
      <div className="inventory-reconciliation-heading">
        <div><SourceBadge>Append-only historical review</SourceBadge><h3 id="inventory-reconciliation-title">Historical Reconciliation</h3><p>Original completed records remain unchanged. Confirming appends a reviewed reconciliation and updates only current projections.</p></div>
        <StatusBadge tone={candidate.eligible ? "success" : "warning"}>{words(candidate.status || (candidate.eligible ? "READY_TO_CONFIRM" : "NEEDS_REVIEW"))}</StatusBadge>
      </div>
      <div className="inventory-reconciliation-state-flow">
        <CorrectionState title="Original Historical State" state={candidate.current} />
        <span aria-hidden="true">→</span>
        <CorrectionState title="Proposed Correction" state={candidate.proposed} />
      </div>
      <div className="inventory-reconciliation-effects" aria-label="Accounting and inventory consequences">
        <strong>Accounting & Inventory Consequences</strong>
        <Facts rows={[
          { label: "Realized COGS adjustment", value: signedMoneyLabel(candidate.saleCogsEffectMinorUnits, currency) },
          { label: "Remaining Inventory cost", value: signedMoneyLabel(candidate.remainingInventoryCostEffectMinorUnits, currency) },
          { label: "Total acquisition change", value: signedMoneyLabel(candidate.costEffectMinorUnits, currency) },
          { label: "Quantity effect", value: candidate.quantityEffect ?? 0 },
        ]} />
        <p>Historical Sale, Transfer, Purchase, Receiving, creation, and prior correction records remain append-only.</p>
      </div>
      <div className="inventory-reconciliation-records" aria-label="Affected historical records">
        <strong>Affected Records</strong>
        {sales.length ? <div className="inventory-reconciliation-record-list">{sales.map((sale, index) => (
          <article key={sale.saleId || index} className="inventory-reconciliation-record">
            <div><span>Sale {sale.allocationSequence || index + 1}</span><small>{sale.saleId || "Stable sale reference"}</small></div>
            <Facts rows={[
              { label: "Quantity", value: sale.quantity },
              { label: "Original COGS", value: moneyLabel({ minorUnits: sale.originalCogsMinorUnits, currency }) },
              { label: "Currently effective COGS", value: moneyLabel({ minorUnits: sale.priorEffectiveCogsMinorUnits, currency }) },
              { label: "Corrected COGS", value: moneyLabel({ minorUnits: sale.correctedCogsMinorUnits, currency }) },
              { label: "Adjustment", value: signedMoneyLabel(sale.cogsDeltaMinorUnits, currency) },
              { label: "Original product", value: sale.originalProductReference },
              { label: "Corrected relationship", value: sale.correctedProductReference },
            ]} />
          </article>
        ))}</div> : <p>No completed Sale requires an accounting adjustment.</p>}
        {transfers.length ? <div className="inventory-reconciliation-record-list">{transfers.map((transfer, index) => <article key={transfer.transferId || index} className="inventory-reconciliation-record"><strong>Transfer {index + 1}</strong><small>{transfer.transferId || "Stable transfer reference"}</small></article>)}</div> : null}
        {transferBlocked ? <p className="inventory-reconciliation-blocked" role="status">Transfer reconciliation needs review because canonical managed Transfer authority is not available. No Transfer or Inventory history can be changed from this preview.</p> : null}
      </div>
      {candidate.blockers?.length ? <ul className="purchase-receiving-warnings" data-reconciliation-blocked="true">{candidate.blockers.map((entry) => <li key={entry}>{words(entry)}</li>)}</ul> : null}
      {candidate.warnings?.length ? <ul className="purchase-receiving-warnings">{candidate.warnings.map((entry) => <li key={entry}>{words(entry)}</li>)}</ul> : null}
      <p className="purchase-receiving-invariant">Inventory Reconciliation Candidate != Historical Mutation</p>
      <div className="purchase-receiving-actions">
        <PrimaryButton onClick={onConfirm} disabled={busy || !candidate.eligible}>{busy ? "Confirming Reconciliation…" : reconciliationConfirmLabel(candidate)}</PrimaryButton>
      </div>
    </section>
  );
}

function InventoryCorrectionDialog({ item, form, candidate, reconciliationCandidate, managedInventory, adjustments, reconciliationEvents, busy, onChange, onPreview, onPreviewReconciliation, onConfirm, onConfirmReconciliation, onClose }) {
  if (!item) return null;
  const reconciliationOnly = form.reconciliationOnly === true;
  const category = form.category || INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION;
  const needsCondition = [INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING].includes(category);
  const needsProduct = [INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES.WRONG_ITEM_RESOLUTION, INVENTORY_CORRECTION_CATEGORIES.SUBSTITUTION_RESOLUTION].includes(category);
  const needsQuantity = [INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION].includes(category);
  const needsCost = category === INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION;
  const needsReversal = category === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION;
  const requiresReconciliation = correctionNeedsHistoricalReconciliation(candidate);
  const update = (patch) => onChange({ ...form, ...patch });
  return (
    <Dialog
      open
      title={reconciliationOnly ? "Review Historical Reconciliation Reversal" : "Review Inventory Correction"}
      description={reconciliationOnly ? "Review an append-only reversal of the latest historical reconciliation. The original event remains in history." : "Preview the current state, proposed change, and downstream effect. Nothing changes until explicit owner confirmation succeeds."}
      onClose={busy ? undefined : onClose}
      actions={<><SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>{!reconciliationOnly ? <PrimaryButton onClick={onPreview} disabled={busy}>Review Correction</PrimaryButton> : null}{reconciliationOnly || (candidate && requiresReconciliation) ? <PrimaryButton onClick={onPreviewReconciliation} disabled={busy}>Review Historical Effect</PrimaryButton> : null}{candidate && !requiresReconciliation && !reconciliationOnly ? <PrimaryButton onClick={onConfirm} disabled={busy || !candidate.eligible}>{[INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN].includes(category) ? "Confirm Return" : "Confirm Correction"}</PrimaryButton> : null}</>}
    >
      <div className="purchase-receiving-form inventory-correction-form" data-correction-authority="verified-owner-only" aria-busy={busy ? "true" : "false"}>
        {reconciliationOnly ? <div className="purchase-receiving-form__wide"><Facts rows={[{ label: "Reviewed action", value: "Reverse latest historical reconciliation" }, { label: "History policy", value: "Append-only" }]} /></div> : <label><span>Correction or disposition</span><select value={category} disabled={busy} onChange={(event) => {
          const nextCategory = event.target.value;
          update({
            category: nextCategory,
            targetCondition: nextCategory === INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING ? "DAMAGED" : form.targetCondition,
            targetDisposition: nextCategory === INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING ? "ADD_AS_DAMAGED" : form.targetDisposition,
          });
        }}>{CORRECTION_CATEGORY_OPTIONS.map((value) => <option value={value} key={value}>{words(value)}</option>)}</select></label>}
        {needsCondition ? <><label><span>Reviewed condition</span><select value={form.targetCondition || (category === INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING ? "DAMAGED" : "OPEN_BOX")} disabled={busy} onChange={(event) => update({ targetCondition: event.target.value, targetDisposition: event.target.value === "DAMAGED" ? "ADD_AS_DAMAGED" : "ADD_TO_INVENTORY" })}><option value="NEW">New</option><option value="SEALED">Sealed</option><option value="OPEN_BOX">Open box</option><option value="DAMAGED">Damaged</option><option value="USED">Used</option><option value="UNKNOWN">Unknown</option></select></label><p className="purchase-receiving-form__wide purchase-receiving-invariant">Condition correction applies to this entire current acquisition lot. Sold or transferred units require historical reconciliation.</p></> : null}
        {needsProduct ? <><label className="purchase-receiving-form__wide"><span>Existing product relationship</span><select value={form.targetProductReference || ""} disabled={busy} onChange={(event) => update({ targetProductReference: event.target.value })}><option value="">Choose an existing product</option>{managedInventory.filter((entry) => entry.id !== item.id && entry.productReference !== item.productReference).map((entry) => <option key={entry.id} value={entry.productReference}>{entry.productTitle || entry.name || entry.productReference}</option>)}</select></label><p className="purchase-receiving-form__wide purchase-receiving-invariant">Product correction applies to the current relationship and never creates a product automatically. Historical Sales remain unchanged.</p></> : null}
        {needsQuantity ? <label><span>Quantity physically affected</span><input type="number" inputMode="numeric" min="1" max={item.quantity} step="1" value={form.quantity || ""} disabled={busy} onChange={(event) => update({ quantity: event.target.value })} /></label> : null}
        {category === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION ? <label><span>Quantity reason</span><select value={form.quantityReason || INVENTORY_QUANTITY_CORRECTION_REASONS.COUNT_CORRECTION} disabled={busy} onChange={(event) => update({ quantityReason: event.target.value })}>{Object.values(INVENTORY_QUANTITY_CORRECTION_REASONS).filter((value) => value !== INVENTORY_QUANTITY_CORRECTION_REASONS.FOUND_EXTRA).map((value) => <option value={value} key={value}>{words(value)}</option>)}</select></label> : null}
        {needsCost ? <label><span>Corrected total cost (minor units)</span><input type="number" inputMode="numeric" min="0" step="1" value={form.targetTotalCostMinorUnits ?? ""} disabled={busy} onChange={(event) => update({ targetTotalCostMinorUnits: event.target.value })} /></label> : null}
        {needsReversal && reconciliationOnly ? <label className="purchase-receiving-form__wide"><span>Latest reconciliation to reverse</span><select value={form.reversesReconciliationEventId || ""} disabled={busy} onChange={(event) => update({ reversesReconciliationEventId: event.target.value })}><option value="">Choose an append-only reconciliation</option>{[...reconciliationEvents].sort((a, b) => (b.reconciliationSequence || 0) - (a.reconciliationSequence || 0)).map((entry) => <option value={entry.id} key={entry.id}>{words(entry.category)} · event {entry.reconciliationSequence}</option>)}</select></label> : null}
        {needsReversal && !reconciliationOnly ? <label className="purchase-receiving-form__wide"><span>Latest correction to reverse</span><select value={form.reversesAdjustmentId || ""} disabled={busy} onChange={(event) => update({ reversesAdjustmentId: event.target.value })}><option value="">Choose an append-only event</option>{adjustments.filter((entry) => entry.previousState && entry.resultingState).sort((a, b) => (b.adjustmentSequence || 0) - (a.adjustmentSequence || 0)).map((entry) => <option value={entry.id} key={entry.id}>{words(entry.correctionCategory)} · event {entry.adjustmentSequence}</option>)}</select></label> : null}
        <label className="purchase-receiving-form__wide"><span>Owner reason</span><textarea value={form.reason || ""} disabled={busy} onChange={(event) => update({ reason: event.target.value })} maxLength={1000} /></label>
      </div>
      {candidate ? <div className="inventory-correction-preview" aria-label="Inventory correction impact preview"><CorrectionState title="Current State" state={candidate.current} /><span aria-hidden="true">→</span><CorrectionState title="Proposed Change" state={candidate.proposed} /><div className="inventory-correction-effect"><strong>Downstream Effect</strong><p>{candidate.quantityEffect} quantity · {candidate.costEffectMinorUnits} minor-unit cost effect</p><p>Original Purchase, Receiving, creation, sale, and transfer history remains append-only.</p></div></div> : null}
      {candidate?.blockers?.length ? <ul className="purchase-receiving-warnings" data-correction-blocked="true">{candidate.blockers.map((entry) => <li key={entry}>{words(entry)}</li>)}</ul> : null}
      {candidate?.warnings?.length ? <ul className="purchase-receiving-warnings">{candidate.warnings.map((entry) => <li key={entry}>{words(entry)}</li>)}</ul> : null}
      <HistoricalReconciliationPreview candidate={reconciliationCandidate} busy={busy} onConfirm={onConfirmReconciliation} />
      <p className="purchase-receiving-invariant">Refund != Return · Refund != Inventory Removal · Replacement requires new Receiving and Inventory creation.</p>
    </Dialog>
  );
}

export default function PurchaseReceivingPage({
  session = { status: OWNER_SESSION_STATES.LOADING },
  onSignIn,
  onSignOut,
  onReturnHome,
  onOpenLegacyPurchases,
}) {
  const authorized = session.status === OWNER_SESSION_STATES.AUTHORIZED;
  const authorizedRef = useRef(authorized);
  const actionInFlightRef = useRef(false);
  authorizedRef.current = authorized;
  const [service, setService] = useState(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [section, setSection] = useState("drafts");
  const [dialog, setDialog] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [handoff, setHandoff] = useState(null);
  const [inventoryReviews, setInventoryReviews] = useState({});
  const [message, setMessage] = useState({ text: "", tone: "info" });
  const [busy, setBusy] = useState(false);
  const [managedInventory, setManagedInventory] = useState([]);
  const [inventoryAdjustments, setInventoryAdjustments] = useState([]);
  const [inventoryReconciliationEvents, setInventoryReconciliationEvents] = useState([]);
  const [correctionCandidate, setCorrectionCandidate] = useState(null);
  const [reconciliationCandidate, setReconciliationCandidate] = useState(null);
  const [replacementSource, setReplacementSource] = useState(null);

  useEffect(() => {
    if (!authorized) {
      setService(null);
      setSnapshot(EMPTY_SNAPSHOT);
      setDialog("");
      setSelected(null);
      setForm({});
      setHandoff(null);
      setInventoryReviews({});
      setMessage({ text: "", tone: "info" });
      setBusy(false);
      actionInFlightRef.current = false;
      setManagedInventory([]);
      setInventoryAdjustments([]);
      setInventoryReconciliationEvents([]);
      setCorrectionCandidate(null);
      setReconciliationCandidate(null);
      setReplacementSource(null);
      return;
    }
    try {
      const nextService = createPurchaseReceivingService({ isOwnerAuthorized: () => authorizedRef.current });
      setService(nextService);
      setSnapshot(nextService.snapshot());
      setManagedInventory(nextService.listManagedInventory());
      setInventoryAdjustments(nextService.listInventoryAdjustments());
      setInventoryReconciliationEvents(nextService.listInventoryReconciliationEvents?.() || []);
    } catch (error) {
      setService(null);
      setSnapshot(EMPTY_SNAPSHOT);
      setMessage({ text: error?.message || "Purchase and Receiving records could not be loaded.", tone: "error" });
    }
  }, [authorized]);

  const drafts = snapshot.purchaseDrafts || EMPTY_SNAPSHOT.purchaseDrafts;
  const purchases = snapshot.purchases || EMPTY_SNAPSHOT.purchases;
  const receivingEvents = snapshot.receivingEvents || EMPTY_SNAPSHOT.receivingEvents;
  const receivingPurchases = purchases.filter((purchase) => (purchase.receivingStatus || purchase.status) !== "FULLY_RECEIVED" || purchase.status === "REPLACEMENT_PENDING");
  const replacementEventsById = new Map((snapshot.purchaseEvents || [])
    .filter((entry) => entry.type === PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED && entry.relatedEventId)
    .map((entry) => [entry.id, entry]));
  const replacementEventsBySource = new Map([...replacementEventsById.values()].map((entry) => [entry.relatedEventId, entry]));
  const replacementReceivedSourceIds = new Set((snapshot.receivingEvents || [])
    .map((entry) => replacementEventsById.get(entry.replacementEventId)?.relatedEventId)
    .filter(Boolean));
  const effectiveAdjustmentIds = new Set(deriveEffectiveInventoryAdjustmentIds(inventoryAdjustments));

  async function run(action, successMessage) {
    if (!service || busy || actionInFlightRef.current || !authorizedRef.current) return null;
    actionInFlightRef.current = true;
    setBusy(true);
    try {
      const result = await action();
      if (!authorizedRef.current) {
        setSnapshot(EMPTY_SNAPSHOT);
        return null;
      }
      setSnapshot(result?.snapshot || service.snapshot());
      setManagedInventory(service.listManagedInventory());
      setInventoryAdjustments(service.listInventoryAdjustments());
      setInventoryReconciliationEvents(service.listInventoryReconciliationEvents?.() || []);
      setMessage({ text: successMessage, tone: "success" });
      return result;
    } catch (error) {
      if (authorizedRef.current) setMessage({ text: error?.message || "The owner-reviewed action could not be completed.", tone: "error" });
      return null;
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }

  function openCorrection(draft) {
    setSelected(draft);
    setForm({ retailerLabel: draft.retailerLabel || draft.vendorName || "", externalOrderId: draft.externalOrderId || "", orderedAt: String(draft.orderedAt || draft.purchasedAt || "").slice(0, 10) });
    setDialog("correct");
  }

  function openRejection(draft) {
    setSelected(draft);
    setForm({ reason: "" });
    setDialog("reject");
  }

  function openReceiving(purchase) {
    setSelected(purchase);
    setForm({ idempotencyKey: `owner-receiving:${purchase.id}:${globalThis.crypto?.randomUUID?.() || Date.now()}`, locationReference: "", lines: Object.fromEntries((purchase.lineItems || []).map((line, index) => [lineId(line, index), { quantityReceived: 0, condition: "NEW", discrepancy: "NONE", notes: "" }])) });
    setDialog("receiving");
  }

  async function correctDraft() {
    const patch = Object.fromEntries(Object.entries(form).filter(([field, value]) => value !== "" && String(selected[field] || "").slice(0, field === "orderedAt" ? 10 : undefined) !== String(value)));
    const result = await run(() => service.correctDraft(selected.id, { patch, reason: "Owner correction from Purchase review." }, recordVersion(selected)), "Purchase Draft corrected. Original evidence remains in history.");
    if (result) { setDialog(""); setSelected(null); }
  }

  async function rejectDraft() {
    const result = await run(() => service.rejectDraft(selected.id, form.reason || "Rejected after owner review.", recordVersion(selected)), "Purchase Draft rejected. No Purchase was created.");
    if (result) { setDialog(""); setSelected(null); }
  }

  async function confirmDraft(draft) {
    await run(async () => {
      let current = draft;
      if ((current.status || current.reviewState) !== "READY_TO_CONFIRM" && typeof service.markDraftReady === "function") {
        const ready = await service.markDraftReady(current.id, recordVersion(current));
        current = ready?.draft || current;
      }
      return service.confirmDraft(current.id, { expectedVersion: recordVersion(current) });
    }, "Purchase confirmed once. Receiving and inventory remain separate.");
  }

  async function recordReceiving() {
    const lineReceipts = Object.entries(form.lines || {}).map(([lineItemId, line]) => ({
      lineItemId,
      quantityReceived: Number(line.quantityReceived),
      condition: line.condition,
      quantityAffected: Math.max(Number(line.quantityReceived) || 0, line.discrepancy !== "NONE" ? 1 : 0),
      discrepancy: line.discrepancy,
      note: line.notes,
    })).filter((line) => line.quantityReceived > 0 || line.discrepancy !== "NONE");
    const result = await run(() => service.recordReceivingEvent(selected.id, { idempotencyKey: form.idempotencyKey, locationReference: form.locationReference, entries: lineReceipts }), "Receiving event recorded. Inventory was not created.");
    if (result) {
      const updatedPurchase = result.purchase || selected;
      setInventoryReviews({});
      setHandoff({ purchase: updatedPurchase, preview: service.previewInventoryHandoff(updatedPurchase.id), candidates: service.previewInventoryCreation(updatedPurchase.id) });
      setDialog("");
      setSelected(null);
      setSection("receiving");
    }
  }

  function previewHandoff(purchase) {
    try {
      setInventoryReviews({});
      setHandoff({ purchase, preview: service.previewInventoryHandoff(purchase.id), candidates: service.previewInventoryCreation(purchase.id) });
      setSection("receiving");
    } catch (error) {
      setMessage({ text: error?.message || "Inventory Handoff Preview is unavailable.", tone: "error" });
    }
  }

  function updateInventoryReview(candidate, patch) {
    if (!service || !handoff?.purchase) return;
    const nextReviews = { ...inventoryReviews, [candidate.candidateId]: { ...(inventoryReviews[candidate.candidateId] || {}), ...patch } };
    try {
      const candidates = service.previewInventoryCreation(handoff.purchase.id, nextReviews);
      setInventoryReviews(nextReviews);
      setHandoff({ ...handoff, candidates });
    } catch (error) {
      setMessage({ text: error?.message || "Inventory candidate review could not be applied.", tone: "error" });
    }
  }

  async function confirmInventory(candidate) {
    const result = await run(() => service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion, review: inventoryReviews[candidate.candidateId] || {} }), "Inventory was created once with Purchase and Receiving provenance.");
    if (result && handoff?.purchase) {
      setHandoff({ ...handoff, candidates: service.previewInventoryCreation(handoff.purchase.id, inventoryReviews) });
    }
  }

  function openInventoryCorrection(item, adjustments) {
    setSelected(item);
    setCorrectionCandidate(null);
    setReconciliationCandidate(null);
    setForm({
      category: INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION,
      idempotencyKey: `owner-inventory-correction:${item.id}:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      reason: "",
      targetCondition: item.condition === "DAMAGED" ? "OPEN_BOX" : "DAMAGED",
      targetDisposition: item.condition === "DAMAGED" ? "ADD_TO_INVENTORY" : "ADD_AS_DAMAGED",
      latestAdjustmentId: [...adjustments].sort((a, b) => (b.adjustmentSequence || 0) - (a.adjustmentSequence || 0))[0]?.id || "",
    });
    setDialog("inventory-correction");
  }

  function openInventoryReconciliationReversal(item, events) {
    const latest = [...events].sort((a, b) => (b.reconciliationSequence || 0) - (a.reconciliationSequence || 0))[0];
    setSelected(item);
    setCorrectionCandidate(null);
    setReconciliationCandidate(null);
    setForm({
      category: INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION,
      reconciliationOnly: true,
      idempotencyKey: `owner-inventory-reconciliation-reversal:${item.id}:${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      reversesReconciliationEventId: latest?.id || "",
      reason: "",
    });
    setDialog("inventory-correction");
  }

  function openReplacementReceiving(item, adjustment) {
    const existingEvent = replacementEventsBySource.get(adjustment.id) || null;
    setReplacementSource({ item, adjustment, existingEvent });
    setForm({
      purchaseEventIdempotencyKey: existingEvent?.idempotencyKey || `owner-replacement-note:${adjustment.id}`,
      receivingIdempotencyKey: `owner-replacement-receiving:${adjustment.id}`,
      replacementReference: existingEvent?.replacementReference || "",
      condition: item.condition || "UNKNOWN",
    });
    setDialog("replacement-receiving");
  }

  async function recordReplacementReceiving() {
    if (!replacementSource) return;
    const { item, adjustment } = replacementSource;
    const result = await run(async () => {
      const replacement = await service.recordPurchaseEvent(item.purchaseId, {
        type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
        idempotencyKey: form.purchaseEventIdempotencyKey,
        lineItemId: item.purchaseLineItemId,
        quantity: adjustment.quantity,
        relatedEventId: adjustment.id,
        replacementReference: form.replacementReference,
        summary: "Owner confirmed a replacement relationship for returned Inventory.",
      });
      return service.recordReceivingEvent(item.purchaseId, {
        idempotencyKey: form.receivingIdempotencyKey,
        replacementEventId: replacement.event.id,
        entries: [{
          lineItemId: item.purchaseLineItemId,
          quantityReceived: adjustment.quantity,
          quantityAffected: adjustment.quantity,
          condition: form.condition,
          discrepancy: RECEIVING_DISCREPANCIES.NONE,
          note: "Owner confirmed physical receipt of the replacement.",
        }],
      });
    }, "Replacement Receiving recorded. Inventory still requires explicit creation confirmation.");
    if (result) {
      const purchase = result.purchase;
      setHandoff({ purchase, preview: service.previewInventoryHandoff(purchase.id), candidates: service.previewInventoryCreation(purchase.id) });
      setInventoryReviews({});
      setReplacementSource(null);
      setDialog("");
      setSection("receiving");
    }
  }

  function correctionProposalFromForm() {
    const category = form.category;
    const proposal = {
      category,
      idempotencyKey: form.idempotencyKey,
      reason: form.reason || "Owner reviewed the Inventory correction and its downstream effect.",
    };

    if ([INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES.DAMAGED_AFTER_RECEIVING].includes(category)) {
      proposal.targetCondition = form.targetCondition;
      proposal.targetDisposition = form.targetDisposition;
    }
    if ([INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES.WRONG_ITEM_RESOLUTION, INVENTORY_CORRECTION_CATEGORIES.SUBSTITUTION_RESOLUTION].includes(category)) {
      proposal.targetProductReference = form.targetProductReference;
    }
    if ([INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION].includes(category) && form.quantity !== "" && form.quantity != null) {
      proposal.quantity = Number(form.quantity);
    }
    if (category === INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION) {
      proposal.quantityReason = form.quantityReason || INVENTORY_QUANTITY_CORRECTION_REASONS.COUNT_CORRECTION;
    }
    if (category === INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION && form.targetTotalCostMinorUnits !== "" && form.targetTotalCostMinorUnits != null) {
      proposal.targetTotalCostMinorUnits = Number(form.targetTotalCostMinorUnits);
    }
    if (category === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION) {
      proposal.reversesAdjustmentId = form.reversesAdjustmentId;
    }
    return proposal;
  }

  function reconciliationProposalFromForm(candidate = correctionCandidate) {
    const correctionCategory = form.category;
    const transferBlocked = (candidate?.blockers || []).some((blocker) => /TRANSFER/.test(String(blocker || "")));
    let category = INVENTORY_RECONCILIATION_CATEGORIES.LOT_PROVENANCE_RECONCILIATION;
    if (transferBlocked) {
      category = INVENTORY_RECONCILIATION_CATEGORIES.TRANSFER_PROVENANCE_RECONCILIATION;
    } else if (correctionCategory === INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION) {
      category = INVENTORY_RECONCILIATION_CATEGORIES.COGS_RECONCILIATION;
    } else if ([
      INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION,
      INVENTORY_CORRECTION_CATEGORIES.WRONG_ITEM_RESOLUTION,
      INVENTORY_CORRECTION_CATEGORIES.SUBSTITUTION_RESOLUTION,
    ].includes(correctionCategory)) {
      category = INVENTORY_RECONCILIATION_CATEGORIES.SALE_PRODUCT_RECONCILIATION;
    } else if ([
      INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER,
      INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN,
    ].includes(correctionCategory)) {
      category = INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION;
    } else if (correctionCategory === INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION
      && (form.reversesReconciliationEventId || form.reversesAdjustmentId)) {
      category = INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL;
    }

    const proposal = {
      category,
      idempotencyKey: form.idempotencyKey,
      reason: form.reason || "Owner reviewed the historical reconciliation and its downstream effect.",
    };
    if (category === INVENTORY_RECONCILIATION_CATEGORIES.COGS_RECONCILIATION && form.targetTotalCostMinorUnits !== "" && form.targetTotalCostMinorUnits != null) {
      proposal.targetTotalCostMinorUnits = Number(form.targetTotalCostMinorUnits);
    }
    if (category === INVENTORY_RECONCILIATION_CATEGORIES.SALE_PRODUCT_RECONCILIATION) {
      proposal.targetProductReference = form.targetProductReference;
    }
    if (category === INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION && form.quantity !== "" && form.quantity != null) {
      proposal.quantity = Number(form.quantity);
    } else if (category === INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION && correctionCategory === INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER) {
      proposal.quantity = candidate?.availableQuantity;
    }
    if (category === INVENTORY_RECONCILIATION_CATEGORIES.PRIOR_CORRECTION_REVERSAL) {
      if (form.reversesReconciliationEventId) proposal.reversesReconciliationEventId = form.reversesReconciliationEventId;
      else proposal.reversesAdjustmentId = form.reversesAdjustmentId;
    }
    return proposal;
  }

  function previewInventoryCorrection() {
    try {
      setCorrectionCandidate(service.previewInventoryCorrection(selected.id, correctionProposalFromForm()));
      setReconciliationCandidate(null);
      setMessage({ text: "Correction impact previewed. No Inventory was changed.", tone: "info" });
    } catch (error) {
      setCorrectionCandidate(null);
      setMessage({ text: error?.message || "Inventory correction could not be previewed.", tone: "error" });
    }
  }

  function previewInventoryReconciliation() {
    try {
      const candidate = service.previewInventoryReconciliation(selected.id, reconciliationProposalFromForm());
      setReconciliationCandidate(candidate);
      setMessage({ text: candidate.eligible ? "Historical effect reviewed. No record was changed." : "Historical reconciliation needs review and cannot be confirmed.", tone: candidate.eligible ? "info" : "error" });
    } catch (error) {
      setReconciliationCandidate(null);
      setMessage({ text: error?.message || "Historical reconciliation could not be previewed.", tone: "error" });
    }
  }

  async function confirmInventoryCorrection() {
    if (!correctionCandidate) return;
    const proposal = correctionProposalFromForm();
    const result = await run(() => service.confirmInventoryCorrection(selected.id, correctionCandidate.candidateId, {
      expectedVersion: correctionCandidate.expectedVersion,
      proposal,
    }), "Inventory correction recorded once. Original acquisition history remains append-only.");
    if (result) {
      setDialog("");
      setSelected(null);
      setCorrectionCandidate(null);
      setReconciliationCandidate(null);
      setForm({});
    }
  }

  async function confirmInventoryReconciliation() {
    if (!reconciliationCandidate) return;
    const proposal = reconciliationProposalFromForm();
    const result = await run(() => service.confirmInventoryReconciliation(selected.id, reconciliationCandidate.candidateId, {
      expectedVersion: reconciliationCandidate.expectedVersion,
      proposal,
    }), "Historical reconciliation recorded once. Completed Sale and Transfer history remains unchanged.");
    if (result) {
      setDialog("");
      setSelected(null);
      setCorrectionCandidate(null);
      setReconciliationCandidate(null);
      setForm({});
    }
  }

  if (session.status === OWNER_SESSION_STATES.LOADING) return <main className="purchase-receiving purchase-receiving--denied" data-page="purchase-receiving" data-owner-gate="loading"><LoadingState title="Checking owner access">Verifying the application session before loading Purchase records.</LoadingState></main>;
  if (session.status === OWNER_SESSION_STATES.SIGN_IN_REQUIRED) return <main className="purchase-receiving purchase-receiving--denied" data-page="purchase-receiving" data-owner-gate="sign-in"><ErrorState title="Sign In Required" action={<PrimaryButton onClick={onSignIn}>Sign In</PrimaryButton>}>Sign in with the approved owner account to review Purchases and Receiving.</ErrorState></main>;
  if (session.status === OWNER_SESSION_STATES.OWNER_ACCESS_REQUIRED) return <main className="purchase-receiving purchase-receiving--denied" data-page="purchase-receiving" data-owner-gate="required"><ErrorState title="Owner Access Required" action={<div className="purchase-receiving-actions"><PrimaryButton onClick={onReturnHome}>Return to Business</PrimaryButton><SecondaryButton onClick={onSignOut}>Sign Out</SecondaryButton></div>}>Business workspace access does not grant authority to confirm Purchases. No Purchase records were loaded.</ErrorState></main>;
  if (!authorized) return <main className="purchase-receiving purchase-receiving--denied" data-page="purchase-receiving" data-owner-gate="required"><ErrorState title="Owner access unavailable" action={<PrimaryButton onClick={onReturnHome}>Return to Business</PrimaryButton>}>Owner authorization could not be verified. No Purchase records were loaded.</ErrorState></main>;

  return (
    <main className="purchase-receiving" data-page="purchase-receiving" data-testid="purchase-receiving-page" data-owner-gate="authorized" data-inventory-writer="owner-confirmed-only">
      <PageHeader
        eyebrow="Business · Owner review"
        title="Purchases & Receiving"
        description="Review Purchases, confirm physical Receiving, and explicitly create local Inventory only after every boundary passes."
        actions={onOpenLegacyPurchases ? <QuietButton onClick={onOpenLegacyPurchases}>Legacy Purchase Records</QuietButton> : null}
      />
      <p className="purchase-receiving-boundary">Order Candidate != Purchase · Checkout Evidence != Purchase · Purchase Draft != Purchase · Receiving != Inventory · Inventory Creation Candidate != Inventory</p>
      {message.text ? <Toast tone={message.tone}>{message.text}</Toast> : null}
      <div className="purchase-receiving-metrics" aria-label="Purchase and Receiving summary">
        <MetricCard label="Drafts" value={drafts.length} helper="Non-authoritative review records" />
        <MetricCard label="Purchases" value={purchases.length} helper="Explicitly owner-confirmed" />
        <MetricCard label="Awaiting receipt" value={receivingPurchases.length} helper="Delivery is not receipt" />
        <MetricCard label="Receiving events" value={receivingEvents.length} helper="Append-only confirmations" />
      </div>
      <nav className="purchase-receiving-tabs" aria-label="Purchase workflow sections">
        {SECTIONS.map((item) => <button key={item.key} type="button" data-purchase-section={item.key} className={section === item.key ? "is-active" : ""} aria-current={section === item.key ? "page" : undefined} onClick={() => setSection(item.key)}>{item.label}</button>)}
      </nav>

      {section === "drafts" ? <section aria-label="Purchase Drafts"><SectionHeader title="Purchase Drafts" description="Correct, reject, or explicitly confirm reviewed evidence. Nothing upstream creates a Purchase automatically." />{drafts.length ? <div className="purchase-receiving-grid">{drafts.map((draft) => <DraftCard key={draft.id} draft={draft} busy={busy} onCorrect={openCorrection} onReject={openRejection} onConfirm={confirmDraft} />)}</div> : <EmptyState title="No Purchase Drafts">No synthetic or owner-reviewed draft is waiting. Order Candidates and Checkout Evidence remain separate records.</EmptyState>}</section> : null}

      {section === "purchases" ? <section aria-label="Confirmed Purchases"><SectionHeader title="Confirmed Purchases" description="These records exist only after explicit owner confirmation. Receipt and inventory are separate workflows." />{purchases.length ? <div className="purchase-receiving-grid">{purchases.map((purchase) => <PurchaseCard key={purchase.id} purchase={purchase} events={receivingEvents} busy={busy} onReceive={openReceiving} onPreview={previewHandoff} />)}</div> : <EmptyState title="No confirmed Purchases">Confirm a valid Purchase Draft to create exactly one local Purchase.</EmptyState>}</section> : null}

      {section === "receiving" ? <section aria-label="Receiving"><SectionHeader title="Receiving" description="Record only physical receipt, including partial shipments and discrepancies." />{receivingPurchases.length ? <div className="purchase-receiving-grid">{receivingPurchases.map((purchase) => <PurchaseCard key={purchase.id} purchase={purchase} events={receivingEvents} busy={busy} onReceive={openReceiving} onPreview={previewHandoff} />)}</div> : <EmptyState title="Nothing awaiting receipt">There are no owner-confirmed Purchases waiting for receiving.</EmptyState>}<InventoryHandoff preview={handoff?.preview} purchase={handoff?.purchase} candidates={handoff?.candidates} reviews={inventoryReviews} busy={busy} onReview={updateInventoryReview} onConfirm={confirmInventory} onClose={() => { setHandoff(null); setInventoryReviews({}); }} /></section> : null}

      {section === "corrections" ? <section aria-label="Inventory Corrections and Returns" data-correction-workflow="preview-then-owner-confirm"><SectionHeader title="Inventory Corrections & Returns" description="Review append-only condition, product, quantity, cost, return, and historical reconciliation events after Inventory creation. Refunds alone never remove Inventory." />{managedInventory.length ? <div className="purchase-receiving-grid">{managedInventory.map((item) => <InventoryCorrectionCard key={item.id} item={item} adjustments={inventoryAdjustments} reconciliationEvents={inventoryReconciliationEvents} effectiveAdjustmentIds={effectiveAdjustmentIds} replacementReceivedSourceIds={replacementReceivedSourceIds} busy={busy} onReview={openInventoryCorrection} onReplacement={openReplacementReceiving} onReconcile={openInventoryReconciliationReversal} />)}</div> : <EmptyState title="No owner-confirmed Inventory">Inventory must first pass Purchase, Receiving, candidate review, and explicit creation confirmation.</EmptyState>}<aside className="purchase-receiving-compatibility"><strong>Historical reconciliation boundary</strong><p>Completed Sales and Transfers remain immutable. A reviewed reconciliation may append exact accounting or provenance effects, but it never pretends the original transaction did not happen.</p></aside><aside className="purchase-receiving-compatibility"><strong>Replacement and unexpected-extra boundary</strong><p>Replacement items require a new Receiving event and Inventory creation. Unexpected extras require separate identity and cost review. Neither mutates an existing lot automatically.</p></aside></section> : null}

      <aside className="purchase-receiving-compatibility"><strong>Legacy compatibility</strong><p>Existing Deal Finder records remain compatible. Owner-confirmed Inventory is written only to the established local Business Inventory authority as a separate provenance lot.</p>{onOpenLegacyPurchases ? <QuietButton onClick={onOpenLegacyPurchases}>Open Legacy Purchase Records</QuietButton> : null}</aside>

      <Dialog open={dialog === "correct"} title="Correct Purchase Draft" description="Corrections append provenance; they do not replace source evidence." onClose={() => setDialog("")} actions={<><SecondaryButton onClick={() => setDialog("")}>Cancel</SecondaryButton><PrimaryButton onClick={correctDraft} disabled={busy}>Save Correction</PrimaryButton></>}><div className="purchase-receiving-form"><label><span>Retailer or vendor</span><input value={form.retailerLabel || ""} onChange={(event) => setForm({ ...form, retailerLabel: event.target.value })} maxLength={500} /></label><label><span>External order reference</span><input value={form.externalOrderId || ""} onChange={(event) => setForm({ ...form, externalOrderId: event.target.value })} maxLength={256} /></label><label><span>Order date</span><input type="date" value={form.orderedAt || ""} onChange={(event) => setForm({ ...form, orderedAt: event.target.value })} /></label></div></Dialog>
      <Dialog open={dialog === "reject"} title="Reject Purchase Draft" description="Rejection preserves review history and creates no Purchase." onClose={() => setDialog("")} actions={<><SecondaryButton onClick={() => setDialog("")}>Cancel</SecondaryButton><PrimaryButton onClick={rejectDraft} disabled={busy}>Reject Draft</PrimaryButton></>}><div className="purchase-receiving-form"><label className="purchase-receiving-form__wide"><span>Reason</span><textarea value={form.reason || ""} onChange={(event) => setForm({ reason: event.target.value })} maxLength={1000} /></label></div></Dialog>
      <ReceivingDialog purchase={dialog === "receiving" ? selected : null} receivingEvents={receivingEvents} form={form} onChange={setForm} onClose={() => setDialog("")} onSubmit={recordReceiving} busy={busy} />
      <InventoryCorrectionDialog item={dialog === "inventory-correction" ? selected : null} form={form} candidate={correctionCandidate} reconciliationCandidate={reconciliationCandidate} managedInventory={managedInventory} adjustments={inventoryAdjustments.filter((entry) => entry.inventoryItemId === selected?.id)} reconciliationEvents={inventoryReconciliationEvents.filter((entry) => entry.inventoryItemId === selected?.id)} busy={busy} onChange={(next) => { setForm(next); setCorrectionCandidate(null); setReconciliationCandidate(null); }} onPreview={previewInventoryCorrection} onPreviewReconciliation={previewInventoryReconciliation} onConfirm={confirmInventoryCorrection} onConfirmReconciliation={confirmInventoryReconciliation} onClose={() => { if (!busy) { setDialog(""); setSelected(null); setCorrectionCandidate(null); setReconciliationCandidate(null); setForm({}); } }} />
      <ReplacementReceivingDialog source={dialog === "replacement-receiving" ? replacementSource : null} form={form} busy={busy} onChange={setForm} onConfirm={recordReplacementReceiving} onClose={() => { if (!busy) { setDialog(""); setReplacementSource(null); setForm({}); } }} />
    </main>
  );
}
