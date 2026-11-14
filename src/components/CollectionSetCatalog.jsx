import { lazy, Suspense, useEffect, useId, useMemo, useState, useLayoutEffect } from "react";
import { BottomSheet, EmptyState, PrimaryButton, QuietButton, SearchField } from "./operations/OperationsUI.jsx";
import CatalogMatchReview from "./CatalogMatchReview.jsx";
import { browseSetCatalog, catalogFinishOptions, copyRecognition, priceMetadataLabel } from "../utils/collectionBrowse.mjs";
import ItemPhoto from "./ItemPhoto.jsx";
import CardVersionPicker from "./CardVersionPicker.jsx";
import { getItemImageUrl } from "../utils/productDisplayUtils.js";
import { buildSetCatalogEntries, setCatalogName, setCatalogNumber } from "../utils/setCatalog.mjs";
import { loadSetCatalog } from "../services/setCatalogLoader.mjs";
import { inferOwnedItemPurpose, OWNED_ITEM_PURPOSE_OPTIONS } from "../features/ownedItems/ownedItemPurpose.js";
import { collectionCopyQuantity } from "../utils/collectionCopyGroups.mjs";
import { cardVersionLabel } from "../utils/cardVersions.mjs";
import "./collection-set-catalog.css";

const EMPTY = Object.freeze([]);
const ProductInspectViewer = lazy(() => import("./ProductInspectViewer.jsx"));
const quantityLabel = entry => entry.ownedQuantity === null ? "Quantity needs review" : `Qty ${entry.ownedQuantity}`;

function savedCopySummary(record) {
  const purpose = OWNED_ITEM_PURPOSE_OPTIONS.find(option => option.value === inferOwnedItemPurpose(record))?.label || "Unassigned";
  return [purpose, `Qty ${collectionCopyQuantity(record)}`, cardVersionLabel(record.variant || record.finish || record.priceSubtype || record.cardVariant || record.printing), record.condition].filter(Boolean).join(" · ");
}

