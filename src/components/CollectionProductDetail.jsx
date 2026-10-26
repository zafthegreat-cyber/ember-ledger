import { useId } from "react";
import ItemPhoto from "./ItemPhoto.jsx";
import { PageHeader, QuietButton, SecondaryButton } from "./operations/OperationsUI.jsx";
import { DetailList } from "./operations/RecordExperience.jsx";
import WorkspaceTabs, { WorkspaceTabPanel } from "./operations/WorkspaceTabs.jsx";
import { inferOwnedItemPurpose, OWNED_ITEM_PURPOSE_OPTIONS } from "../features/ownedItems/ownedItemPurpose.js";
import { getRecordGameLabel } from "../utils/collectibleGames.mjs";
import { collectionCopyQuantity } from "../utils/collectionCopyGroups.mjs";
import { getPortfolioItemKey } from "../utils/collectionPortfolio.mjs";
import "./collection-product-detail.css";

const DETAIL_TABS = Object.freeze([{ key: "overview", label: "Overview" }, { key: "copies", label: "Copies" }]);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function itemTitle(item = {}) {
  return item.name || item.title || item.cardName || item.productName || "Untitled item";
}

function purchaseDate(record = {}) {
  const value = record.purchaseDate || record.purchase_date || record.acquisitionDate;
  if (!value) return "Not recorded";
  const source = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(source) ? `${source}T00:00:00` : source);
  if (Number.isNaN(date.getTime())) return source;
  return <time dateTime={source}>{date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>;
}

