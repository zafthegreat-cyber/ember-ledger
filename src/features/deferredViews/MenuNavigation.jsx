import { useId, useRef, useState } from "react";
import MenuItemIcon from "./MenuItemIcon.jsx";

const SECTION_ORDER = ["find", "collection", "community", "account", "tools", "admin"];
const SECTION_LABELS = { find: "Find & sell", tools: "Help & updates", account: "Account & settings" };
const SECTION_ICONS = { collection: "inventory", find: "find", community: "community", tools: "help", account: "account", admin: "secure" };
const ITEM_GROUPS = { scanProduct: "collection", scout: "find", reportRestock: "find", watchList: "find", exchange: "find", announcements: "tools", comingSoon: "tools" };
const SECTION_HINTS = { collection: "Cards, scanning & adding", find: "Restocks, alerts & research", community: "Families, trading & shops", account: "Profile, preferences & privacy", tools: "Support, feedback & what's new", admin: "Approvals & moderation" };
const QUICK_KEYS = ["scout", "vault", "scanProduct", "watchList"];
const QUICK_LABELS = { scanProduct: "Scan", watchList: "Alerts" };
const SEARCH_TERMS = { settings: "cloud saving sync backup recovery theme appearance dark light preferences", collections: "family workspace members", exchange: "sell prices market research", watchList: "notifications watchlist", reportRestock: "report restock stock low empty shelves shelf sighting store visit found in out of stock availability" };
const WORKSPACE_HINTS = { COLLECT: "Your cards, sets & wishlist.", FIND: "Restocks, alerts & finding cards.", SELL: "Inventory, listings & sales.", BUSINESS: "Purchases, expenses & reports.", BOT: "Private bot tools & activity." };

