import { useMemo, useRef, useState } from "react";
import { COST_ALLOCATION_METHODS, INVENTORY_STATUSES, PRODUCT_CLASSIFICATIONS } from "../../constants.js";
import { reconcileLotAllocations } from "../../inventory.js";
import { formatCurrency } from "../../selectors.js";
import { EmptyState, FormActions, MoneyInput, NumberInput, RecordActions, SectionHeading, SelectInput, StatusPill, TextArea, TextInput } from "../../components/Fields.jsx";

function blankPurchase() {
  return { title: "", source: "", purchaseDate: new Date().toISOString().slice(0, 10), originalListing: "", totalPurchaseCost: "", notes: "" };
}

function blankLot(purchaseId = "") {
  return { purchaseId, title: "", totalLotCost: "", allocationMethod: "manual", notes: "" };
}

function blankInventory(lotId = "", purchaseId = "") {
  return {
    purchaseId,
    lotId,
    name: "",
    quantity: 1,
    productClassification: "Unknown",
    pokemonName: "",
    setName: "",
    cardNumber: "",
    language: "English",
    condition: "",
    gradingCompany: "",
    grade: "",
    certificationNumber: "",
    purchaseSource: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    originalListing: "",
    totalPurchaseCost: "",
    allocatedItemCost: "",
    actualPurchasePrice: "",
    status: "In stock",
    storageLocation: "",
    intendedSalesChannel: "",
    projectedResaleLow: "",
    projectedResaleMid: "",
    projectedResaleHigh: "",
    originalProjectedProfit: "",
    originalProjectedRoi: "",
    recommendedMaximumPurchasePrice: "",
    notes: "",
  };
}

