import { useEffect, useRef, useState } from "react";
import { fetchMarketSourceQuotes, resolveMarketSourceIdentity } from "../services/liveMarketSources.mjs";
import { searchEbayListings } from "../features/flipScout/ebayClient.js";
import { supabase } from "../supabaseClient.js";
import "./market-source-comparison.css";

const EMPTY_ITEM = Object.freeze({});
const STATUS_LABELS = { ready: "Checked", match_required: "Match needed", no_quote: "No quote", unavailable: "Unavailable", server_feed_required: "Server feed needed", aborted: "Stopped", not_checked: "Not checked" };

function text(value) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function dateLabel(value) { const date = new Date(value || ""); return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not supplied"; }
function priceLabel(value, currency = "USD") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Not supplied";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "code" }).format(amount); }
  catch { return `${amount.toFixed(2)} ${text(currency)}`; }
}
function sourceLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["tcgplayer.com", "tcgcsv.com", "cardmarket.com", "tcgdex.net", "ebay.com", "ebay.co.uk", "ebay.ca", "ebay.com.au", "ebay.de"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : "";
  } catch { return ""; }
}

function ebaySearch(item, name) {
  const keywords = [...new Set([name, text(item.setName || item.set_name), text(item.cardNumber || item.card_number), text(item.variant || item.priceSubtype)])].filter(Boolean).join(" ").slice(0, 100);
  const candidateGtin = text(item.upc || item.barcode).replace(/[ -]/g, "");
  return { keywords, ...(/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(candidateGtin) ? { gtin: candidateGtin } : {}), currency: "USD", buyingOptions: ["FIXED_PRICE"], limit: 6, offset: 0 };
}

function QuoteCard({ quote }) {
  const link = sourceLink(quote.sourceUrl);
  const basis = quote.kind === "listing" ? "Asking price" : quote.kind === "trend" ? "Price trend" : quote.priceBasis === "unknown" ? "Cached reference" : quote.priceBasis === "mid" ? "Mid reference" : "Market estimate";
  return <article className="market-source-quote">
    <div className="market-source-quote-heading"><strong>{priceLabel(quote.amount, quote.currency)}</strong><span>{basis}</span></div>
    <small>{quote.sourceLabel}{quote.via ? ` via ${quote.via}` : ""}{quote.marketEligible === false ? " · Reference only" : ""}</small>
    <p>{[quote.variant, quote.condition].filter(Boolean).join(" · ") || "Product-level reference"}</p>
    <small>Source updated: {dateLabel(quote.observedAt)}</small>
    {quote.snapshotLastImportedAt ? <small>Daily snapshot imported: {dateLabel(quote.snapshotLastImportedAt)}</small> : null}
    {quote.matchNote ? <p className="market-source-match-note">{quote.matchNote}</p> : null}
    {link ? <a href={link} target="_blank" rel="noreferrer">View source<span className="sr-only"> for {quote.sourceLabel || "this quote"}</span> ↗</a> : null}
  </article>;
}

