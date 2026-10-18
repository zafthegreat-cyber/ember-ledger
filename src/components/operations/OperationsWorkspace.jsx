import { useEffect, useId, useRef } from "react";
import { AppNavIcon } from "../command-system/AppNavIcon.jsx";
import { StatusBadge } from "./OperationsUI.jsx";
import "./operations-workspace.css";

/** Presentation only: callers retain route, selection, permission and data ownership. */
export function OperationsWorkspace({ label, navigation = [], activeKey, onNavigate, groups = null, sidebarFooter = null, children, className = "" }) {
  const selectId = useId();
  return (
    <div className={`ops-workspace ${groups ? "ops-workspace--grouped" : ""} ${className}`}>
      <aside className="ops-workspace__rail" aria-label={`${label} sections`}>
        <span className="ops-workspace__label">{label}</span>
        <label className="ops-workspace__mobile-select" htmlFor={selectId}>
          <span>Section</span>
          <select id={selectId} value={activeKey} onChange={(event) => onNavigate(event.target.value)}>
            {navigation.map((item) => <option key={item.key} value={item.key}>{item.label}{item.count !== undefined ? ` (${item.count})` : ""}</option>)}
          </select>
        </label>
        <nav className="ops-workspace__navigation" aria-label={`${label} navigation`}>
          {navigation.map((item) => (
            <button key={item.key} className="ops-workspace__nav-button" type="button" onClick={() => onNavigate(item.key)} aria-current={activeKey === item.key ? "page" : undefined}>
              {item.icon ? <AppNavIcon kind={item.icon} /> : null}
              <span className="ops-workspace__nav-copy"><strong>{item.label}</strong>{item.description ? <small>{item.description}</small> : null}</span>
              {item.count !== undefined ? <span className="ops-workspace__count">{item.count}</span> : null}
            </button>
          ))}
        </nav>
        {sidebarFooter ? <div className="ops-workspace__rail-footer">{sidebarFooter}</div> : null}
      </aside>
      {groups ? <aside className="ops-workspace__groups" aria-label={`${label} groups`}>{groups}</aside> : null}
      <div className="ops-workspace__main">{children}</div>
    </div>
  );
}

/** Compact records on wide screens; one screen at a time on phones. */
export function OperationsRecordBrowser({ label, records = [], selectedId, onSelect, onBack, renderDetail, renderRow, toolbar = null, filters = null, emptyState = null, detailEmpty = null, backLabel = "Back to list", className = "", disabled = false }) {
  const id = useId();
  const detailRef = useRef(null);
  const rowRefs = useRef(new Map());
  const focusDetail = useRef(false);
  const selected = records.find((record) => record.id === selectedId);
  useEffect(() => {
    if (selected && focusDetail.current) {
      focusDetail.current = false;
      detailRef.current?.focus();
    }
  }, [selected]);
  const selectRecord = (record) => {
    focusDetail.current = true;
    onSelect(record.id);
    if (record.id === selectedId) {
      focusDetail.current = false;
      detailRef.current?.focus();
    }
  };
  const returnToList = () => {
    const previousId = selectedId;
    focusDetail.current = false;
    onBack ? onBack() : onSelect(null);
    requestAnimationFrame(() => rowRefs.current.get(previousId)?.focus());
  };
  return (
    <section className={`ops-record-browser ${selected ? "has-selection" : ""} ${className}`} aria-label={label}>
      {toolbar ? <div className="ops-record-browser__toolbar">{toolbar}</div> : null}
      <div className="ops-record-browser__panes">
        <div className="ops-record-browser__list-pane">
          <div className="ops-record-browser__list-heading"><h3 id={`${id}-list`}>{label}</h3><span>{records.length}</span></div>
          {filters ? <details className="ops-record-browser__filters"><summary>Filter records</summary><div>{filters}</div></details> : null}
          {records.length ? (
            <ul className="ops-record-browser__list" aria-labelledby={`${id}-list`}>
              {records.map((record) => (
                <li key={record.id}>
                  <button type="button" disabled={disabled} ref={(node) => { if (node) rowRefs.current.set(record.id, node); else rowRefs.current.delete(record.id); }} className="ops-record-browser__row" aria-pressed={selectedId === record.id} aria-controls={`${id}-detail`} onClick={() => selectRecord(record)}>
                    {renderRow ? renderRow(record) : <>
                      <span className="ops-record-browser__row-copy"><strong>{record.title}</strong>{record.subtitle ? <span>{record.subtitle}</span> : null}{record.meta ? <small>{record.meta}</small> : null}</span>
                      {record.status ? <StatusBadge tone={record.statusTone || "neutral"}>{record.status}</StatusBadge> : null}
                      <span className="ops-record-browser__chevron" aria-hidden="true">›</span>
                    </>}
                  </button>
                </li>
              ))}
            </ul>
          ) : emptyState || <p className="ops-record-browser__placeholder">No records match these filters.</p>}
        </div>
        <div id={`${id}-detail`} className="ops-record-browser__detail-pane">
          {selected ? <>
            <div className="ops-record-browser__detail-heading">
              <button type="button" disabled={disabled} className="ops-record-browser__back" onClick={returnToList}><span aria-hidden="true">←</span> {backLabel}</button>
            </div>
            <div ref={detailRef} tabIndex={-1} role="group" aria-label={`${selected.title} details`} className="ops-record-browser__selection-heading">{renderDetail(selected)}</div>
          </> : <div className="ops-record-browser__placeholder">{detailEmpty || <><AppNavIcon kind="collection" /><strong>Select a record</strong><span>Its details and actions will appear here.</span></>}</div>}
        </div>
      </div>
    </section>
  );
}
