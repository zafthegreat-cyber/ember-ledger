import { AppNavIcon } from "./AppNavIcon";

export function EtMockupPageShell({ accent = "hearth", className = "", ariaLabel = "", children }) {
  return (
    <div className={`et-mockup-page et-mockup-page-${accent} ${className}`.trim()} data-accent={accent} aria-label={ariaLabel || undefined}>
      {children}
    </div>
  );
}

export function EtMockupPill({ children, tone = "" }) {
  return <span className={`et-mockup-pill ${tone ? `et-mockup-pill-${tone}` : ""}`.trim()}>{children}</span>;
}

export function EtMockupButton({ children, onClick, variant = "primary", className = "", disabled = false }) {
  return (
    <button type="button" className={`et-mockup-button et-mockup-button-${variant} ${className}`.trim()} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function EtMockupSectionCard({ title, detail, action = null, className = "", children, ariaLabel = "", sectionRef = null, id = "" }) {
  return (
    <section id={id || undefined} ref={sectionRef} className={`et-mockup-section-card ${className}`.trim()} aria-label={ariaLabel || title}>
      <div className="et-mockup-section-heading">
        <div>
          <h2>{title}</h2>
          {detail ? <p>{detail}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EtMockupIcon({ icon = "hearth", tone = "" }) {
  return (
    <span className={`et-mockup-icon ${tone ? `et-mockup-icon-${tone}` : ""}`.trim()} aria-hidden="true">
      <AppNavIcon kind={icon} />
    </span>
  );
}

export function EtMockupStatCard({ label, value, detail, tone = "", onClick }) {
  const Component = onClick ? "button" : "article";
  const props = onClick ? { type: "button", onClick } : {};
  return (
    <Component className={`et-mockup-stat-card ${tone ? `et-mockup-tone-${tone}` : ""}`.trim()} {...props}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </Component>
  );
}

export function EtMockupActionCard({ title, detail, meta, icon = "hearth", tone = "", onClick, index = null, className = "", ariaLabel = "" }) {
  const Component = onClick ? "button" : "article";
  const props = onClick ? { type: "button", onClick, ...(ariaLabel ? { "aria-label": ariaLabel } : {}) } : {};
  return (
    <Component className={`et-mockup-action-card ${tone ? `et-mockup-tone-${tone}` : ""} ${className}`.trim()} {...props}>
      <EtMockupIcon icon={icon} tone={tone} />
      <span className="et-mockup-action-copy">
        {index ? <em>Step {index}</em> : null}
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {meta ? <b>{meta}</b> : <i aria-hidden="true">&gt;</i>}
    </Component>
  );
}

export function EtMockupRightRail({ title, detail, children, className = "" }) {
  return (
    <aside className={`et-mockup-right-rail ${className}`.trim()} aria-label={title}>
      <div className="et-mockup-rail-heading">
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      {children}
    </aside>
  );
}

export function EtMockupEmptyState({ title, detail, action = null }) {
  return (
    <div className="et-mockup-empty-state">
      <EtMockupIcon icon="spark" tone="gold" />
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {action}
    </div>
  );
}

export function FlowNextActionCard({ eyebrow = "Next action", title, detail, tone = "gold", actions = [] }) {
  return (
    <section className={`flow-next-action-card et-mockup-tone-${tone}`} aria-label={eyebrow}>
      <div>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
      {actions.length ? (
        <div className="flow-next-action-buttons">
          {actions.filter(Boolean).map((action) => (
            <EtMockupButton
              key={action.label}
              variant={action.variant || "secondary"}
              className={action.disabled ? "is-disabled" : ""}
              disabled={Boolean(action.disabled)}
              onClick={action.disabled ? undefined : action.onClick}
            >
              {action.label}
            </EtMockupButton>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function EtMockupHero({
  brand = "Ember & Tide",
  title,
  detail,
  mark,
  points,
  pills = [],
  todayAction = null,
  adminAction = null,
  ariaLabel = "",
}) {
  return (
    <section className="et-mockup-page-hero" aria-label={ariaLabel || `${brand} welcome`}>
      <div className="et-mockup-hero-copy">
        <span className="et-mockup-brand-row">
          {mark ? <img src={mark} alt="" /> : null}
          <b>{brand}</b>
        </span>
        <h1>{title}</h1>
        {detail ? <p>{detail}</p> : null}
        {todayAction ? (
          <button type="button" className="et-mockup-today-action" onClick={todayAction.onClick}>
            <span>{todayAction.label || "Today"}</span>
            <strong>{todayAction.title}</strong>
            {todayAction.cta ? <b>{todayAction.cta}</b> : null}
          </button>
        ) : null}
      </div>
      <div className="et-mockup-hero-status" aria-label={`${brand} status`}>
        {points ? (
          <span className="et-mockup-points-card">
            <strong>{points.value}</strong>
            <small>{points.label}</small>
          </span>
        ) : null}
        {pills.length ? (
          <span className="et-mockup-pill-row">
            {pills.map((pill) => <EtMockupPill tone={pill.tone} key={pill.label}>{pill.label}</EtMockupPill>)}
            {adminAction}
          </span>
        ) : adminAction}
      </div>
    </section>
  );
}
