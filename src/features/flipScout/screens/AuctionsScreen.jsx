import { useMemo, useRef, useState } from "react";
import { AUCTION_OUTCOMES, AUCTION_TYPES, AUCTION_WATCH_STATUSES, RISK_LEVELS, SORT_OPTIONS, TAX_BASE_OPTIONS } from "../constants.js";
import { calculateMaximumAuctionBid } from "../calculations.js";
import { formatCurrency, sortFlipScoutRecords, timingIndicator } from "../selectors.js";
import { EmptyState, FormActions, MoneyInput, NumberInput, RecordActions, SectionHeading, SelectInput, StatusPill, TextArea, TextInput } from "../components/Fields.jsx";
import { PrimaryButton, QuietButton } from "../../../components/operations/OperationsUI.jsx";
import { DetailList, RecordDetailPage } from "../../../components/operations/RecordExperience.jsx";
import { BRAND_CONFIG } from "../../../config/brand.js";
import { analyzeAuctionForm, formatBasisPoints, formatMinorMoney, minorMoneyToMajorInput } from "../intelligenceFormAdapter.js";

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
    purchaseShipping: "",
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
    unknownContentsCount: "0",
    unknownContentsBulkValue: "",
    lotItemEstimatesText: "",
    lotContentsText: "",
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
  const [selectedAuction, setSelectedAuction] = useState(null);
  const saveInFlightRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const result = useMemo(() => calculateMaximumAuctionBid({ ...form, expectedResalePrice: form.estimatedResaleMid }), [form]);
  const intelligence = useMemo(() => {
    try {
      return { result: analyzeAuctionForm(form), error: "" };
    } catch (error) {
      return { result: null, error: error?.message || "Review the auction assumptions." };
    }
  }, [form]);
  const visible = useMemo(() => sortFlipScoutRecords(auctions.filter((auction) => !query.trim() || [auction.title, auction.source, auction.location, auction.auctionType].join(" ").toLowerCase().includes(query.toLowerCase())), sort), [auctions, query, sort]);

  const save = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setMessage("Add an auction title before saving.");
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    const record = {
      ...form,
      photoReferences: form.photoReferencesText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      calculatedMaximumBid: result.maximumHammerBid,
      maximumBidCalculation: result,
      auctionIntelligence: intelligence.result,
      auctionIntelligenceHistory: intelligence.result ? [
        ...(Array.isArray(form.auctionIntelligenceHistory) ? form.auctionIntelligenceHistory : []),
        { analyzedAt: new Date().toISOString(), methodologyVersion: intelligence.result.methodologyVersion, result: intelligence.result },
      ] : (form.auctionIntelligenceHistory || []),
    };
    try {
      const saved = await onSave("auctions", record, { title: form.id ? "Auction updated" : "Auction added", detail: record.title });
      if (!saved) {
        setMessage("The auction was not saved. Your entries remain available to review and try again.");
        return;
      }
      setForm(blankAuction());
      setFormOpen(false);
      setMessage("Auction saved to your watch list.");
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  if (selectedAuction) {
    const ceiling = selectedAuction.maximumBidCalculation || calculateMaximumAuctionBid({ ...selectedAuction, expectedResalePrice: selectedAuction.estimatedResaleMid });
    const ending = timingIndicator(selectedAuction.endDateTime);
    const pickup = timingIndicator(selectedAuction.pickupDeadline, "pickup");
    const expectedLotValue = formatMinorMoney(
      selectedAuction.auctionIntelligence?.expectedLotValue,
      selectedAuction.estimatedResaleMid ? formatCurrency(selectedAuction.estimatedResaleMid) : "Not enough data",
    );
    const ownerResaleRange = [selectedAuction.estimatedResaleLow, selectedAuction.estimatedResaleMid, selectedAuction.estimatedResaleHigh]
      .filter((value) => value !== "" && value !== null && value !== undefined)
      .map(formatCurrency)
      .join(" / ");
    return <RecordDetailPage
      eyebrow="Auction detail"
      title={selectedAuction.title || "Untitled auction"}
      status={selectedAuction.watchStatus || "New"}
      statusTone={selectedAuction.riskLevel === "High" ? "danger" : selectedAuction.riskLevel === "Low" ? "success" : "warning"}
      image={(selectedAuction.photoReferences || [])[0] || ""}
      identity={`${selectedAuction.source || "Manual source"} · ${selectedAuction.auctionType || "Auction"}`}
      summary={[{ label: "Current bid", value: formatCurrency(selectedAuction.currentBid), numeric: true }, { label: `${BRAND_CONFIG.applicationDisplayName} maximum`, value: formatMinorMoney(selectedAuction.auctionIntelligence?.maximumRecommendedBid), numeric: true }, { label: "Owner maximum", value: formatCurrency(selectedAuction.myMaximumBid), numeric: true }, { label: "Risk", value: selectedAuction.riskLevel || "Unknown" }]}
      primaryAction={<PrimaryButton disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setForm(toForm(selectedAuction)); setFormOpen(true); setSelectedAuction(null); }}>Edit Auction</PrimaryButton>}
      secondaryActions={<>{selectedAuction.url ? <a className="ops-button ops-button--secondary" href={selectedAuction.url} target="_blank" rel="noreferrer">Open Auction</a> : null}<QuietButton disabled={saving} onClick={async () => { if (saveInFlightRef.current) return; if (await onDelete("auctions", selectedAuction.id, selectedAuction.title)) setSelectedAuction(null); }}>Delete</QuietButton></>}
      sections={[
        { title: "Timing and pickup", description: "Deadlines and location information.", children: <DetailList items={[{ label: "Starts", value: selectedAuction.startDate ? new Date(selectedAuction.startDate).toLocaleString() : "" }, { label: "Ends", value: selectedAuction.endDateTime ? new Date(selectedAuction.endDateTime).toLocaleString() : "" }, { label: "Time remaining", value: ending?.label }, { label: "Pickup deadline", value: selectedAuction.pickupDeadline ? new Date(selectedAuction.pickupDeadline).toLocaleString() : "" }, { label: "Pickup status", value: pickup?.label }, { label: "Location", value: selectedAuction.location }, { label: "Distance", value: selectedAuction.distance ? `${selectedAuction.distance} mi` : "" }]} /> },
        { title: "Bid intelligence", description: "Advisory only. The application never submits a bid.", children: <DetailList items={[{ label: "Maximum recommended bid", value: formatMinorMoney(selectedAuction.auctionIntelligence?.maximumRecommendedBid) }, { label: "Owner-entered maximum", value: formatCurrency(selectedAuction.myMaximumBid) }, { label: "Expected net proceeds", value: formatMinorMoney(selectedAuction.auctionIntelligence?.expectedNetProceeds) }, { label: "Profit at ceiling", value: formatMinorMoney(selectedAuction.auctionIntelligence?.profitAtMaximumBid) }, { label: "ROI at ceiling", value: formatBasisPoints(selectedAuction.auctionIntelligence?.roiAtMaximumBidBasisPoints) }, { label: "Confidence", value: selectedAuction.auctionIntelligence?.confidence || "Not analyzed" }, { label: "Valuation basis", value: selectedAuction.auctionIntelligence?.valuationBasis === "STRUCTURED_LOT_ANALYSIS" ? "Structured lot analysis" : selectedAuction.auctionIntelligence?.valuationBasis === "OWNER_MIDPOINT_ASSUMPTION" ? "Owner midpoint assumption" : "Not enough data" }, { label: "Explanation", value: selectedAuction.auctionIntelligence?.explanation || "Save the auction with enough assumptions to create an intelligence result." }]} /> },
        { title: "Lot scenarios", description: "Identified and probable items use sell-through assumptions. Unknown contents receive no value without an explicit owner bulk estimate.", children: selectedAuction.auctionIntelligence?.lotAnalysis ? <DetailList items={[{ label: "Conservative", value: formatMinorMoney(selectedAuction.auctionIntelligence.lotAnalysis.scenarios.conservative.netValue) }, { label: "Expected", value: formatMinorMoney(selectedAuction.auctionIntelligence.lotAnalysis.scenarios.expected.netValue) }, { label: "Optimistic", value: formatMinorMoney(selectedAuction.auctionIntelligence.lotAnalysis.scenarios.optimistic.netValue) }, { label: "Identified lines", value: selectedAuction.auctionIntelligence.lotAnalysis.identifiedItems.length }, { label: "Probable lines", value: selectedAuction.auctionIntelligence.lotAnalysis.probableItems.length }, { label: "Unknown lines", value: selectedAuction.auctionIntelligence.lotAnalysis.unknownItems.length }, { label: "Why the range changes", value: selectedAuction.auctionIntelligence.lotAnalysis.spreadDrivers.join(" ") || "No spread driver recorded." }]} /> : <p className="flip-muted-copy">No structured lot-item estimates were saved.</p> },
        { title: "Bid calculation", description: "Compatibility calculation using the existing recorded assumptions.", children: <DetailList items={[{ label: "Buyer premium", value: `${selectedAuction.buyerPremiumPercentage || 0}%` }, { label: "Tax rate", value: `${selectedAuction.taxRate || 0}%` }, { label: "Tax base", value: TAX_BASE_OPTIONS.find((row) => row.value === selectedAuction.taxBase)?.label }, { label: "Fixed fees", value: formatCurrency(selectedAuction.fixedFees) }, { label: "Shipping", value: formatCurrency(selectedAuction.purchaseShipping) }, { label: "Travel", value: formatCurrency(selectedAuction.estimatedTravelCost) }, { label: "Labor", value: formatCurrency(selectedAuction.estimatedLaborCost) }, { label: "Disposal", value: formatCurrency(selectedAuction.estimatedDisposalCost) }, { label: "Total acquisition at ceiling", value: formatCurrency(ceiling.totalCostAtMaximum) }]} /> },
        { title: "Outcome and notes", description: "Watch status, result, and owner notes.", children: <DetailList items={[{ label: "Outcome", value: selectedAuction.outcome }, { label: "Expected lot value used", value: expectedLotValue }, { label: "Owner-entered resale range", value: ownerResaleRange || "Not recorded" }, { label: "Notes", value: selectedAuction.notes }]} /> },
      ]}
      timeline={[selectedAuction.startDate ? { id: "start", title: "Auction started", date: new Date(selectedAuction.startDate).toLocaleString() } : null, selectedAuction.endDateTime ? { id: "end", title: "Auction ends", date: new Date(selectedAuction.endDateTime).toLocaleString() } : null, selectedAuction.updatedAt ? { id: "updated", title: "Record updated", date: new Date(selectedAuction.updatedAt).toLocaleString() } : null].filter(Boolean)}
      onBack={() => { if (!saveInFlightRef.current) setSelectedAuction(null); }}
    />;
  }

  return (
    <div className="flip-screen">
      <section className="flip-section">
        <SectionHeading eyebrow="Bid discipline" title="Auction Watch" detail="Track auction timing and calculate a ceiling from your own resale, cost, tax, profit, and ROI assumptions." actions={<button type="button" className="primary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setForm(blankAuction()); setFormOpen((open) => !open); }}>{formOpen ? "Close form" : "Add Auction"}</button>} />
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
              <MoneyInput label="Purchase shipping" value={form.purchaseShipping} onChange={set("purchaseShipping")} />
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
              <NumberInput label="Unknown contents" helper="Unknown contents receive no value unless you enter an explicit lot assumption." value={form.unknownContentsCount} onChange={set("unknownContentsCount")} min="0" step="1" />
              <MoneyInput label="Unknown-contents bulk estimate" helper={`Optional owner assumption. ${BRAND_CONFIG.applicationDisplayName} applies a conservative haircut and never invents value for unseen contents.`} value={form.unknownContentsBulkValue} onChange={set("unknownContentsBulkValue")} />
              <SelectInput label="Watch status" value={form.watchStatus} onChange={set("watchStatus")} options={AUCTION_WATCH_STATUSES} />
              <SelectInput label="Won / lost status" value={form.outcome} onChange={set("outcome")} options={AUCTION_OUTCOMES} />
              <TextArea label="Photos or photo references" helper="One reference per line." value={form.photoReferencesText} onChange={set("photoReferencesText")} />
              <TextArea label="Lot contents" helper="One identified, probable, or unknown content note per line." value={form.lotContentsText} onChange={set("lotContentsText")} />
              <TextArea label="Lot item estimates" helper="One line: certainty | item | quantity | conservative | expected | optimistic | sell-through % | condition uncertain | duplicate. Certainty is identified, probable, or unknown." value={form.lotItemEstimatesText} onChange={set("lotItemEstimatesText")} rows={5} />
              <TextArea label="Notes" value={form.notes} onChange={set("notes")} />
            </div>
            <div className="flip-auction-calculation">
              <div><span>Maximum recommended bid</span><strong>{formatMinorMoney(intelligence.result?.maximumRecommendedBid)}</strong></div>
              <div><span>Expected net proceeds</span><strong>{formatMinorMoney(intelligence.result?.expectedNetProceeds)}</strong></div>
              <div><span>Profit at recommended bid</span><strong>{formatMinorMoney(intelligence.result?.profitAtMaximumBid)}</strong></div>
              <div><span>Confidence</span><strong>{intelligence.result?.confidence || "Insufficient"}</strong></div>
              <p>{intelligence.error || intelligence.result?.explanation || "Add an expected lot value before relying on a bid ceiling."} This is decision support only and never submits a bid.</p>
              {intelligence.result?.warnings?.length ? <ul>{intelligence.result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
              {intelligence.result?.lotAnalysis ? <details className="code3-compatibility-calculation"><summary>Show lot scenarios</summary><div className="flip-record-facts"><span>Conservative <strong>{formatMinorMoney(intelligence.result.lotAnalysis.scenarios.conservative.netValue)}</strong></span><span>Expected <strong>{formatMinorMoney(intelligence.result.lotAnalysis.scenarios.expected.netValue)}</strong></span><span>Optimistic <strong>{formatMinorMoney(intelligence.result.lotAnalysis.scenarios.optimistic.netValue)}</strong></span></div><p>{intelligence.result.lotAnalysis.spreadDrivers.join(" ") || "No spread driver recorded."}</p></details> : null}
              <details className="code3-compatibility-calculation"><summary>Show previous calculation</summary><div className="flip-record-facts"><span>Previous ceiling <strong>{formatCurrency(result.maximumHammerBid)}</strong></span><span>Premium <strong>{formatCurrency(result.buyerPremiumAtMaximum)}</strong></span><span>Tax <strong>{formatCurrency(result.taxAtMaximum)}</strong></span><span>Total acquisition <strong>{formatCurrency(result.totalCostAtMaximum)}</strong></span></div></details>
              <button type="button" className="secondary-button" disabled={saving || !intelligence.result?.maximumRecommendedBid} onClick={() => set("myMaximumBid")(minorMoneyToMajorInput(intelligence.result.maximumRecommendedBid))}>Use {BRAND_CONFIG.applicationDisplayName} ceiling</button>
            </div>
            {message ? <p className="flip-form-message" role="status">{message}</p> : null}
            <FormActions><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Update auction" : "Save auction"}</button></FormActions>
          </form>
        ) : message ? <p className="flip-form-message" role="status">{message}</p> : null}
      </section>

      <section className="flip-section">
        <div className="flip-filter-bar"><TextInput label="Search auctions" value={query} onChange={setQuery} /><SelectInput label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} /></div>
        {visible.length ? <div className="flip-record-list">{visible.map((auction) => {
          const ending = timingIndicator(auction.endDateTime);
          const pickup = timingIndicator(auction.pickupDeadline, "pickup");
          const structuredValuation = auction.auctionIntelligence?.valuationBasis === "STRUCTURED_LOT_ANALYSIS";
          const expectedValue = formatMinorMoney(
            auction.auctionIntelligence?.expectedLotValue,
            auction.estimatedResaleMid ? formatCurrency(auction.estimatedResaleMid) : "Not enough data",
          );
          return <article className="flip-record-card" key={auction.id}>
            <div className="flip-record-card__head"><div><span>{auction.source}</span><h3>{auction.title}</h3></div><StatusPill tone={auction.riskLevel === "High" ? "danger" : auction.riskLevel === "Low" ? "good" : "warning"}>{auction.riskLevel} risk</StatusPill></div>
            <div className="flip-risk-row">{ending ? <StatusPill tone={ending.tone}>{ending.label}</StatusPill> : null}{pickup ? <StatusPill tone={pickup.tone}>{pickup.label}</StatusPill> : null}<StatusPill>{auction.watchStatus}</StatusPill><StatusPill>{auction.outcome}</StatusPill></div>
            <div className="flip-record-facts"><span>Current <strong>{formatCurrency(auction.currentBid)}</strong></span><span>{BRAND_CONFIG.applicationDisplayName} max <strong>{formatMinorMoney(auction.auctionIntelligence?.maximumRecommendedBid)}</strong></span><span>{structuredValuation ? "Expected lot" : "Mid resale"} <strong>{expectedValue}</strong></span></div>
            {auction.url ? <a href={auction.url} target="_blank" rel="noreferrer">Open auction</a> : <p className="flip-muted-copy">No auction URL saved.</p>}
            <PrimaryButton disabled={saving} onClick={() => setSelectedAuction(auction)}>View Details</PrimaryButton>
            <RecordActions onEdit={() => { if (saveInFlightRef.current) return; setForm(toForm(auction)); setFormOpen(true); window.scrollTo?.({ top: 0, behavior: "smooth" }); }} onDelete={() => { if (!saveInFlightRef.current) return onDelete("auctions", auction.id, auction.title); return false; }} />
          </article>;
        })}</div> : <EmptyState title="No auctions tracked">Add a real auction manually. No auction source is connected in Phase 1.</EmptyState>}
      </section>
    </div>
  );
}
