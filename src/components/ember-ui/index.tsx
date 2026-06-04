import type { ReactNode } from "react";
import type { Accent, ActionItem, EmberRole, Stat } from "../../types/emberTide";

export function Icon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    focusable: "false",
  };

  const icons: Record<string, ReactNode> = {
    hearth: (
      <svg {...common}><path d="M5 11.5 12 5l7 6.5v7.5a1 1 0 0 1-1 1h-4.1v-5.2h-3.8V20H6a1 1 0 0 1-1-1v-7.5Z" /><path d="M9 12.5c.8-1.9 2.4-2.7 3-4.4 1.8 1.4 3 2.9 3 4.8a3 3 0 0 1-6 0v-.4Z" /></svg>
    ),
    scout: (
      <svg {...common}><circle cx="12" cy="12" r="8" /><path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4 5.4-2.2Z" /></svg>
    ),
    vault: (
      <svg {...common}><path d="M5 6.5 12 4l7 2.5v5.1c0 4.2-2.6 6.5-7 8.4-4.4-1.9-7-4.2-7-8.4V6.5Z" /><path d="M9 11h6v5H9z" /></svg>
    ),
    forge: (
      <svg {...common}><path d="m7 17 10-10" /><path d="m8 7 9 9" /><path d="M5 19h14" /></svg>
    ),
    market: (
      <svg {...common}><path d="M6 8h12l-1.2 9.5H7.2L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>
    ),
    tidepool: (
      <svg {...common}><path d="M4 15c2 2 4 2 6 0s4-2 6 0 4 2 6 0" /><path d="M4 9c2 2 4 2 6 0s4-2 6 0 4 2 6 0" /></svg>
    ),
    more: (
      <svg {...common}><circle cx="6" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18" cy="12" r="2" /></svg>
    ),
    assist: (
      <svg {...common}><path d="M12 3.8 14.1 9l5.3 2.1-5.3 2.1L12 18.4l-2.1-5.2-5.3-2.1L9.9 9 12 3.8Z" /></svg>
    ),
    spark: (
      <svg {...common}><path d="M12 3.8 14.1 9l5.3 2.1-5.3 2.1L12 18.4l-2.1-5.2-5.3-2.1L9.9 9 12 3.8Z" /><circle cx="12" cy="12" r="2.2" /></svg>
    ),
    scan: (
      <svg {...common}><path d="M5 8V5h3" /><path d="M16 5h3v3" /><path d="M19 16v3h-3" /><path d="M8 19H5v-3" /><path d="M7 12h10" /><path d="M9 9v6" /><path d="M13 9v6" /></svg>
    ),
    calendar: (
      <svg {...common}><path d="M6 5h12a1 1 0 0 1 1 1v13H5V6a1 1 0 0 1 1-1Z" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M5 10h14" /></svg>
    ),
    plus: (
      <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>
    ),
    location: (
      <svg {...common}><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></svg>
    ),
    map: (
      <svg {...common}><path d="m5 6 5-2 5 2 4-2v14l-4 2-5-2-5 2-4-2V8l4-2Z" /><path d="M10 4v14" /><path d="M15 6v14" /></svg>
    ),
    roles: (
      <svg {...common}><circle cx="8" cy="8" r="3" /><circle cx="16" cy="9" r="2.5" /><path d="M3.5 20a5 5 0 0 1 9 0" /><path d="M13.5 20a4.5 4.5 0 0 1 7 0" /></svg>
    ),
    parent: (
      <svg {...common}><path d="M5 20v-6a4 4 0 0 1 8 0v6" /><path d="M13 20v-4a3 3 0 0 1 6 0v4" /><circle cx="9" cy="6" r="3" /><circle cx="16" cy="8" r="2" /></svg>
    ),
    shop: (
      <svg {...common}><path d="M4 10h16l-1.2-5H5.2L4 10Z" /><path d="M6 10v10h12V10" /><path d="M9 20v-6h6v6" /></svg>
    ),
    admin: (
      <svg {...common}><path d="M5 6.5 12 4l7 2.5v5.4c0 4-2.8 6.3-7 8.1-4.2-1.8-7-4.1-7-8.1V6.5Z" /><path d="M9 12h6" /><path d="M12 9v6" /></svg>
    ),
    account: (
      <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>
    ),
    settings: (
      <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="m5.6 5.6 2.1 2.1" /><path d="m16.3 16.3 2.1 2.1" /><path d="m18.4 5.6-2.1 2.1" /><path d="m7.7 16.3-2.1 2.1" /></svg>
    ),
    lock: (
      <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
    ),
    bell: (
      <svg {...common}><path d="M6 18h12" /><path d="M8 18v-6a4 4 0 1 1 8 0v6" /><path d="M10 21h4" /></svg>
    ),
    store: (
      <svg {...common}><path d="M4 10h16" /><path d="M6 10v10h12V10" /><path d="m5 4 14 0 1 6H4l1-6Z" /></svg>
    ),
    verified: (
      <svg {...common}><path d="M12 3 14.4 7.6 19.5 8.5 15.9 12.2 16.6 17.3 12 15 7.4 17.3 8.1 12.2 4.5 8.5 9.6 7.6 12 3Z" /><path d="m9.4 12 1.6 1.6 3.6-4" /></svg>
    ),
    report: (
      <svg {...common}><path d="M7 3h7l4 4v17H7z" /><path d="M14 3v5h5" /><path d="M10 13h5" /><path d="M10 17h6" /></svg>
    ),
    card: (
      <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>
    ),
    box: (
      <svg {...common}><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="M4 8v8l8 4 8-4V8" /><path d="M12 12v8" /></svg>
    ),
    trade: (
      <svg {...common}><path d="M7 7h11l-3-3" /><path d="M17 17H6l3 3" /><path d="M18 7l-3 3" /><path d="M6 17l3-3" /></svg>
    ),
    gift: (
      <svg {...common}><path d="M4 11h16v9H4z" /><path d="M3 7h18v4H3z" /><path d="M12 7v13" /><path d="M12 7C10 3 6 4 7 7" /><path d="M12 7c2-4 6-3 5 0" /></svg>
    ),
    heart: (
      <svg {...common}><path d="M20.8 8.6c0 5.1-8.8 9.9-8.8 9.9S3.2 13.7 3.2 8.6A4.4 4.4 0 0 1 12 6a4.4 4.4 0 0 1 8.8 2.6Z" /></svg>
    ),
    loading: (
      <svg {...common}><path d="M12 3a9 9 0 1 1-9 9" /><path d="M12 3v5" /></svg>
    ),
    error: (
      <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
    ),
    chevron: (
      <svg {...common}><path d="m9 6 6 6-6 6" /></svg>
    ),
    shield: (
      <svg {...common}><path d="M5 6.5 12 4l7 2.5v5.4c0 4-2.8 6.3-7 8.1-4.2-1.8-7-4.1-7-8.1V6.5Z" /></svg>
    ),
  };

  return icons[name] || icons.shield;
}