export default function CollectionSetCatalog({ row, onAddItem, onAddCatalogItem, onOpenItem, onReviewCatalogMatch, canMatchRecord = () => true, hiddenValues = false, viewState, onViewStateChange, loadCatalog = loadSetCatalog }) {
  const id = useId();
  const [remote, setRemote] = useState({ status: "loading", products: EMPTY });
  const [attempt, setAttempt] = useState(0);
  const [localView, setLocalView] = useState({kind:"all",ownership:"all",query:"",limit:24,sort:"number",finish:"all"});
  const browse = {...localView,...viewState};
  const {kind,ownership,query,limit,sort,finish} = browse;
  const ownedOnly = ownership === "owned";
  const update = patch => onViewStateChange ? onViewStateChange(current => ({...localView,...current,...patch})) : setLocalView(current => ({...current,...patch}));
  const setKind = value => update({kind:value,limit:24});
  const setQuery = value => update({query:value,limit:24});
  const setLimit = value => update({limit:typeof value === "function" ? value(limit) : value});
  const [selectedKey, setSelectedKey] = useState("");
  const [matchRecord, setMatchRecord] = useState(null);
  useLayoutEffect(() => {
    if (!viewState?.returnPosition) return;
    const position = viewState.returnPosition;
    let second;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { window.scrollTo(0,position.windowY || 0); const main = document.querySelector(".main"); if(main)main.scrollTop=position.mainY || 0; }); });
    return () => { cancelAnimationFrame(first); if(second)cancelAnimationFrame(second); };
  }, [viewState?.returnPosition]);
  function openSavedRecord(record) {
    update({returnPosition:{windowY:window.scrollY,mainY:document.querySelector(".main")?.scrollTop || 0}});
    setSelectedKey(""); onOpenItem?.(record);
  }
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => loadCatalog(row.key, { signal: controller.signal })).then(result => {
      if (!controller.signal.aborted) setRemote({ status: result.available ? "ready" : "unavailable", products: result.products });
    }).catch(error => {
      if (!controller.signal.aborted) setRemote({ status: "error", products: EMPTY, message: error.message || "The catalog could not be loaded." });
    });
    return () => controller.abort();
  }, [row.key, attempt, loadCatalog]);
  const existingCatalog = row.catalogRecords || EMPTY, ownedItems = row.ownedItems || EMPTY;
  const entries = useMemo(() => buildSetCatalogEntries({ catalogRecords: [...remote.products, ...existingCatalog], ownedItems }), [remote.products, existingCatalog, ownedItems]);
  const filtered = useMemo(() => browseSetCatalog(entries, { kind, ownership, query, sort, finish }), [entries, kind, ownership, query, sort, finish]);
  const finishes = useMemo(() => catalogFinishOptions(entries),[entries]);
  const selected = entries.find(entry => entry.key === selectedKey);
  const filteredOwnedCount = filtered.filter(entry => entry.owned).length;
  const visibleEntries = filtered.slice(0, limit);
  const hasFilters = Boolean(query.trim()) || kind !== "all" || ownership !== "all" || finish !== "all";
  const savedOnly = entries.filter(entry => entry.savedOnly).length;
  function retry() { setRemote({ status: "loading", products: EMPTY }); setAttempt(value => value + 1); }
  function reset() { update({query:"",kind:"all",ownership:"all",finish:"all",sort:"number",limit:24}); }

  return <section className="set-catalog" aria-label={`${row.name} catalog`}>
    <div className="set-catalog-heading"><h3>Catalog</h3><QuietButton onClick={() => onAddItem?.(row)}>Add missing item</QuietButton></div>
    <div className="set-catalog-toolbar"><SearchField label="Search this set" placeholder="Search by name or card number" value={query} onChange={value => { setQuery(value); setLimit(24); }} /><div className="set-catalog-controls"><div className="set-catalog-kinds" role="group" aria-label="Product type">{[["all", "All"], ["card", "Cards"], ["sealed", "Sealed"]].map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setLimit(24); }}>{label}</button>)}</div><button type="button" className="set-catalog-owned-toggle" aria-label="Owned only" aria-pressed={ownedOnly} onClick={() => { update({ownership:ownedOnly ? "all" : "owned",limit:24}); }}><span aria-hidden="true">{ownedOnly ? "✓" : "○"}</span> Owned only</button><button type="button" className="set-catalog-owned-toggle" aria-pressed={ownership === "missing"} onClick={() => update({ownership:ownership === "missing" ? "all" : "missing",limit:24})}>Missing from collection</button></div><div className="set-catalog-selects"><label>Sort catalog<select value={sort} onChange={event => update({sort:event.target.value})}><option value="number">Card number</option><option value="name">Name</option><option value="rarity">Rarity</option></select></label>{finishes.length ? <label>Finish<select value={finish} onChange={event => update({finish:event.target.value,limit:24})}><option value="all">All known finishes</option>{finishes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}</div></div>
    {remote.status === "loading" ? <p className="set-catalog-notice" role="status">Loading catalog entries. Your saved items remain available below.</p> : null}
    {remote.status === "error" ? <div className="set-catalog-notice" role="alert"><p>{remote.message} If you are offline, reconnect and try again. Your saved records are unchanged.</p><QuietButton onClick={retry}>Retry catalog</QuietButton></div> : null}
    {remote.status === "unavailable" ? <p className="set-catalog-notice">A full catalog is not connected for this set. Showing known catalog entries and your saved items.</p> : null}
    <div className="set-catalog-results"><p className="set-catalog-result-count" role="status" aria-live="polite" aria-atomic="true">{visibleEntries.length < filtered.length ? `${visibleEntries.length} of ` : ""}{filtered.length} {filtered.length === 1 ? "item" : "items"}{ownedOnly ? " you own" : ownership === "missing" ? " missing from your collection" : " shown"}{query ? ` matching “${query}”` : ""}{!ownedOnly && filteredOwnedCount ? ` · ${filteredOwnedCount} owned` : ""}</p>{hasFilters ? <QuietButton onClick={reset}>Clear filters</QuietButton> : null}</div>
    {filtered.length ? <ul className="set-catalog-grid" aria-label="Cards and sealed products">{visibleEntries.map(entry => <li key={entry.key}><button type="button" className="set-catalog-product" data-owned={entry.owned} aria-label={`View ${setCatalogName(entry.product)}${setCatalogNumber(entry.product) ? `, card ${setCatalogNumber(entry.product)}` : ""}${entry.owned ? `, owned, ${quantityLabel(entry)}` : ""}`} onClick={() => setSelectedKey(entry.key)}><span className="set-catalog-product-media"><ItemPhoto product={entry.product} sizes="(max-width: 600px) 44vw, (max-width: 1000px) 28vw, 240px" fallbackClassName="set-catalog-photo-fallback" src={getItemImageUrl(entry.product)} alt={setCatalogName(entry.product)} loading="lazy" /></span><span className="set-catalog-product-copy"><strong>{setCatalogName(entry.product)}</strong><span>{[entry.savedOnly ? "Saved item" : entry.kind === "card" ? "Card" : "Sealed", setCatalogNumber(entry.product) ? `#${setCatalogNumber(entry.product)}` : entry.product.productType, entry.product.rarity].filter(Boolean).join(" · ")}</span>{entry.savedOnly && remote.status !== "loading" ? <span className="set-catalog-match-note">Catalog match needed</span> : null}{entry.owned ? <span className="set-catalog-owned-badge">✓ Owned · {quantityLabel(entry)}</span> : null}</span></button></li>)}</ul> : remote.status !== "loading" ? <EmptyState title={ownedOnly ? "No owned items match" : "No matching catalog items"} action={<QuietButton onClick={reset}>Show all items</QuietButton>}>{ownedOnly ? "Turn off Owned only to explore this set, or adjust your search." : "Try another name, card number, or product type."}</EmptyState> : null}
    {filtered.length > limit ? <div className="set-catalog-more"><QuietButton onClick={() => setLimit(value => value + 24)}>Show more ({filtered.length - limit} remaining)</QuietButton></div> : null}
    <details className="set-catalog-disclosure"><summary>About this catalog</summary><p className="set-catalog-note">Owned badges use your personal collection and count saved quantities. Catalog entries may include variants; they are not an official checklist or a store stock guarantee.{savedOnly && remote.status !== "loading" ? ` ${savedOnly} saved ${savedOnly === 1 ? "item needs" : "items need"} a catalog match and ${savedOnly === 1 ? "is" : "are"} shown separately.` : ""}</p></details>
    <BottomSheet className="product-inspect-sheet" open={Boolean(selected)} title={selected ? setCatalogName(selected.product) : "Catalog item"} onClose={() => { setSelectedKey(""); setMatchRecord(null); }}>
      {matchRecord ? <CatalogMatchReview record={matchRecord} entries={entries} hiddenValues={hiddenValues} onCancel={() => setMatchRecord(null)} onReview={(record,product) => { setSelectedKey(""); setMatchRecord(null); onReviewCatalogMatch?.(record,product); }} /> : selected ? <CardVersionPicker key={selected.key} product={selected.product} records={selected.records}>{versionProduct => <div className="set-catalog-item-detail">
        <Suspense fallback={<div className="product-inspect__loading" role="status">Loading interactive preview…</div>}><ProductInspectViewer product={versionProduct} src={getItemImageUrl(versionProduct)} title={setCatalogName(versionProduct)} /></Suspense>
        {priceMetadataLabel([versionProduct]) ? <p className="set-catalog-price-context">{priceMetadataLabel([versionProduct])}</p> : null}
        <p>{row.name}{setCatalogNumber(selected.product) ? ` · #${setCatalogNumber(selected.product)}` : ""}</p>
        {!selected.product.versions?.length ? <p className={selected.owned ? "set-catalog-detail-owned" : ""}>{selected.owned ? `✓ Owned · ${quantityLabel(selected)}` : "Not in your personal collection"}</p> : null}
        {selected.product.language ? <p>{selected.product.language}</p> : null}
        {selected.records.length ? <div className="set-catalog-copies"><h3>Your saved copies</h3>{selected.records.map((record, index) => <QuietButton className="set-catalog-copy-link" key={`${record._recordOrigin || ""}:${record.id}:${index}`} aria-label={`Open saved copy from ${copyRecognition(record,{hidden:hiddenValues}).title}`} aria-describedby={`${id}-saved-copy-${index}`} onClick={() => openSavedRecord(record)}><span><strong>{copyRecognition(record,{hidden:hiddenValues}).title}</strong><small id={`${id}-saved-copy-${index}`}>{savedCopySummary(record)} · {copyRecognition(record,{hidden:hiddenValues}).detail}</small></span><span aria-hidden="true">→</span></QuietButton>)}</div> : null}
        {selected.savedOnly && onReviewCatalogMatch && selected.records.some(canMatchRecord) ? <div className="set-catalog-match-actions"><h3>Connect to the catalog</h3>{selected.records.filter(canMatchRecord).map((record,index) => <QuietButton key={record.id || index} onClick={() => setMatchRecord(record)}>Find catalog match · {copyRecognition(record,{hidden:hiddenValues}).title}</QuietButton>)}</div> : null}
        {!selected.savedOnly && onAddCatalogItem ? <PrimaryButton onClick={() => { setSelectedKey(""); onAddCatalogItem(row, versionProduct); }}>{selected.owned ? "Add another copy" : "Add to collection"}</PrimaryButton> : null}
        <p className="set-catalog-note">Review quantity, condition, purpose, and purchase details before saving. Browsing does not add anything.</p>
      </div>}</CardVersionPicker> : null}
    </BottomSheet>
  </section>;
}