function ComparisonSession({ item, name }) {
  const [result, setResult] = useState(null);
  const [ebayResult, setEbayResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const controller = useRef(null);
  const account = useRef(undefined);
  const search = ebaySearch(item, name);

  useEffect(() => {
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      const nextAccount = session?.user?.id || "";
      if (account.current !== undefined && account.current !== nextAccount) {
        sequence.current += 1;
        controller.current?.abort();
        inFlight.current = false;
        setBusy(""); setResult(null); setEbayResult(null); setError("");
      }
      account.current = nextAccount;
    });
    return () => {
      sequence.current += 1;
      controller.current?.abort();
      subscription?.data?.subscription?.unsubscribe();
    };
  }, []);

  async function checkSources() {
    if (inFlight.current) return;
    inFlight.current = true;
    const ticket = ++sequence.current;
    const requestController = new AbortController();
    controller.current = requestController;
    setBusy("sources"); setError("");
    try {
      const next = await fetchMarketSourceQuotes(item, { signal: requestController.signal });
      if (ticket === sequence.current && !requestController.signal.aborted) setResult(next);
    } catch (requestError) {
      if (ticket === sequence.current && !requestController.signal.aborted) setError(requestError?.message || "Could not check price sources. Your saved value is unchanged.");
    } finally {
      if (ticket === sequence.current) { inFlight.current = false; setBusy(""); }
    }
  }

  async function checkEbay() {
    if (inFlight.current || (!search.keywords && !search.gtin)) return;
    inFlight.current = true;
    const ticket = ++sequence.current;
    setBusy("ebay"); setError("");
    try {
      // The existing connector enforces account and owner access on the server.
      const next = await searchEbayListings(search);
      if (ticket === sequence.current) setEbayResult(next);
    } catch (requestError) {
      if (ticket === sequence.current) {
        const message = requestError?.status === 404 ? "The eBay connector is not available in this app session." : requestError?.message || "Could not check eBay asking prices.";
        setError(`${message} Your saved value is unchanged.`);
      }
    } finally {
      if (ticket === sequence.current) { inFlight.current = false; setBusy(""); }
    }
  }

  const sources = result?.sources || [{ id: "tcgplayer", label: "TCGplayer", status: "not_checked", message: "Daily cached market estimates through TCGCSV, or linked card references through TCGdex." }, { id: "cardmarket", label: "Cardmarket", status: "not_checked", message: "EUR price references when available for a linked card. Currency remains separate." }];
  return <section className="market-source-comparison" aria-label="Compare market price sources" aria-busy={Boolean(busy)}>
    <div className="market-source-heading"><div><span className="market-source-eyebrow">Price check</span><h3>Compare sources</h3><p>Check current references for {name}. Your saved value stays unchanged.</p></div><button type="button" disabled={Boolean(busy)} onClick={checkSources}>{busy === "sources" ? "Checking sources…" : "Refresh sources"}</button></div>
    <p className="market-source-helper">Match the game, product, variant, and condition before using a quote. Currencies are shown separately.</p>
    <div className="market-source-provider-grid">
      {sources.map((source) => {
        const quotes = (result?.quotes || []).filter((quote) => quote.sourceId === (source.quoteSourceId || source.id) && (!source.via || quote.via === source.via));
        return <section className="market-source-provider" key={source.id} aria-label={`${source.label} price references`}>
          <div className="market-source-provider-heading"><h4>{source.label}</h4><span className={`market-source-status ${source.status === "ready" ? "is-ready" : ""}`}>{STATUS_LABELS[source.status] || "Needs review"}</span></div>
          <p>{source.message}</p>
          {quotes.length ? <div className="market-source-quote-list">{quotes.slice(0, 8).map((quote) => <QuoteCard key={quote.id} quote={quote} />)}</div> : null}
          {quotes.length > 8 ? <small>Showing 8 of {quotes.length} reference quotes. Open the source to review more variants.</small> : null}
        </section>;
      })}
    </div>
    <section className="market-source-ebay" aria-label="Compare eBay asking prices">
      <div className="market-source-provider-heading"><div><h4>eBay</h4><p>Active asking prices for comparison. Completed-sale data is not connected.</p></div><button type="button" className="secondary-button" disabled={Boolean(busy) || (!search.keywords && !search.gtin)} onClick={checkEbay}>{busy === "ebay" ? "Checking eBay…" : "Compare eBay asking prices"}</button></div>
      <small>Search: {search.keywords || search.gtin || "Add an item name or barcode first."}</small>
      {ebayResult ? <><p className="market-source-match-note">Review each title and condition. These listings are not confirmed matches and do not change your market value.</p><div className="market-source-ebay-list">{(ebayResult.listings || []).slice(0, 6).map((listing) => {
        const link = sourceLink(listing.listingUrl);
        return <article className="market-source-quote" key={listing.id || listing.externalListingId}>
          <strong>{listing.title || "eBay listing"}</strong><p>{priceLabel(listing.askingPrice, listing.priceCurrency || "USD")} asking · {listing.condition || "Condition not supplied"}</p><small>Shipping: {Number(listing.purchaseShipping) === 0 && listing.purchaseShipping !== null && listing.purchaseShipping !== undefined ? "Free" : priceLabel(listing.purchaseShipping, listing.priceCurrency || "USD")}</small>{link ? <a href={link} target="_blank" rel="noreferrer">View eBay listing ↗</a> : null}
        </article>;
      })}</div>{!ebayResult.listings?.length ? <p>No active listings were returned. Your saved value is unchanged.</p> : null}<small>eBay checked: {dateLabel(ebayResult.checkedAt)}</small></> : null}
    </section>
    {error ? <p className="market-source-error" role="alert">{error}</p> : null}
    <p className="market-source-footnote" role="status">{busy ? "Checking requested sources…" : result?.checkedAt ? `Sources checked: ${dateLabel(result.checkedAt)}. Source update times are shown with each quote.` : "Refresh sources to check linked product IDs. No automatic changes are made to your records."}</p>
  </section>;
}

export default function MarketSourceComparison({ marketItem = EMPTY_ITEM, productName = "Product" }) {
  const identity = resolveMarketSourceIdentity(marketItem);
  const name = text(productName) || text(marketItem.name || marketItem.productName || marketItem.cardName) || "this item";
  const key = JSON.stringify([identity.key, name, text(marketItem.id), text(marketItem.setName || marketItem.set_name), text(marketItem.cardNumber || marketItem.card_number), text(marketItem.upc || marketItem.barcode)]);
  return <ComparisonSession key={key} item={marketItem} name={name} />;
}