export function AppScreen({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="ets-phone" role="region" aria-label={`${label} mobile screen`}>
      <span className="ets-phone-notch" aria-hidden="true" />
      {children}
    </div>
  );
}

export function AppHeader({ title, detail, accent }: { title: string; detail?: string; accent: Accent }) {
  return (
    <header className="ets-phone-header">
      <div>
        <h3>{title}</h3>
        {detail ? <p>{detail}</p> : null}
      </div>
      <button className="ets-icon-button" type="button" aria-label="Open Ember Assist">
        <Icon name={accent === "assist" ? "more" : "assist"} />
      </button>
    </header>
  );
}

export function PageHero({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail: string }) {
  return (
    <section className="ets-page-hero">
      <OriginalMascot />
      {eyebrow ? <p>{eyebrow}</p> : null}
      <h2>{title}</h2>
      <small>{detail}</small>
    </section>
  );
}

export function MagicCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`ets-magic-card ${className}`}>{children}</section>;
}

export function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <div className="ets-section-heading">
      <h4>{title}</h4>
      {action ? <button type="button">{action}</button> : null}
    </div>
  );
}

export function StatCard({ stat }: { stat: Stat }) {
  return (
    <div className="ets-stat-card">
      <strong>{stat.value}</strong>
      <span>{stat.label}</span>
      {stat.detail ? <small>{stat.detail}</small> : null}
    </div>
  );
}

