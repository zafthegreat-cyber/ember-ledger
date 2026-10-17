import { useId, useRef, useState } from "react";
import MenuItemIcon from "./MenuItemIcon.jsx";

const SECTION_ORDER = ["collection", "community", "tools", "account", "admin", "roadmap"];
const SECTION_LABELS = { tools: "Tools & support", account: "Account & settings", roadmap: "What's next" };
const SECTION_ICONS = { collection: "inventory", community: "community", tools: "help", account: "account", admin: "secure", roadmap: "calendar" };
const QUICK_KEYS = ["vault", "scanProduct", "scout", "watchList"];
const QUICK_LABELS = { scanProduct: "Scan a card" };
const SEARCH_TERMS = { settings: "cloud saving sync backup recovery theme appearance dark light preferences", collections: "family workspace members", exchange: "sell prices market research", watchList: "notifications watchlist" };

function Chevron({ expanded = false }) {
  return <svg className={`menu-command-chevron${expanded ? " is-expanded" : ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>;
}

// This presentation layer only receives destinations already permitted by App.
export default function MenuNavigation({ sections, NavIcon, isItemActive, onSelect, onAdd, modeLabel, children }) {
  const searchId = useId();
  const sectionId = useId();
  const searchRef = useRef(null);
  const scrollRef = useRef(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => sections.filter(section => section.items.some(isItemActive)).map(section => section.key));
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const ordered = [...sections].sort((left, right) => {
    const rank = key => SECTION_ORDER.includes(key) ? SECTION_ORDER.indexOf(key) : SECTION_ORDER.length;
    return rank(left.key) - rank(right.key);
  });
  const visibleSections = ordered.map(section => ({ ...section, items: section.items.filter(item => {
    const text = `${item.label} ${item.helper || ""} ${section.title} ${SEARCH_TERMS[item.key] || ""}`.toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  }) })).filter(section => section.items.length);
  const resultCount = visibleSections.reduce((total, section) => total + section.items.length, 0);
  const allItems = sections.flatMap(section => section.items);
  const quickItems = QUICK_KEYS.map(key => allItems.find(item => item.key === key)).filter(Boolean);

  function updateQuery(value) {
    setQuery(value);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function clearSearch() {
    updateQuery("");
    searchRef.current?.focus();
  }

  return <>
    <div className="menu-search-toolbar">
      <label className="menu-search-label" htmlFor={searchId}>Search menu</label>
      <div className="menu-search-field">
        <NavIcon kind="search" />
        <input ref={searchRef} id={searchId} type="search" value={query} onChange={event => updateQuery(event.target.value)} placeholder="Find a page or tool" autoComplete="off" spellCheck={false} />
        {query && <button type="button" className="menu-search-clear" aria-label="Clear menu search" onClick={clearSearch}><NavIcon kind="close" /></button>}
      </div>
      <span className="menu-sr-only" role="status">{searching ? `${resultCount} ${resultCount === 1 ? "destination" : "destinations"} found` : ""}</span>
    </div>
    <div ref={scrollRef} className="drawer-menu-stack">
      <nav className="menu-command-links" aria-label="Menu destinations">
        {!searching && <>
          <div className="menu-command-links-header">
            <span className="menu-workspace-label">{modeLabel}</span>
            <button type="button" className="menu-quick-add" onClick={onAdd}><NavIcon kind="plus" />Quick Add</button>
          </div>
          {quickItems.length > 0 && <section className="menu-shortcuts" aria-label="Quick access">
            {quickItems.map(item => <button key={item.key} type="button" className={`menu-shortcut${isItemActive(item) ? " active" : ""}`} data-menu-shortcut={item.key} aria-current={isItemActive(item) ? "page" : undefined} onClick={() => onSelect(item)}>
              <MenuItemIcon item={item} NavIcon={NavIcon} />
              <span>{QUICK_LABELS[item.key] || item.label}</span>
            </button>)}
          </section>}
          <p className="menu-browse-label">Browse all</p>
        </>}
        {searching && <p className="menu-results-label">{resultCount} {resultCount === 1 ? "result" : "results"}</p>}
        <div className="menu-command-groups">
          {visibleSections.map(section => {
            const open = searching || expanded.includes(section.key);
            const title = SECTION_LABELS[section.key] || section.title;
            const hasActive = section.items.some(isItemActive);
            const groupId = `${sectionId}-${section.key}`;
            return <section className={`menu-command-section${open ? " is-open" : ""}`} data-menu-section={section.key} key={section.key}>
              {searching ? <h3 className="menu-results-section-title">{title}</h3> : <h3 className="menu-section-heading">
                <button type="button" className="menu-section-toggle" aria-expanded={open} aria-controls={groupId} onClick={() => setExpanded(current => current.includes(section.key) ? current.filter(key => key !== section.key) : [...current, section.key])}>
                  <span className="menu-section-icon" aria-hidden="true"><NavIcon kind={SECTION_ICONS[section.key] || "workspace"} /></span>
                  <span className="menu-section-title">{title}{hasActive && <span className="menu-current-section">Current page</span>}</span>
                  <span className="menu-section-count" aria-label={`${section.items.length} destinations`}>{section.items.length}</span>
                  <Chevron expanded={open} />
                </button>
              </h3>}
              <div id={groupId} className="menu-command-grid" hidden={!open}>
                {section.items.map(item => <button type="button" key={item.key} className={`menu-command-link${isItemActive(item) ? " active" : ""}`} data-menu-key={item.key} aria-current={isItemActive(item) ? "page" : undefined} aria-label={`${item.label}. ${item.helper || "Open this workspace area."}`} onClick={() => onSelect(item)}>
                  <span className="menu-command-icon" aria-hidden="true"><MenuItemIcon item={item} NavIcon={NavIcon} /></span>
                  <span className="menu-command-copy"><strong>{item.label}</strong><small>{item.helper}</small></span>
                  <Chevron />
                </button>)}
              </div>
            </section>;
          })}
        </div>
        {searching && resultCount === 0 && <div className="menu-empty-search">
          <NavIcon kind="search" /><strong>No matching pages</strong><p>Try collection, alerts, or settings.</p>
          <button type="button" onClick={clearSearch}>Clear search</button>
        </div>}
      </nav>
      {!searching && children}
    </div>
  </>;
}
