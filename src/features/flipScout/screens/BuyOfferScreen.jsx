import { useLayoutEffect, useRef, useState } from "react";
import { PrimaryButton, QuietButton, StatusBadge } from "../../../components/operations/OperationsUI.jsx";
import { SelectField, TextField } from "../../../components/operations/RecordExperience.jsx";
import { BUY_OFFER_AVAILABILITY, BUY_OFFER_DEMAND, BUY_OFFER_PRODUCT_TYPES, calculateBuyOffer, defaultBuyOffer } from "../buyOffer.js";
import "../buy-offer.css";

const DRAFT_KEY = "code3.buy-offer-draft.v1";
const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percent = (basisPoints) => `${(basisPoints / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
function money(minor) {
  const amount = BigInt(minor), absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}$${integerFormat.format(absolute / 100n)}.${String(absolute % 100n).padStart(2, "0")}`;
}

function readDraft() {
  const fallback = { form: defaultBuyOffer(), issue: "" };
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || !saved.form || typeof saved.form !== "object" || Array.isArray(saved.form)) throw Error("Invalid draft");
    const form = defaultBuyOffer(saved.form.mode === "collection" ? "collection" : "resale");
    for (const key of Object.keys(form)) {
      if (typeof saved.form[key] === "string" && saved.form[key].length <= (key === "title" ? 160 : 40)) form[key] = saved.form[key];
    }
    return { form, issue: "" };
  } catch {
    return { ...fallback, issue: "The previous calculator draft could not be read. You can still make a new estimate." };
  }
}