function Chevron({ expanded = false }) {
  return <svg className={`menu-command-chevron${expanded ? " is-expanded" : ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>;
}

function groupDestinations(sections) {
  const grouped = new Map();
  for (const section of sections) for (const item of section.items) {
    const key = ITEM_GROUPS[item.key] || section.key;
    if (!grouped.has(key)) grouped.set(key, { key, title: SECTION_LABELS[key] || section.title, items: [] });
    grouped.get(key).items.push(item);
  }
  const rank = key => SECTION_ORDER.includes(key) ? SECTION_ORDER.indexOf(key) : SECTION_ORDER.length;
  return [...grouped.values()].sort((left, right) => rank(left.key) - rank(right.key));
}

// This presentation layer only receives destinations already permitted by App.
export default function MenuNavigation({ sections, NavIcon, isItemActive, onSelect, onAdd, modeLabel, experiencePresentation, workspaces = [], currentWorkspaceId = "", onSelectWorkspace, children }) {
  const searchId = useId();
  const sectionId = useId();
  const workspaceId = useId();
  const searchRef = useRef(null);
  const scrollRef = useRef(null);
  const ordered = groupDestinations(sections);
  const collectorPresentation = Boolean(experiencePresentation && !experiencePresentation.showBusinessTools);
  const sectionLabel = section => section.key === "find" && collectorPresentation ? "Find & trade" : SECTION_LABELS[section.key] || section.title;
  const sectionHint = key => key === "community" && collectorPresentation && !experiencePresentation.showFamilyTools
    ? "Collector updates & conversations"
    : SECTION_HINTS[key];
  const workspaceHint = workspace => workspace.id === "SELL" && collectorPresentation
    ? "Occasional sales & trades."
    : WORKSPACE_HINTS[workspace.id] || workspace.shortPurpose;
  const [query, setQuery] = useState("");
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => ordered.filter(section => section.items.some(isItemActive)).map(section => section.key));
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const visibleSections = ordered.map(section => ({ ...section, items: section.items.filter(item => {
    const text = `${item.label} ${item.helper || ""} ${sectionLabel(section)} ${sectionHint(section.key) || ""} ${SEARCH_TERMS[item.key] || ""}`.toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  }) })).filter(section => section.items.length);
  const visibleWorkspaces = workspaces.filter(workspace => terms.every(term => `${workspace.label} workspace home ${workspaceHint(workspace) || ""}`.toLocaleLowerCase().includes(term)));
  const resultCount = visibleSections.reduce((total, section) => total + section.items.length, 0) + visibleWorkspaces.length;
  const currentWorkspace = workspaces.find(workspace => workspace.id === currentWorkspaceId);
  const allItems = sections.flatMap(section => section.items);
  const quickItems = QUICK_KEYS.map(key => allItems.find(item => item.key === key)).filter(Boolean);
  const reportItem = allItems.find(item => item.key === "reportRestock");

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
        <input ref={searchRef} id={searchId} type="search" value={query} onChange={event => updateQuery(event.target.value)} onKeyDown={event => {
          if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); clearSearch(); }
          if (event.key === "ArrowDown" && searching) { event.preventDefault(); scrollRef.current?.querySelector("[data-menu-workspace], [data-menu-key]")?.focus(); }
        }} placeholder="Find a page or tool" autoComplete="off" spellCheck={false} />
        {query && <button type="button" className="menu-search-clear" aria-label="Clear menu search" onClick={clearSearch}><NavIcon kind="close" /></button>}
      </div>
      <span className="menu-sr-only" role="status">{searching ? `${resultCount} ${resultCount === 1 ? "destination" : "destinations"} found` : ""}</span>
    </div>
    <div ref={scrollRef} className="drawer-menu-stack">
      <nav className="menu-command-links" aria-label="Menu destinations">
        {!searching && <>
          <div className="menu-command-links-header">
            {workspaces.length > 0 ? <button type="button" className="menu-workspace-toggle" aria-expanded={workspacesOpen} aria-controls={workspaceId} onClick={() => setWorkspacesOpen(open => !open)}>
              <NavIcon kind={currentWorkspace?.icon || "workspace"} /><span><small>Workspace</small><strong>{currentWorkspace?.label || "Choose workspace"}</strong></span><Chevron expanded={workspacesOpen} />
            </button> : <span className="menu-workspace-label">{modeLabel}</span>}
            <button type="button" className="menu-quick-add" onClick={onAdd}><NavIcon kind="plus" />Quick Add</button>
          </div>
          <div id={workspaceId} className="menu-workspace-options" hidden={!workspacesOpen} role="group" aria-label="Switch workspace">
            {workspaces.map(workspace => <button type="button" key={workspace.id} data-menu-workspace={workspace.id} className={`menu-workspace-option${workspace.id === currentWorkspaceId ? " is-current" : ""}`} onClick={() => onSelectWorkspace(workspace)}>
              <NavIcon kind={workspace.icon} /><span><strong>{workspace.label}</strong><small>{workspaceHint(workspace)}</small></span>{workspace.id === currentWorkspaceId ? <span className="menu-workspace-current">Current workspace</span> : <Chevron />}
            </button>)}
          </div>
          {quickItems.length > 0 && <section className="menu-shortcuts" aria-label="Quick access">
            {quickItems.map(item => <button key={item.key} type="button" className={`menu-shortcut${isItemActive(item) ? " active" : ""}`} data-menu-shortcut={item.key} aria-label={item.key === "scanProduct" ? "Scan card or product" : item.label} aria-current={isItemActive(item) ? "page" : undefined} onClick={() => onSelect(item)}>
              <MenuItemIcon item={item} NavIcon={NavIcon} />
              <span>{QUICK_LABELS[item.key] || item.label}</span>
            </button>)}
          </section>}
          {reportItem && <button type="button" className="menu-report-action" data-menu-report="restock" onClick={() => onSelect(reportItem)}>
            <span className="menu-report-icon" aria-hidden="true"><MenuItemIcon item={reportItem} NavIcon={NavIcon} /></span>
            <span><strong>{reportItem.label}</strong><small>{reportItem.helper}</small></span><Chevron />
          </button>}
          <p className="menu-browse-label">Browse all</p>
        </>}
        {searching && <p className="menu-results-label">{resultCount} {resultCount === 1 ? "result" : "results"}</p>}
        {searching && visibleWorkspaces.length > 0 && <section className="menu-workspace-options menu-workspace-results" aria-label="Workspaces">
          <h3 className="menu-results-section-title">Workspaces</h3>
          {visibleWorkspaces.map(workspace => <button type="button" className="menu-workspace-option" key={workspace.id} data-menu-workspace={workspace.id} onClick={() => onSelectWorkspace(workspace)}>
            <NavIcon kind={workspace.icon} /><span><strong>{workspace.label} workspace</strong><small>{workspaceHint(workspace)}</small></span><Chevron />
          </button>)}
        </section>}
        <div className="menu-command-groups">
          {visibleSections.map(section => {
            const open = searching || expanded.includes(section.key);
            const title = sectionLabel(section);
            const hasActive = section.items.some(isItemActive);
            const groupId = `${sectionId}-${section.key}`;
            return <section className={`menu-command-section${open ? " is-open" : ""}`} data-menu-section={section.key} key={section.key}>
              {searching ? <h3 className="menu-results-section-title">{title}</h3> : <h3 className="menu-section-heading">
                <button type="button" className="menu-section-toggle" aria-expanded={open} aria-controls={groupId} onClick={() => setExpanded(current => current.includes(section.key) ? current.filter(key => key !== section.key) : [...current, section.key])}>
                  <span className="menu-section-icon" aria-hidden="true"><NavIcon kind={SECTION_ICONS[section.key] || "workspace"} /></span>
                  <span className="menu-section-title">{title}<span className={hasActive ? "menu-current-section" : "menu-section-hint"}>{hasActive ? "Current page" : sectionHint(section.key)}</span></span>
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