export default function PurchasesInventoryScreen({ view, state, onSave, onDelete, onAllocateLot }) {
  const [purchaseForm, setPurchaseForm] = useState(blankPurchase);
  const [lotForm, setLotForm] = useState(blankLot);
  const [inventoryForm, setInventoryForm] = useState(blankInventory);
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [lotFormOpen, setLotFormOpen] = useState(false);
  const [inventoryFormOpen, setInventoryFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const saveInFlightRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const setPurchase = (key) => (value) => setPurchaseForm((current) => ({ ...current, [key]: value }));
  const setLot = (key) => (value) => setLotForm((current) => ({ ...current, [key]: value }));
  const setInventory = (key) => (value) => setInventoryForm((current) => ({ ...current, [key]: value }));
  const visibleInventory = useMemo(() => state.inventory.filter((item) => !query.trim() || [item.name, item.pokemonName, item.setName, item.storageLocation, item.status].join(" ").toLowerCase().includes(query.toLowerCase())), [query, state.inventory]);

  const submitOnce = async (action, onSuccess, failureMessage) => {
    if (saveInFlightRef.current) return null;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const saved = await action();
      if (!saved) {
        setMessage(failureMessage);
        return null;
      }
      onSuccess();
      return saved;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const savePurchase = async (event) => {
    event.preventDefault();
    if (!purchaseForm.title.trim()) return setMessage("Add a purchase title.");
    return submitOnce(
      () => onSave("purchases", purchaseForm, { title: purchaseForm.id ? "Purchase updated" : "Purchase recorded", detail: purchaseForm.title }),
      () => { setPurchaseForm(blankPurchase()); setPurchaseFormOpen(false); setMessage("Purchase saved."); },
      "The purchase was not saved. Your entries remain available to review and try again.",
    );
  };
  const saveLot = async (event) => {
    event.preventDefault();
    if (!lotForm.title.trim()) return setMessage("Add a lot title.");
    return submitOnce(
      () => onSave("lots", lotForm, { title: lotForm.id ? "Purchase lot updated" : "Purchase lot created", detail: lotForm.title }),
      () => { setLotForm(blankLot()); setLotFormOpen(false); setMessage("Purchase lot saved. Add inventory items to split it."); },
      "The purchase lot was not saved. Your entries remain available to review and try again.",
    );
  };
  const saveInventory = async (event) => {
    event.preventDefault();
    if (!inventoryForm.name.trim()) return setMessage("Add an inventory item name.");
    return submitOnce(
      () => onSave("inventory", inventoryForm, { title: inventoryForm.id ? "Inventory updated" : "Inventory added", detail: inventoryForm.name }),
      () => { setInventoryForm(blankInventory()); setInventoryFormOpen(false); setMessage("Inventory item saved. Sale drafts will not remove it."); },
      "The inventory item was not saved. Your entries remain available to review and try again.",
    );
  };

  if (view === "purchases") return (
    <div className="flip-record-workspace">
      <section className="flip-section">
        <SectionHeading eyebrow="Acquisitions" title="Purchases and lots" detail="A purchase can contain one or more lots, and each lot can be split into individual inventory records." actions={<div className="flip-section-actions"><button type="button" className="primary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setPurchaseForm(blankPurchase()); setPurchaseFormOpen((open) => !open); }}>Record Purchase</button><button type="button" className="secondary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setLotForm(blankLot()); setLotFormOpen((open) => !open); }}>Create Lot</button></div>} />
        {purchaseFormOpen ? <form className="flip-form" onSubmit={savePurchase}><div className="flip-form-grid"><TextInput label="Purchase title" value={purchaseForm.title} onChange={setPurchase("title")} required /><TextInput label="Purchase source" value={purchaseForm.source} onChange={setPurchase("source")} /><TextInput label="Purchase date" type="date" value={purchaseForm.purchaseDate} onChange={setPurchase("purchaseDate")} /><TextInput label="Original listing" type="url" value={purchaseForm.originalListing} onChange={setPurchase("originalListing")} /><MoneyInput label="Total purchase cost" value={purchaseForm.totalPurchaseCost} onChange={setPurchase("totalPurchaseCost")} /><TextArea label="Notes" value={purchaseForm.notes} onChange={setPurchase("notes")} /></div><FormActions><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : purchaseForm.id ? "Update purchase" : "Save purchase"}</button></FormActions></form> : null}
        {lotFormOpen ? <form className="flip-form" onSubmit={saveLot}><div className="flip-form-grid"><SelectInput label="Related purchase" value={lotForm.purchaseId} onChange={setLot("purchaseId")} options={[{ value: "", label: "No purchase selected" }, ...state.purchases.map((purchase) => ({ value: purchase.id, label: purchase.title }))]} /><TextInput label="Lot title" value={lotForm.title} onChange={setLot("title")} required /><MoneyInput label="Total lot cost" value={lotForm.totalLotCost} onChange={setLot("totalLotCost")} /><SelectInput label="Allocation method" value={lotForm.allocationMethod} onChange={setLot("allocationMethod")} options={COST_ALLOCATION_METHODS} /><TextArea label="Notes" value={lotForm.notes} onChange={setLot("notes")} /></div><FormActions><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : lotForm.id ? "Update lot" : "Save lot"}</button></FormActions></form> : null}
        {message ? <p className="flip-form-message" role="status">{message}</p> : null}
      </section>
      <section className="flip-section"><SectionHeading eyebrow="Purchase history" title="Recorded purchases" detail="These are bookkeeping records, not tax conclusions." />{state.purchases.length ? <div className="flip-record-list">{state.purchases.map((purchase) => <article className="flip-record-card" key={purchase.id}><div className="flip-record-card__head"><div><span>{purchase.purchaseDate || "Date not set"}</span><h3>{purchase.title}</h3></div><strong>{formatCurrency(purchase.totalPurchaseCost)}</strong></div><p>{purchase.source || "Source not recorded"}</p><RecordActions onEdit={() => { if (saveInFlightRef.current) return; setPurchaseForm({ ...blankPurchase(), ...purchase }); setPurchaseFormOpen(true); }} onDelete={() => { if (!saveInFlightRef.current) return onDelete("purchases", purchase.id, purchase.title); return false; }} /></article>)}</div> : <EmptyState title="No purchases recorded">Record a real purchase, then create lots or inventory items from it.</EmptyState>}</section>
      <section className="flip-section"><SectionHeading eyebrow="Cost allocation" title="Purchase lots" detail="Every lot shows its total, allocated, and unallocated cost." />{state.lots.length ? <div className="flip-record-list">{state.lots.map((lot) => {
        const items = state.inventory.filter((item) => item.lotId === lot.id);
        const reconciliation = reconcileLotAllocations(lot.totalLotCost, items);
        return <article className="flip-record-card flip-lot-card" key={lot.id}><div className="flip-record-card__head"><div><span>{COST_ALLOCATION_METHODS.find((method) => method.value === lot.allocationMethod)?.label || lot.allocationMethod}</span><h3>{lot.title}</h3></div><StatusPill tone={reconciliation.reconciled ? "good" : "danger"}>{reconciliation.reconciled ? "Reconciled" : "Needs allocation"}</StatusPill></div><div className="flip-lot-totals"><span>Total lot cost <strong>{formatCurrency(reconciliation.totalCost)}</strong></span><span>Allocated cost <strong>{formatCurrency(reconciliation.allocatedCost)}</strong></span><span>Unallocated cost <strong className={reconciliation.reconciled ? "" : "flip-negative"}>{formatCurrency(reconciliation.unallocatedCost)}</strong></span></div>{reconciliation.warning ? <p className="flip-warning-copy">{reconciliation.warning}</p> : null}<p>{items.length} inventory record{items.length === 1 ? "" : "s"} in this lot.</p><div className="flip-form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setInventoryForm(blankInventory(lot.id, lot.purchaseId)); setInventoryFormOpen(true); }}>Split into inventory</button><button type="button" className="secondary-button" disabled={saving || lot.allocationMethod === "manual" || !items.length} onClick={() => onAllocateLot(lot.id, lot.allocationMethod)}>Apply allocation</button></div><RecordActions onEdit={() => { if (saveInFlightRef.current) return; setLotForm({ ...blankLot(), ...lot }); setLotFormOpen(true); }} onDelete={() => { if (!saveInFlightRef.current) return onDelete("lots", lot.id, lot.title); return false; }} /></article>;
      })}</div> : <EmptyState title="No purchase lots">Create a lot when one purchase needs to be split into multiple inventory items.</EmptyState>}</section>
      {inventoryFormOpen ? <InventoryForm form={inventoryForm} set={setInventory} state={state} onSubmit={saveInventory} onClose={() => { if (!saveInFlightRef.current) setInventoryFormOpen(false); }} saving={saving} /> : null}
    </div>
  );

  return (
    <div className="flip-record-workspace">
      <section className="flip-section"><SectionHeading eyebrow="Stock on hand" title="Inventory" detail="Track item identity, quantity, cost allocation, storage, resale projections, and eventual sale history." actions={<button type="button" className="primary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setInventoryForm(blankInventory()); setInventoryFormOpen((open) => !open); }}>{inventoryFormOpen ? "Close form" : "Add Inventory"}</button>} />{inventoryFormOpen ? <InventoryForm form={inventoryForm} set={setInventory} state={state} onSubmit={saveInventory} onClose={() => { if (!saveInFlightRef.current) setInventoryFormOpen(false); }} saving={saving} /> : null}{message ? <p className="flip-form-message" role="status">{message}</p> : null}</section>
      <section className="flip-section"><div className="flip-filter-bar"><TextInput label="Search inventory" value={query} onChange={setQuery} /></div>{visibleInventory.length ? <div className="flip-record-list">{visibleInventory.map((item) => {
        const exactCost = Number.isSafeInteger(item.acquisitionCostMinorUnits) ? item.acquisitionCostMinorUnits / 100 : item.allocatedItemCost;
        return <article className="flip-record-card" key={item.id}><div className="flip-record-card__head"><div><span>{item.productClassification}</span><h3>{item.name}</h3></div><StatusPill tone={item.status === "Sold" ? "muted" : "tide"}>{item.status}</StatusPill></div><div className="flip-record-facts"><span>Qty <strong>{item.quantity}</strong></span><span>Allocated <strong>{formatCurrency(exactCost)}</strong></span><span>Projected mid <strong>{formatCurrency(item.projectedResaleMid)}</strong></span><span>{item.storageLocation || "Location not set"}</span></div><p>{[item.pokemonName, item.setName, item.cardNumber, item.condition, item.gradingCompany && `${item.gradingCompany} ${item.grade}`].filter(Boolean).join(" · ") || "No card-specific details recorded."}</p>{item.provenanceManaged === true ? <p className="flip-warning-copy">Owner-confirmed acquisition history uses append-only corrections.</p> : <RecordActions onEdit={() => { if (saveInFlightRef.current) return; setInventoryForm({ ...blankInventory(), ...item }); setInventoryFormOpen(true); window.scrollTo?.({ top: 0, behavior: "smooth" }); }} onDelete={() => { if (!saveInFlightRef.current) return onDelete("inventory", item.id, item.name); return false; }} />}</article>;
      })}</div> : <EmptyState title="No inventory matches">Add a real item or adjust the search. Creating a sale draft does not remove inventory.</EmptyState>}</section>
    </div>
  );
}

