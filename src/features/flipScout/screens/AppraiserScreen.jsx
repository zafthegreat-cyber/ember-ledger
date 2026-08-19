import { useEffect, useMemo, useState } from "react";
import { CONFIDENCE_LEVELS, PRODUCT_CLASSIFICATIONS } from "../constants.js";
import { analyzeListing } from "../calculations.js";
import { formatCurrency, formatPercent } from "../selectors.js";
import { FormActions, MoneyInput, SectionHeading, SelectInput, StatusPill, TextArea, TextInput } from "../components/Fields.jsx";
import { ConfidenceIndicator, RiskIndicator, StickyDecisionBar } from "../../../components/operations/OperationsUI.jsx";

const DRAFT_KEY = "private-business-hub.deal-analysis-draft.v1";
const STEPS = ["Listing", "Item Details", "Purchase Costs", "Resale Assumptions", "Decision"];

function blankAppraisal() {
  return {
    marketplace: "Manual entry",
    listingUrl: "",
    title: "",
    description: "",
    productClassification: "Unknown",
    itemCondition: "",
    itemNotes: "",
    purchasePrice: "",
    purchaseShipping: "",
    purchaseTax: "",
    buyerPremium: "",
    fixedBuyerFees: "",
    travelOrPickupCost: "",
    preparationCost: "",
    otherAcquisitionCosts: "",
    expectedResaleLow: "",
    expectedResaleMidpoint: "",
    expectedResaleHigh: "",
    expectedSellingPlatform: "eBay",
    sellingFeePercentage: "",
    fixedSellingFees: "",
    outboundShipping: "",
    packagingCost: "",
    returnOrFraudReserve: "",
    otherSellingCosts: "",
    minimumDesiredProfit: "",
    minimumDesiredRoi: "",
    confidence: "Low",
    riskNotes: "",
  };
}

function loadDraft() {
  if (typeof window === "undefined") return { form: blankAppraisal(), step: 0 };
  try {
    const saved = JSON.parse(window.sessionStorage?.getItem(DRAFT_KEY) || "null");
    return { form: { ...blankAppraisal(), ...(saved?.form || {}) }, step: Math.min(4, Math.max(0, Number(saved?.step || 0))) };
  } catch {
    return { form: blankAppraisal(), step: 0 };
  }
}

function displayRecommendation(label) {
  if (label === "Strong Buy" || label === "Exceptional Deal") return "Strong Opportunity";
  if (label === "Personal Collection Only") return "Personal Collection";
  if (label === "Insufficient Information") return "Not Enough Information";
  return label;
}

function recommendationTone(label) {
  if (/exceptional|strong/i.test(label)) return "good";
  if (/offer|fair|watch/i.test(label)) return "warning";
  if (/pass/i.test(label)) return "danger";
  return "neutral";
}