export default function BuyOfferScreen() {
  const [draft, setDraft] = useState(readDraft);
  const [review, setReview] = useState(null);
  const [errors, setErrors] = useState({});
  const formRef = useRef(null), resultRef = useRef(null);
  const pendingFocus = useRef(null);
  const { form, issue } = draft;
  const hasMsrp = ["sealed", "supplies"].includes(form.productType);

  useLayoutEffect(() => {
    const intent = pendingFocus.current;
    pendingFocus.current = null;
    if (!intent) return;
    if (intent.result) resultRef.current?.focus();
    else {
      const invalid = Array.from(formRef.current?.elements || []).find((field) => intent.errors[field.name]);
      const details = invalid?.closest("details");
      if (details) details.open = true;
      invalid?.focus();
    }
  });

  function update(next) {
    let issue = "";
    try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, form: next })); }
    catch { issue = "This tab could not save your draft. Keep this page open while comparing offers."; }
    setDraft({ form: next, issue });
    setReview(null);
    setErrors({});
  }

  function change(key, value) {
    const next = { ...form, [key]: value };
    if (key === "mode" && form.basePercent === defaultBuyOffer(form.mode).basePercent) next.basePercent = defaultBuyOffer(value).basePercent;
    if (key === "productType" && !["sealed", "supplies"].includes(value) && form.availability === "retail") next.availability = "unknown";
    update(next);
  }

  function calculate(event) {
    event.preventDefault();
    const next = calculateBuyOffer(form);
    pendingFocus.current = next.valid ? { result: true } : { errors: next.errors || {} };
    setErrors(next.errors || {});
    setReview(next.valid ? next : null);
  }

  function reset() {
    if (!window.confirm("Reset this buy-offer draft and its result?")) return;
    update(defaultBuyOffer(form.mode === "collection" ? "collection" : "resale"));
    formRef.current?.querySelector('[name="title"]')?.focus();
  }

  const field = (key) => ({ name: key, value: form[key], error: errors[key], onChange: (value) => change(key, value) });
  const amount = (key) => ({ ...field(key), inputMode: "decimal", maxLength: 40, autoComplete: "off", placeholder: "0.00" });

  return <div className="buy-offer" data-testid="buy-offer-screen">
    <header className="buy-offer__intro"><div><p className="buy-offer__eyebrow">A number to start the conversation</p><h2>Buy Offer</h2><p>Compare a seller’s price with a clear offer range for your collection or your next resale.</p></div><StatusBadge>USD · Manual inputs</StatusBadge></header>
    <div className="buy-offer__layout">
      <form ref={formRef} aria-label="Buy offer inputs" className="buy-offer__form" onSubmit={calculate} noValidate>
        <section className="buy-offer__card">
          <fieldset className="buy-offer__mode"><legend>Buying for</legend>{[["resale", "Resale"], ["collection", "My collection"]].map(([value, label]) => <label key={value}><input type="radio" name="mode" value={value} checked={form.mode === value} onChange={() => change("mode", value)} /><span>{label}</span></label>)}</fieldset>
          {errors.mode ? <p role="alert">{errors.mode}</p> : null}
          <div className="buy-offer__fields">
            <TextField label="Product or lot" {...field("title")} maxLength={160} placeholder="e.g. Sealed booster box" className="buy-offer__wide" helper="Use prices for one item, or totals for one whole lot, throughout." />
            <SelectField label="Product type" {...field("productType")} options={BUY_OFFER_PRODUCT_TYPES} />
            <TextField label="Market value (USD)" {...amount("marketPrice")} required helper="Recent sold prices for the same product, condition, language and edition. An asking price alone is not sold evidence." />
            {hasMsrp ? <TextField label="MSRP (USD)" {...amount("msrp")} required={form.availability === "retail"} helper="Optional unless it is available to buy at MSRP." /> : null}
            <TextField label="Seller’s asking price (USD)" {...amount("askingPrice")} helper="Optional. Your offer will never exceed this price." />
            <SelectField label="Availability" {...field("availability")} options={BUY_OFFER_AVAILABILITY.filter((option) => hasMsrp || option.value !== "retail")} helper="Your current observation, not a live stock check." />
            <SelectField label="How sought after is it?" {...field("demand")} options={BUY_OFFER_DEMAND} helper="Use demand for this exact item. Choose Unknown if unsure." />
          </div>
        </section>
        <details className="buy-offer__settings buy-offer__card">
          <summary><span>Costs & offer settings<small>Adjust the starting percentage and your costs.</small></span></summary>
          <div className="buy-offer__fields">
            <TextField label="Starting offer percentage" {...field("basePercent")} inputMode="decimal" maxLength={8} helper="Editable planning rule: 70% for resale or 85% for a collection. Product, availability and demand adjust it." />
            <TextField label="Buying costs (USD)" {...amount("acquisitionCosts")} helper="Your total tax, shipping, pickup or other buying costs, excluding the offer itself." />
            {form.mode === "resale" ? <>
              <TextField label="Selling fee percentage" {...field("sellingFeePercent")} inputMode="decimal" maxLength={8} helper="Enter your expected effective rate. No platform fee is looked up." />
              <TextField label="Other selling costs (USD)" {...amount("sellingCosts")} helper="Shipping, packaging, fixed fees and your reserve." />
              <TextField label="Minimum profit (USD)" {...amount("minimumProfit")} helper="The amount to leave after the offer and all entered costs." />
            </> : null}
          </div>
        </details>
        <p className="buy-offer__note">Costs start at $0. Add your own before relying on the offer ceiling. These are editable negotiation rules, not a market appraisal.</p>
        {issue ? <p className="buy-offer__notice" role="status">{issue}</p> : null}
        <div className="buy-offer__actions"><PrimaryButton type="submit">Calculate offer</PrimaryButton><QuietButton onClick={reset}>Reset inputs</QuietButton></div>
      </form>

      <aside ref={resultRef} className="buy-offer__result buy-offer__card" tabIndex={-1} aria-labelledby="buy-offer-result-title">
        <p className="buy-offer__eyebrow">Your offer plan</p>
        <h3 id="buy-offer-result-title">{review?.blocked ? "No offer fits these costs" : review ? "A starting point for this deal" : "What should you offer?"}</h3>
        {!review ? <div className="buy-offer__empty"><span aria-hidden="true">%</span><p>Enter the product’s market value and your buying assumptions, then calculate a range.</p><p>Changing an input clears the previous result so you always review the current numbers.</p></div> : <>
          {form.title ? <p className="buy-offer__product">{form.title}</p> : null}
          {review.blocked ? <p className="buy-offer__notice">{review.blockedReason || "Your costs and minimum profit leave no room for a positive offer. Review those inputs before negotiating."}</p> : <>
            <div className="buy-offer__target"><span>Target offer</span><strong>{money(review.targetMinor)}</strong><b>{percent(review.marketPercentBps)} of market value</b></div>
            <dl className="buy-offer__range"><div><dt>Open with</dt><dd>{money(review.openingMinor)}</dd></div><div><dt>Offer ceiling</dt><dd>{money(review.maximumMinor)}</dd></div></dl>
          </>}
          <dl className="buy-offer__comparison"><div><dt>Entered market value</dt><dd>{money(review.marketMinor)}</dd></div><div><dt>Pricing reference</dt><dd>{money(review.referenceMinor)}</dd></div>{review.msrpMinor != null ? <div><dt>Entered MSRP</dt><dd>{money(review.msrpMinor)}</dd></div> : null}{review.askingMinor != null ? <div><dt>Seller’s asking price</dt><dd>{money(review.askingMinor)}</dd></div> : null}{!review.blocked && review.askingPercentBps != null ? <div><dt>Target as % of asking</dt><dd>{percent(review.askingPercentBps)}</dd></div> : null}{!review.blocked && review.projectedProfitMinor != null ? <div><dt>Profit at entered resale value</dt><dd>{money(review.projectedProfitMinor)}</dd></div> : null}</dl>
          {review.warnings?.length ? <ul className="buy-offer__warnings" aria-label="Assumptions to review">{review.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
          <details className="buy-offer__breakdown"><summary>How this offer is calculated</summary><p>The adjustments below are planning assumptions. They change how much of the pricing reference to offer; they do not change market value.</p><dl>{review.factors.map((factor) => <div key={factor.key}><dt>{factor.label}</dt><dd>{factor.points > 0 ? "+" : ""}{factor.points} pts</dd></div>)}</dl><p>Policy target: {review.adjustedPercent}% of the reference before cost and asking-price limits. The opening offer is 95% of the final target.</p><dl>{review.limits.map((limit) => <div key={limit.label}><dt>{limit.label}</dt><dd>{money(limit.amountMinor)}</dd></div>)}</dl><p>When a sealed product or supplies can be bought at MSRP, the lower of MSRP and market is the reference. Otherwise the market value is used. All offers round down to whole cents.</p></details>
          <p className="buy-offer__note">Based on your inputs. No live prices are fetched and no offer, purchase or inventory record is submitted.</p>
        </>}
      </aside>
    </div>
  </div>;
}