function InventoryForm({ form, set, state, onSubmit, onClose, saving = false }) {
  return <form className="flip-form" onSubmit={onSubmit}>
    <div className="flip-form-grid">
      <SelectInput label="Purchase" value={form.purchaseId} onChange={set("purchaseId")} options={[{ value: "", label: "No purchase selected" }, ...state.purchases.map((purchase) => ({ value: purchase.id, label: purchase.title }))]} />
      <SelectInput label="Purchase lot" value={form.lotId} onChange={set("lotId")} options={[{ value: "", label: "No lot selected" }, ...state.lots.map((lot) => ({ value: lot.id, label: lot.title }))]} />
      <TextInput label="Item name" value={form.name} onChange={set("name")} required />
      <NumberInput label="Quantity" value={form.quantity} onChange={set("quantity")} min="0" step="1" />
      <SelectInput label="Product classification" value={form.productClassification} onChange={set("productClassification")} options={PRODUCT_CLASSIFICATIONS} />
      <TextInput label="Pokémon" value={form.pokemonName} onChange={set("pokemonName")} />
      <TextInput label="Set" value={form.setName} onChange={set("setName")} />
      <TextInput label="Card number" value={form.cardNumber} onChange={set("cardNumber")} />
      <TextInput label="Language" value={form.language} onChange={set("language")} />
      <TextInput label="Condition" value={form.condition} onChange={set("condition")} />
      <TextInput label="Grading company" value={form.gradingCompany} onChange={set("gradingCompany")} />
      <TextInput label="Grade" value={form.grade} onChange={set("grade")} />
      <TextInput label="Certification number" value={form.certificationNumber} onChange={set("certificationNumber")} />
      <TextInput label="Purchase source" value={form.purchaseSource} onChange={set("purchaseSource")} />
      <TextInput label="Purchase date" type="date" value={form.purchaseDate} onChange={set("purchaseDate")} />
      <TextInput label="Original listing" type="url" value={form.originalListing} onChange={set("originalListing")} />
      <MoneyInput label="Total purchase cost" value={form.totalPurchaseCost} onChange={set("totalPurchaseCost")} />
      <MoneyInput label="Allocated item cost" helper="For lot items, this is the share allocated to this inventory record." value={form.allocatedItemCost} onChange={set("allocatedItemCost")} />
      <MoneyInput label="Actual purchase price" value={form.actualPurchasePrice} onChange={set("actualPurchasePrice")} />
      <SelectInput label="Current status" value={form.status} onChange={set("status")} options={INVENTORY_STATUSES} />
      <TextInput label="Storage location" value={form.storageLocation} onChange={set("storageLocation")} />
      <TextInput label="Intended sales channel" value={form.intendedSalesChannel} onChange={set("intendedSalesChannel")} />
      <MoneyInput label="Original projected resale low" value={form.projectedResaleLow} onChange={set("projectedResaleLow")} />
      <MoneyInput label="Original projected resale midpoint" value={form.projectedResaleMid} onChange={set("projectedResaleMid")} />
      <MoneyInput label="Original projected resale high" value={form.projectedResaleHigh} onChange={set("projectedResaleHigh")} />
      <MoneyInput label="Original projected profit" value={form.originalProjectedProfit} onChange={set("originalProjectedProfit")} />
      <TextInput label="Original projected ROI" helper="Enter 30 for 30%." type="number" inputMode="decimal" min="0" step="0.1" value={form.originalProjectedRoi} onChange={set("originalProjectedRoi")} />
      <MoneyInput label="Recommended maximum purchase price" value={form.recommendedMaximumPurchasePrice} onChange={set("recommendedMaximumPurchasePrice")} />
      <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
    </div>
    <FormActions><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Update inventory" : "Save inventory"}</button><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button></FormActions>
  </form>;
}
