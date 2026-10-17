import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BottomSheet,
  EmptyState,
  FilterButton,
  MetricCard,
  PageHeader,
  PrimaryButton,
  QuietButton,
  RecordCard,
  SearchField,
  SectionHeader,
  StatusBadge,
} from "../components/operations/OperationsUI.jsx";
import {
  DetailList,
  GuidedFormPage,
  RecordDetailPage,
  SelectField,
  TextField,
} from "../components/operations/RecordExperience.jsx";
import {
  OWNED_ITEM_PURPOSE_OPTIONS,
  OWNED_ITEM_PURPOSES,
  changeOwnedItemPurpose,
  inferOwnedItemPurpose,
  normalizeOwnedItem,
} from "../features/ownedItems/ownedItemPurpose.js";
import { calculateSaleResults } from "../features/flipScout/calculations.js";
import { COST_ALLOCATION_METHODS, EXPENSE_CATEGORIES, INVENTORY_STATUSES, PRODUCT_CLASSIFICATIONS, SALE_STATUSES } from "../features/flipScout/constants.js";
import { allocateLotCost, reconcileLotAllocations, soldQuantityForInventory, validateSaleQuantity } from "../features/flipScout/inventory.js";
import { availableInventoryCostMajorUnits, inventoryRecordCostMajorUnits, suggestedInventorySaleCogsMajorUnits, suggestedInventorySaleCogsMinorUnits } from "../features/flipScout/exactInventoryCost.js";
import { getSaleReportingProjection } from "../features/flipScout/selectors.js";
import { createFlipScoutRepository } from "../features/flipScout/storageRepository.js";
import BusinessCompliancePage from "../features/businessCompliance/BusinessCompliancePage.jsx";
import "./everyday-workspaces.css";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const EMPTY_FEATURE_CONTROLS = Object.freeze({});
const TODAY = () => new Date().toISOString().slice(0, 10);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value, empty = "Not recorded") {
  return value === "" || value == null || !Number.isFinite(Number(value)) ? empty : currency.format(Number(value));
}

function roi(value) {
  return value === "" || value == null || !Number.isFinite(Number(value)) ? "Not recorded" : percent.format(Number(value));
}

function recordTitle(record = {}) {
  return record.title || record.name || record.cardName || record.productName || record.description || record.purpose || "Untitled record";
}

function recordImage(record = {}) {
  return record.imageUrl || record.image || record.images?.[0]?.url || record.images?.[0] || "";
}

