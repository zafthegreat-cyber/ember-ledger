import { useEffect, useMemo, useState } from "react";
import { CATALOG_SORT_OPTIONS } from "../utils/catalogSortUtils";
import { searchPokemonCatalog } from "../services/pokemonCatalogSearch";
import MarketPriceHistoryPanel from "./MarketPriceHistoryPanel";
import SmartCatalogSearchBox from "./SmartCatalogSearchBox";

export const WHAT_DID_I_SEE_STORAGE_KEY = "tide_tradr_what_did_i_see_reports";

const RESULT_LIMIT = 25;
const STOCK_STATUSES = ["In stock", "Low stock", "Sold out", "Behind counter", "Locked case", "Unknown"];
const DISPLAY_TYPES = ["shelf", "endcap", "locked case", "front counter", "checkout lane", "vendor display", "other"];
const CONDITIONS = ["sealed clean", "damaged box", "opened/tampered", "loose packs", "unknown"];
const DEAL_RATINGS = ["good buy", "fair", "overpriced", "avoid", "unknown"];
const RESTOCK_CONFIDENCE = ["high", "medium", "low", "unknown"];
const FILTERS = ["All", "Cards", "Sealed", "Has market price", "Missing market price", "Has image"];

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function moneyValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function compactSource(product = {}) {
  return product.marketSource || product.sourceType || product.source || "Unknown";
}

function productTitle(product = {}) {
  return product.catalogType === "card"
    ? product.cardName || product.name || "Unknown card"
    : product.productName || product.name || "Unknown product";
}

function productImage(product = {}) {
  return product.imageUrl || product.imageLarge || product.imageSmall || "";
}

function productSourceUrl(product = {}) {
  return product.sourceUrl || product.marketUrl || product.tcgplayerUrl || product.imageSourceUrl || "";
}

function makeDetails(product, reportDefaults) {
  return {
    id: makeId("seen-item"),
    catalogProductId: product.id,
    storeName: reportDefaults.storeName || "",
    dateSeen: reportDefaults.visitDate || today(),
    timeSeen: reportDefaults.visitTime || currentTime(),
    shelfPrice: "",
    quantitySeen: "",
    stockStatus: "In stock",
    notes: "",
    aisleLocation: "",
    displayType: "shelf",
    condition: product.catalogType === "card" ? "unknown" : "sealed clean",
    photoUrl: "",
    barcodeSeen: product.barcode || product.upc || "",
    dealRating: "unknown",
    restockConfidence: "unknown",
    collapsed: false,
  };
}

function buildCatalogSnapshot(product = {}) {
  return {
    catalogProductId: product.id,
    name: productTitle(product),
    imageUrl: productImage(product),
    productType: product.productType || (product.catalogType === "card" ? "Card" : "Sealed"),
    setName: product.setName || product.expansion || "",
    expansion: product.expansion || product.setName || "",
    cardNumber: product.cardNumber || product.card_number || "",
    marketPrice: moneyValue(product.marketPrice || product.marketValue || product.marketValueNearMint || product.midPrice),
    lowPrice: moneyValue(product.lowPrice),
    midPrice: moneyValue(product.midPrice),
    highPrice: moneyValue(product.highPrice),
    marketUrl: productSourceUrl(product),
    sourceLabel: compactSource(product),
    barcode: product.barcode || product.upc || "",
    sku: product.sku || product.externalProductId || product.tcgplayerProductId || "",
  };
}

