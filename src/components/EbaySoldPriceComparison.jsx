import { useEffect, useId, useRef, useState } from "react";
import { getEbaySoldHealth, searchEbaySoldComparables } from "../features/flipScout/ebayClient.js";
import { supabase } from "../supabaseClient.js";
import "./market-source-comparison.css";

const PRINTINGS = [["non_holo", "Non-holo"], ["holo", "Holo"], ["reverse_holo", "Reverse holo"], ["first_edition", "First edition"], ["shadowless", "Shadowless"]];
const LANGUAGES = [["en", "English"], ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"], ["de", "German"], ["fr", "French"], ["it", "Italian"], ["es", "Spanish"], ["pt", "Portuguese"]];
const CONDITIONS = [["NM", "Near mint"], ["LP", "Lightly played"], ["MP", "Moderately played"], ["HP", "Heavily played"], ["DMG", "Damaged"]];
const text = value => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const money = value => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
const date = value => new Date(value).toLocaleDateString();

function initialMatch(item, name) {
  const variant = text(item.variant || item.priceSubtype).toLowerCase();
  const language = text(item.language).toLowerCase();
  const condition = text(item.condition).toUpperCase();
  return {
    name, setName: text(item.setName || item.set_name), cardNumber: text(item.cardNumber || item.card_number),
    printing: /reverse/.test(variant) ? "reverse_holo" : /non.?holo|^normal$/.test(variant) ? "non_holo" : /holo/.test(variant) ? "holo" : "",
    language: LANGUAGES.find(([key, label]) => language === key || language === label.toLowerCase())?.[0] || "",
    condition: CONDITIONS.some(([key]) => condition === key) ? condition : "", grader: "", grade: "",
  };
}

function MatchField({ id, fieldKey, label, match, choices, disabled, onChange }) {
  return <label className="sold-price-field" htmlFor={`${id}-${fieldKey}`}><span>{label}</span>
    {choices ? <select id={`${id}-${fieldKey}`} value={match[fieldKey]} required disabled={disabled} onChange={event => onChange(fieldKey, event.target.value)}><option value="">Choose…</option>{choices.map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select>
      : <input id={`${id}-${fieldKey}`} value={match[fieldKey]} required maxLength={fieldKey === "cardNumber" ? 24 : fieldKey === "grade" ? 8 : 80} disabled={disabled} onChange={event => onChange(fieldKey, event.target.value)} />}
  </label>;
}

export default function EbaySoldPriceComparison({ item, name }) {
  const id = useId();
  const [match, setMatch] = useState(() => initialMatch(item, name));
  const [health, setHealth] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const sequence = useRef(0);
  const controller = useRef(null);
  const account = useRef(undefined);

  useEffect(() => {
    const request = new AbortController();
    getEbaySoldHealth({ signal: request.signal }).then(next => { if (!request.signal.aborted) setHealth(next); }).catch(requestError => {
      if (!request.signal.aborted) { setHealth({ configured: false }); setError(requestError.message); }
    });
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id || "";
      if (account.current !== undefined && next !== account.current) {
        sequence.current += 1; request.abort(); controller.current?.abort();
        setResult(null); setHealth(null); setError(""); setBusy("");
      }
      account.current = next;
    });
    return () => { sequence.current += 1; request.abort(); controller.current?.abort(); subscription?.data?.subscription?.unsubscribe(); };
  }, []);

  function change(key, value) {
    sequence.current += 1; controller.current?.abort();
    setBusy(""); setResult(null); setError("");
    setMatch(previous => ({ ...previous, [key]: value, ...(key === "grader" ? { condition: "", grade: "" } : {}) }));
  }

  async function calculate(event) {
    event.preventDefault();
    if (busy || !health?.configured) return;
    const ticket = ++sequence.current;
    const request = new AbortController(); controller.current = request;
    setBusy("search"); setResult(null); setError("");
    try {
      const next = await searchEbaySoldComparables(match, { signal: request.signal });
      if (ticket === sequence.current && !request.signal.aborted) setResult(next);
    } catch (requestError) {
      if (ticket === sequence.current && !request.signal.aborted) setError(requestError.message);
    } finally { if (ticket === sequence.current) setBusy(""); }
  }

  return <section className="market-source-ebay" aria-label="eBay sold market estimate">
    <div className="market-source-provider-heading"><div><h4>eBay sold market estimate</h4><p>Calculate from recent matching card sales, supplied by CompsAPI.</p></div><span className="market-source-status">{result ? "Available" : health?.configured ? "Ready to check" : health ? "Not connected" : "Checking connection"}</span></div>
    {health && !health.configured ? <p role="status">Sold-price estimates need a data-provider connection. Your existing price references remain available.</p> : null}
    <form onSubmit={calculate} aria-label="Match a card for sold prices">
      <div className="sold-price-fields">
        {[["name", "Card name"], ["setName", "Set name"], ["cardNumber", "Card number"], ["printing", "Printing", PRINTINGS], ["language", "Card language", LANGUAGES]].map(([key, label, choices]) => <MatchField key={key} id={id} fieldKey={key} label={label} match={match} choices={choices} disabled={Boolean(busy)} onChange={change} />)}
        <label className="sold-price-field" htmlFor={`${id}-grader`}><span>Raw or graded</span><select id={`${id}-grader`} value={match.grader} disabled={Boolean(busy)} onChange={event => change("grader", event.target.value)}><option value="">Raw card</option>{["PSA", "BGS", "CGC", "SGC", "TAG"].map(grader => <option key={grader}>{grader}</option>)}</select></label>
        <MatchField id={id} fieldKey={match.grader ? "grade" : "condition"} label={match.grader ? "Exact slab grade" : "Raw condition"} choices={match.grader ? undefined : CONDITIONS} match={match} disabled={Boolean(busy)} onChange={change} />
      </div>
      <p className="market-source-match-note">Match the set, number, printing, language, and condition or grade. Other printings and sealed products need a separate price reference.</p>
      <button type="submit" disabled={Boolean(busy) || !health?.configured}>{busy ? "Checking sold prices…" : "Calculate sold market estimate"}</button>
    </form>
    {error ? <p className="market-source-error" role="alert">{error}</p> : null}
    {result ? <div role="status" className="market-source-quote-list">
      <article className="market-source-quote"><strong>{result.marketEligible ? `${money(result.estimatedMarketPrice)} estimated market price` : "Not enough matching sales for an estimate"}</strong><p>{result.sampleSize} matching single-card sales in the last {result.lookbackDays} days · USD · excludes shipping, tax, and fees.</p><small>{result.outliersRemoved} price outliers excluded. At least 3 matching sales are needed. Your saved value stays unchanged.</small></article>
      <details><summary>Review matching sales</summary>{result.comparables.map(sale => <article className="market-source-quote" key={sale.id}><strong>{sale.title}</strong><p>{money(sale.amount)} · {sale.condition} · sold {date(sale.soldAt)}</p><a href={`https://www.ebay.com/itm/${encodeURIComponent(sale.id)}`} target="_blank" rel="noreferrer">View sold listing ↗</a></article>)}</details>
      {result.limitations.map(note => <small key={note}>{note}</small>)}
      {result.moreSalesAvailable ? <small>More sales exist; this estimate uses the matching sample from the requested page.</small> : null}
    </div> : null}
  </section>;
}
