import { useMemo, useState } from "react";
import EbayConnectionPanel from "../components/EbayConnectionPanel.jsx";
import { CheckField, EmptyState, FormActions, MoneyInput, NumberInput, SectionHeading, SelectInput, StatusPill, TextInput } from "../components/Fields.jsx";
import { searchEbayListings } from "../ebayClient.js";
import { ebaySearchFromRule, isEbaySearchRule } from "../ebayDiscovery.js";
import { formatCurrency } from "../selectors.js";

function blankSearch() {
  return {
    keywords: "",
    categoryId: "",
    gtin: "",
    minimumPrice: "",
    maximumPrice: "",
    currency: "USD",
    conditionIdsText: "",
    buyItNow: true,
    auction: true,
    bestOffer: false,
    deliveryCountry: "US",
    deliveryPostalCode: "",
    localPickupOnly: false,
    pickupCountry: "US",
    pickupPostalCode: "",
    pickupRadius: "35",
    pickupRadiusUnit: "mi",
    excludeKeywords: "",
    newlyListedHours: "",
    maximumDistance: "",
    maximumPurchaseAmount: "",
    productClassifications: [],
    minimumProjectedProfit: "",
    minimumRoi: "",
    minimumConfidence: "",
    limit: 25,
  };
}

function formFromRule(rule) {
  if (!rule) return blankSearch();
  const search = ebaySearchFromRule(rule);
  return {
    ...blankSearch(),
    ...search,
    conditionIdsText: Array.isArray(search.conditionIds) ? search.conditionIds.join(", ") : String(search.conditionIds || ""),
    buyItNow: search.buyingOptions.includes("FIXED_PRICE"),
    auction: search.buyingOptions.includes("AUCTION"),
    bestOffer: search.buyingOptions.includes("BEST_OFFER"),
  };
}

function searchPayload(form, offset = 0) {
  return {
    keywords: form.keywords,
    categoryId: form.categoryId,
    gtin: form.gtin,
    minimumPrice: form.minimumPrice,
    maximumPrice: form.maximumPrice,
    currency: form.currency,
    conditionIds: String(form.conditionIdsText || "").split(/[,|\n]/).map((value) => value.trim()).filter(Boolean),
    buyingOptions: [form.buyItNow ? "FIXED_PRICE" : "", form.auction ? "AUCTION" : "", form.bestOffer ? "BEST_OFFER" : ""].filter(Boolean),
    deliveryCountry: form.deliveryCountry,
    deliveryPostalCode: form.deliveryPostalCode,
    localPickupOnly: form.localPickupOnly,
    pickupCountry: form.pickupCountry,
    pickupPostalCode: form.pickupPostalCode,
    pickupRadius: form.pickupRadius,
    pickupRadiusUnit: form.pickupRadiusUnit,
    excludeKeywords: form.excludeKeywords,
    newlyListedHours: form.newlyListedHours,
    maximumDistance: form.maximumDistance,
    maximumPurchaseAmount: form.maximumPurchaseAmount,
    productClassifications: form.productClassifications,
    minimumProjectedProfit: form.minimumProjectedProfit,
    minimumRoi: form.minimumRoi,
    minimumConfidence: form.minimumConfidence,
    offset,
    limit: Number(form.limit) || 25,
  };
}

function reviewState(listing = {}) {
  if (!listing.title || (!listing.listingUrl && !listing.externalListingId)) return { label: "Missing required information", tone: "danger" };
  if (listing.isExpired || listing.reviewStatus === "Expired") return { label: "Expired listing", tone: "muted" };
  if (listing.reviewStatus === "Imported") return { label: "Already imported", tone: "good" };
  if (listing.reviewStatus === "Needs Re-review" || listing.updateStatus === "Updated" || listing.sourceChangeType === "updated") return { label: "Changed listing", tone: "warning" };
  if (listing.sourceChangeType === "existing" || listing.updateStatus === "Unchanged") return { label: "Existing matching listing", tone: "neutral" };
  return { label: "New result", tone: "tide" };
}

