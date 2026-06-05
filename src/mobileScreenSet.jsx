import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import tokens from "../design/tokens/tokens.json";
import {
  ActionTile,
  AppHeader,
  AppScreen,
  BottomNav,
  ConfidenceRing,
  EmptyState,
  ErrorState,
  FloatingAssistButton,
  Icon,
  LoadingState,
  MagicCard,
  PageHero,
  PageTabs,
  RoleGateBadge,
  SafeNoticeCard,
  SectionHeader,
  StatCard,
  StatPill,
  TrustBadge,
  UpgradePrompt,
} from "./components/ember-ui";
import { emberTideData } from "./mock/emberTideData";
import "./mobileScreenSet.css";

function flattenTokens(source, prefix = "--ets") {
  return Object.entries(source).reduce((vars, [key, value]) => {
    if (value && typeof value === "object") {
      return { ...vars, ...flattenTokens(value, `${prefix}-${key}`) };
    }
    return { ...vars, [`${prefix}-${key}`]: value };
  }, {});
}

const tokenVars = flattenTokens(tokens);

Object.entries(tokenVars).forEach(([key, value]) => {
  document.documentElement.style.setProperty(key, value);
});

function StatusBar() {
  return (
    <div className="ets-status-bar" aria-hidden="true">
      <span>9:41</span>
      <span className="ets-status-icons"><i /><i /><i /></span>
    </div>
  );
}

function FoilStrip({ count = 3 }) {
  const labels = ["Sky Fox", "Ember Drake", "Tide Fawn", "Moonlit Crest"];
  return (
    <div className="ets-card-row">
      {labels.slice(0, count).map((label, index) => (
        <div className={`ets-foil-card ets-foil-card--${index % 2 === 1 ? "ember" : "tide"}`} role="img" aria-label={`${label} abstract foil card`} key={label}>
          <span className="ets-foil-card-art" />
          <span className="ets-foil-card-line" />
          <span className="ets-foil-card-line short" />
          <strong>{label}</strong>
        </div>
      ))}
    </div>
  );
}

function MapPreview() {
  return (
    <div className="ets-map-panel" role="img" aria-label="Abstract Richmond store signal map">
      <span className="pin pin-a" />
      <span className="pin pin-b" />
      <span className="pin pin-c" />
      <span className="you" />
      <span className="ets-map-label">Richmond, VA</span>
    </div>
  );
}

function TrendPreview() {
  return (
    <div className="ets-chart-line" aria-label="Abstract fair price trend" role="img">
      {Array.from({ length: 13 }).map((_, index) => <i key={index} />)}
    </div>
  );
}

function CreaturePreview() {
  return (
    <div className="ets-creature-panel" aria-label="Original fantasy creature silhouette" role="img">
      <span className="ets-creature-wing" />
      <span className="ets-creature-body" />
      <span className="ets-creature-tail" />
    </div>
  );
}

function ScanFrame() {
  return (
    <div className="ets-scan-frame" role="img" aria-label="Contained scan placeholder">
      <span className="corner corner-a" />
      <span className="corner corner-b" />
      <span className="corner corner-c" />
      <span className="corner corner-d" />
      <Icon name="scan" />
      <strong>Ready to review</strong>
      <small>Upload proof, then confirm details before saving.</small>
    </div>
  );
}

function StatStrip({ stats = [] }) {
  if (!stats.length) return null;
  return (
    <div className={`ets-stat-strip ${stats.length > 3 ? "ets-stat-strip--four" : ""}`}>
      {stats.map((stat) => <StatCard stat={stat} key={`${stat.label}-${stat.value}`} />)}
    </div>
  );
}

function PrimaryActions({ screen }) {
  const actions = [screen.primaryAction, ...(screen.secondaryActions || [])].filter(Boolean);
  if (!actions.length) return null;
  return (
    <div className="ets-primary-actions" aria-label={`${screen.title} actions`}>
      {actions.map((action, index) => (
        <button className={index === 0 ? "ets-primary-button" : "ets-secondary-button"} type="button" key={action}>
          {action}
        </button>
      ))}
    </div>
  );
}

