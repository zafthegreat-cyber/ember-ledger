import { useMemo } from "react";
import { CollectionSetGrid, CollectionSetItems, SetArtwork } from "./CollectionSetsViews.jsx";
import { EmptyState, QuietButton, SearchField, SortControl } from "./operations/OperationsUI.jsx";
import { filterCollectionSetRows } from "../utils/collectionSets.mjs";
import "./collection-sets.css";
import CollectionGameFilter from "./CollectionGameFilter.jsx";
import { COLLECTIBLE_GAMES } from "../utils/collectibleGames.mjs";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function CollectionSets({ rows, viewState, onViewStateChange, onOpenSet, onBack, onOpenItem, onAddItem, onAddManualItem, resolveItemImage, showValues, binderTools }) {
  const { query, scope, sort, language, selectedId, limit, game = "all" } = viewState;
  const update = (patch) => onViewStateChange((current) => ({ ...current, ...patch }));
  const filtered = useMemo(() => filterCollectionSetRows(rows, { query, scope, sort, language, game }), [rows, query, scope, sort, language, game]);
  const selectedGame = COLLECTIBLE_GAMES.find((entry) => entry.id === game);
  const gameName = selectedGame?.name || "Unspecified / other";
  const selected = rows.find((row) => row.id === selectedId);
  const languages = [...new Set(rows.flatMap((row) => row.languages || []))].sort();

  return <section className="collection-sets" aria-label="Collection sets">
    {selected ? <div className="collection-set-detail">
      <QuietButton className="collection-sets-back" onClick={onBack}>← Back to sets</QuietButton>
      <header className="collection-set-detail-header">
        <SetArtwork row={selected} resolveItemImage={resolveItemImage} />
        <div><p className="collection-sets-eyebrow">{[selected.gameName, selected.series].filter(Boolean).join(" · ") || "Your set collection"}</p><h2 tabIndex={-1} data-set-detail-heading>{selected.name}</h2><p>{selected.progressLabel}</p><p>{selected.sealedCount || 0} sealed item{selected.sealedCount === 1 ? "" : "s"} · {selected.itemCount} saved record{selected.itemCount === 1 ? "" : "s"}</p></div>
      </header>
      <div className="collection-sets-summary">
        <div><span>Unique cards</span><strong>{selected.uniqueCardCount}</strong></div>
        <div><span>Saved estimate</span><strong>{showValues ? selected.totalValue == null || (selected.itemCount > 0 && selected.knownValueCount === 0) ? "Not recorded" : currency.format(selected.totalValue) : "Hidden"}</strong></div>
      </div>
      <p className="collection-sets-note">{selected.totalCards ? "Progress counts recorded unique cards, not duplicate copies or finish variants." : "A full set checklist is not available. Progress counts your recorded unique cards; sealed products are tracked separately."} {selected.unknownCardIdentityCount ? `${selected.unknownCardIdentityCount} card record(s) need a card number or catalog identity before they can count toward progress. ` : ""}{showValues ? `${selected.knownValueCount} of ${selected.itemCount} saved records have an estimate. Values include recorded quantities and may combine saved market and projected estimates.` : "Value display follows your Collection preference and plan."}</p>
      <div className="collection-sets-detail-actions"><h3>In your collection</h3><QuietButton onClick={() => onAddItem(selected)}>Add an item</QuietButton></div>
      {selected.ownedItems.length ? <CollectionSetItems items={selected.ownedItems} onOpenItem={onOpenItem} resolveItemImage={resolveItemImage} showValues={showValues} /> : <EmptyState title="Start collecting this set" action={<QuietButton onClick={() => onAddItem(selected)}>Add an item</QuietButton>}>Add a card or sealed product you own. Browsing a set does not add records to your collection.</EmptyState>}
    </div> : <>
      <h2 className="sr-only">Set library</h2>
      <CollectionGameFilter value={game} onChange={(value) => update({ game: value, selectedId: "", limit: 24 })} />
      <div className="collection-sets-toolbar"><SearchField label="Search sets" placeholder="Search sets by name, series, or code" value={query} onChange={(value) => update({ query: value, limit: 24 })} />{query ? <QuietButton onClick={() => update({ query: "", limit: 24 })}>Clear search</QuietButton> : null}</div>
      <div className="collection-sets-controls"><div className="collection-sets-tabs" role="group" aria-label="Set collection scope">{[["all", "All sets"], ["owned", "Your sets"]].map(([value, label]) => <button type="button" key={value} aria-pressed={scope === value} onClick={() => update({ scope: value, limit: 24 })}>{label}</button>)}</div><SortControl label="Sort sets" value={sort} onChange={(value) => update({ sort: value })} options={[{ value: "name", label: "Name" }, { value: "progress", label: "Your progress" }, { value: "newest", label: "Release date" }]} />{languages.length > 1 ? <SortControl label="Sets containing language" value={language} onChange={(value) => update({ language: value, limit: 24 })} options={[{ value: "all", label: "All recorded languages" }, ...languages.map((value) => ({ value, label: value }))]} /> : null}</div>
      <p className="collection-sets-result-count" role="status">{filtered.length} set{filtered.length === 1 ? "" : "s"}{query ? ` matching “${query}”` : scope === "owned" ? " in your collection" : " to explore"}</p>
      {filtered.length ? <><CollectionSetGrid rows={filtered.slice(0, limit)} onOpen={onOpenSet} resolveItemImage={resolveItemImage} showValues={showValues} />{filtered.length > limit ? <div className="collection-sets-load-more"><QuietButton onClick={() => update({ limit: limit + 24 })}>Show more sets ({filtered.length - limit} remaining)</QuietButton></div> : null}</> : <EmptyState title={query ? "No matching sets" : game !== "all" ? `No ${gameName} sets yet` : "No sets here yet"} action={<><QuietButton onClick={onAddManualItem}>Add an item</QuietButton><QuietButton onClick={() => update({ query: "", scope: "all", language: "all", game: "all", limit: 24 })}>Browse all sets</QuietButton></>}>{query ? "Try a set name, series, or code." : game !== "all" && !selectedGame?.catalogSupported ? "You can track this game with manual entries, photos, set names, and saved estimates. Live catalog and price lookup are not connected for this game." : "Add a set name to a collection item to track it here."}</EmptyState>}
      <p className="collection-sets-note">Progress uses your saved personal collection. Set totals and matching set artwork are shown when available.{language !== "all" ? " The language filter finds sets containing that language. Counts and values include every language saved within each set." : ""}</p>
      {binderTools ? <details className="collection-sets-binders"><summary>Binders & set plans</summary>{binderTools}</details> : null}
    </>}
  </section>;
}