function acquisitionCost(record = {}, sales = []) {
  if (record.provenanceManaged === true) return availableInventoryCostMajorUnits(record, sales);
  const value = record.allocatedItemCost ?? record.allocatedCost ?? record.totalPurchaseCost ?? record.purchasePrice ?? record.actualPurchasePrice;
  return value === "" || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function availableInventoryQuantity(record = {}, sales = []) {
  if (record.provenanceManaged !== true) return number(record.quantity);
  return Math.max(0, number(record.quantity) - soldQuantityForInventory(record.id, sales));
}

function dateLabel(value) {
  if (!value) return "Date not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
}

function mergeRecords(primary = [], compatibility = []) {
  const result = [];
  const seen = new Set();
  for (const record of [...primary.map((row) => ({ ...row, _recordOrigin: "repository" })), ...compatibility.map((row) => ({ ...row, _recordOrigin: "legacy" }))]) {
    const key = String(record.id || `${recordTitle(record)}-${record.purchaseDate || record.date || ""}`);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

function activityEntry(title, detail) {
  return { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, detail, createdAt: new Date().toISOString() };
}

function useBusinessRepository() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) repositoryRef.current = createFlipScoutRepository();
  const repository = repositoryRef.current;
  const [state, setState] = useState(() => repository.load());
  const [error, setError] = useState(repository.getLastError());

  useEffect(() => {
    const refresh = (event) => setState(event.detail?.state || repository.load());
    window.addEventListener("private-business-hub:flip-scout-data", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("private-business-hub:flip-scout-data", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [repository]);

  const saveRecord = useCallback(async (collection, record, message = "Record saved") => {
    if (record?.provenanceManaged === true) {
      setError("Owner-confirmed acquisition records use their append-only correction workflow.");
      return null;
    }
    try {
      const result = await repository.runLocked(() => {
        return repository.upsert(collection, record, {
          activityRecord: activityEntry(message, recordTitle(record)),
        });
      });
      setState(result.state);
      setError(result.error);
      return result.error ? null : result.record;
    } catch (saveError) {
      setState(repository.load());
      setError(saveError?.message || "The record could not be saved safely.");
      return null;
    }
  }, [repository]);

  const removeRecord = useCallback(async (collection, record) => {
    if (record?.provenanceManaged === true) {
      setError("Owner-confirmed acquisition records cannot be deleted from the generic editor.");
      return false;
    }
    if (!window.confirm(`Delete ${recordTitle(record)}? This cannot be undone.`)) return false;
    try {
      const result = await repository.runLocked(() => repository.remove(collection, record.id));
      setState(result.state);
      setError(result.error);
      return !result.error;
    } catch (removeError) {
      setState(repository.load());
      setError(removeError?.message || "The record could not be deleted safely.");
      return false;
    }
  }, [repository]);

  const allocateLot = useCallback(async (lot, method) => {
    const lotItems = state.inventory.filter((item) => item.lotId === lot.id);
    const allocated = allocateLotCost({ totalCost: lot.totalLotCost, items: lotItems, method });
    const byId = new Map(allocated.map((item) => [item.id, item]));
    const result = await repository.runLocked(() => {
      const current = repository.load();
      return repository.save({ ...current, lots: current.lots.map((row) => row.id === lot.id ? { ...row, allocationMethod: method, updatedAt: new Date().toISOString() } : row), inventory: current.inventory.map((item) => byId.get(item.id) || item), activity: [activityEntry("Lot cost allocated", `${recordTitle(lot)} · ${method.replaceAll("_", " ")}`), ...current.activity].slice(0, 150) });
    });
    setState(result.state);
    setError(result.error);
  }, [repository, state]);

  return { state, error, saveRecord, removeRecord, allocateLot };
}

function usePreservedDraft(key, initialValue) {
  const storageKey = `private-business-hub.form-draft.${key}`;
  const [value, setValue] = useState(() => {
    try { return { ...initialValue, ...JSON.parse(sessionStorage.getItem(storageKey) || "null") }; } catch { return initialValue; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Draft preservation is best effort. */ }
  }, [storageKey, value]);
  const clear = () => {
    try { sessionStorage.removeItem(storageKey); } catch { /* Ignore unavailable session storage. */ }
  };
  return [value, setValue, clear];
}

function WorkspaceTabs({ label, tabs, active, onChange }) {
  return <div className="everyday-tabs" role="tablist" aria-label={label}>{tabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} className={active === tab.key ? "is-active" : ""} onClick={() => onChange(tab.key)}>{tab.label}</button>)}</div>;
}

function WorkspaceMoreMenu({ label = "More", items, active, onChange }) {
  return <details className="everyday-more-menu"><summary>{label}</summary><div>{items.map((item) => <button key={item.key} type="button" aria-current={active === item.key ? "page" : undefined} onClick={() => onChange(item.key)}>{item.label}</button>)}</div></details>;
}

function MetricRow({ items }) {
  return <div className="everyday-metrics">{items.slice(0, 4).map((item) => <MetricCard key={item.label} {...item} />)}</div>;
}

function RecordListCard({ record, eyebrow, facts = [], status = "", statusTone = "neutral", onOpen }) {
  const image = recordImage(record);
  return <button type="button" className="everyday-record-card" onClick={() => onOpen(record)} aria-label={`Open ${recordTitle(record)}`}>
    {image ? <img src={image} alt="" loading="lazy" /> : <div className="everyday-record-placeholder" aria-hidden="true">Record</div>}
    <div className="everyday-record-card__body">
      <div className="everyday-record-card__heading"><div><span>{eyebrow}</span><h3>{recordTitle(record)}</h3></div>{status ? <StatusBadge tone={statusTone}>{status}</StatusBadge> : null}</div>
      <dl>{facts.slice(0, 4).filter((fact) => fact.value !== undefined && fact.value !== null && fact.value !== "").map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
    </div>
    <span className="everyday-record-chevron" aria-hidden="true">›</span>
  </button>;
}

function PurposeActions({ item, onChange }) {
  return <div className="purpose-action-grid" role="group" aria-label="Assign item purpose">{OWNED_ITEM_PURPOSE_OPTIONS.map((option) => <button key={option.value} type="button" className={inferOwnedItemPurpose(item) === option.value ? "is-active" : ""} aria-pressed={inferOwnedItemPurpose(item) === option.value} onClick={() => onChange(item, option.value)}>{option.label}</button>)}</div>;
}

function itemDetailGroups(item) {
  return [
    { title: "Identification", description: "Item and card details.", items: [{ label: "Classification", value: item.productClassification }, { label: "Pokémon", value: item.pokemonName }, { label: "Set", value: item.setName }, { label: "Card number", value: item.cardNumber }, { label: "Language", value: item.language }, { label: "Condition", value: item.condition }, { label: "Grade", value: [item.gradingCompany, item.grade].filter(Boolean).join(" ") }, { label: "Certification", value: item.certificationNumber }] },
    { title: "Acquisition and value", description: "Original cost context remains attached.", items: [{ label: "Purchase source", value: item.purchaseSource || item.source }, { label: "Purchase date", value: dateLabel(item.purchaseDate) }, { label: "Original listing", value: item.originalListing }, { label: "Total purchase cost", value: money(item.totalPurchaseCost), numeric: true }, { label: "Allocated cost", value: money(acquisitionCost(item)), numeric: true }, { label: "Projected resale", value: [money(item.projectedResaleLow, ""), money(item.projectedResaleMid, ""), money(item.projectedResaleHigh, "")].filter(Boolean).join(" / ") }] },
    { title: "Storage and notes", description: "Where the item is and what remains to do.", items: [{ label: "Storage location", value: item.storageLocation }, { label: "Sales channel", value: item.intendedSalesChannel }, { label: "Notes", value: item.notes }] },
  ];
}

function itemDetailSections(item) {
  return itemDetailGroups(item).map((group) => ({ ...group, children: <DetailList items={group.items} /> }));
}

function itemTimeline(item) {
  const purposeHistory = Array.isArray(item.purposeHistory) ? item.purposeHistory.map((entry) => ({ id: entry.id, title: "Purpose changed", date: dateLabel(entry.at), detail: `${entry.from.replaceAll("_", " ")} → ${entry.to.replaceAll("_", " ")} · ${entry.reason}` })) : [];
  return [...purposeHistory, item.purchaseDate ? { id: "purchased", title: "Purchased", date: dateLabel(item.purchaseDate), detail: item.purchaseSource || "Source not recorded" } : null, item.createdAt ? { id: "created", title: "Record created", date: dateLabel(item.createdAt) } : null].filter(Boolean);
}

function blankForm(type, seed = {}) {
  const shared = { notes: "" };
  const forms = {
    collection: { name: "", quantity: 1, productClassification: "Unknown", ownedItemPurpose: OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION, pokemonName: "", setName: "", cardNumber: "", condition: "", purchaseSource: "", purchaseDate: TODAY(), allocatedItemCost: "", projectedResaleMid: "", storageLocation: "", ...shared },
    purchase: { title: "", source: "", purchaseDate: TODAY(), originalListing: "", totalPurchaseCost: "", ...shared },
    lot: { purchaseId: "", title: "", totalLotCost: "", allocationMethod: "manual", ...shared },
    inventory: { purchaseId: "", lotId: "", name: "", quantity: 1, productClassification: "Unknown", ownedItemPurpose: OWNED_ITEM_PURPOSES.FOR_RESALE, pokemonName: "", setName: "", cardNumber: "", condition: "", purchaseSource: "", purchaseDate: TODAY(), allocatedItemCost: "", projectedResaleLow: "", projectedResaleMid: "", projectedResaleHigh: "", storageLocation: "", intendedSalesChannel: "", status: "In stock", ...shared },
    sale: { inventoryItemId: "", lotId: "", quantitySold: 1, salesChannel: "", saleDate: TODAY(), grossSalePrice: "", discounts: "", sellingFees: "", paymentFees: "", shippingChargedToBuyer: "", actualOutboundShipping: "", packaging: "", refunds: "", otherCosts: "", allocatedCostOfGoodsSold: "", status: "Completed", ...shared },
    expense: { date: TODAY(), category: "Other", merchant: "", description: "", amount: "", paymentMethod: "", businessPercentage: 100, receiptReference: "", relatedRecordType: "", relatedRecordId: "", ...shared },
    mileage: { date: TODAY(), startLocation: "", destination: "", purpose: "", miles: "", relatedRecordType: "", relatedRecordId: "", ...shared },
  };
  return { ...(forms[type] || shared), ...seed };
}

const FORM_CONFIG = {
  collection: { title: "Add Collection Item", description: "Identify the item, preserve acquisition context, and choose its purpose.", steps: ["Item", "Acquisition", "Purpose"], collection: "inventory", submit: "Save Item" },
  purchase: { title: "Record Purchase", description: "Capture the purchase first; lots and inventory remain related records.", steps: ["Purchase", "Costs"], collection: "purchases", submit: "Save Purchase" },
  lot: { title: "Process Purchase Lot", description: "Connect a lot to its purchase and choose how item cost will be allocated.", steps: ["Lot", "Allocation"], collection: "lots", submit: "Save Lot" },
  inventory: { title: "Add Resale Inventory", description: "Identify the item, retain its cost basis, and set the resale plan.", steps: ["Item", "Costs", "Plan"], collection: "inventory", submit: "Save Inventory" },
  sale: { title: "Record Sale", description: "Validate quantity and record real proceeds and selling costs.", steps: ["Sale", "Costs", "Result"], collection: "sales", submit: "Save Sale" },
  expense: { title: "Add Expense", description: "Record a factual business expense and its receipt reference.", steps: ["Expense", "Reference"], collection: "expenses", submit: "Save Expense" },
  mileage: { title: "Add Mileage", description: "Record the actual trip. Mileage remains a bookkeeping estimate.", steps: ["Trip", "Related"], collection: "mileage", submit: "Save Mileage" },
};

function RecordForm({ type, seed = {}, state, onSave, onCancel }) {
  const config = FORM_CONFIG[type];
  const [step, setStep] = useState(0);
  const [form, setForm, clearDraft] = usePreservedDraft(`${type}.${seed.id || "new"}`, blankForm(type, seed));
  const [error, setError] = useState("");
  const saveInFlightRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };
  const selectedInventory = state.inventory.find((item) => item.id === form.inventoryItemId);
  const quantityCheck = type === "sale" ? validateSaleQuantity({ inventoryItem: selectedInventory, sales: state.sales, saleDraft: form, editingSaleId: form.id }) : { valid: true, message: "" };
  const suggestedCogs = selectedInventory ? suggestedInventorySaleCogsMajorUnits(selectedInventory, state.sales, Number(form.quantitySold), form.id) : 0;
  const suggestedCogsMinorUnits = selectedInventory?.provenanceManaged === true ? suggestedInventorySaleCogsMinorUnits(selectedInventory, state.sales, Number(form.quantitySold), form.id) : null;
  const authoritativeCogs = selectedInventory?.provenanceManaged === true ? suggestedCogs : form.allocatedCostOfGoodsSold === "" ? suggestedCogs : form.allocatedCostOfGoodsSold;
  const saleResult = calculateSaleResults({ ...form, allocatedCostOfGoodsSold: authoritativeCogs });
  const requiredValue = type === "purchase" ? form.title : type === "lot" ? form.title : ["collection", "inventory"].includes(type) ? form.name : type === "sale" ? form.inventoryItemId : type === "expense" ? form.description || form.merchant : form.purpose;
  const canContinue = step > 0 || Boolean(String(requiredValue || "").trim());

  const cancel = () => {
    if (saveInFlightRef.current) return;
    if (JSON.stringify(form) !== JSON.stringify(blankForm(type, seed)) && !window.confirm("Discard this draft? Saved records will not be changed.")) return;
    clearDraft();
    onCancel();
  };
  const submit = async () => {
    if (!String(requiredValue || "").trim()) return setError("Complete the required field before saving.");
    if (type === "sale" && !quantityCheck.valid) return setError(quantityCheck.message);
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    const record = type === "sale" ? {
      ...form,
      allocatedCostOfGoodsSold: authoritativeCogs,
      ...(selectedInventory?.provenanceManaged === true ? { allocatedCostOfGoodsSoldMinorUnits: suggestedCogsMinorUnits, costAuthority: "INTEGER_MINOR_UNITS" } : {}),
      netProceeds: saleResult.netProceeds,
      realizedProfit: saleResult.realizedProfit,
      realizedRoi: saleResult.realizedRoi,
    } : form;
    try {
      const saved = await onSave(config.collection, record, `${config.title} saved`);
      if (!saved) return setError("The record was not saved. Review the latest Inventory state and try again.");
      clearDraft();
      onCancel();
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return <GuidedFormPage title={config.title} description={config.description} steps={config.steps} activeStep={step} onStepChange={setStep} onCancel={cancel} onSubmit={submit} canContinue={canContinue && !saving} submitLabel={saving ? "Saving…" : seed.id ? `Update ${config.submit.replace("Save ", "")}` : config.submit} error={error}>
    <div className="ops-form-group"><header><h2>{config.steps[step]}</h2><p>Required fields are marked. Additional detail can be added later.</p></header><div className="ops-form-grid">
      {(["collection", "inventory"].includes(type) && step === 0) ? <><TextField label="Item name" required value={form.name} onChange={set("name")} error={!form.name && error ? "Item name is required." : ""} /><TextField label="Quantity" type="number" inputMode="numeric" min="1" value={form.quantity} onChange={set("quantity")} /><SelectField label="Product classification" value={form.productClassification} onChange={set("productClassification")} options={PRODUCT_CLASSIFICATIONS} /><TextField label="Pokémon" value={form.pokemonName} onChange={set("pokemonName")} /><TextField label="Set" value={form.setName} onChange={set("setName")} /><TextField label="Card number" value={form.cardNumber} onChange={set("cardNumber")} /><TextField label="Condition" value={form.condition} onChange={set("condition")} /></> : null}
      {(["collection", "inventory"].includes(type) && step === 1) ? <><SelectField label="Purchase" value={form.purchaseId || ""} onChange={set("purchaseId")} options={[{ value: "", label: "No purchase selected" }, ...state.purchases.map((row) => ({ value: row.id, label: row.title }))]} /><SelectField label="Purchase lot" value={form.lotId || ""} onChange={set("lotId")} options={[{ value: "", label: "No lot selected" }, ...state.lots.map((row) => ({ value: row.id, label: row.title }))]} /><TextField label="Purchase source" value={form.purchaseSource} onChange={set("purchaseSource")} /><TextField label="Purchase date" type="date" value={form.purchaseDate} onChange={set("purchaseDate")} /><TextField label="Allocated item cost" type="number" inputMode="decimal" min="0" step="0.01" value={form.allocatedItemCost} onChange={set("allocatedItemCost")} /></> : null}
      {(["collection", "inventory"].includes(type) && step === 2) ? <><SelectField label="Purpose" value={form.ownedItemPurpose} onChange={set("ownedItemPurpose")} options={OWNED_ITEM_PURPOSE_OPTIONS} /><SelectField label="Status" value={form.status || "In stock"} onChange={set("status")} options={INVENTORY_STATUSES} /><TextField label="Storage location" value={form.storageLocation} onChange={set("storageLocation")} /><TextField label="Intended sales channel" value={form.intendedSalesChannel || ""} onChange={set("intendedSalesChannel")} /><TextField label="Projected resale low" type="number" inputMode="decimal" min="0" step="0.01" value={form.projectedResaleLow || ""} onChange={set("projectedResaleLow")} /><TextField label="Projected resale midpoint" type="number" inputMode="decimal" min="0" step="0.01" value={form.projectedResaleMid || ""} onChange={set("projectedResaleMid")} /><TextField label="Projected resale high" type="number" inputMode="decimal" min="0" step="0.01" value={form.projectedResaleHigh || ""} onChange={set("projectedResaleHigh")} /><TextField className="is-wide" label="Notes" multiline value={form.notes} onChange={set("notes")} /></> : null}
      {(type === "purchase" && step === 0) ? <><TextField label="Purchase title" required value={form.title} onChange={set("title")} error={!form.title && error ? "Purchase title is required." : ""} /><TextField label="Source" value={form.source} onChange={set("source")} /><TextField label="Purchase date" type="date" value={form.purchaseDate} onChange={set("purchaseDate")} /></> : null}
      {(type === "purchase" && step === 1) ? <><TextField label="Total purchase cost" type="number" inputMode="decimal" min="0" step="0.01" value={form.totalPurchaseCost} onChange={set("totalPurchaseCost")} /><TextField label="Original listing" type="url" value={form.originalListing} onChange={set("originalListing")} /><TextField className="is-wide" label="Notes" multiline value={form.notes} onChange={set("notes")} /></> : null}
      {(type === "lot" && step === 0) ? <><SelectField label="Related purchase" value={form.purchaseId} onChange={set("purchaseId")} options={[{ value: "", label: "No purchase selected" }, ...state.purchases.map((row) => ({ value: row.id, label: row.title }))]} /><TextField label="Lot title" required value={form.title} onChange={set("title")} error={!form.title && error ? "Lot title is required." : ""} /><TextField label="Total lot cost" type="number" inputMode="decimal" min="0" step="0.01" value={form.totalLotCost} onChange={set("totalLotCost")} /></> : null}
      {(type === "lot" && step === 1) ? <><SelectField label="Allocation method" value={form.allocationMethod} onChange={set("allocationMethod")} options={COST_ALLOCATION_METHODS} helper="Automatic methods apply after inventory items are attached to this lot." /><TextField className="is-wide" label="Notes" multiline value={form.notes} onChange={set("notes")} /></> : null}
      {(type === "sale" && step === 0) ? <><SelectField label="Inventory item" required value={form.inventoryItemId} onChange={set("inventoryItemId")} error={!form.inventoryItemId && error ? "Choose an inventory item." : ""} options={[{ value: "", label: "Choose inventory" }, ...state.inventory.map((row) => ({ value: row.id, label: `${row.name} · qty ${availableInventoryQuantity(row, state.sales)}` }))]} /><TextField label="Quantity sold" type="number" inputMode="numeric" min="1" value={form.quantitySold} onChange={set("quantitySold")} /><TextField label="Sales channel" value={form.salesChannel} onChange={set("salesChannel")} /><TextField label="Sale date" type="date" value={form.saleDate} onChange={set("saleDate")} /><TextField label="Gross sale price" type="number" inputMode="decimal" min="0" step="0.01" value={form.grossSalePrice} onChange={set("grossSalePrice")} /></> : null}
      {(type === "sale" && step === 1) ? <><TextField label="Discounts" type="number" inputMode="decimal" min="0" step="0.01" value={form.discounts} onChange={set("discounts")} /><TextField label="Selling fees" type="number" inputMode="decimal" min="0" step="0.01" value={form.sellingFees} onChange={set("sellingFees")} /><TextField label="Payment fees" type="number" inputMode="decimal" min="0" step="0.01" value={form.paymentFees} onChange={set("paymentFees")} /><TextField label="Shipping charged to buyer" type="number" inputMode="decimal" min="0" step="0.01" value={form.shippingChargedToBuyer} onChange={set("shippingChargedToBuyer")} /><TextField label="Actual outbound shipping" type="number" inputMode="decimal" min="0" step="0.01" value={form.actualOutboundShipping} onChange={set("actualOutboundShipping")} /><TextField label="Packaging" type="number" inputMode="decimal" min="0" step="0.01" value={form.packaging} onChange={set("packaging")} /><TextField label="Allocated cost of goods sold" helper={selectedInventory?.provenanceManaged === true ? "Exact from the owner-confirmed acquisition lot; this value cannot be overridden." : suggestedCogs ? `Suggested: ${money(suggestedCogs)}` : "Enter the cost assigned to the sold quantity."} type="number" inputMode="decimal" min="0" step="0.01" value={selectedInventory?.provenanceManaged === true ? suggestedCogs : form.allocatedCostOfGoodsSold} onChange={set("allocatedCostOfGoodsSold")} disabled={selectedInventory?.provenanceManaged === true} /></> : null}
      {(type === "sale" && step === 2) ? <><SelectField label="Sale status" value={form.status} onChange={set("status")} options={SALE_STATUSES} /><div className="sale-result-preview" role="status"><span>Quantity check<strong>{quantityCheck.message || "Choose inventory"}</strong></span><span>Net proceeds<strong>{money(saleResult.netProceeds)}</strong></span><span>Realized profit<strong>{money(saleResult.realizedProfit)}</strong></span><span>Realized ROI<strong>{roi(saleResult.realizedRoi)}</strong></span></div><TextField className="is-wide" label="Notes" multiline value={form.notes} onChange={set("notes")} /></> : null}
      {(type === "expense" && step === 0) ? <><TextField label="Date" type="date" value={form.date} onChange={set("date")} /><SelectField label="Category" value={form.category} onChange={set("category")} options={EXPENSE_CATEGORIES} /><TextField label="Merchant" value={form.merchant} onChange={set("merchant")} /><TextField label="Description" required value={form.description} onChange={set("description")} /><TextField label="Amount" type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={set("amount")} /><TextField label="Payment method" value={form.paymentMethod} onChange={set("paymentMethod")} /></> : null}
      {(type === "expense" && step === 1) ? <><TextField label="Business percentage" type="number" inputMode="decimal" min="0" max="100" value={form.businessPercentage} onChange={set("businessPercentage")} helper="Bookkeeping estimate only." /><TextField label="Receipt reference" value={form.receiptReference} onChange={set("receiptReference")} /><TextField className="is-wide" label="Notes" multiline value={form.notes} onChange={set("notes")} /></> : null}
      {(type === "mileage" && step === 0) ? <><TextField label="Date" type="date" value={form.date} onChange={set("date")} /><TextField label="Start location" value={form.startLocation} onChange={set("startLocation")} /><TextField label="Destination" value={form.destination} onChange={set("destination")} /><TextField label="Purpose" required value={form.purpose} onChange={set("purpose")} /><TextField label="Miles" type="number" inputMode="decimal" min="0" step="0.1" value={form.miles} onChange={set("miles")} /></> : null}
      {(type === "mileage" && step === 1) ? <><SelectField label="Related record type" value={form.relatedRecordType} onChange={set("relatedRecordType")} options={[{ value: "", label: "No related record" }, "auction", "purchase", "sale", "inventory"]} /><TextField label="Related record ID" value={form.relatedRecordId} onChange={set("relatedRecordId")} /><TextField className="is-wide" label="Notes" multiline value={form.notes} onChange={set("notes")} /></> : null}
    </div></div>
  </GuidedFormPage>;
}

function CollectionItemDetail({ item, onBack, onPurpose, onEdit, onDelete }) {
  const normalized = normalizeOwnedItem(item);
  const cost = acquisitionCost(item);
  const managed = item.provenanceManaged === true;
  return <RecordDetailPage eyebrow="Collection item" title={recordTitle(item)} status={normalized.ownedItemPurpose.replaceAll("_", " ").toLowerCase()} statusTone={normalized.ownedItemPurpose === OWNED_ITEM_PURPOSES.UNASSIGNED ? "warning" : "info"} image={recordImage(item)} identity={[item.productClassification, item.setName, item.cardNumber].filter(Boolean).join(" · ") || "Identification is incomplete."} summary={[{ label: "Acquisition cost", value: cost == null ? "Not recorded" : money(cost), numeric: true }, { label: "Projected resale", value: money(item.projectedResaleMid) }, { label: "Condition", value: item.condition || "Not recorded" }, { label: "Storage", value: item.storageLocation || "Not assigned" }]} primaryAction={managed ? null : <PrimaryButton onClick={() => onPurpose(item, OWNED_ITEM_PURPOSES.FOR_RESALE)}>Sell This Item</PrimaryButton>} secondaryActions={managed ? null : <><QuietButton onClick={() => onEdit(item)}>Edit</QuietButton>{item._recordOrigin === "repository" ? <QuietButton onClick={() => onDelete(item)}>Delete</QuietButton> : null}</>} sections={[...itemDetailSections(item), ...(managed ? [{ title: "Acquisition provenance", description: "This owner-confirmed lot can be corrected only through append-only Inventory adjustments.", children: <DetailList items={[{ label: "Purchase", value: item.purchaseId }, { label: "Inventory lot", value: item.inventoryLotId }]} /> }] : [{ title: "Purpose assignment", description: "Purpose controls where this owned item appears.", children: <PurposeActions item={item} onChange={onPurpose} /> }])]} timeline={itemTimeline(item)} onBack={onBack} />;
}

export function CollectionWorkspace({ items = [], initialView = "collection", onViewChange, onAddItem, onChangePurpose, onSellItem, featureControls = EMPTY_FEATURE_CONTROLS }) {
  const { state, error, saveRecord, removeRecord } = useBusinessRepository();
  const [view, setView] = useState(initialView);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  useEffect(() => {
    setView(initialView);
    setSelected(null);
    setForm(null);
    setFiltersOpen(false);
  }, [initialView]);
  const allItems = useMemo(() => mergeRecords(state.inventory, items).map(normalizeOwnedItem), [items, state.inventory]);
  const visible = useMemo(() => allItems.filter((item) => (!query || [recordTitle(item), item.setName, item.cardNumber, item.storageLocation].join(" ").toLowerCase().includes(query.toLowerCase())) && (!conditionFilter || item.condition === conditionFilter)), [allItems, conditionFilter, query]);
  const collectionItems = visible.filter((item) => item.ownedItemPurpose === OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION);
  const heldItems = visible.filter((item) => item.ownedItemPurpose === OWNED_ITEM_PURPOSES.HOLD);
  const unassigned = allItems.filter((item) => item.ownedItemPurpose === OWNED_ITEM_PURPOSES.UNASSIGNED);
  const grading = visible.filter((item) => item.gradingCompany || item.grade || /graded/i.test(item.productClassification || ""));
  const sets = Object.entries(collectionItems.reduce((groups, item) => { const key = item.setName || (/binder/i.test(item.productClassification || "") ? recordTitle(item) : ""); if (key) (groups[key] ||= []).push(item); return groups; }, {}));
  const secondaryDestinations = [{ key: "sets", label: "Sets & Binders" }, { key: "wishlist", label: "Wishlist" }, featureControls.grading !== false ? { key: "grading", label: "Grading" } : null].filter(Boolean);
  const collectionMoreItems = [...secondaryDestinations, ...(unassigned.length ? [{ key: "unassigned", label: `Unassigned Review (${unassigned.length})` }] : [])];
  const valuedCollectionItems = collectionItems.filter((item) => item.projectedResaleMid !== "" && item.projectedResaleMid != null && Number.isFinite(Number(item.projectedResaleMid)));
  const estimatedCollectionValue = valuedCollectionItems.reduce((sum, item) => sum + Number(item.projectedResaleMid), 0);
  const changeView = (next) => { setSelected(null); setView(next); onViewChange?.(next); };
  const chooseCollectionUtility = (next) => {
    if (next === "unassigned") {
      setSelected(unassigned[0] || null);
      return;
    }
    changeView(next);
  };
  const changePurpose = async (item, nextPurpose) => {
    if (item.provenanceManaged === true) return;
    if (item._recordOrigin === "repository") {
      const changed = changeOwnedItemPurpose(item, nextPurpose, { changedBy: "owner", reason: nextPurpose === OWNED_ITEM_PURPOSES.FOR_RESALE ? "Sell This Item from Collection" : "Purpose assigned in Collection" });
      const saved = await saveRecord("inventory", changed, "Item purpose changed");
      if (saved) setSelected({ ...saved, _recordOrigin: "repository" });
    } else if (onChangePurpose) {
      onChangePurpose(item, nextPurpose);
      setSelected({ ...changeOwnedItemPurpose(item, nextPurpose, { changedBy: "owner", reason: "Purpose assigned in Collection" }), _recordOrigin: "legacy" });
    } else if (nextPurpose === OWNED_ITEM_PURPOSES.FOR_RESALE) onSellItem?.(item);
  };
  if (form) return <RecordForm key={`${form.type}-${form.seed?.id || "new"}`} type={form.type} seed={form.seed} state={state} onSave={async (collection, record, message) => { const saved = await saveRecord(collection, record, message); if (saved) setSelected({ ...saved, _recordOrigin: "repository" }); return saved; }} onCancel={() => setForm(null)} />;
  if (selected) return <CollectionItemDetail item={selected} onBack={() => setSelected(null)} onPurpose={changePurpose} onEdit={(item) => setForm({ type: "collection", seed: item })} onDelete={async (item) => { if (await removeRecord("inventory", item)) setSelected(null); }} />;
  const cardsFor = (records) => records.map((item) => <RecordListCard key={item.id} record={item} eyebrow={[item.setName, item.productClassification].filter(Boolean).join(" · ") || "Owned item"} status={item.ownedItemPurpose === OWNED_ITEM_PURPOSES.UNASSIGNED ? "Needs purpose" : ""} statusTone="warning" facts={[{ label: item.condition ? "Condition" : "Quantity", value: item.condition || item.quantity || 1 }, { label: "Estimated value", value: item.projectedResaleMid !== "" && item.projectedResaleMid != null ? money(item.projectedResaleMid) : "" }]} onOpen={setSelected} />);
  return <main className="everyday-workspace" data-testid="collection-workspace">
    <PageHeader eyebrow="Owned items" title={view === "collection" ? "Collection" : secondaryDestinations.find((item) => item.key === view)?.label || "Collection"} actions={<PrimaryButton onClick={() => setForm({ type: "collection", seed: {} })}>Add Item</PrimaryButton>} />
    {view !== "collection" ? <div className="everyday-secondary-navigation"><button type="button" onClick={() => changeView("collection")}>Back to Collection</button><WorkspaceMoreMenu items={collectionMoreItems} active={view} onChange={chooseCollectionUtility} /></div> : null}
    {error ? <p className="compatibility-note" role="alert">{error}</p> : null}
    {view === "collection" ? <><div className="everyday-toolbar"><SearchField label="Search collection" value={query} onChange={setQuery} enterKeyHint="search" autoComplete="off" /><FilterButton active={filtersOpen || Boolean(conditionFilter)} onClick={() => setFiltersOpen(true)}>Filter</FilterButton></div><div className="everyday-collection-summary"><MetricRow items={[{ label: "Items", value: collectionItems.length }, ...(valuedCollectionItems.length ? [{ label: "Estimated Value", value: money(estimatedCollectionValue), numeric: true }] : [])]} /><WorkspaceMoreMenu items={collectionMoreItems} active={view} onChange={chooseCollectionUtility} /></div><section aria-label="Collection items">{collectionItems.length ? <div className="everyday-record-list">{cardsFor(collectionItems)}</div> : <EmptyState title="No collection items yet" action={<PrimaryButton onClick={() => setForm({ type: "collection", seed: {} })}>Add Item</PrimaryButton>}>Add an item or assign an existing item to Personal collection.</EmptyState>}</section></> : null}
    {view === "sets" ? <section><SectionHeader title="Sets & Binders" description="Grouped from real set and binder fields." />{sets.length ? <div className="everyday-group-list">{sets.map(([name, records]) => <RecordCard key={name}><h3>{name}</h3><p>{records.length} item{records.length === 1 ? "" : "s"}</p><QuietButton onClick={() => setSelected(records[0])}>Open Items</QuietButton></RecordCard>)}</div> : <EmptyState title="No set or binder groups">Add a set name or binder classification to an owned item.</EmptyState>}</section> : null}
    {view === "wishlist" ? <section><SectionHeader title="Wishlist" description="Owned targets currently assigned to Hold." />{heldItems.length ? <div className="everyday-record-list">{cardsFor(heldItems)}</div> : <EmptyState title="Your wishlist is empty">Assign an item to Hold to keep it here.</EmptyState>}</section> : null}
    {view === "grading" ? <section><SectionHeader title="Grading" description="Recorded grading candidates and graded items only." />{grading.length ? <div className="everyday-record-list">{cardsFor(grading)}</div> : <EmptyState title="No grading records">Add grading company, grade, or a graded classification to an item.</EmptyState>}</section> : null}
    <BottomSheet open={filtersOpen} title="Filter collection" onClose={() => setFiltersOpen(false)}><SelectField label="Condition" value={conditionFilter} onChange={setConditionFilter} options={[{ value: "", label: "All conditions" }, ...[...new Set(allItems.map((item) => item.condition).filter(Boolean))]]} /><QuietButton onClick={() => { setConditionFilter(""); setFiltersOpen(false); }}>Clear Filter</QuietButton></BottomSheet>
  </main>;
}

function BusinessDetail({ type, record, state, onBack, onEdit, onDelete, onMoveToCollection, onOpenRelated, onAllocate }) {
  const purchase = type === "purchase";
  const lot = type === "lot";
  const inventory = type === "inventory";
  const sale = type === "sale";
  const expense = type === "expense";
  const linkedLots = purchase ? state.lots.filter((row) => row.purchaseId === record.id) : [];
  const linkedInventory = purchase ? state.inventory.filter((row) => row.purchaseId === record.id) : lot ? state.inventory.filter((row) => row.lotId === record.id) : [];
  const linkedSales = inventory ? state.sales.filter((row) => row.inventoryItemId === record.id) : [];
  const result = sale ? calculateSaleResults(record) : null;
  const saleReporting = sale && record.costAuthority === "INTEGER_MINOR_UNITS" ? getSaleReportingProjection(record, state) : null;
  const reconciliation = lot ? reconcileLotAllocations(record.totalLotCost, linkedInventory) : null;
  const summary = purchase ? [{ label: "Purchase cost", value: money(record.totalPurchaseCost), numeric: true }, { label: "Lots", value: linkedLots.length }, { label: "Inventory items", value: linkedInventory.length }, { label: "Date", value: dateLabel(record.purchaseDate) }]
    : lot ? [{ label: "Lot cost", value: money(reconciliation.totalCost), numeric: true }, { label: "Allocated", value: money(reconciliation.allocatedCost), numeric: true }, { label: "Unallocated", value: money(reconciliation.unallocatedCost), numeric: true }, { label: "Items", value: linkedInventory.length }]
      : inventory ? [{ label: "Quantity available", value: availableInventoryQuantity(record, linkedSales) }, { label: "Available cost", value: money(acquisitionCost(record, linkedSales)), numeric: true }, { label: "Projected resale", value: money(record.projectedResaleMid), numeric: true }, { label: "Sales", value: linkedSales.length }]
        : sale ? [{ label: "Gross", value: money(record.grossSalePrice), numeric: true }, { label: "Net proceeds", value: money(record.netProceeds ?? result.netProceeds), numeric: true }, { label: "Realized profit", value: money(saleReporting?.effectiveProfit ?? record.realizedProfit ?? result.realizedProfit), numeric: true }, { label: "Realized ROI", value: roi(saleReporting?.effectiveRoi ?? record.realizedRoi ?? result.realizedRoi), numeric: true }]
          : expense ? [{ label: "Amount", value: money(record.amount), numeric: true }, { label: "Business estimate", value: `${number(record.businessPercentage)}%` }, { label: "Date", value: dateLabel(record.date) }, { label: "Receipt", value: record.receiptReference || "Missing" }]
            : [{ label: "Miles", value: `${number(record.miles)} mi`, numeric: true }, { label: "Date", value: dateLabel(record.date) }, { label: "Start", value: record.startLocation || "Not recorded" }, { label: "Destination", value: record.destination || "Not recorded" }];
  const details = purchase ? [{ label: "Source", value: record.source }, { label: "Original listing", value: record.originalListing }, { label: "Notes", value: record.notes }]
    : lot ? [{ label: "Allocation method", value: COST_ALLOCATION_METHODS.find((method) => method.value === record.allocationMethod)?.label || record.allocationMethod }, { label: "Reconciliation", value: reconciliation.reconciled ? "Reconciled" : reconciliation.warning }, { label: "Notes", value: record.notes }]
      : inventory ? itemDetailGroups(record).flatMap((group) => group.items)
        : sale ? [{ label: "Sales channel", value: record.salesChannel }, { label: "Sale date", value: dateLabel(record.saleDate) }, { label: "Quantity sold", value: record.quantitySold }, { label: "Selling fees", value: money(record.sellingFees) }, { label: "Outbound shipping", value: money(record.actualOutboundShipping) }, { label: "Packaging", value: money(record.packaging) }, { label: "Original cost of goods sold", value: money(saleReporting?.originalCogs ?? record.allocatedCostOfGoodsSold) }, ...(saleReporting?.hasReconciliation ? [{ label: "Append-only COGS adjustment", value: money(saleReporting.cogsAdjustment) }, { label: "Effective cost of goods sold", value: money(saleReporting.effectiveCogs) }] : []), { label: "Notes", value: record.notes }]
          : expense ? [{ label: "Category", value: record.category }, { label: "Merchant", value: record.merchant }, { label: "Description", value: record.description }, { label: "Payment method", value: record.paymentMethod }, { label: "Related record", value: record.relatedRecordId }, { label: "Notes", value: record.notes }]
            : [{ label: "Purpose", value: record.purpose }, { label: "Related record", value: record.relatedRecordId }, { label: "Notes", value: record.notes }];
  const relatedRows = [...linkedLots.map((row) => ({ ...row, _type: "lot" })), ...linkedInventory.map((row) => ({ ...row, _type: "inventory" })), ...linkedSales.map((row) => ({ ...row, _type: "sale" }))];
  const typeLabel = { purchase: "Purchase", lot: "Purchase lot", inventory: "Inventory item", sale: "Sale", expense: "Expense", mileage: "Mileage" }[type];
  const canApplyAllocation = lot && !reconciliation.reconciled && record.allocationMethod !== "manual";
  const managedSale = sale && state.inventory.some((item) => item.id === record.inventoryItemId && item.provenanceManaged === true)
    && !["draft", "cancelled"].includes(String(record.status || "").toLowerCase());
  const managed = record.provenanceManaged === true || managedSale;
  const primaryIsEdit = !inventory && !canApplyAllocation;
  return <RecordDetailPage eyebrow={typeLabel} title={recordTitle(record)} status={lot ? reconciliation.reconciled ? "Reconciled" : "Needs allocation" : record.status || "Recorded"} statusTone={lot && !reconciliation.reconciled ? "warning" : "neutral"} image={recordImage(record)} identity={inventory ? [record.productClassification, record.setName, record.cardNumber].filter(Boolean).join(" · ") : record.source || record.salesChannel || record.merchant || record.purpose || "Business record"} summary={summary} primaryAction={managed ? null : inventory ? <PrimaryButton onClick={() => onMoveToCollection(record)}>Move to Collection</PrimaryButton> : canApplyAllocation ? <PrimaryButton onClick={() => onAllocate(record, record.allocationMethod)}>Apply Allocation</PrimaryButton> : <PrimaryButton onClick={() => onEdit(type, record)}>Edit</PrimaryButton>} secondaryActions={managed ? null : <>{!primaryIsEdit ? <QuietButton onClick={() => onEdit(type, record)}>Edit</QuietButton> : null}{record._recordOrigin !== "legacy" ? <QuietButton onClick={() => onDelete(type, record)}>Delete</QuietButton> : null}</>} sections={[{ title: "Details", description: managed ? "Owner-confirmed acquisition metadata is protected from generic editing and deletion." : "Recorded information and assumptions.", children: <DetailList items={details} /> }]} timeline={[record.updatedAt ? { id: "updated", title: "Record updated", date: dateLabel(record.updatedAt) } : null, record.createdAt ? { id: "created", title: "Record created", date: dateLabel(record.createdAt) } : null].filter(Boolean)} related={relatedRows.length ? <div className="related-record-list">{relatedRows.map((row) => <QuietButton key={`${row._type}-${row.id}`} onClick={() => onOpenRelated(row._type, row)}>{recordTitle(row)}</QuietButton>)}</div> : null} onBack={onBack} />;
}

export function BusinessWorkspace({ items = [], purchases = [], sales = [], expenses = [], mileage = [], initialView = "overview", initialMoneyView = "expenses", onViewChange, onMoneyViewChange, onMoveToCollection }) {
  const repository = useBusinessRepository();
  const { state, error, saveRecord, removeRecord, allocateLot } = repository;
  const [view, setView] = useState(initialView);
  const [moneyView, setMoneyViewState] = useState(initialMoneyView);
  const setMoneyView = (next) => {
    setMoneyViewState(next);
    onMoneyViewChange?.(next);
  };
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    setView(initialView);
    setSelected(null);
    setForm(null);
    setFiltersOpen(false);
  }, [initialView]);
  useEffect(() => {
    setMoneyViewState(initialMoneyView);
  }, [initialMoneyView]);
  const allPurchases = useMemo(() => mergeRecords(state.purchases, purchases), [purchases, state.purchases]);
  const allInventory = useMemo(() => mergeRecords(state.inventory, items).filter((item) => inferOwnedItemPurpose(item) === OWNED_ITEM_PURPOSES.FOR_RESALE), [items, state.inventory]);
  const allSales = useMemo(() => mergeRecords(state.sales, sales), [sales, state.sales]);
  const allExpenses = useMemo(() => mergeRecords(state.expenses, expenses), [expenses, state.expenses]);
  const allMileage = useMemo(() => mergeRecords(state.mileage, mileage), [mileage, state.mileage]);
  const businessDestinations = [{ key: "purchases", label: "Purchases", detail: "Owner-reviewed drafts and receiving" }, { key: "inventory", label: "Inventory", detail: "Items for resale" }, { key: "sales", label: "Sales", detail: "Proceeds and profit" }, { key: "money", label: "Money", detail: "Expenses and records" }, { key: "compliance", label: "Compliance", detail: "Registration, taxes, licenses, deadlines" }];
  const moneyTabs = [{ key: "expenses", label: "Expenses" }, { key: "mileage", label: "Mileage" }, { key: "reports", label: "Reports" }];
  const changeView = (next) => { setSelected(null); setView(next); onViewChange?.(next); };
  const findRecord = (type, record) => {
    const map = { purchase: allPurchases, lot: state.lots, inventory: allInventory, sale: allSales, expense: allExpenses, mileage: allMileage };
    return map[type]?.find((row) => row.id === record.id) || record;
  };
  const openDetail = (type, record) => setSelected({ type, record: findRecord(type, record) });
  const managedSale = (type, record) => type === "sale" && state.inventory.some((item) => item.id === record.inventoryItemId && item.provenanceManaged === true)
    && !["draft", "cancelled"].includes(String(record.status || "").trim().toLowerCase());
  const editRecord = (type, record) => { if (record.provenanceManaged !== true && !managedSale(type, record)) setForm({ type: type === "purchase" ? "purchase" : type, seed: record }); };
  const deleteRecord = async (type, record) => { const collection = { purchase: "purchases", lot: "lots", inventory: "inventory", sale: "sales", expense: "expenses", mileage: "mileage" }[type]; if (record._recordOrigin === "legacy" || record.provenanceManaged === true || managedSale(type, record)) return; if (await removeRecord(collection, record)) setSelected(null); };
  const moveToCollection = (record) => {
    if (record.provenanceManaged === true) return;
    if (record._recordOrigin === "repository") saveRecord("inventory", changeOwnedItemPurpose(record, OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION, { changedBy: "owner", reason: "Moved from Business to Collection" }), "Item moved to Collection");
    else onMoveToCollection?.(record);
    setSelected(null);
  };
  const formState = useMemo(() => ({ ...state, purchases: allPurchases, inventory: allInventory, sales: allSales, expenses: allExpenses, mileage: allMileage }), [allExpenses, allInventory, allMileage, allPurchases, allSales, state]);
  if (form) return <RecordForm key={`${form.type}-${form.seed?.id || "new"}`} type={form.type} seed={form.seed} state={formState} onSave={saveRecord} onCancel={() => setForm(null)} />;
  if (selected) return <BusinessDetail type={selected.type} record={selected.record} state={formState} onBack={() => setSelected(null)} onEdit={editRecord} onDelete={deleteRecord} onMoveToCollection={moveToCollection} onOpenRelated={openDetail} onAllocate={allocateLot} />;
  if (view === "compliance") return <BusinessCompliancePage onBack={() => changeView("overview")} />;
  const filtered = (records) => records.filter((record) => !query || recordTitle(record).toLowerCase().includes(query.toLowerCase()));
  const purchaseCost = allPurchases.reduce((sum, row) => sum + number(row.totalPurchaseCost), 0);
  const inventoryCost = allInventory.reduce((sum, row) => sum + number(acquisitionCost(row, allSales)), 0);
  const projectedResale = allInventory.reduce((sum, row) => sum + number(row.projectedResaleMid), 0);
  const completedSales = allSales.filter((row) => String(row.status || "").trim().toLowerCase() === "completed");
  const grossSales = completedSales.reduce((sum, row) => sum + number(row.grossSalePrice), 0);
  const completedSaleReporting = completedSales.map((row) => getSaleReportingProjection(row, formState));
  const realizedProfit = completedSaleReporting.reduce((sum, row) => sum + row.effectiveProfit, 0);
  const realizedCogsAdjustment = completedSaleReporting.reduce((sum, row) => sum + row.cogsAdjustment, 0);
  const unallocatedLots = state.lots.map((lot) => ({ lot, reconciliation: reconcileLotAllocations(lot.totalLotCost, state.inventory.filter((item) => item.lotId === lot.id)) })).filter((row) => !row.reconciliation.reconciled);
  const missingInventoryCost = allInventory.filter((row) => acquisitionCost(row, allSales) == null);
  const draftSales = allSales.filter((row) => String(row.status || "").trim().toLowerCase() === "draft");
  const missingReceipts = allExpenses.filter((row) => !row.receiptReference);
  const businessAttention = [
    { label: "Lots needing allocation", count: unallocatedLots.length, view: "purchases" },
    { label: "Inventory missing cost", count: missingInventoryCost.length, view: "inventory" },
    { label: "Sales drafts", count: draftSales.length, view: "sales" },
    { label: "Expenses missing receipts", count: missingReceipts.length, view: "money", moneyView: "expenses" },
  ].filter((row) => row.count > 0);
  const recordCards = (type, records, facts) => filtered(records).slice(0, 24).map((record) => <RecordListCard key={record.id} record={record} eyebrow={{ purchase: "Purchase", lot: "Purchase lot", inventory: record.productClassification || "Inventory", sale: record.salesChannel || "Sale", expense: record.category || "Expense", mileage: "Mileage" }[type]} status={type === "lot" ? reconcileLotAllocations(record.totalLotCost, state.inventory.filter((item) => item.lotId === record.id)).reconciled ? "Reconciled" : "Needs allocation" : record.status || "Recorded"} statusTone={type === "lot" && !reconcileLotAllocations(record.totalLotCost, state.inventory.filter((item) => item.lotId === record.id)).reconciled ? "warning" : "neutral"} facts={facts(record)} onOpen={(row) => openDetail(type, row)} />);
  return <main className="everyday-workspace" data-testid="business-workspace">
    <PageHeader eyebrow="Business records" title={view === "overview" ? "Business" : businessDestinations.find((item) => item.key === view)?.label || "Business"} />
    {view === "overview" ? <><nav className="business-destination-grid" aria-label="Business destinations">{businessDestinations.map((item) => <button key={item.key} type="button" onClick={() => changeView(item.key)}><strong>{item.label}</strong><span>{item.detail}</span></button>)}</nav>{businessAttention.length ? <section className="business-attention-section"><SectionHeader title="Needs Attention" /><div className="business-attention-list">{businessAttention.map((item) => <button key={item.label} type="button" onClick={() => { if (item.moneyView) setMoneyView(item.moneyView); changeView(item.view); }}><span>{item.label}</span><strong>{item.count}</strong><span aria-hidden="true">›</span></button>)}</div></section> : null}</> : <button type="button" className="everyday-back-button" onClick={() => changeView("overview")}>Back to Business</button>}
    {error ? <p className="compatibility-note" role="alert">{error}</p> : null}
    {view === "purchases" ? <><section className="everyday-action-section"><SectionHeader title="Purchases" description="Acquisitions, lots, and cost allocation." actions={<PrimaryButton onClick={() => setForm({ type: "purchase", seed: {} })}>Record Purchase</PrimaryButton>} /></section>{unallocatedLots.length ? <section className="everyday-attention"><SectionHeader title="Needs attention" description={`${unallocatedLots.length} purchase lot${unallocatedLots.length === 1 ? " has" : "s have"} unreconciled cost.`} actions={<PrimaryButton onClick={() => openDetail("lot", unallocatedLots[0].lot)}>Review Allocation</PrimaryButton>} /></section> : null}<MetricRow items={[{ label: "Purchases", value: allPurchases.length }, { label: "Capital recorded", value: money(purchaseCost), numeric: true }, { label: "Purchase lots", value: state.lots.length }, { label: "Unallocated lots", value: unallocatedLots.length, tone: unallocatedLots.length ? "warning" : "neutral" }]} /><section><SectionHeader title="Recent purchases" description="Open a purchase to process its lots and related inventory." />{allPurchases.length ? <div className="everyday-record-list">{recordCards("purchase", allPurchases, (row) => [{ label: "Cost", value: money(row.totalPurchaseCost) }, { label: "Date", value: dateLabel(row.purchaseDate) }, { label: "Source", value: row.source || "Not recorded" }])}</div> : <EmptyState title="No purchases recorded" action={<PrimaryButton onClick={() => setForm({ type: "purchase", seed: {} })}>Record Purchase</PrimaryButton>}>Record a real acquisition when inventory is purchased.</EmptyState>}</section><section><SectionHeader title="Lot processing" description="Split purchases and reconcile cost without changing the original purchase." actions={<QuietButton onClick={() => setForm({ type: "lot", seed: {} })}>Create Lot</QuietButton>} />{state.lots.length ? <div className="everyday-record-list">{recordCards("lot", state.lots, (row) => { const result = reconcileLotAllocations(row.totalLotCost, state.inventory.filter((item) => item.lotId === row.id)); return [{ label: "Lot cost", value: money(result.totalCost) }, { label: "Allocated", value: money(result.allocatedCost) }, { label: "Unallocated", value: money(result.unallocatedCost) }]; })}</div> : <EmptyState title="No purchase lots">Create a lot only when a purchase must be split into multiple inventory records.</EmptyState>}</section></> : null}
    {view === "inventory" ? <><section className="everyday-action-section"><SectionHeader title="Inventory" description="Items whose current purpose is For resale." actions={<PrimaryButton onClick={() => setForm({ type: "inventory", seed: {} })}>Add Resale Inventory</PrimaryButton>} /></section>{missingInventoryCost.length ? <section className="everyday-attention"><SectionHeader title="Needs attention" description={`${missingInventoryCost.length} inventory item${missingInventoryCost.length === 1 ? " is" : "s are"} missing an acquisition cost.`} actions={<PrimaryButton onClick={() => openDetail("inventory", missingInventoryCost[0])}>Review Item</PrimaryButton>} /></section> : null}<MetricRow items={[{ label: "Inventory records", value: allInventory.length }, { label: "Units on hand", value: allInventory.reduce((sum, row) => sum + availableInventoryQuantity(row, allSales), 0) }, { label: "Recorded cost", value: money(inventoryCost), numeric: true }, { label: "Projected resale", value: projectedResale ? money(projectedResale) : "Not enough data", numeric: true }]} /><section><SectionHeader title="Current inventory" description="Open an item for cost, storage, purpose, and sales history." actions={<FilterButton active={filtersOpen} onClick={() => setFiltersOpen(true)}>Search</FilterButton>} />{allInventory.length ? <div className="everyday-record-list">{recordCards("inventory", allInventory, (row) => [{ label: "Quantity available", value: availableInventoryQuantity(row, allSales) }, { label: "Available cost", value: money(acquisitionCost(row, allSales)) }, { label: "Projected resale", value: money(row.projectedResaleMid) }, { label: "Storage", value: row.storageLocation || "Not assigned" }])}</div> : <EmptyState title="No resale inventory" action={<PrimaryButton onClick={() => setForm({ type: "inventory", seed: {} })}>Add Resale Inventory</PrimaryButton>}>Move a Collection item to resale or add acquired inventory.</EmptyState>}</section></> : null}
    {view === "sales" ? <><section className="everyday-action-section"><SectionHeader title="Sales" description="Completed sales and drafts; drafts never remove inventory. Confirmed reconciliations adjust reporting without changing original Sale records." actions={<PrimaryButton onClick={() => setForm({ type: "sale", seed: {} })}>Record Sale</PrimaryButton>} /></section>{draftSales.length ? <section className="everyday-attention"><SectionHeader title="Needs attention" description={`${draftSales.length} sale draft${draftSales.length === 1 ? " is" : "s are"} not completed.`} actions={<PrimaryButton onClick={() => openDetail("sale", draftSales[0])}>Review Draft</PrimaryButton>} /></section> : null}<MetricRow items={[{ label: "Completed sales", value: completedSales.length }, { label: "Gross revenue", value: money(grossSales), numeric: true }, { label: "Realized profit", value: money(realizedProfit), numeric: true }, { label: "COGS adjustment", value: money(realizedCogsAdjustment), numeric: true }]} /><section><SectionHeader title="Recent sales" description="Open a sale for original proceeds and cost plus any append-only reporting reconciliation." />{allSales.length ? <div className="everyday-record-list">{recordCards("sale", allSales, (row) => { const reporting = getSaleReportingProjection(row, formState); return [{ label: "Gross", value: money(row.grossSalePrice) }, { label: "Net", value: money(row.netProceeds) }, { label: "Profit", value: money(reporting.effectiveProfit) }, { label: "Date", value: dateLabel(row.saleDate) }]; })}</div> : <EmptyState title="No sales recorded" action={<PrimaryButton onClick={() => setForm({ type: "sale", seed: {} })}>Record Sale</PrimaryButton>}>Record a real transaction or save a draft.</EmptyState>}</section></> : null}
    {view === "money" ? <><div className="everyday-money-navigation"><WorkspaceTabs label="Money sections" tabs={moneyTabs} active={moneyView} onChange={setMoneyView} /><WorkspaceMoreMenu label="More" items={[{ key: "reconciliation", label: "Reconciliation" }]} active={moneyView} onChange={setMoneyView} /></div>{moneyView === "expenses" ? <><section className="everyday-action-section"><SectionHeader title="Expenses" description="Business records and bookkeeping estimates, not tax conclusions." actions={<PrimaryButton onClick={() => setForm({ type: "expense", seed: {} })}>Add Expense</PrimaryButton>} /></section>{missingReceipts.length ? <section className="everyday-attention"><SectionHeader title="Needs attention" description={`${missingReceipts.length} expense${missingReceipts.length === 1 ? " is" : "s are"} missing a receipt reference.`} actions={<PrimaryButton onClick={() => openDetail("expense", missingReceipts[0])}>Review Expense</PrimaryButton>} /></section> : null}<MetricRow items={[{ label: "Expenses", value: allExpenses.length }, { label: "Recorded amount", value: money(allExpenses.reduce((sum, row) => sum + number(row.amount), 0)), numeric: true }, { label: "Missing receipts", value: missingReceipts.length }]} /><section><SectionHeader title="Recent expenses" />{allExpenses.length ? <div className="everyday-record-list">{recordCards("expense", allExpenses, (row) => [{ label: "Amount", value: money(row.amount) }, { label: "Merchant", value: row.merchant || "Not recorded" }, { label: "Date", value: dateLabel(row.date) }])}</div> : <EmptyState title="No expenses recorded" action={<PrimaryButton onClick={() => setForm({ type: "expense", seed: {} })}>Add Expense</PrimaryButton>}>Add actual business expenses and receipt references.</EmptyState>}</section></> : null}{moneyView === "mileage" ? <><section className="everyday-action-section"><SectionHeader title="Mileage" description="Factual trip records for bookkeeping review." actions={<PrimaryButton onClick={() => setForm({ type: "mileage", seed: {} })}>Add Mileage</PrimaryButton>} /></section><MetricRow items={[{ label: "Trips", value: allMileage.length }, { label: "Recorded miles", value: `${allMileage.reduce((sum, row) => sum + number(row.miles), 0).toFixed(1)} mi`, numeric: true }]} /><section><SectionHeader title="Recent trips" />{allMileage.length ? <div className="everyday-record-list">{recordCards("mileage", allMileage, (row) => [{ label: "Miles", value: `${number(row.miles)} mi` }, { label: "Date", value: dateLabel(row.date) }, { label: "Destination", value: row.destination || "Not recorded" }])}</div> : <EmptyState title="No mileage recorded" action={<PrimaryButton onClick={() => setForm({ type: "mileage", seed: {} })}>Add Mileage</PrimaryButton>}>Record sourcing, pickup, delivery, or other business trips.</EmptyState>}</section></> : null}{moneyView === "reports" ? <><section className="everyday-action-section"><SectionHeader title="Reports" description="Summaries use completed real records only." /></section><MetricRow items={[{ label: "Capital recorded", value: money(purchaseCost) }, { label: "Revenue", value: money(grossSales) }, { label: "Realized profit", value: money(realizedProfit) }, { label: "Expenses", value: money(allExpenses.reduce((sum, row) => sum + number(row.amount), 0)) }]} /><EmptyState title="Detailed reporting needs more completed records">Source and time-period reports will remain unavailable until their required records can be reconciled.</EmptyState></> : null}{moneyView === "reconciliation" ? <><section className="everyday-action-section"><SectionHeader title="Reconciliation" description="Resolve cost and receipt gaps before relying on reports." /></section>{unallocatedLots.length || missingInventoryCost.length || missingReceipts.length ? <div className="reconciliation-list">{unallocatedLots.map(({ lot }) => <RecordCard key={lot.id}><h3>{lot.title}</h3><p>Lot allocation does not reconcile.</p><PrimaryButton onClick={() => openDetail("lot", lot)}>Review Lot</PrimaryButton></RecordCard>)}{missingInventoryCost.map((row) => <RecordCard key={row.id}><h3>{recordTitle(row)}</h3><p>Inventory cost is missing.</p><PrimaryButton onClick={() => openDetail("inventory", row)}>Review Item</PrimaryButton></RecordCard>)}{missingReceipts.map((row) => <RecordCard key={row.id}><h3>{recordTitle(row)}</h3><p>Receipt reference is missing.</p><PrimaryButton onClick={() => openDetail("expense", row)}>Review Expense</PrimaryButton></RecordCard>)}</div> : <EmptyState title="Nothing to reconcile">Recorded lot allocations, inventory costs, and receipt references reconcile.</EmptyState>}</> : null}</> : null}
    <BottomSheet open={filtersOpen} title="Inventory search" onClose={() => setFiltersOpen(false)}><SearchField label="Search inventory" value={query} onChange={setQuery} enterKeyHint="search" autoComplete="off" /><QuietButton onClick={() => { setQuery(""); setFiltersOpen(false); }}>Clear Search</QuietButton></BottomSheet>
  </main>;
}