function StatePanel({ screen }) {
  if (screen.state === "loading") return <LoadingState title={screen.feature?.title} detail={screen.feature?.detail} />;
  if (screen.state === "error") return <ErrorState title={screen.feature?.title} detail={screen.feature?.detail} />;
  if (screen.state === "upgrade") return <UpgradePrompt title={screen.feature?.title || "Upgrade available"} detail={screen.feature?.detail || "More tools are available on another tier."} />;
  if (screen.state === "empty") return <EmptyState title={screen.feature?.title || "Nothing here yet"} detail={screen.feature?.detail || "Start with one safe action."} />;
  if (screen.state === "review") {
    return (
      <MagicCard className="ets-ui-state ets-ui-state-review">
        <span className="ets-state-icon"><Icon name="verified" /></span>
        <h4>Review before saving</h4>
        <p>{screen.feature?.detail || "Nothing is saved until the family confirms the details."}</p>
      </MagicCard>
    );
  }
  if (screen.state === "verified") {
    return (
      <MagicCard className="ets-ui-state ets-ui-state-verified">
        <span className="ets-state-icon"><Icon name="verified" /></span>
        <h4>{screen.feature?.title || "Confirmed"}</h4>
        <p>{screen.feature?.detail || "This action has been reviewed and safely recorded."}</p>
      </MagicCard>
    );
  }
  if (screen.state === "waitlist") {
    return (
      <MagicCard className="ets-ui-state ets-ui-state-waitlist">
        <span className="ets-state-icon"><Icon name="location" /></span>
        <h4>{screen.feature?.title || "Waitlist saved"}</h4>
        <p>{screen.feature?.detail || "We use state interest to decide where to expand next."}</p>
      </MagicCard>
    );
  }
  if (screen.state === "stale") {
    return (
      <MagicCard className="ets-ui-state ets-ui-state-stale">
        <span className="ets-state-icon"><Icon name="bell" /></span>
        <h4>{screen.feature?.title || "Needs fresh proof"}</h4>
        <p>{screen.feature?.detail || "Older signals are labeled clearly instead of becoming raw pattern data."}</p>
      </MagicCard>
    );
  }
  if (screen.state === "disputed") {
    return (
      <MagicCard className="ets-ui-state ets-ui-state-disputed">
        <span className="ets-state-icon"><Icon name="report" /></span>
        <h4>{screen.feature?.title || "Needs moderation"}</h4>
        <p>{screen.feature?.detail || "Conflicting reports go through proof review before families act on them."}</p>
      </MagicCard>
    );
  }
  if (screen.state === "restricted") {
    return (
      <MagicCard className="ets-ui-state ets-restricted-state">
        <span className="ets-state-icon"><Icon name="lock" /></span>
        <h4>{screen.feature?.title || "Protected feature"}</h4>
        <p>{screen.feature?.detail || "This stays hidden until your role has access."}</p>
      </MagicCard>
    );
  }
  if (screen.state === "parentApproval") {
    return (
      <MagicCard className="ets-ui-state ets-parent-state">
        <span className="ets-state-icon"><Icon name="parent" /></span>
        <h4>Parent approval needed</h4>
        <p>Kids need parent review before completing sensitive trades or community actions.</p>
      </MagicCard>
    );
  }
  return null;
}

