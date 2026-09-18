import { AppNavIcon } from "./AppNavIcon";
import { BRAND_CONFIG } from "../../config/brand";

function normalizeAction(action) {
  if (!action) return null;
  if (typeof action === "string") return { label: action };
  return action;
}

function iconForPlanItem(item = {}) {
  if (item.icon) return item.icon;
  const key = String(item.key || item.label || item.title || "").toLowerCase();
  if (key.includes("add") || key.includes("scan")) return "plus";
  if (key.includes("proof") || key.includes("record") || key.includes("data")) return "data";
  if (key.includes("store") || key.includes("place") || key.includes("storage")) return "workspace";
  if (key.includes("trade") || key.includes("exchange") || key.includes("sell")) return "exchange";
  if (key.includes("price") || key.includes("market") || key.includes("compare")) return "market";
  if (key.includes("family") || key.includes("parent") || key.includes("nest")) return "community";
  if (key.includes("help") || key.includes("support") || key.includes("issue")) return "help";
  if (key.includes("alert") || key.includes("watch") || key.includes("beacon")) return "bell";
  if (key.includes("scout") || key.includes("report")) return "scout";
  return "plan";
}

const COMMAND_BOARD_NAV = [
  { key: "hearth", label: "Home", icon: "home", path: "/" },
  { key: "scout", label: "Find", icon: "scout", path: "/find/deals" },
  { key: "vault", label: "Collection", icon: "vault", path: "/collection" },
  { key: "exchange", label: "Business", icon: "market", path: "/business" },
  { key: "you", label: "Settings", icon: "account", path: "/settings" },
];

const COMMAND_BOARD_QA_PARAMS = ["betaLocalMode", "themeInspect", "qaUnlockPaid"];

function commandBoardHref(path) {
  if (typeof window === "undefined") return path;
  const currentParams = new URLSearchParams(window.location.search);
  const nextParams = new URLSearchParams();
  COMMAND_BOARD_QA_PARAMS.forEach((key) => {
    if (currentParams.has(key)) nextParams.set(key, currentParams.get(key));
  });
  const query = nextParams.toString();
  return query ? `${path}?${query}` : path;
}

function activeNavKeyForAccent(accent) {
  if (accent === "market" || accent === "forge" || accent === "harbor") return "exchange";
  if (accent === "profile" || accent === "settings" || accent === "account") return "you";
  return accent || "hearth";
}

