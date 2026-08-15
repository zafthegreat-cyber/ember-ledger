import { useEffect, useId, useRef } from "react";
import { BRAND_CONFIG } from "../../config/brand.js";
import { AppNavIcon } from "../command-system/AppNavIcon.jsx";
import "./operations-ui.css";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function AppShell({ children, className = "", ...props }) {
  const shellRef = useRef(null);


  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !shellRef.current) return undefined;
    const updateViewport = () => {
      const keyboardOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      shellRef.current?.style.setProperty("--ops-visual-viewport-height", `${viewport.height}px`);
      shellRef.current?.style.setProperty("--ops-keyboard-offset", `${keyboardOffset}px`);
      shellRef.current?.setAttribute("data-keyboard-open", keyboardOffset > 120 ? "true" : "false");
    };
    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
      shellRef.current?.removeAttribute("data-keyboard-open");
    };
  }, []);

  return <div ref={shellRef} className={cx("ops-app-shell", className)} {...props}>{children}</div>;
}

export function MobileBottomNavigation({ items = [], activeKey = "", onSelect }) {
  return (
    <nav className="ops-mobile-nav" aria-label="Primary navigation" style={{ "--ops-mobile-nav-count": items.length }}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={cx(item.key === activeKey && !item.isAction ? "is-active" : "", item.isAction ? "is-global-action" : "")}
          aria-current={item.key === activeKey && !item.isAction ? "page" : undefined}
          aria-label={item.ariaLabel || item.label}
          onClick={() => onSelect?.(item)}
        >
          <span className={item.isAction ? "ops-mobile-nav__action-icon" : ""}><AppNavIcon kind={item.icon || item.key} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function DesktopSidebar({ items = [], secondaryItems = [], activeKey = "", onSelect, footer = null }) {
  return (
    <aside className="ops-desktop-sidebar" aria-label="Primary navigation">
      <button type="button" className="ops-brand" onClick={() => onSelect?.(items[0])} aria-label={`Open ${BRAND_CONFIG.applicationDisplayName} home`}>
        <span className="ops-brand-mark" aria-hidden="true">{BRAND_CONFIG.monogram}</span>
        <span><strong>{BRAND_CONFIG.applicationDisplayName}</strong><small>{BRAND_CONFIG.businessDisplayName}</small></span>
      </button>
      <nav>
        {items.map((item) => item.children?.length ? (
          <details key={item.key} open={item.key === activeKey || item.children.some((child) => child.key === activeKey)}>
            <summary><AppNavIcon kind={item.icon || item.key} /><span>{item.label}</span></summary>
            <div className="ops-desktop-subnav">
              {item.children.map((child) => (
                <button key={child.key} type="button" className={child.key === activeKey ? "is-active" : ""} aria-current={child.key === activeKey ? "page" : undefined} onClick={() => onSelect?.(child)}>
                  <span>{child.label}</span>
                </button>
              ))}
            </div>
          </details>
        ) : (
          <button key={item.key} type="button" className={item.key === activeKey ? "is-active" : ""} aria-current={item.key === activeKey ? "page" : undefined} onClick={() => onSelect?.(item)}>
            <AppNavIcon kind={item.icon || item.key} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {secondaryItems.length ? (
        <nav className="ops-desktop-secondary-nav" aria-label="Owner and application settings">
          {secondaryItems.map((item) => (
            <button key={item.key} type="button" className={item.key === activeKey ? "is-active" : ""} aria-current={item.key === activeKey ? "page" : undefined} onClick={() => onSelect?.(item)}>
              <AppNavIcon kind={item.icon || item.key} />
              <span>{item.label}</span>
              {item.badge ? <small>{item.badge}</small> : null}
            </button>
          ))}
        </nav>
      ) : null}
      {footer ? <div className="ops-sidebar-footer">{footer}</div> : null}
    </aside>
  );
}

export function PageHeader({ eyebrow = "", title, description = "", actions = null, children = null }) {
  return (
    <header className="ops-page-header">
      <div>{eyebrow ? <span className="ops-eyebrow">{eyebrow}</span> : null}<h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="ops-page-actions">{actions}</div> : null}
      {children}
    </header>
  );
}

export function SectionHeader({ eyebrow = "", title, description = "", actions = null }) {
  return (
    <div className="ops-section-header">
      <div>{eyebrow ? <span className="ops-eyebrow">{eyebrow}</span> : null}<h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="ops-section-actions">{actions}</div> : null}
    </div>
  );
}

function Button({ variant, className = "", children, ...props }) {
  return <button type="button" className={cx("ops-button", `ops-button--${variant}`, className)} {...props}>{children}</button>;
}

export function PrimaryButton(props) { return <Button variant="primary" {...props} />; }
export function SecondaryButton(props) { return <Button variant="secondary" {...props} />; }
export function QuietButton(props) { return <Button variant="quiet" {...props} />; }

export function IconButton({ label, icon = "plus", ...props }) {
  return <Button variant="icon" aria-label={label} title={label} {...props}><AppNavIcon kind={icon} /><span className="sr-only">{label}</span></Button>;
}

export function StatusBadge({ children, tone = "neutral", icon = "" }) {
  return <span className={cx("ops-badge", `ops-badge--${tone}`)}>{icon ? <AppNavIcon kind={icon} /> : null}<span>{children}</span></span>;
}

export function SourceBadge({ children }) { return <StatusBadge tone="info" icon="data">{children}</StatusBadge>; }

export function ConfidenceIndicator({ value = "Not set" }) {
  const normalized = String(value || "Not set");
  const tone = /high/i.test(normalized) ? "success" : /low/i.test(normalized) ? "warning" : "info";
  return <StatusBadge tone={tone}>Confidence: {normalized}</StatusBadge>;
}

export function RiskIndicator({ value = "Not set" }) {
  const normalized = String(value || "Not set");
  const tone = /high|critical/i.test(normalized) ? "danger" : /medium/i.test(normalized) ? "warning" : /low/i.test(normalized) ? "success" : "neutral";
  return <StatusBadge tone={tone}>Risk: {normalized}</StatusBadge>;
}

function LabeledInput({ label, helper = "", error = "", prefix = "", suffix = "", inputProps = {} }) {
  const id = useId();
  const helperId = `${id}-help`;
  const errorId = `${id}-error`;
  return (
    <label className={cx("ops-field", error && "has-error")} htmlFor={id}>
      <span>{label}</span>
      <span className="ops-input-wrap">{prefix ? <i aria-hidden="true">{prefix}</i> : null}<input id={id} aria-describedby={[helper ? helperId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined} aria-invalid={error ? "true" : undefined} {...inputProps} />{suffix ? <i aria-hidden="true">{suffix}</i> : null}</span>
      {helper ? <small id={helperId}>{helper}</small> : null}
      {error ? <small id={errorId} role="alert">{error}</small> : null}
    </label>
  );
}

export function CurrencyInput({ label, helper, error, value, onChange, ...props }) {
  return <LabeledInput label={label} helper={helper} error={error} prefix="$" inputProps={{ type: "number", inputMode: "decimal", min: 0, step: "0.01", value: value ?? "", onChange: (event) => onChange?.(event.target.value), ...props }} />;
}

export function PercentageInput({ label, helper, error, value, onChange, ...props }) {
  return <LabeledInput label={label} helper={helper} error={error} suffix="%" inputProps={{ type: "number", inputMode: "decimal", min: 0, step: "0.1", value: value ?? "", onChange: (event) => onChange?.(event.target.value), ...props }} />;
}

export function SearchField({ label = "Search", value, onChange, ...props }) {
  return <LabeledInput label={label} inputProps={{ type: "search", value: value ?? "", onChange: (event) => onChange?.(event.target.value), ...props }} />;
}

export function FilterButton({ active = false, children = "Filters", ...props }) { return <SecondaryButton className={active ? "is-active" : ""} aria-pressed={active} {...props}><AppNavIcon kind="filter" />{children}</SecondaryButton>; }

export function SortControl({ label = "Sort", value, onChange, options = [] }) {
  const id = useId();
  return <label className="ops-sort" htmlFor={id}><span>{label}</span><select id={id} value={value} onChange={(event) => onChange?.(event.target.value)}>{options.map((option) => { const item = typeof option === "string" ? { value: option, label: option } : option; return <option key={item.value} value={item.value}>{item.label}</option>; })}</select></label>;
}

export function RecordCard({ children, className = "", ...props }) { return <article className={cx("ops-card", "ops-record-card", className)} {...props}>{children}</article>; }
export function ProductCard({ children, image = "", imageAlt = "", className = "", ...props }) { return <article className={cx("ops-card", "ops-product-card", className)} {...props}>{image ? <img src={image} alt={imageAlt} /> : <div className="ops-product-placeholder" aria-hidden="true"><AppNavIcon kind="inventory" /></div>}{children}</article>; }
export function DealCard({ className = "", ...props }) { return <ProductCard className={cx("ops-deal-card", className)} {...props} />; }

export function MetricCard({ label, value, helper = "", tone = "neutral" }) {
  return <article className={cx("ops-metric-card", `is-${tone}`)}><span>{label}</span><strong>{value}</strong>{helper ? <small>{helper}</small> : null}</article>;
}

function StatePanel({ kind, title, children, action = null }) {
  return <div className={cx("ops-state", `ops-state--${kind}`)} role={kind === "error" ? "alert" : "status"}><span aria-hidden="true"><AppNavIcon kind={kind === "error" ? "warning" : kind === "offline" ? "data" : "inventory"} /></span><div><h3>{title}</h3>{children ? <p>{children}</p> : null}{action}</div></div>;
}

export function EmptyState({ title, children, action }) { return <StatePanel kind="empty" title={title} action={action}>{children}</StatePanel>; }
export function LoadingState({ title = "Loading…", children = "Please wait." }) { return <StatePanel kind="loading" title={title}>{children}</StatePanel>; }
export function ErrorState({ title = "Something went wrong", children, action }) { return <StatePanel kind="error" title={title} action={action}>{children}</StatePanel>; }
export function OfflineState({ action }) { return <StatePanel kind="offline" title="You’re offline" action={action}>Local records remain available. Connected data may be out of date.</StatePanel>; }

export function ProviderStatus({ name, status, detail, checkedAt = "" }) {
  const tone = /available|connected|healthy/i.test(status) ? "success" : /required|error|rate/i.test(status) ? "danger" : "warning";
  return <RecordCard className="ops-provider-status"><div><SourceBadge>{name}</SourceBadge><h3>{status}</h3><p>{detail}</p>{checkedAt ? <small>Last checked {checkedAt}</small> : null}</div><StatusBadge tone={tone}>{status}</StatusBadge></RecordCard>;
}

const MODAL_FOCUS_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

function useModalFocus(open, onClose) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector(MODAL_FOCUS_SELECTOR);
      (first || dialogRef.current)?.focus?.({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll(MODAL_FOCUS_SELECTOR)].filter((node) => node.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { dialogRef, onKeyDown };
}

export function BottomSheet({ open, title, children, onClose }) {
  const { dialogRef, onKeyDown } = useModalFocus(open, onClose);
  if (!open) return null;
  return <div className="ops-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section ref={dialogRef} className="ops-bottom-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onKeyDown}><header><h2>{title}</h2><IconButton label="Close" icon="close" onClick={onClose} /></header>{children}</section></div>;
}

export function Dialog({ open, title, description = "", children, actions = null, onClose }) {
  const { dialogRef, onKeyDown } = useModalFocus(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return <div className="ops-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section ref={dialogRef} className="ops-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}><header><div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div><IconButton label="Close" icon="close" onClick={onClose} /></header>{children}{actions ? <footer>{actions}</footer> : null}</section></div>;
}

export function Toast({ children, tone = "info" }) { return <div className={cx("ops-toast", `ops-toast--${tone}`)} role="status" aria-live="polite">{children}</div>; }

export function MobileRecordList({ children, label = "Records" }) { return <div className="ops-mobile-record-list" aria-label={label}>{children}</div>; }

export function DesktopDataTable({ columns = [], rows = [], rowKey = "id", caption = "Records" }) {
  return <div className="ops-table-wrap"><table><caption className="sr-only">{caption}</caption><thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row[rowKey]}>{columns.map((column) => <td key={column.key} data-label={column.label}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody></table></div>;
}

export function StickyDecisionBar({ recommendation, maximumOffer, action = null }) {
  return <aside className="ops-sticky-decision" aria-label="Decision summary"><div><span>Recommendation</span><strong>{recommendation || "Not enough information"}</strong></div><div><span>Maximum offer</span><strong>{maximumOffer || "Not available"}</strong></div>{action}</aside>;
}