function FeatureSummary({ screen }) {
  const feature = screen.feature;
  if (!feature) return null;

  if (feature.kind === "map") {
    return (
      <MagicCard className="ets-feature-card ets-feature-map">
        <FeatureTitle feature={feature} />
        <MapPreview />
        {feature.safety ? <p className="ets-safe-copy">{feature.safety}</p> : null}
      </MagicCard>
    );
  }

  if (feature.kind === "scan") {
    return (
      <MagicCard className="ets-feature-card ets-feature-scan">
        <FeatureTitle feature={feature} />
        <ScanFrame />
      </MagicCard>
    );
  }

  if (feature.kind === "vaultGrid") {
    return (
      <MagicCard className="ets-feature-card">
        <FeatureTitle feature={feature} />
        <FoilStrip />
        <ProgressLine label={feature.progressLabel || "Collection health"} value={feature.progressValue || "78%"} />
      </MagicCard>
    );
  }

  if (feature.kind === "itemDetail" || feature.kind === "productDetail") {
    return (
      <MagicCard className="ets-feature-card ets-detail-card">
        <div className="ets-detail-art"><FoilStrip count={1} /></div>
        <FeatureTitle feature={feature} />
      </MagicCard>
    );
  }

  if (feature.kind === "trade") {
    return (
      <MagicCard className="ets-feature-card ets-trade-card">
        <FeatureTitle feature={feature} />
        <div className="ets-trade-balance">
          <span>You give <strong>$128</strong></span>
          <span>Difference <strong>-$4</strong></span>
          <span>You receive <strong>$124</strong></span>
        </div>
      </MagicCard>
    );
  }

  if (feature.kind === "market") {
    return (
      <MagicCard className="ets-feature-card">
        <FeatureTitle feature={feature} />
        <SearchPreview />
        <TrendPreview />
      </MagicCard>
    );
  }

  if (feature.kind === "home") {
    return (
      <MagicCard className="ets-feature-card ets-home-feature">
        <FeatureTitle feature={feature} />
        <div className="ets-home-cues">
          <span><Icon name="scout" /><strong>Scout</strong><small>Worth the trip</small></span>
          <span><Icon name="vault" /><strong>Vault</strong><small>Protect value</small></span>
          <span><Icon name="spark" /><strong>Spark</strong><small>Give back</small></span>
        </div>
      </MagicCard>
    );
  }

  if (feature.kind === "community") {
    return (
      <MagicCard className="ets-feature-card ets-community-feature">
        <FeatureTitle feature={feature} />
        <div className="ets-community-feed">
          <span><strong>Shop update</strong><small>Event note, no exact counts</small></span>
          <span><strong>Parent tip</strong><small>Moderator reviewed</small></span>
        </div>
      </MagicCard>
    );
  }

  if (feature.kind === "spark" || feature.kind === "donation") {
    return (
      <MagicCard className="ets-feature-card ets-impact-feature">
        <FeatureTitle feature={feature} />
        <div className="ets-impact-metrics">
          <span><strong>320</strong><small>Spark points</small></span>
          <span><strong>12</strong><small>Kids helped</small></span>
        </div>
      </MagicCard>
    );
  }

  if (feature.kind === "assist") {
    return <PageHero eyebrow={feature.badge} title={feature.title || "Ember Assist"} detail={feature.detail || "Warm app guidance."} />;
  }

  if (feature.kind === "admin") {
    return (
      <MagicCard className="ets-feature-card ets-admin-feature">
        <FeatureTitle feature={feature} />
        <div className="ets-admin-meter">
          <span>Proof</span><span>Disputes</span><span>Safety</span>
        </div>
      </MagicCard>
    );
  }

  return (
    <MagicCard className="ets-feature-card">
      <FeatureTitle feature={feature} />
    </MagicCard>
  );
}

function FeatureTitle({ feature }) {
  return (
    <div className="ets-feature-title">
      <div>
        {feature.badge ? <TrustBadge label={feature.badge} /> : null}
        <h4>{feature.title}</h4>
        <p>{feature.detail}</p>
      </div>
      {feature.confidence ? <ConfidenceRing value={feature.confidence} /> : null}
    </div>
  );
}

function ProgressLine({ label, value }) {
  const numericValue = Math.max(0, Math.min(100, Number.parseInt(String(value), 10) || 72));
  return (
    <div className="ets-progress-block">
      <span><strong>{label}</strong><b>{value}</b></span>
      <i><em style={{ width: `${numericValue}%` }} /></i>
    </div>
  );
}

function SearchPreview() {
  return (
    <label className="ets-search-field">
      <span className="sr-only">Search</span>
      <input type="search" value="Starter Collection Box" readOnly aria-label="Mock market search query" />
    </label>
  );
}

function ScreenSections({ screen }) {
  return screen.sections.map((section) => (
    <MagicCard className={`ets-section-card ets-section-${section.variant || "list"}`} key={`${screen.key}-${section.title}`}>
      <SectionHeader title={section.title} action={section.items.length > 2 ? "See all" : undefined} />
      {section.detail ? <p className="ets-section-detail">{section.detail}</p> : null}
      <div className="ets-list-section-inner">
        {section.items.map((item) => <ActionTile item={item} key={`${section.title}-${item.title}`} />)}
      </div>
    </MagicCard>
  ));
}

