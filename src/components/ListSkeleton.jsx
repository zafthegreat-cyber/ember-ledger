// Loading skeletons (SHOULD-12, 2026-11-14).
//
// One shape for every "we are fetching this" moment so pages stop mixing
// "Loading…" text, spinners and blank space. Purely presentational: the
// caller decides when to show it. Styles live in
// src/styles/app/16-should-polish.css (.c3-skeleton*).
//
//   <ListSkeleton rows={4} />                 — list of text rows
//   <ListSkeleton rows={3} variant="card" />  — card tiles (thumb + 2 lines)
//   <ListSkeleton rows={2} variant="metric" /> — stat tiles
export default function ListSkeleton({ rows = 3, variant = "row", label = "Loading", className = "" }) {
  const count = Math.max(1, Math.min(12, Number(rows) || 3));
  return (
    <div className={`c3-skeleton-list c3-skeleton-list--${variant} ${className}`.trim()} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: count }, (_, index) => (
        <div className={`c3-skeleton-item c3-skeleton-item--${variant}`} key={index} aria-hidden="true">
          {variant === "card" ? <span className="c3-skeleton c3-skeleton-thumb" /> : null}
          <span className="c3-skeleton-lines">
            <span className="c3-skeleton c3-skeleton-line" style={{ width: variant === "metric" ? "42%" : `${72 - (index % 3) * 12}%` }} />
            <span className="c3-skeleton c3-skeleton-line c3-skeleton-line--small" style={{ width: variant === "metric" ? "64%" : `${48 + (index % 2) * 16}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Inline helper for pages that already branch on a loading flag. */
export function LoadingOr({ loading, rows = 3, variant = "row", label, children }) {
  return loading ? <ListSkeleton rows={rows} variant={variant} label={label} /> : children;
}
