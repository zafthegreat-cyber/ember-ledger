import { useMemo, useState } from "react";
import { CollectionSetGrid, SetArtwork } from "./CollectionSetsViews.jsx";
import CollectionSetCatalog from "./CollectionSetCatalog.jsx";
import { EmptyState, QuietButton, SearchField, SortControl } from "./operations/OperationsUI.jsx";
import { filterCollectionSetRows } from "../utils/collectionSets.mjs";
import "./collection-sets.css";
import CollectionGameFilter from "./CollectionGameFilter.jsx";
import { collectionPreferenceStore } from '../utils/collectionNext.mjs';
import { projectSetLanguage, setYear, setCatalogAvailability } from '../utils/setLibraryNext.mjs';
import './collection-next.css';
import { COLLECTIBLE_GAMES } from "../utils/collectibleGames.mjs";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function deviceStorage() { try { return globalThis.localStorage; } catch { return undefined; } }

export default function CollectionSets({ rows, viewState, onViewStateChange, onOpenSet, onBack, onOpenItem, onAddItem, onAddCatalogItem, onAddManualItem, onReviewCatalogMatch, canMatchRecord = () => true, resolveItemImage, showValues, binderTools, loadCatalog, preferenceScope, onAddMissingToWishlist, onPreviewMissingWishlist, existingWishlistProducts }) {
  const { query, scope, sort, language, selectedId, limit, game = "all" } = viewState;
  const update = (patch) => onViewStateChange((current) => ({ ...current, ...patch }));
  const [prefStore]=useState(()=>collectionPreferenceStore(deviceStorage(),preferenceScope));
  const [preferences,setPreferences]=useState(()=>prefStore.load());
  const pins=preferences.state.pinnedSets;
  const togglePin=id=>setPreferences(prefStore.save({...preferences.state,pinnedSets:pins.includes(id)?pins.filter(key=>key!==id):[...pins,id].slice(0,100)}));
  const {year='all',availability='all',countLanguage='all',seriesMode=false,pinnedOnly=false,collapsedSeries=[]}=viewState;
  const projected=useMemo(()=>countLanguage==='selected'&&language!=='all'?rows.map(row=>projectSetLanguage(row,language)):rows,[rows,countLanguage,language]);
  const filtered = useMemo(() => filterCollectionSetRows(projected, { query, scope, sort, language, game }).filter(row=>(year==='all'||setYear(row)===year)&&(availability==='all'||setCatalogAvailability(row)===availability)&&(!pinnedOnly||pins.includes(row.id))), [projected, query, scope, sort, language, game,year,availability,pinnedOnly,pins]);
  const seriesName=row=>row.series||'Other / series not recorded';
  const allSeries=[...new Set(filtered.map(seriesName))];
  const seriesGroups=[...new Set(filtered.slice(0,limit).map(seriesName))];
  const jumpSeries=series=>{if(!series)return;const last=filtered.findLastIndex(row=>seriesName(row)===series);update({seriesMode:true,limit:Math.max(limit,last+1),collapsedSeries:collapsedSeries.filter(value=>value!==series)});requestAnimationFrame(()=>document.getElementById('set-series-'+encodeURIComponent(series))?.scrollIntoView({block:'start'}));};
  const grid=groupRows=><CollectionSetGrid rows={groupRows} onOpen={onOpenSet} resolveItemImage={resolveItemImage} showValues={showValues}/>;
  const selectedGame = COLLECTIBLE_GAMES.find((entry) => entry.id === game);
  const gameName = selectedGame?.name || "Unspecified / other";
  const selected = projected.find((row) => row.id === selectedId);
  const languages = [...new Set(rows.flatMap((row) => row.languages || []))].sort();
  const applied = [query ? `Search: ${query}` : "", scope !== "all" ? ({owned:"Your sets","in-progress":"In progress",complete:"Complete"})[scope] : "", game !== "all" ? gameName : "", language !== "all" ? language : "",year!=="all"?year:"",availability!=="all"?availability:"",pinnedOnly?"Pinned sets":""].filter(Boolean);

  return <section className="collection-sets" aria-label="Collection sets">
    {selected ? <div className="collection-set-detail">
      <QuietButton className="collection-sets-back" onClick={onBack}>← Back to sets</QuietButton>
      <header className="collection-set-detail-header">
        <SetArtwork row={selected} resolveItemImage={resolveItemImage} />
        <div><p className="collection-set-detail-meta">{[selected.gameName, selected.series].filter(Boolean).join(" · ") || "Your set collection"}</p><h2 tabIndex={-1} data-set-detail-heading>{selected.name}</h2><button type="button" aria-pressed={pins.includes(selected.id)} onClick={()=>togglePin(selected.id)}>{pins.includes(selected.id)?"★ Pinned set":"☆ Pin set"}</button><p>{selected.uniqueCardCount} unique card{selected.uniqueCardCount === 1 ? "" : "s"} owned · {selected.sealedQuantity || 0} sealed</p>{showValues && selected.itemCount > 0 ? <p>Saved estimate: {selected.totalValue == null || selected.knownValueCount === 0 ? "Not recorded" : currency.format(selected.totalValue)}{selected.knownValueCount < selected.itemCount ? ` (${selected.knownValueCount} of ${selected.itemCount} records valued)` : ""}</p> : null}</div>
      </header>
      {!preferences.ok&&<p role="alert">{preferences.error}</p>}{language!=="all"&&<p className="collection-sets-note">{countLanguage==="selected"?"Counts and values show only "+language+" records; catalog browsing may contain other languages.":"Counts and values include all saved languages."}</p>}
      <CollectionSetCatalog onAddMissingToWishlist={onAddMissingToWishlist} onPreviewMissingWishlist={onPreviewMissingWishlist} existingWishlistProducts={existingWishlistProducts} key={selected.id} row={selected} onAddItem={onAddItem} onAddCatalogItem={onAddCatalogItem} onOpenItem={onOpenItem} onReviewCatalogMatch={onReviewCatalogMatch} canMatchRecord={canMatchRecord} hiddenValues={!showValues} viewState={viewState.catalogViews?.[selected.key]} onViewStateChange={next => onViewStateChange(current => ({...current,catalogViews:{...current.catalogViews,[selected.key]:typeof next === "function" ? next(current.catalogViews?.[selected.key]) : next}}))} loadCatalog={loadCatalog} />
    </div> : <>
      <h2 className="sr-only">Set library</h2>
      {pins.length>0&&<nav className="collection-pinned-sets" aria-label="Pinned sets">{rows.filter(row=>pins.includes(row.id)).map(row=><button type="button" key={row.id} onClick={()=>onOpenSet(row)}>★ {row.name}</button>)}</nav>}
      <CollectionGameFilter value={game} onChange={(value) => update({ game: value, selectedId: "", limit: 24 })} />
      <div className="collection-sets-toolbar"><SearchField label="Search sets" placeholder="Search sets by name, series, or code" value={query} onChange={(value) => update({ query: value, limit: 24 })} />{query ? <QuietButton onClick={() => update({ query: "", limit: 24 })}>Clear search</QuietButton> : null}</div>
      <div className="collection-sets-controls"><div className="collection-sets-tabs" role="group" aria-label="Set collection scope">{[["all", "All sets"], ["owned", "Your sets"], ["in-progress", "In progress"], ["complete", "Complete"]].map(([value, label]) => <button type="button" key={value} aria-pressed={scope === value} onClick={() => update({ scope: value, limit: 24 })}>{label}</button>)}</div><SortControl label="Sort sets" value={sort} onChange={(value) => update({ sort: value })} options={[{ value: "name", label: "Name" }, { value: "progress", label: "Your progress" }, { value: "newest", label: "Release date" }]} />{languages.length > 1 ? <SortControl label="Sets containing language" value={language} onChange={(value) => update({ language: value, limit: 24 })} options={[{ value: "all", label: "All recorded languages" }, ...languages.map((value) => ({ value, label: value }))]} /> : null}</div>
      <details className="collection-extra-filters"><summary>Organize set library</summary><div className="collection-extra-filter-grid"><label>Release year<select value={year} onChange={event=>update({year:event.target.value,limit:24})}><option value="all">All years</option>{[...new Set(rows.map(setYear))].sort().reverse().map(value=><option key={value}>{value}</option>)}</select></label><label>Catalog coverage<select value={availability} onChange={event=>update({availability:event.target.value,limit:24})}><option value="all">All sets</option><option value="catalog">Catalog or checklist available</option><option value="saved">Saved records only</option></select></label><label>Count language<select value={countLanguage} disabled={language==='all'} onChange={event=>update({countLanguage:event.target.value})}><option value="all">All saved languages</option><option value="selected">Selected language only</option></select></label></div><div className="collection-sets-tabs"><button type="button" aria-pressed={seriesMode} onClick={()=>update({seriesMode:!seriesMode})}>Group by series</button><button type="button" aria-pressed={pinnedOnly} onClick={()=>update({pinnedOnly:!pinnedOnly})}>Pinned sets only</button></div><label>Jump to series<select value="" onChange={event=>jumpSeries(event.target.value)}><option value="">Choose series</option>{allSeries.map(series=><option key={series}>{series}</option>)}</select></label><p>Open a set to pin it. Pins are saved on this device.</p></details>
      {!preferences.ok&&<p role="alert">{preferences.error}</p>}
      {applied.length ? <div className="collection-sets-filter-summary" aria-label="Applied set filters"><p>{applied.join(" · ")}</p><QuietButton onClick={() => update({query:"",scope:"all",language:"all",game:"all",year:"all",availability:"all",pinnedOnly:false,limit:24})}>Clear filters</QuietButton></div> : null}
      <div className="collection-sets-results-heading"><p className="collection-sets-result-count" role="status">{Math.min(limit,filtered.length) < filtered.length ? `${Math.min(limit,filtered.length)} of ` : ""}{filtered.length} set{filtered.length === 1 ? "" : "s"}{query ? ` matching “${query}”` : scope === "owned" ? " in your collection" : " to explore"}</p>{!showValues ? <span className="collection-sets-privacy">Estimates hidden</span> : null}</div>
      {filtered.length ? <>{seriesMode?seriesGroups.map(series=><details className="collection-set-series" id={"set-series-"+encodeURIComponent(series)} key={series} open={query.trim()?true:!collapsedSeries.includes(series)} onToggle={event=>{if(query.trim())return;const closed=!event.currentTarget.open;if(closed!==collapsedSeries.includes(series))update({collapsedSeries:closed?[...collapsedSeries,series]:collapsedSeries.filter(value=>value!==series)});}}><summary>{series} · {filtered.filter(row=>(row.series||'Other / series not recorded')===series).length} sets</summary>{grid(filtered.slice(0,limit).filter(row=>(row.series||'Other / series not recorded')===series))}</details>):grid(filtered.slice(0,limit))}{filtered.length > limit ? <div className="collection-sets-load-more"><QuietButton onClick={() => update({ limit: limit + 24 })}>Show more sets ({filtered.length - limit} remaining)</QuietButton></div> : null}</> : <EmptyState title={query ? "No matching sets" : game !== "all" ? `No ${gameName} sets yet` : "No sets here yet"} action={<><QuietButton onClick={onAddManualItem}>Add an item</QuietButton><QuietButton onClick={() => update({ query: "", scope: "all", language: "all", game: "all", year:"all", availability:"all", pinnedOnly:false, limit: 24 })}>Browse all sets</QuietButton></>}>{query ? "Try a set name, series, or code." : game !== "all" && !selectedGame?.catalogSupported ? "You can track this game with manual entries, photos, set names, and saved estimates. Live catalog and price lookup are not connected for this game." : "Add a set name to a collection item to track it here."}</EmptyState>}
      <p className="collection-sets-note">Progress uses your saved personal collection. Checklist totals appear where available. Some promo and product collections do not have a dedicated set logo.{language !== "all" ? countLanguage==='selected'?" Counts and values show only the selected language. A language-specific checklist total is not inferred.":" Counts and values include all saved languages in each matching set." : ""}</p>
      {binderTools ? <details className="collection-sets-binders"><summary>Binders & set plans</summary>{binderTools}</details> : null}
    </>}
  </section>;
}
