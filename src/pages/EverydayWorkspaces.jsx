import { useMemo, useState } from "react";
import {
  EmptyState,
  PageHeader,
  PrimaryButton,
  QuietButton,
  RecordCard,
  SectionHeader,
  StatusBadge,
} from "../components/operations/OperationsUI.jsx";
import {
  OWNED_ITEM_PURPOSES,
  inferOwnedItemPurpose,
  normalizeOwnedItem,
  summarizePurposeCompatibility,
} from "../features/ownedItems/ownedItemPurpose.js";
import "./everyday-workspaces.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const EMPTY_FEATURE_CONTROLS = Object.freeze({});

function itemTitle(item) {
  return item.title || item.name || item.cardName || item.productName || "Untitled item";
}

function itemImage(item) {
  return item.imageUrl || item.image || item.images?.[0]?.url || item.images?.[0] || "";
}

function itemCost(item) {
  const value = Number(item.allocatedItemCost ?? item.allocatedCost ?? item.totalPurchaseCost ?? item.purchasePrice);
  return Number.isFinite(value) ? value : null;
}

function WorkspaceTabs({ label, tabs, active, onChange }) {
  return (
    <div className="everyday-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={active === tab.key ? "is-active" : ""}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function OwnedItemCard({ item, action, actionLabel }) {
  const normalized = normalizeOwnedItem(item);
  const cost = itemCost(item);
  const image = itemImage(item);
  return (
    <RecordCard className="owned-item-card">
      {image ? <img src={image} alt="" loading="lazy" /> : <div className="owned-item-placeholder" aria-hidden="true">Item</div>}
      <div className="owned-item-card__body">
        <div className="owned-item-card__heading">
          <div><h3>{itemTitle(item)}</h3><p>{item.productClassification || item.condition || "Identification not completed"}</p></div>
          <StatusBadge tone={normalized.purposeSource === "explicit" ? "info" : "neutral"}>
            {normalized.purposeSource === "explicit" ? "Purpose saved" : "Legacy mapping"}
          </StatusBadge>
        </div>
        <dl>
          <div><dt>Purpose</dt><dd>{normalized.ownedItemPurpose.replaceAll("_", " ").toLowerCase()}</dd></div>
          <div><dt>Acquisition cost</dt><dd>{cost == null ? "Not recorded" : money.format(cost)}</dd></div>
          <div><dt>Source</dt><dd>{item.purchaseSource || item.source || "Not recorded"}</dd></div>
          <div><dt>Location</dt><dd>{item.storageLocation || "Not assigned"}</dd></div>
        </dl>
        {action ? <QuietButton onClick={() => action(item)}>{actionLabel}</QuietButton> : null}
      </div>
    </RecordCard>
  );
}

export function CollectionWorkspace({
  items = [],
  initialView = "collection",
  onViewChange,
  onAddItem,
  onSellItem,
  onOpenLegacyCollection,
  featureControls = EMPTY_FEATURE_CONTROLS,
}) {
  const [view, setView] = useState(initialView);
  const normalizedItems = useMemo(() => items.map(normalizeOwnedItem), [items]);
  const compatibility = useMemo(() => summarizePurposeCompatibility(items), [items]);
  const collectionItems = normalizedItems.filter((item) => item.ownedItemPurpose === OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION);
  const heldItems = normalizedItems.filter((item) => item.ownedItemPurpose === OWNED_ITEM_PURPOSES.HOLD);
  const tabs = [
    { key: "collection", label: "My Collection" },
    { key: "sets", label: "Sets & Binders" },
    { key: "wishlist", label: "Wishlist" },
    featureControls.grading !== false ? { key: "grading", label: "Grading" } : null,
  ].filter(Boolean);
  const changeView = (next) => { setView(next); onViewChange?.(next); };

  return (
    <main className="everyday-workspace" data-testid="collection-workspace">
      <PageHeader
        eyebrow="Owned items"
        title="Collection"
        description="Keep personal items, sets, wishlist targets, and grading plans together. Selling changes purpose without creating a duplicate record."
        actions={<PrimaryButton onClick={onAddItem}>Add Collection Item</PrimaryButton>}
      />
      <WorkspaceTabs label="Collection sections" tabs={tabs} active={view} onChange={changeView} />

      {compatibility.compatibilityCount ? (
        <div className="compatibility-note" role="status">
          <strong>Compatibility view active.</strong> {compatibility.compatibilityCount} existing {compatibility.compatibilityCount === 1 ? "record is" : "records are"} being shown using legacy fields. No irreversible migration has run.
          {compatibility.unmappedCount ? ` ${compatibility.unmappedCount} record(s) still need a purpose.` : ""}
        </div>
      ) : null}

      {view === "collection" ? (
        <section>
          <SectionHeader title="My Collection" description="Items kept for personal collecting." actions={onOpenLegacyCollection ? <QuietButton onClick={onOpenLegacyCollection}>Open detailed collection tools</QuietButton> : null} />
          {collectionItems.length ? <div className="owned-item-list">{collectionItems.map((item) => <OwnedItemCard key={item.id} item={item} action={onSellItem} actionLabel="Sell This Item" />)}</div> : <EmptyState title="No collection items yet" action={<PrimaryButton onClick={onAddItem}>Add Collection Item</PrimaryButton>}>Add an item or move an owned item here. Purchase cost and source history stay attached.</EmptyState>}
        </section>
      ) : null}

      {view === "sets" ? <section><SectionHeader title="Sets & Binders" description="Organize complete sets and binder projects without duplicating owned items." /><EmptyState title="No set or binder projects">Detailed binder grouping is retained in the existing collection tools and will be migrated here in a later UI phase.</EmptyState></section> : null}
      {view === "wishlist" ? <section><SectionHeader title="Wishlist" description="Targets you are watching or holding for a future decision." />{heldItems.length ? <div className="owned-item-list">{heldItems.map((item) => <OwnedItemCard key={item.id} item={item} />)}</div> : <EmptyState title="Your wishlist is empty">Items with a Hold purpose will appear here.</EmptyState>}</section> : null}
      {view === "grading" ? <section><SectionHeader title="Grading" description="Track candidates and submissions when grading records are available." /><EmptyState title="No grading records">Grading remains available only when it has real records. No grades or outcomes are estimated here.</EmptyState></section> : null}
    </main>
  );
}

export function BusinessWorkspace({
  items = [],
  purchases = [],
  sales = [],
  expenses = [],
  mileage = [],
  initialView = "purchases",
  initialMoneyView = "expenses",
  onViewChange,
  onAddPurchase,
  onAddInventory,
  onAddSale,
  onAddExpense,
  onAddMileage,
  onMoveToCollection,
  onOpenDetailedRecords,
}) {
  const [view, setView] = useState(initialView);
  const [moneyView, setMoneyView] = useState(initialMoneyView);
  const inventory = useMemo(() => items.filter((item) => inferOwnedItemPurpose(item) === OWNED_ITEM_PURPOSES.FOR_RESALE), [items]);
  const tabs = [
    { key: "purchases", label: "Purchases" },
    { key: "inventory", label: "Inventory" },
    { key: "sales", label: "Sales" },
    { key: "money", label: "Money" },
  ];
  const moneyTabs = [
    { key: "expenses", label: "Expenses" },
    { key: "mileage", label: "Mileage" },
    { key: "reports", label: "Reports" },
    { key: "reconciliation", label: "Reconciliation" },
  ];
  const changeView = (next) => { setView(next); onViewChange?.(next); };

  return (
    <main className="everyday-workspace" data-testid="business-workspace">
      <PageHeader eyebrow="Business records" title="Business" description="Purchases, resale inventory, sales, and money records in one operational workspace." />
      <WorkspaceTabs label="Business sections" tabs={tabs} active={view} onChange={changeView} />

      {view === "purchases" ? <section><SectionHeader title="Purchases" description="Original cost and source records for acquired items and lots." actions={<PrimaryButton onClick={onAddPurchase}>Record Purchase</PrimaryButton>} />{purchases.length ? <div className="owned-item-list">{purchases.slice(0, 20).map((item) => <OwnedItemCard key={item.id} item={item} />)}</div> : <EmptyState title="No purchases recorded" action={<PrimaryButton onClick={onAddPurchase}>Record Purchase</PrimaryButton>}>Record a real purchase when inventory is acquired.</EmptyState>}</section> : null}
      {view === "inventory" ? <section><SectionHeader title="Inventory" description="Owned items whose current purpose is For resale." actions={<PrimaryButton onClick={onAddInventory}>Add Resale Inventory</PrimaryButton>} />{inventory.length ? <div className="owned-item-list">{inventory.map((item) => <OwnedItemCard key={item.id} item={item} action={onMoveToCollection} actionLabel="Move to Collection" />)}</div> : <EmptyState title="No resale inventory" action={<PrimaryButton onClick={onAddInventory}>Add Resale Inventory</PrimaryButton>}>Collection items appear here only after their purpose changes to For resale.</EmptyState>}</section> : null}
      {view === "sales" ? <section><SectionHeader title="Sales" description="Realized sales and profit records. Drafts do not remove inventory." actions={<PrimaryButton onClick={onAddSale}>Record Sale</PrimaryButton>} />{sales.length ? <div className="owned-item-list">{sales.slice(0, 20).map((item) => <OwnedItemCard key={item.id} item={item} />)}</div> : <EmptyState title="No completed sales" action={<PrimaryButton onClick={onAddSale}>Record Sale</PrimaryButton>}>Record sales only after a real transaction.</EmptyState>}</section> : null}
      {view === "money" ? <section><SectionHeader title="Money" description="Business records and bookkeeping estimates. They are not tax-filing determinations." actions={onOpenDetailedRecords ? <QuietButton onClick={onOpenDetailedRecords}>Open detailed records</QuietButton> : null} /><WorkspaceTabs label="Money sections" tabs={moneyTabs} active={moneyView} onChange={setMoneyView} />{moneyView === "expenses" ? (expenses.length ? <div className="owned-item-list">{expenses.slice(0, 20).map((item) => <OwnedItemCard key={item.id} item={item} />)}</div> : <EmptyState title="No expenses recorded" action={<PrimaryButton onClick={onAddExpense}>Add Expense</PrimaryButton>}>Add actual business expenses and receipt references.</EmptyState>) : null}{moneyView === "mileage" ? (mileage.length ? <div className="owned-item-list">{mileage.slice(0, 20).map((item) => <OwnedItemCard key={item.id} item={item} />)}</div> : <EmptyState title="No mileage recorded" action={<PrimaryButton onClick={onAddMileage}>Add Mileage</PrimaryButton>}>Mileage entries are bookkeeping estimates, not definitive deductions.</EmptyState>) : null}{moneyView === "reports" ? <EmptyState title="Reports need completed records">Reports appear after purchases, sales, and costs can be reconciled from real records.</EmptyState> : null}{moneyView === "reconciliation" ? <EmptyState title="Nothing to reconcile">Unallocated lot costs and missing cost-of-goods records will appear here.</EmptyState> : null}</section> : null}
    </main>
  );
}