export default function AppraiserScreen({ seed, onSave }) {
  const draft = useMemo(loadDraft, []);
  const [form, setForm] = useState(() => ({ ...draft.form, ...(seed || {}) }));
  const [step, setStep] = useState(draft.step);
  const [savedMessage, setSavedMessage] = useState("");
  useEffect(() => {
    if (seed) {
      setForm((current) => ({ ...current, ...seed }));
      setStep(0);
    }
  }, [seed]);
  useEffect(() => {
    try {
      window.sessionStorage?.setItem(DRAFT_KEY, JSON.stringify({ form, step }));
    } catch {
      // The workflow remains usable when session storage is unavailable.
    }
  }, [form, step]);
  const result = useMemo(() => analyzeListing(form), [form]);
  const recommendation = displayRecommendation(result.label);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const riskCount = String(form.riskNotes || "").split(/[,\n]/).map((value) => value.trim()).filter(Boolean).length;
  const missingInformation = [
    !String(form.title || "").trim() && !String(form.listingUrl || "").trim() ? "Listing title or URL" : "",
    !Number(form.purchasePrice) ? "Asking price" : "",
    !Number(form.expectedResaleMidpoint) ? "Expected resale midpoint" : "",
    form.sellingFeePercentage === "" ? "Selling fee percentage" : "",
    form.minimumDesiredProfit === "" ? "Minimum desired profit" : "",
    form.minimumDesiredRoi === "" ? "Minimum desired ROI" : "",
  ].filter(Boolean);

  const save = (event) => {
    event?.preventDefault?.();
    const record = {
      ...form,
      recommendation: result.label,
      landedCost: result.landedCost,
      expectedProfit: result.midpoint.profit,
      expectedRoi: result.midpoint.roi,
      maximumRecommendedPurchasePrice: result.maximumBasePurchasePrice,
      result,
    };
    onSave("appraisals", record, { title: "Deal analysis saved", detail: `${record.title || "Untitled listing"} · ${recommendation}` });
    setSavedMessage("Analysis saved with its assumptions and result.");
  };

  const clear = () => {
    setForm(blankAppraisal());
    setStep(0);
    setSavedMessage("");
    window.sessionStorage?.removeItem(DRAFT_KEY);
  };

  return (
    <div className="flip-screen flip-analysis-workflow">
      <section className="flip-section">
        <SectionHeading title="Deal Analysis" />
        <nav className="flip-analysis-steps" aria-label="Deal Analysis progress">
          {STEPS.map((label, index) => <button key={label} type="button" className={index === step ? "is-active" : index < step ? "is-complete" : ""} aria-current={index === step ? "step" : undefined} onClick={() => index <= step ? setStep(index) : null}><span>{index + 1}</span><strong>{label}</strong></button>)}
        </nav>

        <form className="flip-form" onSubmit={save}>
          {step === 0 ? <section className="flip-analysis-step" aria-labelledby="analysis-listing-title"><div><span>Step 1 of 5</span><h2 id="analysis-listing-title">Listing</h2><p>Capture enough source context to recognize the opportunity later.</p></div><div className="flip-form-grid"><TextInput label="Marketplace" value={form.marketplace} onChange={set("marketplace")} /><TextInput label="Listing URL" type="url" value={form.listingUrl} onChange={set("listingUrl")} /><TextInput label="Title" value={form.title} onChange={set("title")} /><TextArea label="Description" value={form.description} onChange={set("description")} /></div></section> : null}

          {step === 1 ? <section className="flip-analysis-step" aria-labelledby="analysis-item-title"><div><span>Step 2 of 5</span><h2 id="analysis-item-title">Item Details</h2><p>Record what the item is, what is known, and what still creates uncertainty.</p></div><div className="flip-form-grid"><SelectInput label="Product classification" value={form.productClassification} onChange={set("productClassification")} options={PRODUCT_CLASSIFICATIONS} /><TextInput label="Condition" value={form.itemCondition} onChange={set("itemCondition")} /><SelectInput label="Confidence" value={form.confidence} onChange={set("confidence")} options={CONFIDENCE_LEVELS} /><TextArea label="Item notes" value={form.itemNotes} onChange={set("itemNotes")} /><TextArea label="Risk notes" helper="Separate risk flags with commas or new lines." value={form.riskNotes} onChange={set("riskNotes")} /></div></section> : null}

          {step === 2 ? <section className="flip-analysis-step" aria-labelledby="analysis-cost-title"><div><span>Step 3 of 5</span><h2 id="analysis-cost-title">Purchase Costs</h2><p>Landed cost includes every recorded acquisition cost, not only the asking price.</p></div><div className="flip-form-grid"><MoneyInput label="Asking price" value={form.purchasePrice} onChange={set("purchasePrice")} /><MoneyInput label="Shipping" value={form.purchaseShipping} onChange={set("purchaseShipping")} /><MoneyInput label="Tax estimate" value={form.purchaseTax} onChange={set("purchaseTax")} /><MoneyInput label="Buyer premium" value={form.buyerPremium} onChange={set("buyerPremium")} /><MoneyInput label="Fixed buyer fees" value={form.fixedBuyerFees} onChange={set("fixedBuyerFees")} /><MoneyInput label="Pickup / travel" value={form.travelOrPickupCost} onChange={set("travelOrPickupCost")} /><MoneyInput label="Preparation / cleaning" value={form.preparationCost} onChange={set("preparationCost")} /><MoneyInput label="Other acquisition costs" value={form.otherAcquisitionCosts} onChange={set("otherAcquisitionCosts")} /></div><div className="flip-live-total"><span>Current landed-cost estimate</span><strong>{formatCurrency(result.landedCost)}</strong></div></section> : null}

          {step === 3 ? <section className="flip-analysis-step" aria-labelledby="analysis-resale-title"><div><span>Step 4 of 5</span><h2 id="analysis-resale-title">Resale Assumptions</h2><p>Use your own researched range. The application does not turn active listing prices into market value.</p></div><div className="flip-form-grid"><MoneyInput label="Expected resale low" value={form.expectedResaleLow} onChange={set("expectedResaleLow")} /><MoneyInput label="Expected resale midpoint" value={form.expectedResaleMidpoint} onChange={set("expectedResaleMidpoint")} /><MoneyInput label="Expected resale high" value={form.expectedResaleHigh} onChange={set("expectedResaleHigh")} /><TextInput label="Expected selling platform" value={form.expectedSellingPlatform} onChange={set("expectedSellingPlatform")} /><TextInput label="Selling fee percentage" helper="Enter 13.25 for 13.25%." type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.sellingFeePercentage} onChange={set("sellingFeePercentage")} /><MoneyInput label="Fixed selling fees" value={form.fixedSellingFees} onChange={set("fixedSellingFees")} /><MoneyInput label="Outbound shipping" value={form.outboundShipping} onChange={set("outboundShipping")} /><MoneyInput label="Packaging cost" value={form.packagingCost} onChange={set("packagingCost")} /><MoneyInput label="Return / fraud reserve" value={form.returnOrFraudReserve} onChange={set("returnOrFraudReserve")} /><MoneyInput label="Other selling costs" value={form.otherSellingCosts} onChange={set("otherSellingCosts")} /><MoneyInput label="Minimum desired profit" value={form.minimumDesiredProfit} onChange={set("minimumDesiredProfit")} /><TextInput label="Minimum desired ROI" helper="Enter 30 for 30%." type="number" inputMode="decimal" min="0" step="0.1" value={form.minimumDesiredRoi} onChange={set("minimumDesiredRoi")} /></div></section> : null}

          {step === 4 ? <section className="flip-analysis-step ops-decision-panel" aria-labelledby="analysis-decision-title">
            <div className="flip-result-title"><span>Recommendation</span><StatusPill tone={recommendationTone(result.label)}>{recommendation}</StatusPill><h2 id="analysis-decision-title">{form.title || "Current assumptions"}</h2></div>
            <div className="flip-decision-priority"><article><span>Maximum offer</span><strong>{formatCurrency(result.maximumRecommendedOffer)}</strong></article><article><span>Landed cost</span><strong>{formatCurrency(result.landedCost)}</strong></article><article><span>Expected profit</span><strong>{formatCurrency(result.midpoint.profit)}</strong></article><article><span>Expected ROI</span><strong>{formatPercent(result.midpoint.roi)}</strong></article></div>
            <div className="ops-indicator-row"><ConfidenceIndicator value={result.confidence} /><RiskIndicator value={riskCount ? `${riskCount} flag${riskCount === 1 ? "" : "s"}` : "No flags entered"} /></div>
            <button type="button" className="primary-button flip-decision-primary" onClick={save}>Save decision</button>
            <div className="flip-scenario-table" role="table" aria-label="Low midpoint and high appraisal outcomes"><div role="row" className="flip-scenario-table__head"><span>Scenario</span><span>Net proceeds</span><span>Profit</span><span>ROI</span></div>{[["Low", result.low], ["Midpoint", result.midpoint], ["High", result.high]].map(([label, row]) => <div role="row" key={label}><strong>{label}<small>{formatCurrency(row.expectedResalePrice)} resale</small></strong><span>{formatCurrency(row.netProceeds)}</span><span className={row.profit >= 0 ? "flip-positive" : "flip-negative"}>{formatCurrency(row.profit)}</span><span>{formatPercent(row.roi)}</span></div>)}</div>
            <div className="flip-decision-disclosures">
              <details className="flip-decision-details" name="deal-analysis-details"><summary>Show assumptions</summary><div className="flip-result-metrics"><article><span>Break-even resale</span><strong>{result.breakEvenResalePrice === null ? "Unavailable" : formatCurrency(result.breakEvenResalePrice)}</strong></article><article><span>Maximum purchase price</span><strong>{formatCurrency(result.maximumBasePurchasePrice)}</strong></article></div><div className="flip-rule-checks"><div className={result.meetsProfit ? "is-pass" : "is-fail"}><span aria-hidden="true">{result.meetsProfit ? "✓" : "!"}</span><p><strong>Minimum profit</strong><small>{result.meetsProfit ? "Meets rule" : "Does not meet rule"}</small></p></div><div className={result.meetsRoi ? "is-pass" : "is-fail"}><span aria-hidden="true">{result.meetsRoi ? "✓" : "!"}</span><p><strong>Minimum ROI</strong><small>{result.meetsRoi ? "Meets rule" : "Does not meet rule"}</small></p></div></div></details>
              <details className="flip-decision-details" name="deal-analysis-details"><summary>Show calculation</summary><div className="flip-calculation-explanation"><h3>How this was calculated</h3><p>{result.explanation}</p><p>Net proceeds subtract selling fees, outbound shipping, packaging, reserves, and other selling costs. The maximum landed cost must satisfy both your minimum-profit and minimum-ROI rules. The maximum offer then subtracts acquisition costs other than the base purchase price.</p></div></details>
              <details className="flip-decision-details" name="deal-analysis-details"><summary>Show risks</summary><div className="flip-assumption-note"><strong>Risk flags and missing information</strong><p>{result.riskFlags.length ? result.riskFlags.join(" · ") : "No risk flags were entered. That does not mean the listing is risk-free."}</p><small>{missingInformation.length ? `Missing: ${missingInformation.join(", ")}.` : "Core calculation assumptions are present."}</small></div></details>
            </div>
          </section> : null}

          {savedMessage ? <p className="flip-form-message" role="status">{savedMessage}</p> : null}
          <FormActions>
            {step > 0 ? <button type="button" className="secondary-button" onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button> : null}
            {step < 4 ? <button type="button" className="primary-button" onClick={() => setStep((current) => Math.min(4, current + 1))}>Continue</button> : null}
            <button type="button" className="ghost-button" onClick={clear}>Clear</button>
          </FormActions>
        </form>
      </section>
      {step === 4 ? <StickyDecisionBar recommendation={recommendation} maximumOffer={formatCurrency(result.maximumRecommendedOffer)} action={<button type="button" className="ops-button ops-button--primary" onClick={save}>Save decision</button>} /> : null}
    </div>
  );
}