export function CommandBoardV4({
  accent = "hearth",
  className = "",
  ariaLabel = "",
  label = "",
  title,
  description,
  primaryAction = null,
  secondaryActions = [],
  utilityActions = [],
  statusItems = [],
  plan = null,
  routes = [],
  children,
}) {
  const primary = normalizeAction(primaryAction);
  const secondary = secondaryActions.map(normalizeAction).filter(Boolean);
  const utility = utilityActions.map(normalizeAction).filter(Boolean);
  const visibleUtility = utility.filter((action) => !/^(you|profile)$/i.test(String(action.label || "").trim()));
  // The board chrome is intentionally stable across routes: primary command,
  // Compass, Beacon, then Profile. Page-specific secondary commands belong in
  // the plan or body so they cannot reshape the shared hero.
  const contextualActions = (visibleUtility.length ? visibleUtility : secondary).slice(0, 2);
  const hasProfileAction = contextualActions.some((action) => /^(you|profile)$/i.test(String(action.label || "").trim()));
  const activeNavKey = activeNavKeyForAccent(accent);
  const hearthHref = commandBoardHref("/");

  return (
    <section
      className={`command-board-v4 command-board-v4-${accent} ${className}`.trim()}
      aria-label={ariaLabel || title}
      data-command-accent={accent}
    >
      <div className="command-board-v4-frame">
        <aside className="command-board-v4-rail" aria-label="Primary command navigation">
          <a className="command-board-v4-brand" href={hearthHref} aria-label={`Open ${BRAND_CONFIG.applicationDisplayName} Home`}>
            <img src={BRAND_CONFIG.logoReference} alt="" />
            <strong>{BRAND_CONFIG.applicationDisplayName}<small>{label || "WORKSPACE"}</small></strong>
          </a>
          <nav aria-label="Main tabs">
            {COMMAND_BOARD_NAV.map((item) => (
              <a
                key={item.key}
                className={item.key === activeNavKey ? "active" : ""}
                href={commandBoardHref(item.path)}
                aria-current={item.key === activeNavKey ? "page" : undefined}
              >
                <AppNavIcon kind={item.icon} />
                <b>{item.label}</b>
              </a>
            ))}
          </nav>
          <span className="command-board-v4-guard">
            <AppNavIcon kind="spark" />
            <span>
              <b>Family guard</b>
              <small>Safety, privacy, and location rules stay visible.</small>
            </span>
          </span>
        </aside>

        <div className="command-board-v4-stage">
          <div className="command-board-v4-mobile-bar">
            <a className="command-board-v4-mobile-brand" href={hearthHref} aria-label={`Open ${BRAND_CONFIG.applicationDisplayName} Home`}>
              <img src={BRAND_CONFIG.logoReference} alt="" />
              <strong>{BRAND_CONFIG.applicationDisplayName}<small>{label || "WORKSPACE"}</small></strong>
            </a>
            <nav className="command-board-v4-mobile-tools" aria-label={`${title} quick tools`}>
              {primary ? (
                <button
                  type="button"
                  className="command-board-v4-mobile-tool command-board-v4-mobile-primary"
                  aria-label={primary.ariaLabel || primary.label}
                  onClick={primary.onClick}
                  disabled={primary.disabled}
                >
                  <AppNavIcon kind={primary.icon || "plus"} />
                </button>
              ) : null}
              {contextualActions.slice(0, 2).map((action) => (
                <button
                  type="button"
                  className="command-board-v4-mobile-tool"
                  key={action.label}
                  aria-label={action.ariaLabel || action.label}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  <AppNavIcon kind={action.icon || "search"} />
                </button>
              ))}
              <a className="command-board-v4-mobile-tool" href={commandBoardHref("/settings")} aria-label="Open profile and settings">
                <AppNavIcon kind="account" />
              </a>
            </nav>
          </div>

          <header className="command-board-v4-hero">
            <div className="command-board-v4-hero-main">
              <div className="command-board-v4-hero-copy">
                {label ? <span>{label}</span> : null}
                <h1>{title}</h1>
                {description ? <p>{description}</p> : null}
              </div>
              {(primary || secondary.length || utility.length) ? (
                <div className="command-board-v4-actions" aria-label={`${title} actions`}>
                  {primary ? (
                    <button type="button" className="command-board-v4-primary-action" onClick={primary.onClick} disabled={primary.disabled}>
                      {primary.icon ? <AppNavIcon kind={primary.icon} /> : null}
                      <b>{primary.label}</b>
                    </button>
                  ) : null}
                  {contextualActions.length ? (
                    <span className="command-board-v4-utility-actions">
                      {contextualActions.map((action) => (
                        <button type="button" className="command-board-v4-utility-action" key={action.label} onClick={action.onClick} disabled={action.disabled} aria-label={action.ariaLabel || undefined}>
                          {action.icon ? <AppNavIcon kind={action.icon} /> : null}
                          <b>{action.label}</b>
                        </button>
                      ))}
                    </span>
                  ) : null}
                  {!hasProfileAction ? (
                    <a className="command-board-v4-profile-action" href={commandBoardHref("/settings")} aria-label="Open profile and settings">
                      <AppNavIcon kind="account" />
                      <b>Profile</b>
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            {statusItems.length ? <CommandBoardStatusStrip items={statusItems} /> : null}
            {plan ? <CommandBoardPlan {...plan} /> : null}
            {routes.length ? <CommandBoardRouteStrip routes={routes} /> : null}
          </header>

          {children ? <div className="command-board-v4-body">{children}</div> : null}
        </div>

        <nav className="command-board-v4-mobile-dock" aria-label="Main tabs">
          {COMMAND_BOARD_NAV.map((item) => (
            <a
              key={item.key}
              className={item.key === activeNavKey ? "active" : ""}
              href={commandBoardHref(item.path)}
              aria-current={item.key === activeNavKey ? "page" : undefined}
            >
              <AppNavIcon kind={item.icon} />
              <b>{item.label}</b>
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}

export function CommandBoardStatusStrip({ items = [] }) {
  return (
    <div className="command-board-v4-status-strip" aria-label="Status summary">
      {items.map((item, index) => {
        const Component = item.action || item.onClick ? "button" : "article";
        const props = Component === "button" ? { type: "button", onClick: item.action || item.onClick } : {};
        return (
          <Component
            key={item.key || item.label}
            aria-label={item.ariaLabel || undefined}
            data-command-key={item.key || item.label || `status-${index}`}
            data-command-index={index + 1}
            data-command-tone={item.tone || item.key || "status"}
            {...props}
          >
            {item.icon ? <AppNavIcon kind={item.icon} /> : null}
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            {item.detail ? <small>{item.detail}</small> : null}
          </Component>
        );
      })}
    </div>
  );
}

export function CommandBoardSection({
  className = "",
  kicker = "",
  title,
  detail,
  action = null,
  children,
  ariaLabel,
}) {
  return (
    <section className={`command-board-section ${className}`.trim()} aria-label={ariaLabel || title}>
      {(kicker || title || detail || action) ? (
        <div className="command-board-section-heading">
          <div>
            {kicker ? <span>{kicker}</span> : null}
            {title ? <h2>{title}</h2> : null}
            {detail ? <p>{detail}</p> : null}
          </div>
          {action ? <div className="command-board-section-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function CommandMetricGrid({ items = [], className = "", ariaLabel = "Metrics" }) {
  return (
    <div className={`command-metric-grid ${className}`.trim()} aria-label={ariaLabel}>
      {items.map((item) => (
        <article className="command-metric-card" key={item.key || item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail || item.helper ? <small>{item.detail || item.helper}</small> : null}
        </article>
      ))}
    </div>
  );
}

export function CommandBoardPlan({ label = "Plan", title, items = [], actions = [] }) {
  return (
    <section className="command-board-v4-plan-card" aria-label={title || label}>
      <div className="command-board-v4-plan-heading">
        <span>{label}</span>
        {title ? <strong>{title}</strong> : null}
      </div>
      {items.length ? (
        <div className="command-board-v4-plan-grid">
          {items.map((item, index) => (
            <button
              type="button"
              key={item.key || item.label || item.title}
              aria-label={item.ariaLabel || undefined}
              data-command-key={item.key || item.label || item.title || `plan-${index}`}
              data-command-index={index + 1}
              data-command-tone={item.tone || item.key || "plan"}
              onClick={item.action || item.onClick}
              disabled={item.disabled}
            >
              <i aria-hidden="true"><AppNavIcon kind={iconForPlanItem(item)} /></i>
              <span>{item.label || item.title}</span>
              {item.detail ? <small>{item.detail}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
      {actions.length ? (
        <div className="command-board-v4-plan-actions">
          {actions.map((action, index) => (
            <button
              type="button"
              key={action.label}
              className={index === 0 ? "command-board-v4-primary-action" : "command-board-v4-secondary-action"}
              onClick={action.onClick || action.action}
              disabled={action.disabled}
            >
              {action.icon ? <AppNavIcon kind={action.icon} /> : null}
              <b>{action.label}</b>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CommandBoardRouteStrip({ routes = [] }) {
  return (
    <nav className="command-board-v4-route-strip" aria-label="Routes and connections">
      {routes.map((route, index) => (
        <button
          type="button"
          key={route.key || route.label || route.title}
          className={route.active ? "is-active" : ""}
          aria-label={route.ariaLabel || undefined}
          aria-current={route.active ? "page" : undefined}
          data-command-key={route.key || route.label || route.title || `route-${index}`}
          data-command-index={index + 1}
          data-command-tone={route.tone || route.key || "route"}
          onClick={route.action || route.onClick}
          disabled={route.disabled}
        >
          {route.icon ? <AppNavIcon kind={route.icon} /> : null}
          <span>{route.label}</span>
          <strong>{route.title}</strong>
          {route.detail ? <small>{route.detail}</small> : null}
        </button>
      ))}
    </nav>
  );
}