function getSavedReports() {
  try {
    return JSON.parse(localStorage.getItem(WHAT_DID_I_SEE_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReports(reports) {
  localStorage.setItem(WHAT_DID_I_SEE_STORAGE_KEY, JSON.stringify(reports));
}

function dealSummary(shelfPrice, marketPrice) {
  const shelf = moneyValue(shelfPrice);
  const market = moneyValue(marketPrice);
  if (!shelf || !market) return { difference: 0, label: "Unknown" };
  const difference = shelf - market;
  if (shelf <= market * 0.85) return { difference, label: "Good Deal" };
  if (shelf <= market * 1.1) return { difference, label: "Fair" };
  return { difference, label: "Overpriced" };
}

export default function WhatDidISee({
  supabase,
  isSupabaseConfigured,
  mapCatalogRow,
  initialProduct,
  stores = [],
  money = (value) => `$${Number(value || 0).toFixed(2)}`,
  onAddToVault,
  onAddToForge,
  onSaveScoutReport,
  onMessage,
  onBack,
  showHeader = true,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("bestMatch");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedItems, setSelectedItems] = useState({});
  const [storeName, setStoreName] = useState("");
  const [visitDate, setVisitDate] = useState(today());
  const [visitTime, setVisitTime] = useState(currentTime());
  const [reportNotes, setReportNotes] = useState("");
  const [savedReportId, setSavedReportId] = useState("");

  const selectedCount = Object.keys(selectedItems).length;
  const totalPages = totalCount ? Math.max(1, Math.ceil(totalCount / RESULT_LIMIT)) : null;

  const reportDefaults = useMemo(() => ({ storeName, visitDate, visitTime }), [storeName, visitDate, visitTime]);

  useEffect(() => {
    if (!initialProduct?.id) return;
    setResults((current) => [initialProduct, ...current.filter((product) => String(product.id) !== String(initialProduct.id))]);
    setSelectedItems((current) => {
      if (current[initialProduct.id]) return current;
      return {
        ...current,
        [initialProduct.id]: {
          product: initialProduct,
          details: makeDetails(initialProduct, reportDefaults),
        },
      };
    });
  }, [initialProduct?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase catalog search is not configured. Imported catalog data cannot be searched from this screen yet.");
      return;
    }

    const timer = window.setTimeout(async () => {
      const cleanedQuery = String(query || "").trim().replace(/[,%()'"]/g, " ").slice(0, 120);
      if (cleanedQuery.length < 2 && filter === "All") {
        setResults(initialProduct?.id ? [initialProduct] : []);
        setTotalCount(initialProduct?.id ? 1 : null);
        setLoading(false);
        setError("");
        return;
      }
      setLoading(true);
      setError("");
      const productGroup = filter === "Cards" ? "Cards" : filter === "Sealed" ? "Sealed" : "All";
      const dataFilter =
        filter === "Has market price" ? "Has market price" :
        filter === "Missing market price" ? "Missing price" :
        filter === "Has image" ? "Has image" :
        "All";

      try {
        const result = await searchPokemonCatalog({
          supabase,
          query: cleanedQuery,
          mode: "general",
          productGroup,
          dataFilter,
          sort,
          page,
          pageSize: RESULT_LIMIT,
          force: cleanedQuery.length >= 2 || filter !== "All",
        });
        setResults((result.rows || []).map((row) => mapCatalogRow(row)));
        setTotalCount(result.count ?? null);
      } catch (searchError) {
        setError(searchError.message);
        setResults([]);
        setTotalCount(null);
      }
      setLoading(false);
    }, query.trim() ? 350 : 100);

    return () => window.clearTimeout(timer);
  }, [filter, initialProduct?.id, isSupabaseConfigured, mapCatalogRow, page, query, sort, supabase]);

  useEffect(() => {
    setPage(1);
  }, [filter, query, sort]);

  function toggleItem(product) {
    setSelectedItems((current) => {
      if (current[product.id]) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }
      return {
        ...current,
        [product.id]: {
          product,
          details: makeDetails(product, reportDefaults),
        },
      };
    });
  }

  function updateDetails(productId, updates) {
    setSelectedItems((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        details: { ...current[productId].details, ...updates },
      },
    }));
  }

  function selectCatalogRecommendation(recommendation) {
    const nextQuery = recommendation.searchValue || recommendation.label || query;
    setQuery(nextQuery);
    setPage(1);
    if (recommendation.product?.id) {
      setResults((current) => [
        recommendation.product,
        ...current.filter((product) => String(product.id) !== String(recommendation.product.id)),
      ]);
    }
  }

  function buildReport(status = "draft") {
    const now = new Date().toISOString();
    const items = Object.values(selectedItems).map(({ product, details }) => ({
      ...buildCatalogSnapshot(product),
      id: details.id,
      shelfPrice: details.shelfPrice === "" ? "" : moneyValue(details.shelfPrice),
      quantitySeen: details.quantitySeen === "" ? "" : Number(details.quantitySeen || 0),
      stockStatus: details.stockStatus,
      displayType: details.displayType,
      condition: details.condition,
      aisleLocation: details.aisleLocation,
      barcodeSeen: details.barcodeSeen,
      photoUrl: details.photoUrl,
      notes: details.notes,
      dealRating: details.dealRating,
      restockConfidence: details.restockConfidence,
      storeName: details.storeName || storeName,
      dateSeen: details.dateSeen || visitDate,
      timeSeen: details.timeSeen || visitTime,
    }));
    return {
      id: savedReportId || makeId("what-did-i-see"),
      status,
      createdAt: savedReportId ? undefined : now,
      updatedAt: now,
      created_at: savedReportId ? undefined : now,
      updated_at: now,
      storeName,
      visitDate,
      visitTime,
      notes: reportNotes,
      selectedItemIds: items.map((item) => item.catalogProductId),
      items,
    };
  }

  function persistReport(status) {
    if (!selectedCount) {
      onMessage?.("Check at least one catalog item before saving.");
      return null;
    }
    const report = buildReport(status);
    const existingReports = getSavedReports();
    const nextReports = [
      { ...report, createdAt: report.createdAt || existingReports.find((item) => item.id === report.id)?.createdAt || new Date().toISOString() },
      ...existingReports.filter((item) => item.id !== report.id),
    ];
    saveReports(nextReports);
    setSavedReportId(report.id);
    onMessage?.(status === "scout_report" ? "What Did I See saved as a Scout report." : "What Did I See draft saved.");
    if (status === "scout_report") onSaveScoutReport?.({ ...report, createdAt: nextReports[0].createdAt });
    return report;
  }

  function clearList() {
    setSelectedItems({});
    setSavedReportId("");
    setReportNotes("");
    onMessage?.("What Did I See list cleared.");
  }

  function exportJson() {
    const report = buildReport("export");
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copySummary() {
    const report = buildReport("summary");
    const lines = [
      `What Did I See - ${report.storeName || "Unknown store"} - ${report.visitDate} ${report.visitTime}`,
      ...report.items.map((item) => {
        const summary = dealSummary(item.shelfPrice, item.marketPrice);
        return `- ${item.name}: ${item.stockStatus}, qty ${item.quantitySeen || "unknown"}, shelf ${item.shelfPrice ? money(item.shelfPrice) : "unknown"}, market ${money(item.marketPrice)} (${summary.label})`;
      }),
      report.notes ? `Notes: ${report.notes}` : "",
    ].filter(Boolean).join("\n");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(lines);
      onMessage?.("What Did I See summary copied.");
    } else {
      onMessage?.("Copy is not available in this browser. Export JSON still works.");
    }
  }

  function renderDetailBox(product) {
    const selection = selectedItems[product.id];
    if (!selection || selection.details.collapsed) return null;
    const details = selection.details;
    const marketPrice = moneyValue(product.marketPrice || product.marketValue || product.marketValueNearMint || product.midPrice);
    const summary = dealSummary(details.shelfPrice, marketPrice);
    return (
      <div className="what-see-detail-box">
        <div className="compact-card-header">
          <div>
            <h4>Store sighting details</h4>
            <p>Market: {money(marketPrice)} {details.shelfPrice ? `| Shelf difference: ${money(summary.difference)}` : "| Add shelf price to compare"}</p>
          </div>
          <span className="status-badge">{summary.label}</span>
        </div>
        <div className="what-see-form-grid">
          <label>Store seen at<input value={details.storeName} onChange={(event) => updateDetails(product.id, { storeName: event.target.value })} list="what-see-stores" /></label>
          <label>Date seen<input type="date" value={details.dateSeen} onChange={(event) => updateDetails(product.id, { dateSeen: event.target.value })} /></label>
          <label>Time seen<input type="time" value={details.timeSeen} onChange={(event) => updateDetails(product.id, { timeSeen: event.target.value })} /></label>
          <label>Shelf price<input type="number" step="0.01" value={details.shelfPrice} onChange={(event) => updateDetails(product.id, { shelfPrice: event.target.value })} placeholder="49.99" /></label>
          <label>Quantity seen<input type="number" min="0" value={details.quantitySeen} onChange={(event) => updateDetails(product.id, { quantitySeen: event.target.value })} placeholder="3" /></label>
          <label>In stock status<select value={details.stockStatus} onChange={(event) => updateDetails(product.id, { stockStatus: event.target.value })}>{STOCK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Aisle/location<input value={details.aisleLocation} onChange={(event) => updateDetails(product.id, { aisleLocation: event.target.value })} placeholder="Toy aisle, front counter..." /></label>
          <label>Display type<select value={details.displayType} onChange={(event) => updateDetails(product.id, { displayType: event.target.value })}>{DISPLAY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Condition<select value={details.condition} onChange={(event) => updateDetails(product.id, { condition: event.target.value })}>{CONDITIONS.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
          <label>Barcode seen<input value={details.barcodeSeen} onChange={(event) => updateDetails(product.id, { barcodeSeen: event.target.value })} /></label>
          <label>Photo URL / placeholder<input value={details.photoUrl} onChange={(event) => updateDetails(product.id, { photoUrl: event.target.value })} placeholder="Photo upload coming later" /></label>
          <label>Deal rating<select value={details.dealRating} onChange={(event) => updateDetails(product.id, { dealRating: event.target.value })}>{DEAL_RATINGS.map((rating) => <option key={rating}>{rating}</option>)}</select></label>
          <label>Restock confidence<select value={details.restockConfidence} onChange={(event) => updateDetails(product.id, { restockConfidence: event.target.value })}>{RESTOCK_CONFIDENCE.map((level) => <option key={level}>{level}</option>)}</select></label>
          <label className="what-see-notes-field">Notes<textarea value={details.notes} onChange={(event) => updateDetails(product.id, { notes: event.target.value })} placeholder="limit 2 per customer, behind counter, display looked fresh..." /></label>
        </div>
        <div className="quick-actions">
          <button type="button" onClick={() => onAddToVault?.(product)}>Add to Vault</button>
          <button type="button" className="secondary-button" onClick={() => onAddToForge?.(product)}>Add to Forge</button>
          <button type="button" className="secondary-button" onClick={() => toggleItem(product)}>Remove from list</button>
          <button type="button" className="secondary-button" onClick={() => updateDetails(product.id, { collapsed: true })}>Collapse details</button>
        </div>
        <MarketPriceHistoryPanel
          compact
          catalogProductId={product.id}
          tcgplayerProductId={product.tcgplayerProductId || product.sku}
          externalProductId={product.externalProductId || product.sku}
          productName={productTitle(product)}
          currentMarketPrice={product.marketPrice || product.marketValue || product.midPrice}
          currentLowPrice={product.lowPrice}
          currentMidPrice={product.midPrice}
          currentHighPrice={product.highPrice}
          lastPriceChecked={product.lastPriceChecked || product.marketLastUpdated}
          money={money}
        />
      </div>
    );
  }

  return (
    <section className="panel what-see-panel">
      <datalist id="what-see-stores">
        {stores.map((store) => <option key={store.id || store.name} value={store.nickname || store.storeName || store.name} />)}
      </datalist>
      {showHeader ? (
        <div className="compact-card-header">
          <div>
            <h2>What Did I See?</h2>
            <p>Search the imported Pokemon catalog, check what you saw in-store, and save a beta Scout sighting list.</p>
          </div>
          {onBack ? <button type="button" className="secondary-button" onClick={onBack}>Back</button> : null}
        </div>
      ) : null}

      <div className="what-see-toolbar">
        <SmartCatalogSearchBox
          value={query}
          onChange={setQuery}
          onSelectSuggestion={selectCatalogRecommendation}
          supabase={supabase}
          isSupabaseConfigured={isSupabaseConfigured}
          mapRow={mapCatalogRow}
          productGroup={filter === "Cards" ? "Cards" : filter === "Sealed" ? "Sealed" : "All"}
          dataFilter={
            filter === "Has market price" ? "Has market price" :
            filter === "Missing market price" ? "Missing price" :
            filter === "Has image" ? "Has image" :
            "All"
          }
          placeholder="Search product, set, UPC, card number, or TCGplayer ID..."
          money={money}
        />
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          {FILTERS.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort catalog results">
          {CATALOG_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input value={storeName} onChange={(event) => setStoreName(event.target.value)} list="what-see-stores" placeholder="Store seen at" />
        <input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
        <input type="time" value={visitTime} onChange={(event) => setVisitTime(event.target.value)} />
      </div>

      <div className="what-see-report-notes">
        <textarea value={reportNotes} onChange={(event) => setReportNotes(event.target.value)} placeholder="Visit notes optional..." />
      </div>

      <div className="summary-pill-row">
        <span className="status-badge">{selectedCount} checked</span>
        <span className="status-badge">{loading ? "Searching..." : `${results.length} results`}</span>
        {totalCount !== null ? <span className="status-badge">{totalCount} matches</span> : null}
      </div>

      {error ? <div className="empty-state"><h3>Could not search catalog</h3><p>{error}</p></div> : null}
      {!error && !loading && results.length === 0 ? (
        <div className="empty-state">
          <h3>No catalog results yet</h3>
          <p>Search the Pokemon catalog by name, set, product type, card number, or scanned barcode.</p>
        </div>
      ) : null}

      <div className="what-see-results">
        {results.map((product) => {
          const checked = Boolean(selectedItems[product.id]);
          const marketPrice = moneyValue(product.marketPrice || product.marketValue || product.marketValueNearMint || product.midPrice);
          return (
            <article className={checked ? "what-see-result checked" : "what-see-result"} key={product.id}>
              <div className="what-see-result-row">
                <label className="what-see-checkbox">
                  <input type="checkbox" checked={checked} onChange={() => toggleItem(product)} />
                  <span>{checked ? "Checked" : "Check"}</span>
                </label>
                {productImage(product) ? <img src={productImage(product)} alt="" /> : <div className="what-see-thumb-placeholder">Image needed</div>}
                <div className="what-see-result-copy">
                  <h3>{productTitle(product)}</h3>
                  <p>
                    {product.productType || (product.catalogType === "card" ? "Card" : "Sealed")} | {product.setName || product.expansion || "No set"}
                    {product.cardNumber ? ` | #${product.cardNumber}` : ""}
                  </p>
                  <p>Market: {money(marketPrice)} {product.lowPrice ? `| Low ${money(product.lowPrice)}` : ""} {product.midPrice ? `| Mid ${money(product.midPrice)}` : ""} {product.highPrice ? `| High ${money(product.highPrice)}` : ""}</p>
                  <p className="compact-subtitle">
                    Source: {compactSource(product)}
                    {productSourceUrl(product) ? <> | <a href={productSourceUrl(product)} target="_blank" rel="noreferrer">Source URL</a></> : null}
                  </p>
                  {product.historySnapshotCount > 0 ? (
                    <p className="compact-subtitle">History available: {product.historySnapshotCount} snapshot{product.historySnapshotCount === 1 ? "" : "s"}</p>
                  ) : null}
                </div>
                {checked && selectedItems[product.id]?.details.collapsed ? (
                  <button type="button" className="secondary-button" onClick={() => updateDetails(product.id, { collapsed: false })}>Edit details</button>
                ) : null}
              </div>
              {renderDetailBox(product)}
            </article>
          );
        })}
      </div>

      <div className="summary-pill-row catalog-pagination-row">
        <button type="button" className="secondary-button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
        <span className="status-badge">Page {page}{totalPages ? ` of ${totalPages}` : ""}</span>
        <button type="button" className="secondary-button" disabled={loading || (totalPages ? page >= totalPages : results.length < RESULT_LIMIT)} onClick={() => setPage((current) => current + 1)}>Next</button>
      </div>

      <div className="what-see-footer-actions">
        <button type="button" onClick={() => persistReport("draft")}>Save Draft</button>
        <button type="button" onClick={() => persistReport("scout_report")}>Save Scout Report</button>
        <button type="button" className="secondary-button" onClick={clearList}>Clear List</button>
        <button type="button" className="secondary-button" onClick={exportJson} disabled={!selectedCount}>Export JSON</button>
        <button type="button" className="secondary-button" onClick={copySummary} disabled={!selectedCount}>Print/Copy Summary</button>
      </div>
    </section>
  );
}
