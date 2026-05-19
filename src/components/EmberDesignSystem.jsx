const cx = (...parts) => parts.filter(Boolean).join(" ");

export function AppShell({ children, className = "", variant = "command" }) {
  return <div className={cx("et-app-shell", `et-app-shell--${variant}`, className)}>{children}</div>;
}

export function MobileBottomNav({ items = [], activeKey = "", onSelect, className = "" }) {
  return (
    <nav className={cx("et-mobile-bottom-nav", className)} aria-label="Primary mobile navigation">
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            type="button"
            key={item.key}
            className={cx("et-nav-item", item.center && "et-nav-item--center", active && "is-active")}
            aria-current={active ? "page" : undefined}
            onClick={() => item.onClick?.() || onSelect?.(item)}
          >
            {item.icon ? <span className="et-nav-icon" aria-hidden="true">{item.icon}</span> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function WebSidebar({ brand, items = [], activeKey = "", onSelect, footer, className = "" }) {
  return (
    <aside className={cx("et-web-sidebar", className)} aria-label="Ember and Tide navigation">
      {brand ? <div className="et-sidebar-brand">{brand}</div> : null}
      <nav className="et-sidebar-nav">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <button
              type="button"
              key={item.key}
              className={cx("et-sidebar-item", active && "is-active")}
              aria-current={active ? "page" : undefined}
              onClick={() => item.onClick?.() || onSelect?.(item)}
            >
              {item.icon ? <span className="et-sidebar-icon" aria-hidden="true">{item.icon}</span> : null}
              <span>
                <strong>{item.label}</strong>
                {item.helper ? <small>{item.helper}</small> : null}
              </span>
            </button>
          );
        })}
      </nav>
      {footer ? <div className="et-sidebar-footer">{footer}</div> : null}
    </aside>
  );
}

export function TopBar({ title, subtitle, actions, children, className = "" }) {
  return (
    <header className={cx("et-top-bar", className)}>
      <div className="et-top-bar-copy">
        {title ? <h1>{title}</h1> : null}
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children}
      {actions ? <div className="et-top-bar-actions">{actions}</div> : null}
    </header>
  );
}

export function PageHero({ title, subtitle, art, actions, children, tone = "default", className = "" }) {
  return (
    <section className={cx("et-page-hero", `et-page-hero--${tone}`, className)}>
      <div className="et-page-hero-copy">
        {title ? <h1>{title}</h1> : null}
        {subtitle ? <p>{subtitle}</p> : null}
        {actions ? <div className="et-page-hero-actions">{actions}</div> : null}
      </div>
      {art ? <div className="et-page-hero-art">{art}</div> : null}
      {children}
    </section>
  );
}

export function Card({ children, className = "", variant = "glass", as: Element = "section" }) {
  return <Element className={cx("et-card", `et-card--${variant}`, className)}>{children}</Element>;
}

export function Button({ children, className = "", variant = "primary", size = "md", ...props }) {
  return (
    <button type="button" className={cx("et-button", `et-button--${variant}`, `et-button--${size}`, className)} {...props}>
      {children}
    </button>
  );
}

export function IconButton({ label, icon, className = "", variant = "ghost", ...props }) {
  return (
    <button
      type="button"
      className={cx("et-icon-button", `et-icon-button--${variant}`, className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {icon}
    </button>
  );
}

export function Badge({ children, className = "", tone = "neutral" }) {
  return <span className={cx("et-badge", `et-badge--${tone}`, className)}>{children}</span>;
}

export function TrustBadge({ children, className = "", tone = "verified" }) {
  return <Badge className={cx("et-trust-badge", className)} tone={tone}>{children}</Badge>;
}

export function PriceBadge({ label, value, tone = "market", className = "" }) {
  return (
    <span className={cx("et-price-badge", `et-price-badge--${tone}`, className)}>
      {label ? <small>{label}</small> : null}
      <strong>{value}</strong>
    </span>
  );
}

export function EmptyState({ title, body, actions, icon, className = "" }) {
  return (
    <section className={cx("et-empty-state", className)}>
      {icon ? <div className="et-empty-state-icon" aria-hidden="true">{icon}</div> : null}
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {actions ? <div className="et-empty-state-actions">{actions}</div> : null}
    </section>
  );
}

export function ModalShell({ title, description, children, footer, onClose, className = "", size = "md" }) {
  return (
    <div className="et-modal-backdrop" role="presentation">
      <section className={cx("et-modal", `et-modal--${size}`, className)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="et-modal-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {onClose ? <IconButton label="Close" variant="ghost" onClick={onClose} icon="X" /> : null}
        </header>
        <div className="et-modal-body">{children}</div>
        {footer ? <footer className="et-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function BottomSheet({ title, children, footer, onClose, className = "" }) {
  return (
    <section className={cx("et-bottom-sheet", className)} role="dialog" aria-modal="true" aria-label={title}>
      <header className="et-bottom-sheet-header">
        <h2>{title}</h2>
        {onClose ? <IconButton label="Close" variant="ghost" onClick={onClose} icon="X" /> : null}
      </header>
      <div className="et-bottom-sheet-body">{children}</div>
      {footer ? <footer className="et-bottom-sheet-footer">{footer}</footer> : null}
    </section>
  );
}

export function Toast({ children, tone = "info", action, className = "" }) {
  return (
    <div className={cx("et-toast", `et-toast--${tone}`, className)} role={tone === "danger" ? "alert" : "status"}>
      <span>{children}</span>
      {action}
    </div>
  );
}

export function StepFlow({ steps = [], activeStep = 0, children, className = "" }) {
  return (
    <section className={cx("et-step-flow", className)}>
      <ol className="et-step-flow-steps">
        {steps.map((step, index) => (
          <li key={step.key || step.label} className={cx(index === activeStep && "is-active", index < activeStep && "is-complete", step.error && "has-error")}>
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            {step.error ? <small>{step.error}</small> : null}
          </li>
        ))}
      </ol>
      <div className="et-step-flow-body">{children}</div>
    </section>
  );
}

export function FormField({ label, error, help, children, className = "" }) {
  return (
    <label className={cx("et-form-field", error && "has-error", className)}>
      <span>{label}</span>
      {children}
      {help && !error ? <small>{help}</small> : null}
      {error ? <small className="et-field-error">{error}</small> : null}
    </label>
  );
}

export function DataTable({ columns = [], rows = [], rowKey = "id", className = "" }) {
  return (
    <div className={cx("et-table-wrap", className)}>
      <table className="et-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row[rowKey] || index}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoadingState({ label = "Loading Ember and Tide...", className = "" }) {
  return (
    <div className={cx("et-loading-state", className)} role="status">
      <span aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function OfflineSyncState({ title = "Offline mode", body = "Changes will sync when your connection returns.", className = "" }) {
  return (
    <section className={cx("et-sync-state", className)} role="status">
      <strong>{title}</strong>
      <p>{body}</p>
    </section>
  );
}

export function PermissionDeniedState({ title = "Access unavailable", body = "You do not have permission to view this area.", action, className = "" }) {
  return (
    <section className={cx("et-permission-state", className)} role="alert">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}
