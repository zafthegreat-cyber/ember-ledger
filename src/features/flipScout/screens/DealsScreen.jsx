import { useMemo, useState } from "react";
import {
  CONFIDENCE_LEVELS,
  DEAL_STATUSES,
  LISTING_TYPES,
  PRODUCT_CLASSIFICATIONS,
  SORT_OPTIONS,
} from "../constants.js";
import { calculateLandedCost } from "../calculations.js";
import { formatCurrency, formatPercent, sortFlipScoutRecords, timingIndicator } from "../selectors.js";
import { CheckField, EmptyState, FormActions, MoneyInput, NumberInput, SectionHeading, SelectInput, TextArea, TextInput } from "../components/Fields.jsx";
import { DealCard, PrimaryButton, QuietButton } from "../../../components/operations/OperationsUI.jsx";
import { DetailList, RecordDetailPage } from "../../../components/operations/RecordExperience.jsx";

function blankDeal() {
  return {
    marketplace: "Manual URL",
    externalListingId: "",
    listingUrl: "",
    title: "",
    description: "",
    sellerName: "",
    sellerRating: "",
    listingType: "Fixed price",
    productClassification: "Unknown",
    askingPrice: "",
    purchaseShipping: "",
    estimatedTax: "",
    buyerPremium: "",
    fixedBuyerFees: "",
    travelOrPickupCost: "",
    preparationCost: "",
    otherAcquisitionCosts: "",
    imageReferencesText: "",
    location: "",
    distance: "",
    dateDiscovered: new Date().toISOString().slice(0, 10),
    listingCreatedAt: "",
    auctionEndTime: "",
    currentBid: "",
    numberOfBids: "",
    localPickupAvailable: false,
    notes: "",
    riskFlagsText: "",
    status: "New",
    tagsText: "",
    confidence: "Low",
  };
}

function toForm(record = {}) {
  return {
    ...blankDeal(),
    ...record,
    imageReferencesText: record.imageReferencesText ?? (record.imageReferences || []).join("\n"),
    riskFlagsText: record.riskFlagsText ?? (record.riskFlags || []).join(", "),
    tagsText: record.tagsText ?? (record.tags || []).join(", "),
  };
}

