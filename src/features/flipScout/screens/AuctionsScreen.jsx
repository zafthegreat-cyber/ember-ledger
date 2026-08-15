import { useMemo, useState } from "react";
import { AUCTION_OUTCOMES, AUCTION_TYPES, AUCTION_WATCH_STATUSES, RISK_LEVELS, SORT_OPTIONS, TAX_BASE_OPTIONS } from "../constants.js";
import { calculateMaximumAuctionBid } from "../calculations.js";
import { formatCurrency, sortFlipScoutRecords, timingIndicator } from "../selectors.js";
import { EmptyState, FormActions, MoneyInput, NumberInput, RecordActions, SectionHeading, SelectInput, StatusPill, TextArea, TextInput } from "../components/Fields.jsx";

function blankAuction() {
  return {
    source: "Manual auction entry",
    url: "",
    title: "",
    auctionType: "Online auction",
    location: "",
    distance: "",
    pickupDeadline: "",
    startDate: "",
    endDateTime: "",
    currentBid: "",
    myMaximumBid: "",
    buyerPremiumPercentage: "",
    fixedFees: "",
    taxRate: "",
    taxBase: "hammer_plus_premium",
    manualTaxableSubtotal: "",
    deposit: "",
    estimatedTravelCost: "",
    estimatedLaborCost: "",
    estimatedDisposalCost: "",
    estimatedResaleLow: "",
    estimatedResaleMid: "",
    estimatedResaleHigh: "",
    sellingFeePercentage: "",
    fixedSellingFees: "",
    outboundShipping: "",
    packagingCost: "",
    desiredProfit: "",
    desiredRoi: "",
    riskLevel: "Unknown",
    photoReferencesText: "",
    notes: "",
    watchStatus: "New",
    outcome: "Pending",
  };
}

function toForm(record = {}) {
  return { ...blankAuction(), ...record, photoReferencesText: record.photoReferencesText ?? (record.photoReferences || []).join("\n") };
}

