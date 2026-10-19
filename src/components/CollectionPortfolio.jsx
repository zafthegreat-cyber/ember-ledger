import { useEffect, useRef, useState } from "react";
import { BottomSheet, FilterButton, QuietButton, SearchField } from "./operations/OperationsUI.jsx";
import { PortfolioChooser, PortfolioItemGrid, PortfolioMostValuable, PortfolioValueChart } from "./CollectionPortfolioViews.jsx";
import { buildPortfolioCsv, createPortfolioStore, getPortfolioItemKey, getPortfolioItemValuation, portfolioSeries, rankPortfolioItems, selectPortfolioItems, summarizePortfolio } from "../utils/collectionPortfolio.mjs";
import { createRestockDetailsHistory } from "../utils/restockDetailsHistory.mjs";

const PERIODS = [["1d", "1D"], ["7d", "7D"], ["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["max", "MAX"]];
const EMPTY_FEATURES = Object.freeze({});
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const title = (item) => item.name || item.title || item.cardName || item.productName || "Untitled item";
const valueForItem = (item) => getPortfolioItemValuation(item).value;
function deviceStorage() { try { return window.localStorage; } catch { return undefined; } }
function identity(prefix) { return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }

export default function CollectionPortfolio({
  items = [], visibleItems = [], preferenceScope, query, onQueryChange, conditionFilter,
  onOpenFilters, onClearFilters, onOpenItem, onAddItem, resolveItemImage, moreActions,
  features = EMPTY_FEATURES, onLockedFeature, viewState, onViewStateChange, gameFilters, gameFiltered = false,
}) {
  const [initial] = useState(() => { const store = createPortfolioStore({ storage: deviceStorage(), scope: preferenceScope }); return { store, result: store.load() }; });
  const [saved, setSaved] = useState(initial.result);
  const [activeId, setActiveId] = useState(initial.result.state.selectedPortfolioId || "main");
  const { section: requestedSection, period, hidden, display, sort } = viewState;
  const [modal, setModal] = useState("");
  const [draft, setDraft] = useState({ id: "", name: "", keys: [] });
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const historyRef = useRef(null);
  const openerRef = useRef(null);
  const contentRef = useRef(null);
  const historyAllowed = features.history === true && features.value === true;
  const section = requestedSection === "performance" && historyAllowed ? "performance" : "overview";
  const updateView = (patch) => onViewStateChange((current) => ({ ...current, ...patch }));
  const state = saved.state;
  const selectedId = activeId === "all" || state.portfolios.some((row) => row.id === activeId) ? activeId : "main";
  const activeName = selectedId === "all" ? "All portfolios" : state.portfolios.find((row) => row.id === selectedId)?.name || "Main";
  const portfolioItems = selectPortfolioItems(items, state, selectedId);
  const summary = summarizePortfolio(portfolioItems);
  const included = new Set(portfolioItems);
  const shown = visibleItems.filter((item) => included.has(item)).slice().sort((left, right) => sort === "value"
    ? (valueForItem(right) ?? -1) - (valueForItem(left) ?? -1) || title(left).localeCompare(title(right))
    : title(left).localeCompare(title(right)));
  const rankedItems = rankPortfolioItems(portfolioItems).slice(0, 5).map((row) => row.item);
  const series = portfolioSeries(state.snapshots, { portfolioId: selectedId, period });
  const rows = [{ id: "all", name: "All portfolios", count: items.length }, ...state.portfolios.map((row) => ({ ...row, count: selectPortfolioItems(items, state, row.id).length, canManage: true, canMove: row.id !== "main" }))];
  const modalNotice = formError || !saved.ok ? <div className="collection-portfolio-notice" role="alert"><p>{formError || saved.error}</p><button type="button" onClick={reloadSettings}>Reload portfolio settings</button></div> : null;

  useEffect(() => {
    const controller = createRestockDetailsHistory({
      target: window, historyKey: "code3CollectionPortfolioDialog",
      resolveReport: (payload) => ["chooser", "form", "remove"].includes(payload?.type) ? payload : null,
      onOpen: (payload) => setModal(payload.type),
      onClose: () => {
        setModal("");
        window.requestAnimationFrame(() => {
          if (openerRef.current?.isConnected && !document.querySelector('.collection-portfolio-modal [role="dialog"]')) openerRef.current.focus({ preventScroll: true });
        });
      },
    });
    historyRef.current = controller;
    return () => { controller.destroy(); historyRef.current = null; };
  }, []);

  useEffect(() => {
    const refresh = (event) => {
      if (event.key !== initial.store.key) return;
      const result = initial.store.load(); setSaved(result);
      if (result.ok) setActiveId(result.state.selectedPortfolioId);
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [initial.store]);

  function save(change) {
    const result = initial.store.update(change);
    setSaved(result);
    if (!result.ok) { setFormError(result.error); return false; }
    setFormError(""); return true;
  }
  function showDialog(type) {
    if (!modal) openerRef.current = document.activeElement;
    historyRef.current?.open({ type });
  }
  function closeDialog() { historyRef.current?.dismiss(); }
  function choosePortfolio(id) {
    setActiveId(id);
    if (saved.writable) save((next) => { next.selectedPortfolioId = id; });
    closeDialog();
  }
  function openForm(id = "") {
    const existing = state.portfolios.find((row) => row.id === id);
    setDraft({ id, name: existing?.name || "", keys: id ? selectPortfolioItems(items, state, id).map(getPortfolioItemKey).filter(Boolean) : [] });
    setFormError(""); showDialog("form");
  }
  function submitPortfolio(event) {
    event.preventDefault();
    const id = draft.id || identity("portfolio");
    const keys = new Set(draft.keys);
    const success = save((next) => {
      const existing = next.portfolios.find((row) => row.id === id);
      if (existing) existing.name = draft.name.trim();
      else next.portfolios.push({ id, name: draft.name.trim(), favorite: false });
      if (id !== "main") for (const item of items) {
        const key = getPortfolioItemKey(item); if (!key) continue;
        if (keys.has(key)) next.memberships[key] = id;
        else if (next.memberships[key] === id) delete next.memberships[key];
      }
      next.selectedPortfolioId = id;
    });
    if (success) { setActiveId(id); setMessage("Portfolio saved. Your item records are unchanged."); closeDialog(); }
  }
  function removePortfolio() {
    if (!draft.id || draft.id === "main") return;
    if (save((next) => {
      next.portfolios = next.portfolios.filter((row) => row.id !== draft.id);
      for (const [key, assigned] of Object.entries(next.memberships)) if (assigned === draft.id) delete next.memberships[key];
      next.snapshots = next.snapshots.filter((row) => row.portfolioId !== draft.id);
      if (next.selectedPortfolioId === draft.id) next.selectedPortfolioId = "main";
    })) { if (selectedId === draft.id) setActiveId("main"); setMessage("Portfolio removed. Items are still in your collection."); closeDialog(); }
  }
  function movePortfolio(id, direction) {
    save((next) => {
      const index = next.portfolios.findIndex((row) => row.id === id);
      const target = index + (direction === "up" ? -1 : 1);
      if (index < 1 || target < 1 || target >= next.portfolios.length) return;
      [next.portfolios[index], next.portfolios[target]] = [next.portfolios[target], next.portfolios[index]];
    });
  }
  function openPerformance() {
    if (!historyAllowed) { onLockedFeature?.(features.value !== true ? "portfolio_value" : "price_history"); return; }
    updateView({ section: "performance" });
  }
  function saveSnapshot() {
    if (!historyAllowed || !summary.isValid || !summary.knownCount || hidden) return;
    if (save((next) => { next.snapshots.push({ id: identity("snapshot"), at: new Date().toISOString(), portfolioId: selectedId, total: summary.total, knownCount: summary.knownCount, totalCount: summary.totalCount, quantity: summary.quantity }); })) setMessage("Value snapshot saved on this device.");
  }
  function exportPortfolio() {
    if (features.export !== true) { onLockedFeature?.("collection_export"); return; }
    const url = URL.createObjectURL(new Blob(["\uFEFF", buildPortfolioCsv(portfolioItems, { includeValues: !hidden })], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "code3-tcg-portfolio.csv"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(hidden ? "Portfolio exported without monetary values." : "Portfolio exported.");
  }
  function reloadSettings() {
    const result = initial.store.load(); setSaved(result); setFormError("");
    if (result.ok) setActiveId(result.state.selectedPortfolioId);
  }

  return <section className="collection-portfolio" aria-label="Collection portfolio">
    <div ref={contentRef} inert={Boolean(modal)} aria-hidden={modal ? true : undefined}>
      <div className="collection-portfolio-tabs" role="group" aria-label="Portfolio section">
        <button type="button" aria-pressed={section === "overview"} onClick={() => updateView({ section: "overview" })}>Overview</button>
        <button type="button" aria-pressed={section === "performance"} onClick={openPerformance}>Performance</button>
        <span className="collection-portfolio-currency">USD</span>
      </div>
      <header className="collection-portfolio-heading">
        <button type="button" className="collection-portfolio-select" aria-label="Choose portfolio" aria-haspopup="dialog" onClick={() => showDialog("chooser")}><span>Portfolio</span><strong>{activeName}</strong><span aria-hidden="true">⌄</span></button>
        <div className="collection-portfolio-value"><strong data-testid="portfolio-total">{hidden ? "Value hidden" : summary.knownCount && summary.isValid ? money(summary.total) : "Not valued yet"}</strong><button type="button" className="collection-portfolio-eye" aria-label={hidden ? "Show values" : "Hide values"} aria-pressed={hidden} onClick={() => updateView({ hidden: !hidden })}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{hidden ? <path d="m3 3 18 18" /> : null}</svg></button></div>
        <p className="collection-portfolio-coverage">{summary.totalCount} product{summary.totalCount === 1 ? "" : "s"} · {summary.quantity ?? "Unknown"} total quantity · {summary.knownCount} with a saved value</p>
        <p className="collection-portfolio-privacy">{summary.valuationLabel}. {summary.unknownCount ? `${summary.unknownCount} without usable values are excluded from the total.` : "Values are estimates, not sale proceeds."}</p>
        {series.hasHistory && historyAllowed && !hidden ? <p className="collection-portfolio-change" data-tone={series.change > 0 ? "positive" : series.change < 0 ? "negative" : "neutral"}>{series.change > 0 ? "+" : ""}{money(series.change)}{series.percentChange == null ? "" : ` (${series.percentChange > 0 ? "+" : ""}${series.percentChange.toFixed(1)}%)`} <span>between saved snapshots</span></p> : null}
      </header>
      {!saved.ok ? <div className="collection-portfolio-notice" role="alert"><p>{saved.error}</p><button type="button" onClick={reloadSettings}>Reload portfolio settings</button></div> : null}
      {message ? <p className="collection-portfolio-message" role="status">{message}</p> : null}
      {formError && !modal ? <div className="collection-portfolio-notice" role="alert"><p>{formError}</p><button type="button" onClick={reloadSettings}>Reload portfolio settings</button></div> : null}
      {historyAllowed ? <section className="collection-portfolio-history" aria-label="Portfolio value history">
        <PortfolioValueChart points={series.points} hidden={hidden} money={money} periodLabel={PERIODS.find(([key]) => key === period)?.[1]} />
        <div className="collection-portfolio-periods" role="group" aria-label="Value history period">{PERIODS.map(([key, label]) => <button type="button" key={key} aria-pressed={period === key} onClick={() => updateView({ period: key })}>{label}</button>)}</div>
        {!hidden ? <p className="collection-portfolio-privacy">{series.coverageLabel}</p> : null}
        <div className="collection-portfolio-snapshot"><button type="button" disabled={!saved.writable || !summary.isValid || !summary.knownCount || hidden} onClick={saveSnapshot}>Save value snapshot</button><small>Records the current estimate on this device. No past values are invented.</small></div>
      </section> : null}
      <div className="collection-portfolio-actions"><button type="button" onClick={() => showDialog("chooser")}>Organize portfolios</button><button type="button" onClick={exportPortfolio}>Export</button>{moreActions}</div>
      {section === "overview" ? <>
        <PortfolioMostValuable items={rankedItems} resolveItemImage={resolveItemImage} onOpen={onOpenItem} hidden={hidden} valueForItem={valueForItem} money={money} />
        <section aria-label="Portfolio items" className="collection-portfolio-collection">
          <div className="collection-portfolio-section-heading"><h2>Your collection</h2><span>{shown.length} shown</span></div>
          {gameFilters}
          <div className="collection-portfolio-controls"><SearchField label="Search collection" value={query} onChange={onQueryChange} enterKeyHint="search" autoComplete="off" /><FilterButton active={Boolean(conditionFilter)} onClick={onOpenFilters}>Filter</FilterButton></div>
          <div className="collection-portfolio-controls"><label className="collection-portfolio-sort">Sort<select aria-label="Sort collection" value={sort} onChange={(event) => updateView({ sort: event.target.value })}><option value="name">Name</option><option value="value">Most valuable</option></select></label><div className="collection-portfolio-display" role="group" aria-label="Collection display">{["grid", "list"].map((mode) => <button key={mode} type="button" aria-pressed={display === mode} onClick={() => updateView({ display: mode })}>{mode === "grid" ? "Grid" : "List"}</button>)}</div></div>
          {shown.length ? <PortfolioItemGrid items={shown} resolveItemImage={resolveItemImage} onOpen={onOpenItem} hidden={hidden} valueForItem={valueForItem} money={money} mode={display} /> : <div className="collection-portfolio-empty"><h3>{query || conditionFilter || gameFiltered ? "No matching items" : "This portfolio is ready for your items"}</h3><p>{gameFiltered ? "Choose another game, clear the filters, or add an item for this game." : query || conditionFilter ? "Try another search or clear the filters." : items.length ? "Choose another portfolio or organize existing items into this one." : "Add a card, sealed product, or collectible to get started. Existing records keep their purpose."}</p>{query || conditionFilter || gameFiltered ? <><button type="button" onClick={onClearFilters}>Clear search &amp; filters</button>{gameFiltered ? <button type="button" onClick={onAddItem}>Add Item</button> : null}</> : <button type="button" onClick={items.length ? () => showDialog("chooser") : onAddItem}>{items.length ? "Choose portfolio" : "Add Item"}</button>}</div>}
        </section>
      </> : <section className="collection-portfolio-performance"><h2>Understanding your performance</h2><p>Saved snapshots show your collection's recorded value over time. Additions, removals, portfolio organization and estimate changes can all move the total.</p><p>{summary.marketKnownCount} product{summary.marketKnownCount === 1 ? " has" : "s have"} a saved market estimate; {summary.projectedKnownCount} use a projected estimate. Purchase costs are not substituted for missing prices.</p><p>Snapshots and portfolio organization are saved on this device. Original items keep their existing saving and sync behavior.</p></section>}
    </div>
    <div className="collection-portfolio-modal">
      <PortfolioChooser open={modal === "chooser"} onClose={closeDialog} notice={modalNotice} portfolios={rows} activeId={selectedId} onSelect={choosePortfolio} onCreate={() => openForm()} onManage={openForm} onToggleFavorite={(id) => save((next) => { const row = next.portfolios.find((entry) => entry.id === id); if (row) row.favorite = !row.favorite; })} onMove={movePortfolio} />
      <BottomSheet open={modal === "form"} title={draft.id ? "Manage portfolio" : "New portfolio"} onClose={closeDialog}>
        <form className="collection-portfolio-form" onSubmit={submitPortfolio}>
          <label>Portfolio name<input required maxLength={60} value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
          {draft.id === "main" ? <p>Main contains items that have not been assigned to another portfolio. Create or manage another portfolio to move items.</p> : <fieldset aria-label="Portfolio items"><legend>Items in this portfolio</legend><p>Choose existing items to organize here. Their records, purpose and costs stay unchanged.</p>{items.map((item, index) => { const key = getPortfolioItemKey(item); return <label key={key || `unsaved-${index}`} className="collection-portfolio-checkbox"><input type="checkbox" disabled={!key} checked={Boolean(key && draft.keys.includes(key))} onChange={(event) => { const checked = event.target.checked; setDraft((value) => ({ ...value, keys: checked ? [...value.keys, key] : value.keys.filter((entry) => entry !== key) })); }} /><span>{title(item)}{!key ? " — save this item before grouping" : ""}</span></label>; })}{!items.length ? <p>Add an item to your collection first, or save an empty portfolio.</p> : null}</fieldset>}
          {modalNotice}
          <div className="collection-portfolio-form-actions"><button type="submit" disabled={!saved.writable}>Save portfolio</button><button type="button" onClick={() => showDialog("chooser")}>Back to portfolios</button></div>
          {draft.id && draft.id !== "main" ? <QuietButton className="ops-button--danger" onClick={() => showDialog("remove")}>Remove portfolio</QuietButton> : null}
          <small>Portfolio organization is saved on this device.</small>
        </form>
      </BottomSheet>
      <BottomSheet open={modal === "remove"} title="Remove portfolio?" onClose={closeDialog}><div className="collection-portfolio-form"><p>Remove {draft.name} and its saved value snapshots from this device? Its items stay in your collection and return to Main. Original item records are not deleted.</p>{modalNotice}<div className="collection-portfolio-form-actions"><button type="button" onClick={() => showDialog("form")}>Keep portfolio</button><QuietButton className="ops-button--danger" disabled={!saved.writable} onClick={removePortfolio}>Remove portfolio</QuietButton></div></div></BottomSheet>
    </div>
  </section>;
}