function listingTiming(deal) {
  if (deal.auctionEndTime && timingIndicator(deal.auctionEndTime)) return timingIndicator(deal.auctionEndTime).label;
  const created = deal.listingCreatedAt || deal.dateDiscovered || deal.createdAt;
  if (!created) return "Age not recorded";
  const elapsed = Math.max(0, Date.now() - new Date(created).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "Found recently";
  if (hours < 24) return `Found ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Found ${days}d ago`;
}

export default function DealsScreen({ deals, initialMode = "", onSave, onDelete, onAnalyze }) {
  const [form, setForm] = useState(blankDeal);
  const [formOpen, setFormOpen] = useState(() => Boolean(initialMode));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sort, setSort] = useState("newest");
  const [message, setMessage] = useState("");
  const [selectedDeal, setSelectedDeal] = useState(null);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const visibleDeals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = deals.filter((deal) => {
      if (statusFilter !== "All" && deal.status !== statusFilter) return false;
      if (!needle) return true;
      return [deal.title, deal.marketplace, deal.sellerName, deal.location, ...(deal.tags || [])].join(" ").toLowerCase().includes(needle);
    });
    return sortFlipScoutRecords(filtered, sort);
  }, [deals, query, sort, statusFilter]);

  const save = (event) => {
    event.preventDefault();
    if (!form.title.trim() && !form.listingUrl.trim()) {
      setMessage("Add a title or listing URL before saving.");
      return;
    }
    const record = {
      ...form,
      title: form.title.trim() || "Untitled listing",
      imageReferences: form.imageReferencesText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      riskFlags: form.riskFlagsText.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
      tags: form.tagsText.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
      landedCost: calculateLandedCost({ ...form, purchasePrice: form.askingPrice, purchaseTax: form.estimatedTax }),
    };
    onSave("deals", record, { title: form.id ? "Listing updated" : "Listing added", detail: record.title });
    setForm(blankDeal());
    setFormOpen(false);
    setMessage("Listing saved to the Deal Inbox.");
  };

  const edit = (deal) => {
    setForm(toForm(deal));
    setFormOpen(true);
    setMessage("");
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const updateStatus = (deal, status) => {
    onSave("deals", { ...deal, status }, { title: `Listing marked ${status.toLowerCase()}`, detail: deal.title });
    setMessage(`${deal.title || "Listing"} marked ${status}.`);
  };

  if (selectedDeal) {
    const landedCost = selectedDeal.landedCost ?? calculateLandedCost({ ...selectedDeal, purchasePrice: selectedDeal.askingPrice, purchaseTax: selectedDeal.estimatedTax });
    return <RecordDetailPage
      eyebrow="Listing review"
      title={selectedDeal.title || "Untitled listing"}
      status={selectedDeal.status || "New"}
      statusTone={/pass|expired/i.test(selectedDeal.status || "") ? "neutral" : /strong/i.test(selectedDeal.status || "") ? "success" : "info"}
      image={(selectedDeal.imageReferences || [])[0] || ""}
      identity={`${selectedDeal.marketplace || "Manual source"} · ${selectedDeal.productClassification || "Unknown classification"}`}
      summary={[
        { label: selectedDeal.currentBid ? "Current bid" : "Asking price", value: formatCurrency(selectedDeal.currentBid || selectedDeal.askingPrice), numeric: true },
        { label: "Estimated landed cost", value: formatCurrency(landedCost), numeric: true },
        { label: "Projected profit", value: selectedDeal.projectedProfit || selectedDeal.expectedProfit ? formatCurrency(selectedDeal.projectedProfit || selectedDeal.expectedProfit) : "Not entered", numeric: true },
        { label: "Projected ROI", value: selectedDeal.projectedRoi || selectedDeal.expectedRoi ? formatPercent(selectedDeal.projectedRoi || selectedDeal.expectedRoi) : "Not entered", numeric: true },
      ]}
      primaryAction={<PrimaryButton onClick={() => onAnalyze({ ...selectedDeal, purchasePrice: selectedDeal.askingPrice, purchaseTax: selectedDeal.estimatedTax })}>Analyze Deal</PrimaryButton>}
      secondaryActions={<>{selectedDeal.listingUrl ? <a className="ops-button ops-button--secondary" href={selectedDeal.listingUrl} target="_blank" rel="noreferrer">Open Listing</a> : null}<QuietButton onClick={() => { edit(selectedDeal); setSelectedDeal(null); }}>Edit</QuietButton><QuietButton onClick={() => { if (onDelete("deals", selectedDeal.id, selectedDeal.title) !== false) setSelectedDeal(null); }}>Delete</QuietButton></>}
      sections={[
        { title: "Decision", description: "Update the saved review status.", children: <div className="flip-detail-actions"><QuietButton onClick={() => updateStatus(selectedDeal, "Watching")}>Save to Watching</QuietButton><QuietButton onClick={() => updateStatus(selectedDeal, "Passed")}>Pass</QuietButton></div> },
        { title: "Listing", description: "Source-provided and manually entered details.", children: <DetailList items={[{ label: "Source", value: selectedDeal.marketplace }, { label: "External listing ID", value: selectedDeal.externalListingId }, { label: "Seller", value: selectedDeal.sellerName }, { label: "Seller rating", value: selectedDeal.sellerRating }, { label: "Listing type", value: selectedDeal.listingType }, { label: "Location", value: selectedDeal.location }, { label: "Distance", value: selectedDeal.distance ? `${selectedDeal.distance} mi` : "" }, { label: "Description", value: selectedDeal.description }]} /> },
        { title: "Costs and assumptions", description: "Active prices are not sold comparable records.", children: <DetailList items={[{ label: "Shipping", value: formatCurrency(selectedDeal.purchaseShipping) }, { label: "Estimated tax", value: formatCurrency(selectedDeal.estimatedTax) }, { label: "Buyer premium", value: formatCurrency(selectedDeal.buyerPremium) }, { label: "Pickup / travel", value: formatCurrency(selectedDeal.travelOrPickupCost) }, { label: "Preparation", value: formatCurrency(selectedDeal.preparationCost) }, { label: "Resale range", value: [selectedDeal.expectedResaleLow || selectedDeal.projectedResaleLow, selectedDeal.expectedResaleMid || selectedDeal.projectedResaleMid, selectedDeal.expectedResaleHigh || selectedDeal.projectedResaleHigh].filter(Boolean).map(formatCurrency).join(" / ") }, { label: "Confidence", value: selectedDeal.confidence }, { label: "Risk flags", value: (selectedDeal.riskFlags || []).join(", ") || "None recorded" }]} /> },
        { title: "Notes and source", description: "Why this record was surfaced and when it was checked.", children: <DetailList items={[{ label: "Why surfaced", value: selectedDeal.surfacedReason || selectedDeal.explanation }, { label: "Data source", value: selectedDeal.sourceDataExplanation }, { label: "Last checked", value: selectedDeal.lastCheckedAt ? new Date(selectedDeal.lastCheckedAt).toLocaleString() : "" }, { label: "Notes", value: selectedDeal.notes }]} /> },
      ]}
      timeline={[selectedDeal.listingCreatedAt ? { id: "listed", title: "Listing created", date: new Date(selectedDeal.listingCreatedAt).toLocaleString() } : null, selectedDeal.dateDiscovered ? { id: "discovered", title: "Listing discovered", date: new Date(selectedDeal.dateDiscovered).toLocaleDateString() } : null, selectedDeal.updatedAt ? { id: "updated", title: "Record updated", date: new Date(selectedDeal.updatedAt).toLocaleString() } : null].filter(Boolean)}
      onBack={() => setSelectedDeal(null)}
    />;
  }

  return (
    <div className="flip-screen">
      <section className="flip-section">
        <SectionHeading
          title="Deal Feed"
          actions={<button type="button" className="primary-button" onClick={() => { setForm(blankDeal()); setFormOpen((open) => !open); }}>{formOpen ? "Close form" : "Paste Listing"}</button>}
        />
        {formOpen ? (
          <form className="flip-form" onSubmit={save}>
            <div className="flip-form-grid">
              <TextInput label="Marketplace / source" value={form.marketplace} onChange={set("marketplace")} placeholder="eBay, local auction, Facebook Marketplace…" />
              <TextInput label="External listing ID" value={form.externalListingId} onChange={set("externalListingId")} />
              <TextInput label="Listing URL" type="url" value={form.listingUrl} onChange={set("listingUrl")} placeholder="https://…" />
              <TextInput label="Title" value={form.title} onChange={set("title")} />
              <TextArea label="Description" value={form.description} onChange={set("description")} />
              <TextInput label="Seller name" value={form.sellerName} onChange={set("sellerName")} />
              <TextInput label="Seller rating" helper="Only enter a rating supplied by the source or entered by you." value={form.sellerRating} onChange={set("sellerRating")} />
              <SelectInput label="Listing type" value={form.listingType} onChange={set("listingType")} options={LISTING_TYPES} />
              <SelectInput label="Product classification" value={form.productClassification} onChange={set("productClassification")} options={PRODUCT_CLASSIFICATIONS} />
              <MoneyInput label="Asking price" value={form.askingPrice} onChange={set("askingPrice")} />
              <MoneyInput label="Purchase shipping" value={form.purchaseShipping} onChange={set("purchaseShipping")} />
              <MoneyInput label="Estimated tax" value={form.estimatedTax} onChange={set("estimatedTax")} />
              <MoneyInput label="Buyer premium" value={form.buyerPremium} onChange={set("buyerPremium")} />
              <MoneyInput label="Fixed buyer fees" value={form.fixedBuyerFees} onChange={set("fixedBuyerFees")} />
              <MoneyInput label="Pickup or travel cost" value={form.travelOrPickupCost} onChange={set("travelOrPickupCost")} />
              <MoneyInput label="Preparation / cleaning cost" value={form.preparationCost} onChange={set("preparationCost")} />
              <MoneyInput label="Other acquisition costs" value={form.otherAcquisitionCosts} onChange={set("otherAcquisitionCosts")} />
              <TextArea label="Images or image references" helper="One URL or local reference per line. No image files are copied into seed data." value={form.imageReferencesText} onChange={set("imageReferencesText")} />
              <TextInput label="Location" value={form.location} onChange={set("location")} />
              <NumberInput label="Distance (miles)" value={form.distance} onChange={set("distance")} />
              <TextInput label="Date discovered" type="date" value={form.dateDiscovered} onChange={set("dateDiscovered")} />
              <TextInput label="Listing creation time" type="datetime-local" value={form.listingCreatedAt} onChange={set("listingCreatedAt")} />
              <TextInput label="Auction end time" type="datetime-local" value={form.auctionEndTime} onChange={set("auctionEndTime")} />
              <MoneyInput label="Current bid" value={form.currentBid} onChange={set("currentBid")} />
              <NumberInput label="Number of bids" value={form.numberOfBids} onChange={set("numberOfBids")} step="1" />
              <CheckField label="Local pickup available" checked={form.localPickupAvailable} onChange={set("localPickupAvailable")} />
              <SelectInput label="Status" value={form.status} onChange={set("status")} options={DEAL_STATUSES} />
              <SelectInput label="Confidence" value={form.confidence} onChange={set("confidence")} options={CONFIDENCE_LEVELS} />
              <TextArea label="Risk flags" helper="Separate flags with commas or new lines." value={form.riskFlagsText} onChange={set("riskFlagsText")} />
              <TextArea label="Tags" helper="Separate tags with commas." value={form.tagsText} onChange={set("tagsText")} />
              <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
            </div>
            <div className="flip-live-total"><span>Current landed-cost estimate</span><strong>{formatCurrency(calculateLandedCost({ ...form, purchasePrice: form.askingPrice, purchaseTax: form.estimatedTax }))}</strong></div>
            {message ? <p className="flip-form-message" role="status">{message}</p> : null}
            <FormActions><button type="submit" className="primary-button">{form.id ? "Update listing" : "Save listing"}</button><button type="button" className="secondary-button" onClick={() => onAnalyze({ ...form, purchasePrice: form.askingPrice, purchaseTax: form.estimatedTax })}>Analyze assumptions</button></FormActions>
          </form>
        ) : message ? <p className="flip-form-message" role="status">{message}</p> : null}
      </section>

      <section className="flip-section">
        <div className="flip-filter-bar">
          <TextInput label="Search listings" value={query} onChange={setQuery} placeholder="Title, source, seller, tag…" />
          <details className="flip-filter-menu">
            <summary>Filter</summary>
            <div><SelectInput label="Status" value={statusFilter} onChange={setStatusFilter} options={["All", ...DEAL_STATUSES]} /><SelectInput label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} /></div>
          </details>
        </div>
        {visibleDeals.length ? (
          <div className="flip-record-list flip-deal-feed">
            {visibleDeals.map((deal) => (
              <DealCard key={deal.id} image={(deal.imageReferences || [])[0] || ""} imageAlt="">
                <div className="flip-deal-card__body">
                  <span className="flip-deal-source">{deal.marketplace || "Manual source"}</span>
                  <h3>{deal.title || "Untitled listing"}</h3>
                  <div className="flip-deal-summary"><span>{deal.currentBid ? "Current bid" : "Price"}<strong>{formatCurrency(deal.currentBid || deal.askingPrice)}</strong></span><span>Projected profit<strong>{deal.projectedProfit || deal.expectedProfit ? formatCurrency(deal.projectedProfit || deal.expectedProfit) : "Needs analysis"}</strong></span></div>
                  <p className="flip-deal-signal">{deal.confidence || "Unrated"} confidence · {deal.riskLevel || (deal.riskFlags?.length ? "Flagged" : "Unrated")} risk</p>
                  <time dateTime={deal.auctionEndTime || deal.listingCreatedAt || deal.dateDiscovered || deal.createdAt}>{listingTiming(deal)}</time>
                  <button type="button" className="primary-button" onClick={() => setSelectedDeal(deal)}>Review</button>
                </div>
              </DealCard>
            ))}
          </div>
        ) : <EmptyState title="No listings match">Paste a real listing or adjust the current filters. This workspace does not seed fake marketplace results.</EmptyState>}
      </section>
    </div>
  );
}