const roleIconMap = {
  Free: "lock",
  Collector: "vault",
  Family: "parent",
  Seller: "forge",
  Shop: "shop",
  Admin: "admin",
  Beta: "assist",
};

const contextualCards = {
  hearth: {
    Family: ["Tonight's family plan", "Scout one useful signal, protect the Vault, and choose a Spark moment without turning the night into a rush feed.", "spark", "hearth"],
    Seller: ["Seller next move", "Check the pending trade, draft one clean listing, and keep inventory changes review-first.", "forge", "forge"],
    Shop: ["Shop family signal", "Post helpful availability or an event without exact counts, hype, or checkout pressure.", "shop", "shop"],
    Admin: ["Command glance", "Review Scout proof, Spark requests, shop approvals, and safety flags from protected queues.", "admin", "admin"],
  },
  "scout-near-me": {
    Family: ["Family trip lens", "See current proof, confidence, and Worth the Trip notes without raw timing history.", "scout", "scout"],
    Seller: ["Seller boundary", "Use Scout for fair access context, not sourcing patterns or exact inventory timing.", "scout", "shield"],
    Shop: ["Shop trust signal", "Share useful status only when it helps families plan calmly.", "shop", "store"],
    Admin: ["Scout review lens", "Watch proof quality, disputed reports, and unsafe pattern exposure.", "admin", "report"],
  },
  "scout-screenshot-scan": {
    Family: ["Review-first proof", "Screenshots stay private while store, date, time, product, and confidence are checked.", "scout", "scan"],
  },
  "scout-report-review": {
    Family: ["Before families act", "Confirm useful report details and remove private or pattern-like information.", "scout", "verified"],
  },
  vault: {
    Family: ["Protected collection room", "Folders, completion, wish list, and kid-visible collections stay organized without public child details.", "vault", "vault"],
    Seller: ["Inventory bridge", "Move eligible items into Forge only after review so Vault records remain intact.", "forge", "forge"],
  },
  "vault-item-detail": {
    Family: ["Item decision view", "Condition, owned count, value range, notes, trade, Forge, and wish list actions stay scannable.", "vault", "card"],
  },
  forge: {
    Seller: ["Seller workspace", "Trades, listings, sales, and cost basis live together without checkout or inventory mutation surprises.", "forge", "forge"],
    Family: ["Protected seller tools", "Family users see why Forge is gated without exposing seller records.", "more", "lock"],
  },
  market: {
    Family: ["Fair discovery", "Search cards, sealed, and supplies with honest freshness labels and no auto-buy pressure.", "market", "market"],
    Seller: ["Pricing context", "Use fair ranges and freshness labels for drafts, not overconfident live pricing.", "market", "market"],
  },
  tidepool: {
    Family: ["Moderated community", "Trusted posts, confirmations, and family events appear without becoming a restock leak feed.", "tidepool", "shield"],
  },
  spark: {
    Family: ["Impact hub", "Track packs, supplies, trusted helpers, events, and thank-you moments that grow the hobby kindly.", "spark", "heart"],
    Shop: ["Sponsor pathway", "Support kids packs, events, and supplies through reviewed shop participation.", "shop", "gift"],
  },
  "ember-assist": {
    Family: ["Private helper", "Ask for scanner help, trade context, kid-friendly sets, and app guidance without fake AI promises.", "assist", "assist"],
  },
  more: {
    Family: ["Family command menu", "Open Forge, Tidepool, The Spark, Parent Center, privacy, membership, and safe help from one place.", "more", "more"],
    Seller: ["Seller shortcuts", "Forge, listings, sales ledger, trade value, and exports stay one tap away.", "forge", "forge"],
    Shop: ["Shop shortcuts", "Shop Portal, Spark sponsorship, Tidepool events, and safety settings stay grouped.", "shop", "shop"],
    Admin: ["Admin shortcuts", "Review queues, protected moderation, shop approvals, and safety tools stay admin-only.", "admin", "admin"],
  },
  "parent-center": {
    Family: ["Parent safety center", "Approvals, private kid profiles, Spark participation, and community restrictions stay parent-guided.", "spark", "parent"],
  },
  "shop-portal": {
    Shop: ["Trusted shop controls", "Post calm family updates with quantity privacy, proof review, and opt-in sponsorship tools.", "shop", "shop"],
  },
  "admin-review": {
    Admin: ["Protected review desk", "Moderation queues show affected item details before any destructive decision.", "admin", "admin"],
  },
};

