import { useMemo, useRef, useState } from "react";
import { SALE_STATUSES } from "../../constants.js";
import { calculateSaleResults } from "../../calculations.js";
import { validateSaleQuantity } from "../../inventory.js";
import { suggestedInventorySaleCogsMajorUnits, suggestedInventorySaleCogsMinorUnits } from "../../exactInventoryCost.js";
import { formatCurrency, formatPercent, getSaleReportingProjection } from "../../selectors.js";
import { EmptyState, FormActions, MoneyInput, NumberInput, RecordActions, SectionHeading, SelectInput, StatusPill, TextArea, TextInput } from "../../components/Fields.jsx";

function blankSale() {
  return {
    inventoryItemId: "",
    lotId: "",
    quantitySold: 1,
    salesChannel: "",
    saleDate: new Date().toISOString().slice(0, 10),
    grossSalePrice: "",
    discounts: "",
    sellingFees: "",
    paymentFees: "",
    shippingChargedToBuyer: "",
    actualOutboundShipping: "",
    packaging: "",
    refunds: "",
    otherCosts: "",
    allocatedCostOfGoodsSold: "",
    status: "Completed",
    notes: "",
  };
}

export default function SalesScreen({ state, onSave, onDelete }) {
  const [form, setForm] = useState(blankSale);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const saveInFlightRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedItem = state.inventory.find((item) => item.id === form.inventoryItemId);
  const quantityCheck = useMemo(() => validateSaleQuantity({ inventoryItem: selectedItem, sales: state.sales, saleDraft: form, editingSaleId: form.id }), [form, selectedItem, state.sales]);
  const suggestedCogs = selectedItem
    ? suggestedInventorySaleCogsMajorUnits(selectedItem, state.sales, Number(form.quantitySold), form.id)
    : 0;
  const suggestedCogsMinorUnits = selectedItem?.provenanceManaged === true
    ? suggestedInventorySaleCogsMinorUnits(selectedItem, state.sales, Number(form.quantitySold), form.id)
    : null;
  const authoritativeCogs = selectedItem?.provenanceManaged === true ? suggestedCogs : form.allocatedCostOfGoodsSold === "" ? suggestedCogs : form.allocatedCostOfGoodsSold;
  const result = useMemo(() => calculateSaleResults({ ...form, allocatedCostOfGoodsSold: authoritativeCogs }), [authoritativeCogs, form]);

  const save = async (event) => {
    event.preventDefault();
    if (!quantityCheck.valid) return setMessage(quantityCheck.message);
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    const record = {
      ...form,
      allocatedCostOfGoodsSold: authoritativeCogs,
      ...(selectedItem?.provenanceManaged === true ? {
        allocatedCostOfGoodsSoldMinorUnits: suggestedCogsMinorUnits,
        costAuthority: "INTEGER_MINOR_UNITS",
      } : {}),
      netProceeds: result.netProceeds,
      realizedProfit: result.realizedProfit,
      realizedRoi: result.realizedRoi,
    };
    try {
      const saved = await onSave("sales", record, { title: form.id ? "Sale updated" : form.status === "Draft" ? "Sale draft saved" : "Sale recorded", detail: `${selectedItem?.name || "Inventory record"} · ${form.quantitySold} sold` });
      if (!saved) return setMessage("The sale was not saved. Review the latest Inventory quantity and exact cost, then try again.");
      setForm(blankSale()); setFormOpen(false); setMessage(form.status === "Draft" ? "Draft saved; inventory quantity was not removed." : "Sale saved and realized results calculated.");
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return <div className="flip-record-workspace">
    <section className="flip-section">
      <SectionHeading eyebrow="Realized results" title="Sales" detail="Completed sales validate quantity and calculate net proceeds, realized profit, and realized ROI. Drafts never reduce available inventory." actions={<button type="button" className="primary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setForm(blankSale()); setFormOpen((open) => !open); }}>{formOpen ? "Close form" : "Record Sale"}</button>} />
      {formOpen ? <form className="flip-form" onSubmit={save}>
        <div className="flip-form-grid">
          <SelectInput label="Inventory item" value={form.inventoryItemId} onChange={(value) => { set("inventoryItemId")(value); const item = state.inventory.find((row) => row.id === value); if (item) setForm((current) => ({ ...current, inventoryItemId: value, lotId: item.lotId || "", allocatedCostOfGoodsSold: "" })); }} options={[{ value: "", label: "Choose inventory" }, ...state.inventory.map((item) => ({ value: item.id, label: `${item.name} · qty ${item.quantity}` }))]} />
          <SelectInput label="Purchase lot" value={form.lotId} onChange={set("lotId")} options={[{ value: "", label: "No lot selected" }, ...state.lots.map((lot) => ({ value: lot.id, label: lot.title }))]} />
          <NumberInput label="Quantity sold" value={form.quantitySold} onChange={set("quantitySold")} min="0" step="1" />
          <TextInput label="Sales channel" value={form.salesChannel} onChange={set("salesChannel")} />
          <TextInput label="Sale date" type="date" value={form.saleDate} onChange={set("saleDate")} />
          <MoneyInput label="Gross sale price" value={form.grossSalePrice} onChange={set("grossSalePrice")} />
          <MoneyInput label="Discounts" value={form.discounts} onChange={set("discounts")} />
          <MoneyInput label="Selling fees" value={form.sellingFees} onChange={set("sellingFees")} />
          <MoneyInput label="Payment fees" value={form.paymentFees} onChange={set("paymentFees")} />
          <MoneyInput label="Shipping charged to buyer" value={form.shippingChargedToBuyer} onChange={set("shippingChargedToBuyer")} />
          <MoneyInput label="Actual outbound shipping" value={form.actualOutboundShipping} onChange={set("actualOutboundShipping")} />
          <MoneyInput label="Packaging" value={form.packaging} onChange={set("packaging")} />
          <MoneyInput label="Refunds" value={form.refunds} onChange={set("refunds")} />
          <MoneyInput label="Other costs" value={form.otherCosts} onChange={set("otherCosts")} />
          <MoneyInput label="Allocated cost of goods sold" helper={selectedItem?.provenanceManaged === true ? "Exact from the owner-confirmed acquisition lot; this value cannot be overridden." : suggestedCogs ? `Suggested from allocated item cost: ${formatCurrency(suggestedCogs)}` : "Enter the cost basis assigned to the quantity sold."} value={selectedItem?.provenanceManaged === true ? suggestedCogs : form.allocatedCostOfGoodsSold} onChange={set("allocatedCostOfGoodsSold")} disabled={selectedItem?.provenanceManaged === true} />
          <SelectInput label="Sale status" value={form.status} onChange={set("status")} options={SALE_STATUSES} />
          <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
        </div>
        <div className={`flip-quantity-check ${quantityCheck.valid ? "is-pass" : "is-fail"}`} role="status"><strong>{quantityCheck.message}</strong><span>{quantityCheck.availableQuantity} available before this record</span></div>
        <div className="flip-auction-calculation"><div><span>Net proceeds</span><strong>{formatCurrency(result.netProceeds)}</strong></div><div><span>Realized profit</span><strong className={result.realizedProfit >= 0 ? "flip-positive" : "flip-negative"}>{formatCurrency(result.realizedProfit)}</strong></div><div><span>Realized ROI</span><strong>{formatPercent(result.realizedRoi)}</strong></div></div>
        {message ? <p className="flip-form-message" role="status">{message}</p> : null}
        <FormActions><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Update sale" : "Save sale"}</button></FormActions>
      </form> : message ? <p className="flip-form-message" role="status">{message}</p> : null}
    </section>
    <section className="flip-section">{state.sales.length ? <div className="flip-record-list">{state.sales.map((sale) => {
      const item = state.inventory.find((row) => row.id === sale.inventoryItemId);
      const saleResult = calculateSaleResults(sale);
      const managed = item?.provenanceManaged === true && !["draft", "cancelled"].includes(String(sale.status || "").toLowerCase());
      const reporting = managed ? getSaleReportingProjection(sale, state) : null;
      const displayedProfit = reporting?.effectiveProfit ?? sale.realizedProfit ?? saleResult.realizedProfit;
      const displayedRoi = reporting?.effectiveRoi ?? sale.realizedRoi ?? saleResult.realizedRoi;
      return <article className="flip-record-card" key={sale.id}>
        <div className="flip-record-card__head"><div><span>{sale.saleDate || "Date not set"} · {sale.salesChannel || "Channel not set"}</span><h3>{reporting?.productRelationshipAdjusted ? reporting.originalProductReference : item?.name || "Inventory sale"}</h3></div><StatusPill tone={sale.status === "Completed" ? "good" : "muted"}>{sale.status}</StatusPill></div>
        <div className="flip-record-facts"><span>Qty <strong>{sale.quantitySold}</strong></span><span>Gross <strong>{formatCurrency(sale.grossSalePrice)}</strong></span><span>Net <strong>{formatCurrency(sale.netProceeds ?? saleResult.netProceeds)}</strong></span><span>Profit <strong>{formatCurrency(displayedProfit)}</strong></span><span>ROI <strong>{formatPercent(displayedRoi)}</strong></span></div>
        {reporting?.hasReconciliation ? <div className="flip-record-facts" aria-label="Append-only Sale reconciliation"><span>Original COGS <strong>{formatCurrency(reporting.originalCogs)}</strong></span><span>COGS adjustment <strong>{formatCurrency(reporting.cogsAdjustment)}</strong></span><span>Effective COGS <strong>{formatCurrency(reporting.effectiveCogs)}</strong></span>{reporting.productRelationshipAdjusted ? <span>Historical product <strong>{reporting.originalProductReference}</strong><small>Current reporting relationship: {reporting.effectiveProductReference}</small></span> : null}</div> : null}
        {managed ? <p className="flip-warning-copy">The Sale remains unchanged. Confirmed reconciliation events adjust current reporting without replacing its original COGS or product history.</p> : <RecordActions onEdit={() => { if (saveInFlightRef.current) return; setForm({ ...blankSale(), ...sale }); setFormOpen(true); }} onDelete={() => { if (!saveInFlightRef.current) return onDelete("sales", sale.id, item?.name || "sale"); return false; }} />}
      </article>;
    })}</div> : <EmptyState title="No sales recorded">Record a completed sale or save a draft. Drafts leave inventory availability unchanged.</EmptyState>}</section>
  </div>;
}