function acquisitionCost(record = {}) {
  // These are saved acquisition amounts. In particular, a saved lot amount is
  // displayed once for its record, never multiplied by the record's quantity.
  const value = record.allocatedItemCost ?? record.allocatedCost ?? record.totalPurchaseCost ?? record.purchasePrice ?? record.actualPurchasePrice;
  return value !== "" && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

function recordedCost(record, getAcquisitionCost) {
  const value = getAcquisitionCost(record);
  return value !== "" && value != null && Number.isFinite(Number(value)) ? currency.format(Number(value)) : "Not recorded";
}

function purposeForRecord(record, purposeCounts) {
  const purpose = inferOwnedItemPurpose(record);
  const summary = purposeCounts.find((entry) => entry.purpose === purpose);
  const label = summary?.label || OWNED_ITEM_PURPOSE_OPTIONS.find((entry) => entry.value === purpose)?.label || "Unassigned";
  return { label, shortLabel: summary?.shortLabel || (purpose === "PERSONAL_COLLECTION" ? "PC" : label) };
}

function PurposeBreakdown({ purposeCounts }) {
  return <ul className="collection-product-purposes" aria-label="Quantity by purpose">
    {purposeCounts.map((entry) => <li key={entry.purpose} aria-label={`${entry.label}: ${entry.quantity}`}><span>{entry.shortLabel || entry.label}</span><strong>{entry.quantity}</strong></li>)}
  </ul>;
}

/** A derived product view. Every editable action opens its original copy record. */
export default function CollectionProductDetail({ group, onBack, onOpenRecord, resolveItemImage, activeTab = "overview", onTabChange, showValues = true, hiddenValues = false, getAcquisitionCost = acquisitionCost }) {
  const tabsId = useId();
  if (!group?.item) return null;
  const item = group.item;
  const records = group.records || [];
  const purposeCounts = group.purposeCounts || [];
  const valuation = group.valuation || {};
  const knownValue = valuation.value !== "" && valuation.value != null && Number.isFinite(Number(valuation.value)) && valuation.knownCount > 0;
  const value = hiddenValues || !showValues ? "Value hidden" : knownValue ? currency.format(Number(valuation.value)) : "Not valued";
  const partialValue = knownValue && valuation.unknownCount > 0;
  const tab = activeTab === "copies" ? "copies" : "overview";
  const title = itemTitle(item);
  const identity = [getRecordGameLabel(item), item.setName || item.set_name, item.productClassification || item.productType || item.category].filter(Boolean).join(" · ");

  return <main className="collection-product-detail" data-testid="collection-product-detail">
    <QuietButton className="collection-product-back" onClick={onBack}><span aria-hidden="true">←</span>Back to collection</QuietButton>
    <PageHeader eyebrow="Collection product" title={title} description={identity} />
    <WorkspaceTabs id={tabsId} label="Product details" tabs={DETAIL_TABS} active={tab} onChange={onTabChange} />

    <WorkspaceTabPanel id={tabsId} value="overview" active={tab}>
      <section className="collection-product-overview" aria-label="Product overview">
        <div className="collection-product-photo"><ItemPhoto src={resolveItemImage?.(item) || ""} alt={title} fallbackClassName="collection-product-photo-fallback" loading="eager" /></div>
        <div className="collection-product-overview-copy">
          <dl className="collection-product-totals"><div><dt>Total quantity</dt><dd>{group.quantity}</dd></div><div><dt>{partialValue && !hiddenValues && showValues ? "Partial saved value" : "Total saved value"}</dt><dd>{value}</dd></div></dl>
          <PurposeBreakdown purposeCounts={purposeCounts} />
          {partialValue && !hiddenValues && showValues ? <p className="collection-product-note">Some copies do not have a saved value. This total includes only the values already recorded.</p> : null}
          <p className="collection-product-note">Open the Copies tab for each purchase date, cost and purpose.</p>
        </div>
      </section>
      <section className="collection-product-identification" aria-labelledby={`${tabsId}-identification`}><h2 id={`${tabsId}-identification`}>Product details</h2><DetailList items={[
        { label: "Trading card game", value: getRecordGameLabel(item) },
        { label: "Set", value: item.setName || item.set_name },
        { label: "Classification", value: item.productClassification || item.productType || item.category },
        { label: "Card number", value: item.cardNumber || item.card_number },
        { label: "Language", value: item.language },
      ]} /></section>
    </WorkspaceTabPanel>

    <WorkspaceTabPanel id={tabsId} value="copies" active={tab}>
      <section className="collection-product-copies" aria-labelledby={`${tabsId}-copies-title`}>
        <header><h2 id={`${tabsId}-copies-title`}>Your copies</h2><p>Qty {group.quantity} across {records.length} purchase record{records.length === 1 ? "" : "s"}. Each record keeps its own details.</p><PurposeBreakdown purposeCounts={purposeCounts} /></header>
        <ol className="collection-product-copy-list">
          {records.map((record, index) => {
            const purpose = purposeForRecord(record, purposeCounts);
            const quantity = collectionCopyQuantity(record);
            return <li key={`${record.id || "copy"}-${index}`}><article className="collection-product-copy" aria-labelledby={`${tabsId}-copy-${index}`}>
              <header><div><h3 id={`${tabsId}-copy-${index}`}>{purpose.shortLabel} · {quantity}</h3><p>{purpose.label}</p></div><span>Record {index + 1}</span></header>
              <DetailList items={[
                { label: "Purchase date", value: purchaseDate(record) },
                { label: "Recorded cost", value: hiddenValues ? "Cost hidden" : recordedCost(record, getAcquisitionCost), numeric: true },
                { label: "Purchase source", value: record.purchaseSource || record.purchase_source || record.source || "Not recorded" },
                { label: "Condition", value: record.condition },
                { label: "Grade", value: [record.gradingCompany, record.grade].filter(Boolean).join(" ") },
                { label: "Storage", value: record.storageLocation || record.storage_location },
              ]} />
              <SecondaryButton data-copy-record-key={getPortfolioItemKey(record)} onClick={(event) => onOpenRecord?.(record, event.currentTarget)} aria-label={`Open copy record ${index + 1}: ${purpose.label}, quantity ${quantity}`}>Open copy record<span aria-hidden="true"> →</span></SecondaryButton>
            </article></li>;
          })}
        </ol>
        <p className="collection-product-note">To edit, change purpose or remove a copy, open its original record. A record with multiple units stays together.</p>
      </section>
    </WorkspaceTabPanel>
  </main>;
}