function getContextualCard(screen, role) {
  const roleCards = contextualCards[screen.key] || contextualCards[screen.group?.toLowerCase?.()] || {};
  const card = roleCards[role] || roleCards.Family;
  if (card) {
    const [title, detail, accent, icon] = card;
    return { title, detail, accent, icon };
  }
  const accent = screen.role === "Admin" ? "admin" : screen.role === "Shop" ? "shop" : screen.role === "Seller" ? "forge" : screen.accent;
  const rolePrefix = screen.role && screen.role !== role ? `${screen.role} gated preview. ` : "";
  return {
    title: `${screen.title} lens`,
    detail: `${rolePrefix}${screen.notice || screen.feature?.safety || screen.feature?.detail || "This screen uses mock-only, safety-bounded preview data."}`,
    accent,
    icon: screen.feature?.kind === "map" ? "scout" : screen.feature?.kind === "admin" ? "admin" : roleIconMap[role] || "shield",
  };
}

function PhoneFrame({ screen, selectedRole, compact = false }) {
  const roleMismatch = Boolean(screen.role && screen.role !== selectedRole);
  const showFeatureSummary = !screen.state;
  return (
    <article className={`ets-phone-card ets-accent-${screen.accent} ${compact ? "ets-phone-card-compact" : ""}`} aria-labelledby={`${screen.key}-title`}>
      <div className="ets-screen-label">
        <div className="ets-screen-title-row">
          <h2 id={`${screen.key}-title`}>{screen.title}</h2>
          <RoleGateBadge role={screen.role} />
        </div>
        <p>{screen.subtitle}</p>
      </div>
      <AppScreen label={screen.title}>
        <StatusBar />
        <AppHeader title={screen.title} detail={screen.role ? `${screen.role} tools` : screen.group} accent={screen.accent} />
        <main className="ets-phone-content">
          {screen.hero ? <PageHero eyebrow={screen.hero.eyebrow} title={screen.hero.title} detail={screen.hero.detail} /> : null}
          <RoleContext role={selectedRole} screen={screen} />
          {roleMismatch ? (
            <MagicCard className="ets-ui-state ets-restricted-state">
              <span className="ets-state-icon"><Icon name="lock" /></span>
              <h4>{screen.role} access only</h4>
              <p>{selectedRole} users see a protected state here. Admin, shop, seller, and family-only controls stay hidden until the right role is active.</p>
            </MagicCard>
          ) : (
            <>
              <StatStrip stats={screen.stats} />
              {screen.tabs ? <PageTabs tabs={screen.tabs} active={screen.activeTab} /> : null}
              {screen.notice ? <SafeNoticeCard message={screen.notice} /> : null}
              <StatePanel screen={screen} />
              {showFeatureSummary ? <FeatureSummary screen={screen} /> : null}
              <PrimaryActions screen={screen} />
              <ScreenSections screen={screen} />
            </>
          )}
        </main>
        <FloatingAssistButton />
        <BottomNav active={screen.nav} />
      </AppScreen>
    </article>
  );
}

function RoleContext({ role, screen }) {
  const context = getContextualCard(screen, role);
  return (
    <aside className={`ets-role-context ets-item-${context.accent}`}>
      <span><Icon name={context.icon} /></span>
      <div>
        <strong>{context.title}</strong>
        <small>{context.detail}</small>
      </div>
    </aside>
  );
}

