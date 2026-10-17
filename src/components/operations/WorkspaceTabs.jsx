import { useRef, useState } from "react";

export default function WorkspaceTabs({ id, label, tabs, active, onChange }) {
  const buttons = useRef(new Map());
  const fallback = tabs.find((tab) => tab.key === active)?.key ?? tabs[0]?.key;
  const [focus, setFocus] = useState({ active, key: fallback });
  const focusKey = focus.active === active && tabs.some((tab) => tab.key === focus.key) ? focus.key : fallback;

  function moveFocus(event, index) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    // Navigation changes browser history, so only Enter, Space or a click activates.
    buttons.current.get(tabs[next].key)?.focus();
  }

  return <div className="everyday-tabs" role="tablist" aria-label={label} aria-orientation="horizontal"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocus({ active, key: fallback });
    }}>
    {tabs.map((tab, index) => <button
      key={tab.key}
      ref={(node) => { if (node) buttons.current.set(tab.key, node); else buttons.current.delete(tab.key); }}
      id={`${id}-tab-${tab.key}`}
      type="button"
      role="tab"
      data-workspace-tab="true"
      aria-selected={active === tab.key}
      aria-controls={`${id}-panel-${tab.key}`}
      tabIndex={focusKey === tab.key ? 0 : -1}
      className={active === tab.key ? "is-active" : ""}
      onFocus={() => setFocus({ active, key: tab.key })}
      onKeyDown={(event) => moveFocus(event, index)}
      onClick={() => { if (active !== tab.key) onChange(tab.key); }}
    >{tab.label}</button>)}
  </div>;
}

export function WorkspaceTabPanel({ id, value, active, children }) {
  const selected = value === active;
  return <div
    id={`${id}-panel-${value}`}
    className="everyday-tab-panel"
    role="tabpanel"
    aria-labelledby={`${id}-tab-${value}`}
    hidden={!selected}
    tabIndex={selected ? 0 : -1}
  >{selected ? children : null}</div>;
}