export default function AuctionsScreen({ auctions, initialMode = "", onSave, onDelete }) {
  const [form, setForm] = useState(blankAuction);
  const [formOpen, setFormOpen] = useState(() => Boolean(initialMode));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("ending_soon");
  const [message, setMessage] = useState("");
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const result = useMemo(() => calculateMaximumAuctionBid({ ...form, expectedResalePrice: form.estimatedResaleMid }), [form]);
  const visible = useMemo(() => sortFlipScoutRecords(auctions.filter((auction) => !query.trim() || [auction.title, auction.source, auction.location, auction.auctionType].join(" ").toLowerCase().includes(query.toLowerCase())), sort), [auctions, query, sort]);

  const save = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setMessage("Add an auction title before saving.");
    const record = {
      ...form,
      photoReferences: form.photoReferencesText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      calculatedMaximumBid: result.maximumHammerBid,
      maximumBidCalculation: result,
    };
    onSave("auctions", record, { title: form.id ? "Auction updated" : "Auction added", detail: record.title });
    setForm(blankAuction());
    setFormOpen(false);
    setMessage("Auction saved to your watch list.");
  };

  return (
    <div className="flip-screen">
      <section className="flip-section">
        <SectionHeading eyebrow="Bid discipline" title="Auction Watch" detail="Track auction timing and calculate a ceiling from your own resale, cost, tax, profit, and ROI assumptions." actions={<button type="button" className="primary-button" onClick={() => { setForm(blankAuction()); setFormOpen((open) => !open); }}>{formOpen ? "Close form" : "Add Auction"}</button>} />
        {formOpen ? (
          <form className="flip-form" onSubmit={save}>
            <div className="flip-form-grid">
              <TextInput label="Source" value={form.source} onChange={set("source")} />
              <TextInput label="URL" type="url" value={form.url} onChange={set("url")} />
              <TextInput label="Title" value={form.title} onChange={set("title")} required />
              <SelectInput label="Auction type" value={form.auctionType} onChange={set("auctionType")} options={AUCTION_TYPES} />
              <TextInput label="Location" value={form.location} onChange={set("location")} />
              <NumberInput label="Distance (miles)" value={form.distance} onChange={set("distance")} />
              <TextInput label="Pickup deadline" type="datetime-local" value={form.pickupDeadline} onChange={set("pickupDeadline")} />
              <TextInput label="Start date" type="datetime-local" value={form.startDate} onChange={set("startDate")} />
              <TextInput label="End date and time" type="datetime-local" value={form.endDateTime} onChange={set("endDateTime")} />
              <MoneyInput label="Current bid" value={form.currentBid} onChange={set("currentBid")} />
              <MoneyInput label="My maximum bid" helper="You can enter your own ceiling or use the calculated one below." value={form.myMaximumBid} onChange={set("myMaximumBid")} />
              <TextInput label="Buyer premium percentage" type="number" inputMode="decimal" min="0" step="0.01" value={form.buyerPremiumPercentage} onChange={set("buyerPremiumPercentage")} />
              <MoneyInput label="Fixed fees" value={form.fixedFees} onChange={set("fixedFees")} />
              <TextInput label="Tax rate" helper="Enter 6 for 6%." type="number" inputMode="decimal" min="0" step="0.01" value={form.taxRate} onChange={set("taxRate")} />
              <SelectInput label="Tax applies to" value={form.taxBase} onChange={set("taxBase")} options={TAX_BASE_OPTIONS} />
              {form.taxBase === "manual" ? <MoneyInput label="Manual taxable subtotal" value={form.manualTaxableSubtotal} onChange={set("manualTaxableSubtotal")} /> : null}
              <MoneyInput label="Deposit" helper="Tracked separately. The ceiling calculator does not double-count a refundable deposit." value={form.deposit} onChange={set("deposit")} />
              <MoneyInput label="Estimated travel cost" value={form.estimatedTravelCost} onChange={set("estimatedTravelCost")} />
              <MoneyInput label="Estimated labor cost" value={form.estimatedLaborCost} onChange={set("estimatedLaborCost")} />
              <MoneyInput label="Estimated disposal cost" value={form.estimatedDisposalCost} onChange={set("estimatedDisposalCost")} />
              <MoneyInput label="Estimated resale low" value={form.estimatedResaleLow} onChange={set("estimatedResaleLow")} />
              <MoneyInput label="Estimated resale midpoint" value={form.estimatedResaleMid} onChange={set("estimatedResaleMid")} />
              <MoneyInput label="Estimated resale high" value={form.estimatedResaleHigh} onChange={set("estimatedResaleHigh")} />
              <TextInput label="Selling fee percentage" type="number" inputMode="decimal" min="0" step="0.01" value={form.sellingFeePercentage} onChange={set("sellingFeePercentage")} />
              <MoneyInput label="Fixed selling fees" value={form.fixedSellingFees} onChange={set("fixedSellingFees")} />
              <MoneyInput label="Outbound shipping" value={form.outboundShipping} onChange={set("outboundShipping")} />
              <MoneyInput label="Packaging cost" value={form.packagingCost} onChange={set("packagingCost")} />
              <MoneyInput label="Desired profit" value={form.desiredProfit} onChange={set("desiredProfit")} />
              <TextInput label="Desired ROI" helper="Enter 30 for 30%." type="number" inputMode="decimal" min="0" step="0.1" value={form.desiredRoi} onChange={set("desiredRoi")} />
              <SelectInput label="Risk level" value={form.riskLevel} onChange={set("riskLevel")} options={RISK_LEVELS} />
              <SelectInput label="Watch status" value={form.watchStatus} onChange={set("watchStatus")} options={AUCTION_WATCH_STATUSES} />
              <SelectInput label="Won / lost status" value={form.outcome} onChange={set("outcome")} options={AUCTION_OUTCOMES} />
              <TextArea label="Photos or photo references" helper="One reference per line." value={form.photoReferencesText} onChange={set("photoReferencesText")} />
              <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
            </div>
            <div className="flip-auction-calculation">
              <div><span>Calculated maximum hammer bid</span><strong>{formatCurrency(result.maximumHammerBid)}</strong></div>
              <div><span>Premium at ceiling</span><strong>{formatCurrency(result.buyerPremiumAtMaximum)}</strong></div>
              <div><span>Tax at ceiling</span><strong>{formatCurrency(result.taxAtMaximum)}</strong></div>
              <div><span>Total acquisition at ceiling</span><strong>{formatCurrency(result.totalCostAtMaximum)}</strong></div>
              <p>The hammer bid is solved so the total acquisition cost satisfies both desired profit and desired ROI. Selling costs are deducted from midpoint resale first.</p>
              <button type="button" className="secondary-button" onClick={() => set("myMaximumBid")(result.maximumHammerBid.toFixed(2))}>Use calculated ceiling</button>
            </div>
            {message ? <p className="flip-form-message" role="status">{message}</p> : null}
            <FormActions><button type="submit" className="primary-button">{form.id ? "Update auction" : "Save auction"}</button></FormActions>
          </form>
        ) : message ? <p className="flip-form-message" role="status">{message}</p> : null}
      </section>

      <section className="flip-section">
        <div className="flip-filter-bar"><TextInput label="Search auctions" value={query} onChange={setQuery} /><SelectInput label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} /></div>
        {visible.length ? <div className="flip-record-list">{visible.map((auction) => {
          const ending = timingIndicator(auction.endDateTime);
          const pickup = timingIndicator(auction.pickupDeadline, "pickup");
          return <article className="flip-record-card" key={auction.id}>
            <div className="flip-record-card__head"><div><span>{auction.source}</span><h3>{auction.title}</h3></div><StatusPill tone={auction.riskLevel === "High" ? "danger" : auction.riskLevel === "Low" ? "good" : "warning"}>{auction.riskLevel} risk</StatusPill></div>
            <div className="flip-risk-row">{ending ? <StatusPill tone={ending.tone}>{ending.label}</StatusPill> : null}{pickup ? <StatusPill tone={pickup.tone}>{pickup.label}</StatusPill> : null}<StatusPill>{auction.watchStatus}</StatusPill><StatusPill>{auction.outcome}</StatusPill></div>
            <div className="flip-record-facts"><span>Current <strong>{formatCurrency(auction.currentBid)}</strong></span><span>My max <strong>{formatCurrency(auction.myMaximumBid || auction.calculatedMaximumBid)}</strong></span><span>Mid resale <strong>{formatCurrency(auction.estimatedResaleMid)}</strong></span></div>
            {auction.url ? <a href={auction.url} target="_blank" rel="noreferrer">Open auction</a> : <p className="flip-muted-copy">No auction URL saved.</p>}
            <RecordActions onEdit={() => { setForm(toForm(auction)); setFormOpen(true); window.scrollTo?.({ top: 0, behavior: "smooth" }); }} onDelete={() => onDelete("auctions", auction.id, auction.title)} />
          </article>;
        })}</div> : <EmptyState title="No auctions tracked">Add a real auction manually. No auction source is connected in Phase 1.</EmptyState>}
      </section>
    </div>
  );
}