function PrincipleCard({ title, detail, icon }) {
  return (
    <article className="ets-principle-card">
      <span className="ets-principle-icon"><Icon name={icon} /></span>
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function ScreenRail({ screens, activeKey, onSelect }) {
  return (
    <nav className="ets-screen-rail" aria-label="Preview screens">
      {screens.map((screen) => (
        <button
          key={screen.key}
          type="button"
          className={activeKey === screen.key ? "active" : ""}
          aria-pressed={activeKey === screen.key}
          onClick={() => onSelect(screen.key)}
        >
          <Icon name={screen.accent} />
          <span><strong>{screen.title}</strong><small>{screen.group}</small></span>
        </button>
      ))}
    </nav>
  );
}

function RoleSwitcher({ selectedRole, onRoleChange }) {
  return (
    <div className="ets-role-switcher" aria-label="Mock role switcher">
      {emberTideData.roles.map((role) => (
        <button
          key={role}
          type="button"
          className={selectedRole === role ? "active" : ""}
          aria-pressed={selectedRole === role}
          onClick={() => onRoleChange(role)}
        >
          {role}
        </button>
      ))}
    </div>
  );
}

function CoverageChecklist() {
  const items = [
    "No real scraping, checkout, billing, live AI, auth, RLS, or database changes.",
    "Scout copy protects raw patterns, exact timing, employee details, and unsafe private data.",
    "Kid and family states are parent-guided with no public child profiles.",
    "Every preview screen includes an action, safe state, or next step.",
  ];
  return (
    <section className="ets-coverage-panel" aria-label="Safety coverage">
      <div>
        <p className="ets-kicker">Safety boundary</p>
        <h2>Mock-only full app preview</h2>
      </div>
      <ul>
        {items.map((item) => <li key={item}><Icon name="verified" />{item}</li>)}
      </ul>
    </section>
  );
}

function MobileScreenSet() {
  const [activeKey, setActiveKey] = useState("hearth");
  const [selectedRole, setSelectedRole] = useState(emberTideData.profile.tier);
  const activeScreen = emberTideData.screens.find((screen) => screen.key === activeKey) || emberTideData.screens[0];
  const groupedScreens = useMemo(() => emberTideData.screens.reduce((groups, screen) => {
    const group = screen.group || "Preview";
    groups[group] = groups[group] || [];
    groups[group].push(screen);
    return groups;
  }, {}), []);

  return (
    <div className="ets-screen-set" style={tokenVars}>
      <header className="ets-board-header">
        <div className="ets-logo-mark" aria-hidden="true"><span /></div>
        <div>
          <p className="ets-kicker">Full UI perfection preview</p>
          <h1>Ember & Tide</h1>
          <p>Warm, premium, family-first TCG collecting without scalper-friendly pattern exposure.</p>
          <RoleSwitcher selectedRole={selectedRole} onRoleChange={setSelectedRole} />
        </div>
      </header>

      <section className="ets-preview-stage" aria-label="Clickable app preview">
        <div className="ets-preview-copy">
          <p className="ets-kicker">Focused screen</p>
          <h2>{activeScreen.title}</h2>
          <p>{activeScreen.subtitle}</p>
          <div className="ets-role-summary">
            {emberTideData.roleGuidance.map((role) => (
              <button
                key={role.role}
                type="button"
                className={`ets-role-summary-card ets-item-${role.accent} ${selectedRole === role.role ? "active" : ""}`}
                onClick={() => setSelectedRole(role.role)}
              >
                <strong>{role.title}</strong>
                <span>{role.detail}</span>
              </button>
            ))}
          </div>
        </div>
        <PhoneFrame screen={activeScreen} selectedRole={selectedRole} />
        <ScreenRail screens={emberTideData.screens} activeKey={activeKey} onSelect={setActiveKey} />
      </section>

      <CoverageChecklist />

      <section className="ets-phone-groups" aria-label="All Ember and Tide preview screens">
        {Object.entries(groupedScreens).map(([group, screens]) => (
          <div className="ets-screen-group" key={group}>
            <div className="ets-group-heading">
              <p className="ets-kicker">{group}</p>
              <h2>{group === "States" ? "Required UI states" : `${group} screens`}</h2>
            </div>
            <div className="ets-phone-grid">
              {screens.map((screen) => <PhoneFrame key={screen.key} screen={screen} selectedRole={selectedRole} compact />)}
            </div>
          </div>
        ))}
      </section>

      <section className="ets-principles" aria-label="Product principles">
        {emberTideData.principles.map((principle) => <PrincipleCard {...principle} key={principle.title} />)}
      </section>

      <footer className="ets-board-footer">
        <strong>Ember & Tide</strong>
        <span>Collect. Connect. Give.</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("screen-set-root")).render(<MobileScreenSet />);