export function StatPill({ label }: { label: string }) {
  return <span className="ets-stat-pill">{label}</span>;
}

export function ActionTile({ item }: { item: ActionItem }) {
  return (
    <button className={`ets-action-tile ets-item-${item.accent || "more"}`} type="button">
      <span className="ets-journey-icon"><Icon name={item.icon || item.accent || "shield"} /></span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.detail}</small>
      </span>
      {item.meta ? <b>{item.meta}</b> : item.status ? <em>{item.status}</em> : <i aria-hidden="true"><Icon name="chevron" /></i>}
    </button>
  );
}

export function PrimaryButton({ children }: { children: ReactNode }) {
  return <button className="ets-primary-button" type="button">{children}</button>;
}

export function SecondaryButton({ children }: { children: ReactNode }) {
  return <button className="ets-secondary-button" type="button">{children}</button>;
}

export function IconButton({ label, icon }: { label: string; icon: string }) {
  return <button className="ets-icon-button" type="button" aria-label={label}><Icon name={icon} /></button>;
}

export function SearchBar({ placeholder }: { placeholder: string }) {
  return (
    <label className="ets-search-field">
      <span className="sr-only">Search</span>
      <input type="search" placeholder={placeholder} />
    </label>
  );
}

export function SegmentedTabs({ tabs }: { tabs: string[] }) {
  return (
    <div className="ets-chip-row" role="tablist" aria-label="Screen filters">
      {tabs.map((tab, index) => (
        <button className={index === 0 ? "active" : ""} type="button" role="tab" aria-selected={index === 0} key={tab}>{tab}</button>
      ))}
    </div>
  );
}

export function PageTabs({ tabs, active }: { tabs: string[]; active?: string }) {
  return (
    <div className="ets-chip-row" role="tablist" aria-label="Page sections">
      {tabs.map((tab, index) => {
        const selected = active ? tab === active : index === 0;
        return (
          <button className={selected ? "active" : ""} type="button" role="tab" aria-selected={selected} key={tab}>{tab}</button>
        );
      })}
    </div>
  );
}

export function TrustBadge({ label }: { label: string }) {
  return <span className="ets-trust-badge"><Icon name="shield" />{label}</span>;
}

export function ConfidenceRing({ value }: { value: string }) {
  return <span className="ets-confidence-ring">{value}</span>;
}

export function RestockReportCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function ProductCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function CollectionItemCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function DeckCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function TradeBalanceCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function PriceTrendCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function EventCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function DonationCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function CommunityPostCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function AssistantActionCard({ item }: { item: ActionItem }) {
  return <ActionTile item={item} />;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <MagicCard className="ets-empty-state">
      <h4>{title}</h4>
      <p>{detail}</p>
    </MagicCard>
  );
}

export function LoadingState({ title = "Loading", detail = "Checking the latest safe preview data." }: { title?: string; detail?: string }) {
  return (
    <MagicCard className="ets-ui-state ets-ui-state-loading">
      <span className="ets-state-icon"><Icon name="loading" /></span>
      <h4>{title}</h4>
      <p>{detail}</p>
    </MagicCard>
  );
}

export function ErrorState({ title = "Something needs attention", detail = "Try again or use a safe fallback." }: { title?: string; detail?: string }) {
  return (
    <MagicCard className="ets-ui-state ets-ui-state-error">
      <span className="ets-state-icon"><Icon name="error" /></span>
      <h4>{title}</h4>
      <p>{detail}</p>
    </MagicCard>
  );
}