export default function EbayDiscoveryScreen({ state, initialRuleId = "", onMerge, onImport, onUpdate, onNavigate }) {
  const compatibleRules = useMemo(() => state.searchRules.filter(isEbaySearchRule), [state.searchRules]);
  const initialRule = compatibleRules.find((rule) => rule.id === initialRuleId) || null;
  const [selectedRuleId, setSelectedRuleId] = useState(initialRule?.id || "");
  const [form, setForm] = useState(() => formFromRule(initialRule));
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastRequest, setLastRequest] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const [pagination, setPagination] = useState({ offset: 0, limit: 25, total: 0, hasNext: false, hasPrevious: false });
  const [queueQuery, setQueueQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState("Pending");
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const queue = useMemo(() => {
    const needle = queueQuery.trim().toLowerCase();
    return state.providerListings.filter((listing) => {
      if (listing.providerId !== "ebay") return false;
      if (reviewFilter === "Pending" && !["Pending Review", "Needs Re-review"].includes(listing.reviewStatus)) return false;
      if (reviewFilter !== "All" && reviewFilter !== "Pending" && listing.reviewStatus !== reviewFilter) return false;
      if (!needle) return true;
      return [listing.title, listing.sellerName, listing.location, listing.externalListingId].join(" ").toLowerCase().includes(needle);
    });
  }, [queueQuery, reviewFilter, state.providerListings]);

  const loadRule = () => {
    const rule = compatibleRules.find((candidate) => candidate.id === selectedRuleId);
    if (!rule) return setMessage("Choose a compatible saved rule first.");
    setForm(formFromRule(rule));
    setMessage(`${rule.ruleName} loaded. Review location and connector-specific fields before searching.`);
    setError("");
  };

  const runSearch = async (eventOrOffset = 0) => {
    if (eventOrOffset?.preventDefault) eventOrOffset.preventDefault();
    const offset = typeof eventOrOffset === "number" ? eventOrOffset : 0;
    const request = lastRequest && typeof eventOrOffset === "number" && offset !== 0
      ? { ...lastRequest, offset }
      : searchPayload(form, offset);
    if (!request.keywords?.trim() && !request.categoryId?.trim() && !request.gtin?.trim()) {
      setError("Enter keywords, an eBay category ID, or a GTIN before searching.");
      return;
    }
    if (request.localPickupOnly && (!request.pickupPostalCode || !request.pickupRadius)) {
      setError("Local pickup searches need a pickup postal code and radius.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await searchEbayListings(request);
      const merge = await onMerge(result.listings, result.checkedAt);
      setLastRequest(request);
      setLastCheckedAt(result.checkedAt || new Date().toISOString());
      setPagination(result.pagination);
      const deferred = result.deferredFilters?.length
        ? ` Appraisal-only rule fields deferred: ${result.deferredFilters.join(", ")}.`
        : "";
      setMessage(`Checked ${result.listings.length} normalized listing${result.listings.length === 1 ? "" : "s"}: ${merge.added} new, ${merge.updated} updated, ${merge.unchanged} unchanged.${deferred}`);
    } catch (searchError) {
      const retry = searchError.retryAfterSeconds ? ` Retry after about ${searchError.retryAfterSeconds} seconds.` : "";
      setError(`${searchError.message}${retry}`);
    } finally {
      setLoading(false);
    }
  };

  const importListing = async (listing) => {
    const result = await onImport(listing);
    setMessage(result?.error ? `Import failed: ${result.error}` : result.updated ? "The existing Deal Inbox record was updated from this reviewed listing." : "Listing imported to the Deal Inbox for appraisal and decision-making.");
  };

  return (
    <div className="flip-screen">
      <section className="flip-section">
        <SectionHeading eyebrow="Connection status" title="eBay Browse API" detail="Searches run through the private server. No eBay client secret or application token is sent to this browser." />
        <EbayConnectionPanel onStatus={setHealth} />
      </section>

      <section className="flip-section">
        <SectionHeading eyebrow="Manual refresh only" title="Search active eBay listings" detail="Results are sorted by newly listed and always enter Import Review first." actions={<button type="button" className="secondary-button" disabled={loading || !lastRequest} onClick={() => runSearch(pagination.offset)}>{loading ? "Checking…" : "Refresh"}</button>} />
        <div className="flip-ebay-truth" role="note"><strong>About these results</strong><ul><li>These are active eBay listings, not sold comparable records.</li><li>Resale value must be supplied manually or supported by a separately configured source.</li><li>Every result is reviewed before it can enter the Deal Inbox.</li></ul></div>
        {compatibleRules.length ? <div className="flip-rule-runner"><SelectInput label="Saved Search Rules" value={selectedRuleId} onChange={setSelectedRuleId} options={[{ value: "", label: "Choose a saved rule" }, ...compatibleRules.map((rule) => ({ value: rule.id, label: `${rule.ruleName}${rule.enabled ? "" : " (disabled)"}` }))]} /><button type="button" className="secondary-button" onClick={loadRule}>Load rule</button></div> : <p className="flip-muted-copy">No eBay-compatible Saved Searches exist yet. Manual keyword search still works.</p>}
        <form className="flip-form" onSubmit={runSearch}>
          <div className="flip-ebay-search-row"><TextInput label="Search eBay" helper="Search by keywords, or open Filters for category and GTIN fields." value={form.keywords} maxLength="100" onChange={set("keywords")} placeholder="Pokémon binder collection" /><button type="submit" className="primary-button" disabled={loading || health?.configured === false}>{loading ? "Searching eBay…" : "Search eBay"}</button></div>
          <details className="flip-ebay-filters">
            <summary>Filters</summary>
          <div className="flip-form-grid">
            <TextInput label="eBay category ID" helper="Optional numeric category ID." value={form.categoryId} inputMode="numeric" onChange={set("categoryId")} />
            <TextInput label="GTIN" helper="Optional UPC, EAN, or ISBN digits." value={form.gtin} inputMode="numeric" onChange={set("gtin")} />
            <TextInput label="Condition IDs" helper="Optional eBay condition IDs separated by commas." value={form.conditionIdsText} onChange={set("conditionIdsText")} />
            <MoneyInput label="Minimum asking price" value={form.minimumPrice} onChange={set("minimumPrice")} />
            <MoneyInput label="Maximum asking price" value={form.maximumPrice} onChange={set("maximumPrice")} />
            <SelectInput label="Currency" value={form.currency} onChange={set("currency")} options={["USD", "CAD", "GBP", "EUR", "AUD"]} />
            <NumberInput label="Results per page" min="1" max="200" step="1" value={form.limit} onChange={set("limit")} />
            <CheckField label="Buy It Now" checked={form.buyItNow} onChange={set("buyItNow")} />
            <CheckField label="Auction" checked={form.auction} onChange={set("auction")} />
            <CheckField label="Best Offer" checked={form.bestOffer} onChange={set("bestOffer")} />
            <TextInput label="Ship-to country" helper="Two-letter country code." value={form.deliveryCountry} maxLength="2" onChange={set("deliveryCountry")} />
            <TextInput label="Ship-to postal code" value={form.deliveryPostalCode} onChange={set("deliveryPostalCode")} />
            <CheckField label="Local pickup only" helper="eBay requires country, postal code, radius, and unit together." checked={form.localPickupOnly} onChange={set("localPickupOnly")} />
            {form.localPickupOnly ? <>
              <TextInput label="Pickup country" value={form.pickupCountry} maxLength="2" onChange={set("pickupCountry")} />
              <TextInput label="Pickup postal code" value={form.pickupPostalCode} onChange={set("pickupPostalCode")} />
              <NumberInput label="Pickup radius" value={form.pickupRadius} onChange={set("pickupRadius")} />
              <SelectInput label="Radius unit" value={form.pickupRadiusUnit} onChange={set("pickupRadiusUnit")} options={[{ value: "mi", label: "Miles" }, { value: "km", label: "Kilometers" }]} />
            </> : null}
          </div>
          </details>
          {error ? <p className="flip-warning-copy" role="alert">{error}</p> : null}
          {message ? <p className="flip-form-message" role="status">{message}</p> : null}
          {health?.configured === false ? <p className="flip-warning-copy">Add the documented server environment variables before live search can run.</p> : null}
          <FormActions>{lastCheckedAt ? <span className="flip-last-checked">Last checked {new Date(lastCheckedAt).toLocaleString()}</span> : <span className="flip-last-checked">Not checked in this session</span>}</FormActions>
        </form>
        {lastRequest ? <div className="flip-pagination" aria-label="eBay result pages"><button type="button" className="secondary-button" disabled={loading || !pagination.hasPrevious} onClick={() => runSearch(Math.max(0, pagination.offset - pagination.limit))}>Previous</button><span>Offset {pagination.offset} · {pagination.total} indicated matches</span><button type="button" className="secondary-button" disabled={loading || !pagination.hasNext} onClick={() => runSearch(pagination.offset + pagination.limit)}>Next</button></div> : null}
      </section>

      <section className="flip-section">
        <SectionHeading eyebrow="Required review gate" title="Import Review" detail="Classify each result before it enters the Deal Inbox. Importing never creates a purchase or inventory item." actions={queue.some((listing) => listing.reviewStatus === "Imported") ? <button type="button" className="secondary-button" onClick={() => onNavigate("deals")}>Open Deal Inbox</button> : null} />
        <div className="flip-filter-bar"><TextInput label="Search review queue" value={queueQuery} onChange={setQueueQuery} placeholder="Title, seller, location, listing ID…" /><SelectInput label="Review state" value={reviewFilter} onChange={setReviewFilter} options={["Pending", "All", "Pending Review", "Needs Re-review", "Imported", "Dismissed", "Expired"]} /></div>
        {queue.length ? <div className="flip-record-list">{queue.map((listing) => { const displayState = reviewState(listing); return <article className="flip-record-card flip-ebay-listing" key={listing.id}>
          {listing.imageReferences?.[0] ? <img src={listing.imageReferences[0]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
          <div className="flip-record-card__head"><div><span>eBay · {listing.listingType || "Listing"}</span><h3>{listing.title}</h3></div><StatusPill tone={displayState.tone}>{displayState.label}</StatusPill></div>
          <div className="flip-risk-row">{listing.updateStatus && listing.updateStatus !== "Unchanged" ? <StatusPill tone={listing.updateStatus === "Updated" ? "warning" : "neutral"}>{listing.updateStatus}</StatusPill> : null}{listing.isExpired ? <StatusPill tone="muted">Ended</StatusPill> : null}</div>
          <div className="flip-record-facts"><span>Ask <strong>{listing.askingPrice === null || listing.askingPrice === undefined ? "Not supplied" : formatCurrency(listing.askingPrice)}</strong></span><span>Shipping <strong>{listing.purchaseShipping === null || listing.purchaseShipping === undefined ? "Not supplied" : formatCurrency(listing.purchaseShipping)}</strong></span>{listing.currentBid !== null && listing.currentBid !== undefined ? <span>Current bid <strong>{formatCurrency(listing.currentBid)}</strong></span> : null}<span>{listing.condition || "Condition not supplied"}</span></div>
          <p>{listing.location || "Listing location not supplied."}{listing.sellerName ? ` · Seller ${listing.sellerName}${listing.sellerRating ? ` (${listing.sellerRating}% feedback)` : ""}` : ""}</p>
          {listing.updatedFields?.length ? <p className="flip-warning-copy">Updated fields: {listing.updatedFields.join(", ")}</p> : null}
          <p className="flip-source-note"><strong>Data source:</strong> {listing.dataSourceExplanation || listing.dataSource || "Normalized from the eBay Browse API response during a manual search."}</p>
          <small>Last checked {listing.lastCheckedAt ? new Date(listing.lastCheckedAt).toLocaleString() : "not recorded"}{listing.auctionEndTime ? ` · Ends ${new Date(listing.auctionEndTime).toLocaleString()}` : ""}</small>
          {listing.listingUrl ? <a href={listing.listingUrl} target="_blank" rel="noreferrer">Open original eBay listing</a> : null}
          <div className="flip-record-actions">
            {!listing.isExpired && listing.reviewStatus !== "Dismissed" ? <button type="button" className="primary-button" onClick={() => importListing(listing)}>{listing.reviewStatus === "Imported" ? "Refresh Deal Inbox record" : "Import to Deal Inbox"}</button> : null}
            {!["Imported", "Dismissed", "Expired"].includes(listing.reviewStatus) ? <button type="button" className="ghost-button" onClick={() => onUpdate("providerListings", { ...listing, reviewStatus: "Dismissed" }, { title: "eBay discovery dismissed", detail: listing.title })}>Dismiss</button> : null}
          </div>
        </article>; })}</div> : <EmptyState title="No eBay discoveries to review">Run a configured search or adjust the queue filter. This workspace does not seed fake marketplace results.</EmptyState>}
      </section>
    </div>
  );
}
