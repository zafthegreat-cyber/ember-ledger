import { useEffect, useMemo, useState } from "react";
import { BottomSheet, EmptyState, PrimaryButton, QuietButton, SearchField } from "./operations/OperationsUI.jsx";
import ItemPhoto from "./ItemPhoto.jsx";
import { getItemImageUrl } from "../utils/productDisplayUtils.js";
import { buildSetCatalogEntries, filterSetCatalogEntries, setCatalogName, setCatalogNumber } from "../utils/setCatalog.mjs";
import { loadSetCatalog } from "../services/setCatalogLoader.mjs";
import "./collection-set-catalog.css";

const EMPTY = Object.freeze([]);
const quantityLabel = entry => entry.ownedQuantity === null ? "Quantity needs review" : `Qty ${entry.ownedQuantity}`;

export default function CollectionSetCatalog({ row, onAddItem, onAddCatalogItem, onOpenItem, loadCatalog = loadSetCatalog }) {
  const [remote, setRemote] = useState({ status: "loading", products: EMPTY });
  const [attempt, setAttempt] = useState(0);
  const [kind, setKind] = useState("all");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(24);
  const [selectedKey, setSelectedKey] = useState("");
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
  const filtered = useMemo(() => filterSetCatalogEntries(entries, { kind, ownedOnly, query }), [entries, kind, ownedOnly, query]);
  const selected = entries.find(entry => entry.key === selectedKey);
  const filteredOwnedCount = filtered.filter(entry => entry.owned).length;
  const savedOnly = entries.filter(entry => entry.savedOnly).length;
  function retry() { setRemote({ status: "loading", products: EMPTY }); setAttempt(value => value + 1); }
  function reset() { setQuery(""); setKind("all"); setOwnedOnly(false); setLimit(24); }

  return <section className="set-catalog" aria-label={`${row.name} catalog`}>
    <div className="set-catalog-heading"><h3>Catalog</h3><QuietButton onClick={() => onAddItem?.(row)}>Add missing item</QuietButton></div>
    <div className="set-catalog-controls"><div className="set-catalog-kinds" role="group" aria-label="Product type">{[["all", "All"], ["card", "Cards"], ["sealed", "Sealed"]].map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setLimit(24); }}>{label}</button>)}</div><button type="button" className="set-catalog-owned-toggle" aria-label="Owned only" aria-pressed={ownedOnly} onClick={() => { setOwnedOnly(value => !value); setLimit(24); }}><span aria-hidden="true">{ownedOnly ? "✓" : "○"}</span> Owned only</button></div>
    <SearchField label="Search this set" placeholder="Search by name or card number" value={query} onChange={value => { setQuery(value); setLimit(24); }} />
    {remote.status === "loading" ? <p className="set-catalog-notice" role="status">Loading catalog entries. Your saved items remain available below.</p> : null}
    {remote.status === "error" ? <div className="set-catalog-notice" role="alert"><p>{remote.message} If you are offline, reconnect and try again. Your saved records are unchanged.</p><QuietButton onClick={retry}>Retry catalog</QuietButton></div> : null}
    {remote.status === "unavailable" ? <p className="set-catalog-notice">A full catalog is not connected for this set. Showing known catalog entries and your saved items.</p> : null}
    <p className="set-catalog-result-count" role="status">{filtered.length} {filtered.length === 1 ? "item" : "items"}{ownedOnly ? " you own" : " shown"}{query ? ` matching “${query}”` : ""}{!ownedOnly && filteredOwnedCount ? ` · ${filteredOwnedCount} owned` : ""}</p>
    {filtered.length ? <ul className="set-catalog-grid" aria-label="Cards and sealed products">{filtered.slice(0, limit).map(entry => <li key={entry.key}><button type="button" className="set-catalog-product" data-owned={entry.owned} aria-label={`View ${setCatalogName(entry.product)}${setCatalogNumber(entry.product) ? `, card ${setCatalogNumber(entry.product)}` : ""}${entry.owned ? `, owned, ${quantityLabel(entry)}` : ""}`} onClick={() => setSelectedKey(entry.key)}><span className="set-catalog-product-media"><ItemPhoto fallbackClassName="set-catalog-photo-fallback" src={getItemImageUrl(entry.product)} alt={setCatalogName(entry.product)} loading="lazy" />{entry.owned ? <span className="set-catalog-owned-badge">✓ Owned · {quantityLabel(entry)}</span> : null}</span><span className="set-catalog-product-copy"><strong>{setCatalogName(entry.product)}</strong><span>{[entry.savedOnly ? "Saved item" : entry.kind === "card" ? "Card" : "Sealed", setCatalogNumber(entry.product) ? `#${setCatalogNumber(entry.product)}` : entry.product.productType, entry.product.rarity].filter(Boolean).join(" · ")}</span>{entry.savedOnly && remote.status !== "loading" ? <span className="set-catalog-match-note">Catalog match needed</span> : null}</span></button></li>)}</ul> : remote.status !== "loading" ? <EmptyState title={ownedOnly ? "No owned items match" : "No matching catalog items"} action={<QuietButton onClick={reset}>Show all items</QuietButton>}>{ownedOnly ? "Turn off Owned only to explore this set, or adjust your search." : "Try another name, card number, or product type."}</EmptyState> : null}
    {filtered.length > limit ? <div className="set-catalog-more"><QuietButton onClick={() => setLimit(value => value + 24)}>Show more ({filtered.length - limit} remaining)</QuietButton></div> : null}
    <p className="set-catalog-note">Owned badges use your personal collection and count saved quantities. Catalog entries may include variants; they are not an official checklist or a store stock guarantee.{savedOnly && remote.status !== "loading" ? ` ${savedOnly} saved ${savedOnly === 1 ? "item needs" : "items need"} a catalog match and ${savedOnly === 1 ? "is" : "are"} shown separately.` : ""}</p>
    <BottomSheet open={Boolean(selected)} title={selected ? setCatalogName(selected.product) : "Catalog item"} onClose={() => setSelectedKey("")}>
      {selected ? <div className="set-catalog-item-detail"><div className="set-catalog-item-photo"><ItemPhoto fallbackClassName="set-catalog-photo-fallback" src={getItemImageUrl(selected.product)} alt={setCatalogName(selected.product)} /></div><p>{row.name}{setCatalogNumber(selected.product) ? ` · #${setCatalogNumber(selected.product)}` : ""}</p><p className={selected.owned ? "set-catalog-detail-owned" : ""}>{selected.owned ? `✓ Owned · ${quantityLabel(selected)}` : "Not in your personal collection"}</p>{selected.product.language ? <p>{selected.product.language}</p> : null}{selected.records.length ? <div className="set-catalog-copies"><h3>Your saved copies</h3>{selected.records.map((record, index) => <QuietButton key={`${record._recordOrigin || ""}:${record.id}:${index}`} onClick={() => { setSelectedKey(""); onOpenItem?.(record); }}>Open saved record {index + 1}</QuietButton>)}</div> : null}{!selected.savedOnly && onAddCatalogItem ? <PrimaryButton onClick={() => { setSelectedKey(""); onAddCatalogItem(row, selected.product); }}>{selected.owned ? "Add another copy" : "Add to collection"}</PrimaryButton> : null}<p className="set-catalog-note">Review quantity, condition, purpose, and purchase details before saving. Browsing does not add anything.</p></div> : null}
    </BottomSheet>
  </section>;
}