export function UpgradePrompt({ title, detail }: { title: string; detail: string }) {
  return (
    <MagicCard className="ets-ui-state ets-upgrade-prompt">
      <span className="ets-state-icon"><Icon name="lock" /></span>
      <h4>{title}</h4>
      <p>{detail}</p>
    </MagicCard>
  );
}

export function RoleGateBadge({ role }: { role?: EmberRole }) {
  if (!role) return null;
  return <span className="ets-role-badge">{role}</span>;
}

export function BottomNav({ active }: { active: string }) {
  const nav = [
    { key: "Hearth", label: "Hearth" },
    { key: "Scout", label: "Scout" },
    { key: "Vault", label: "Vault" },
    { key: "Market", label: "Market" },
    { key: "More", label: "More" },
  ];
  const normalizedActive = nav.some((item) => item.key === active) ? active : "More";
  return (
    <nav className="ets-bottom-nav" aria-label="Primary destinations">
      {nav.map((item) => (
        <button
          key={item.key}
          type="button"
          className={normalizedActive === item.key ? "active" : ""}
          aria-current={normalizedActive === item.key ? "page" : undefined}
          aria-label={`${item.key} destination`}
        >
          <Icon name={item.key.toLowerCase()} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function FloatingAddButton({ label = "Open Ember Assist", icon = "assist" }: { label?: string; icon?: string }) {
  return <button className="ets-floating-add" type="button" aria-label={label}><Icon name={icon} /></button>;
}

export function FloatingAssistButton() {
  return <FloatingAddButton label="Open Ember Assist" icon="assist" />;
}

export function SafeNoticeCard({ message }: { message: string }) {
  return (
    <aside className="ets-safe-notice">
      <TrustBadge label="Family safe" />
      <p>{message}</p>
    </aside>
  );
}

export function OriginalMascot() {
  return (
    <div className="ets-mascot" aria-label="Original ember and tide mascot placeholder" role="img">
      <span className="ets-mascot-flame" />
      <span className="ets-mascot-tide" />
      <span className="ets-mascot-face" />
    </div>
  );
}

type LiveTone = "hearth" | "scout" | "vault" | "market" | "forge" | "spark" | "assist" | "more";

export function LiveEmberPanel({
  children,
  className = "",
  tone = "hearth",
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  tone?: LiveTone;
  ariaLabel?: string;
}) {
  return (
    <section className={`et-live-panel et-live-tone-${tone} ${className}`.trim()} aria-label={ariaLabel}>
      {children}
    </section>
  );
}

export function LiveEmberStatCard({
  label,
  value,
  detail,
  tone = "hearth",
  onClick,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: LiveTone;
  onClick?: () => void;
}) {
  const contents = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`et-live-stat et-live-tone-${tone}`} onClick={onClick}>
        {contents}
      </button>
    );
  }

  return <div className={`et-live-stat et-live-tone-${tone}`}>{contents}</div>;
}

export function LiveEmberActionCard({
  title,
  detail,
  meta,
  icon = "shield",
  tone = "hearth",
  onClick,
  cta,
}: {
  title: string;
  detail?: string;
  meta?: string;
  icon?: string;
  tone?: LiveTone;
  onClick?: () => void;
  cta?: string;
}) {
  const content = (
    <>
      <span className="et-live-action-icon" aria-hidden="true"><Icon name={icon} /></span>
      <span className="et-live-action-copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {meta || cta ? <b>{cta || meta}</b> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`et-live-action et-live-tone-${tone}`} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={`et-live-action et-live-tone-${tone}`}>{content}</div>;
}

export function LiveEmberTrustNote({ message }: { message: string }) {
  return (
    <aside className="et-live-trust-note">
      <span aria-hidden="true"><Icon name="shield" /></span>
      <strong>{message}</strong>
    </aside>
  );
}
