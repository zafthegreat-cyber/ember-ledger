import { useMemo } from "react";
import { CollectionSetGrid, SetArtwork } from "./CollectionSetsViews.jsx";
import CollectionSetCatalog from "./CollectionSetCatalog.jsx";
import { EmptyState, QuietButton, SearchField, SortControl } from "./operations/OperationsUI.jsx";
import { filterCollectionSetRows } from "../utils/collectionSets.mjs";
import "./collection-sets.css";
import CollectionGameFilter from "./CollectionGameFilter.jsx";
import { COLLECTIBLE_GAMES } from "../utils/collectibleGames.mjs";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function CollectionSets({ rows, viewState, onViewStateChange, onOpenSet, onBack, onOpenItem, onAddItem, onAddCatalogItem, onAddManualItem, onReviewCatalogMatch, canMatchRecord = () => true, resolveItemImage, showValues, binderTools, loadCatalog }) {
  const { query, scope, sort, language, selectedId, limit, game = "all" } = viewState;
  const update = (patch) => onViewStateChange((current) => ({ ...current, ...patch }));
  const filtered = useMemo(() => filterCollectionSetRows(rows, { query, scope, sort, language, game }), [rows, query, scope, sort, language, game]);
  const selectedGame = COLLECTIBLE_GAMES.find((entry) => entry.id === game);
  const gameName = selectedGame?.name || "Unspecified / other";
  const selected = rows.find((row) => row.id === selectedId);
  const languages = [...new Set(rows.flatMap((row) => row.languages || []))].sort();
  const applied = [query ? `Search: ${query}` : "", scope !== "all" ? ({owned:"Your sets","in-progress":"In progress",complete:"Complete"})[scope] : "", game !== "all" ? gameName : "", language !== "all" ? language : ""].filter(Boolean);

  return <section className="collection-sets" aria-label="Collection sets">
    {selected ? <div className="collection-set-detail">
      <QuietButton className="collection-sets-back" onClick={onBack}>← Back to sets</QuietButton>
      <header className="collection-set-detail-header">
        <SetArtwork row={selected} resolveItemImage={resolveItemImage} />
        <div><p className="collection-set-detail-meta">{[selected.gameName, selected.series].filter(Boolean).join(" · ") || "Your set collection"}</p><h2 tabIndex={-1} data-set-detail-heading>{selected.name}</h2><p>{selected.uniqueCardCount} unique card{selected.uniqueCardCount === 1 ? "" : "s"} owned · {selected.sealedQuantity || 0} sealed</p>{showValues && selected.itemCount > 0 ? <p>Saved estimate: {selected.totalValue == null || selected.knownValueCount === 0 ? "Not recorded" : currency.format(selected.totalValue)}{selected.knownValueCount < selected.itemCount ? ` (${selected.knownValueCount} of ${selected.itemCount} records valued)` : ""}</p> : null}</div>
      </header>
      <CollectionSetCatalog key={selected.id} row={selected} onAddItem={onAddItem} onAddCatalogItem={onAddCatalogItem} onOpenItem={onOpenItem} onReviewCatalogMatch={onReviewCatalogMatch} canMatchRecord={canMatchRecord} hiddenValues={!showValues} viewState={viewState.catalogViews?.[selected.key]} onViewStateChange={next => onViewStateChange(current => ({...current,catalogViews:{...current.catalogViews,[selected.key]:typeof next === "function" ? next(current.catalogViews?.[selected.key]) : next}}))} loadCatalog={loadCatalog} />
    </div> : <>
      <h2 className="sr-only">Set library</h2>
      <CollectionGameFilter value={game} onChange={(value) => update({ game: value, selectedId: "", limit: 24 })} />
      <div className="collection-sets-toolbar"><SearchField label="Search sets" placeholder="Search sets by name, series, or code" value={query} onChange={(value) => update({ query: value, limit: 24 })} />{query ? <QuietButton onClick={() => update({ query: "", limit: 24 })}>Clear search</QuietButton> : null}</div>
      <div className="collection-sets-controls"><div className="collection-sets-tabs" role="group" aria-label="Set collection scope">{[["all", "All sets"], ["owned", "Your sets"], ["in-progress", "In progress"], ["complete", "Complete"]].map(([value, label]) => <button type="button" key={value} aria-pressed={scope === value} onClick={() => update({ scope: value, limit: 24 })}>{label}</button>)}</div><SortControl label="Sort sets" value={sort} onChange={(value) => update({ sort: value })} options={[{ value: "name", label: "Name" }, { value: "progress", label: "Your progress" }, { value: "newest", label: "Release date" }]} />{languages.length > 1 ? <SortControl label="Sets containing language" value={language} onChange={(value) => update({ language: value, limit: 24 })} options={[{ value: "all", label: "All recorded languages" }, ...languages.map((value) => ({ value, label: value }))]} /> : null}</div>
      {applied.length ? <div className="collection-sets-filter-summary" aria-label="Applied set filters"><p>{applied.join(" · ")}</p><QuietButton onClick={() => update({query:"",scope:"all",language:"all",game:"all",limit:24})}>Clear filters</QuietButton></div> : null}
      <div className="collection-sets-results-heading"><p className="collection-sets-result-count" role="status">{Math.min(limit,filtered.length) < filtered.length ? `${Math.min(limit,filtered.length)} of ` : ""}{filtered.length} set{filtered.length === 1 ? "" : "s"}{query ? ` matching “${query}”` : scope === "owned" ? " in your collection" : " to explore"}</p>{!showValues ? <span className="collection-sets-privacy">Estimates hidden</span> : null}</div>
      {filtered.length ? <><CollectionSetGrid rows={filtered.slice(0, limit)} onOpen={onOpenSet} resolveItemImage={resolveItemImage} showValues={showValues} />{filtered.length > limit ? <div className="collection-sets-load-more"><QuietButton onClick={() => update({ limit: limit + 24 })}>Show more sets ({filtered.length - limit} remaining)</QuietButton></div> : null}</> : <EmptyState title={query ? "No matching sets" : game !== "all" ? `No ${gameName} sets yet` : "No sets here yet"} action={<><QuietButton onClick={onAddManualItem}>Add an item</QuietButton><QuietButton onClick={() => update({ query: "", scope: "all", language: "all", game: "all", limit: 24 })}>Browse all sets</QuietButton></>}>{query ? "Try a set name, series, or code." : game !== "all" && !selectedGame?.catalogSupported ? "You can track this game with manual entries, photos, set names, and saved estimates. Live catalog and price lookup are not connected for this game." : "Add a set name to a collection item to track it here."}</EmptyState>}
      <p className="collection-sets-note">Progress uses your saved personal collection. Checklist totals appear where available. Some promo and product collections do not have a dedicated set logo.{language !== "all" ? " The language filter finds sets containing that language. Counts and values include every language saved within each set." : ""}</p>
      {binderTools ? <details className="collection-sets-binders"><summary>Binders & set plans</summary>{binderTools}</details> : null}
    </>}
  </section>;
}
