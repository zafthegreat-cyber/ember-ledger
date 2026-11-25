// Rendering is deferred; the owning App retains record state and action handlers.
export default function KnownLimitationsContent({ scope, args = [] }) {
  const {
    KNOWN_LIMITATIONS,
    PRODUCT_GLOSSARY,
    PRODUCT_PROMISE_COPY,
    PRODUCT_ROADMAP_NOTES,
    PRODUCT_TAGLINES,
    PageHeader,
    getHeaderCardClass,
    setActiveTab,
  } = scope;

  function renderKnownLimitationsPage() {
    return (
      <>
        <PageHeader
          className={getHeaderCardClass("panel page-summary-card")}
          title="Known Limitations"
          subtitle={`${PRODUCT_PROMISE_COPY} Some features are still being built, tested, or verified.`}
          actions={<button type="button" className="secondary-button" onClick={() => setActiveTab("dashboard")}>Back to Home</button>}
          summary={<p>{PRODUCT_TAGLINES.primary} {PRODUCT_TAGLINES.secondary}</p>}
        />
        <section className="panel">
          <div className="compact-card-header">
            <div>
              <h2>Beta limitations</h2>
              <p>Known gaps stay labeled so the app does not overpromise.</p>
            </div>
          </div>
          <div className="beta-foundation-grid">
            {KNOWN_LIMITATIONS.map((item) => (
              <article className="beta-readiness-card" key={item}>
                <span>Beta limitation</span>
                <strong>{item}</strong>
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="compact-card-header">
            <div>
              <h2>Product glossary</h2>
              <p>Final names for the live app and permission-safe beta surfaces.</p>
            </div>
            <span className="status-badge">Code 3 TCG</span>
          </div>
          <div className="beta-foundation-grid">
            {PRODUCT_GLOSSARY.map((item) => (
              <article className="beta-readiness-card" key={item.key}>
                <span>{item.status}</span>
                <strong>{item.term}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="compact-card-header">
            <div>
              <h2>Roadmap language</h2>
              <p>Planned names are documented here without turning them into live features.</p>
            </div>
            <span className="status-badge">Future</span>
          </div>
          <div className="beta-foundation-grid">
            {PRODUCT_ROADMAP_NOTES.map((item) => (
              <article className="beta-readiness-card" key={item.key}>
                <span>{item.status}</span>
                <strong>{item.term}</strong>
                <p>{item.body}</p>
                {item.caution ? <p className="compact-subtitle">{item.caution}</p> : null}
              </article>
            ))}
          </div>
        </section>
      </>
    );
  }

  return renderKnownLimitationsPage(...args);
}
