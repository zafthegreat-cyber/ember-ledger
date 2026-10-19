import { useId } from "react";
import ItemPhoto from "./ItemPhoto.jsx";
import { BottomSheet } from "./operations/OperationsUI.jsx";
import "./collection-portfolio.css";
import { getRecordGameLabel } from "../utils/collectibleGames.mjs";

const EMPTY_ITEMS = Object.freeze([]);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function formatMoney(value, formatter) {
  return formatter ? formatter(value) : currency.format(value);
}

function itemTitle(item = {}) {
  return item.name || item.title || item.cardName || item.productName || "Untitled item";
}

function itemContext(item = {}) {
  return [getRecordGameLabel(item), item.setName || item.set_name, item.productClassification || item.productType || item.category]
    .filter(Boolean).join(" · ") || "Collection item";
}

function itemValue(item, valueForItem) {
  const value = valueForItem?.(item);
  if (value === "" || value == null || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

function visibleValue(item, { hidden, valueForItem, money }) {
  if (hidden) return "Value hidden";
  const value = itemValue(item, valueForItem);
  return value == null ? "Not valued" : formatMoney(value, money);
}

export function PortfolioValueChart({ points = EMPTY_ITEMS, hidden = false, money, periodLabel = "Selected period" }) {
  const id = useId();
  if (hidden) {
    return <div className="collection-portfolio-chart-hidden"><span aria-hidden="true">—</span><p>Value history hidden</p></div>;
  }
  const validPoints = points.filter((point) => point && point.at !== "" && point.at != null)
    .map((point) => ({ at: new Date(point.at).getTime(), total: point.total }))
    .filter((point) => Number.isFinite(point.at) && point.total !== "" && point.total != null && Number.isFinite(Number(point.total)) && Number(point.total) >= 0)
    .map((point) => ({ at: point.at, total: Number(point.total) }))
    .sort((left, right) => left.at - right.at);
  const first = validPoints[0];
  const last = validPoints[validPoints.length - 1];
  if (validPoints.length < 2 || first.at === last.at) {
    return <div className="collection-portfolio-chart-empty"><span aria-hidden="true">↗</span><p>No value history yet</p><small>Saved snapshots will show how this portfolio changes over time.</small></div>;
  }

  const bounds = validPoints.reduce((range, point) => ({ min: Math.min(range.min, point.total), max: Math.max(range.max, point.total) }), { min: first.total, max: first.total });
  const padding = Math.max((bounds.max - bounds.min) * 0.12, Math.abs(bounds.max) * 0.04, 1);
  const min = Math.max(0, bounds.min - padding);
  const max = bounds.max + padding;
  const width = 720;
  const height = 248;
  const baseline = height - 16;
  const coords = validPoints.map((point) => ({
    x: 14 + ((point.at - first.at) / (last.at - first.at)) * (width - 28),
    y: 16 + ((max - point.total) / (max - min)) * (height - 32),
  }));
  const line = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(2)},${baseline} L${coords[0].x.toFixed(2)},${baseline} Z`;
  const startLabel = dateFormat.format(first.at);
  const endLabel = dateFormat.format(last.at);
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  return <figure className="collection-portfolio-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{periodLabel} portfolio value history</title>
      <desc id={descriptionId}>{`${validPoints.length} saved snapshots. ${startLabel}: ${formatMoney(first.total, money)}. ${endLabel}: ${formatMoney(last.total, money)}. Values between snapshots are connected for reference.`}</desc>
      {[0.25, 0.5, 0.75].map((fraction) => <line className="collection-portfolio-chart-rule" key={fraction} x1="14" x2={width - 14} y1={16 + fraction * (height - 32)} y2={16 + fraction * (height - 32)} />)}
      <path className="collection-portfolio-chart-area" d={area} />
      <path className="collection-portfolio-chart-line" d={line} />
      <circle className="collection-portfolio-chart-point" cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="5" />
    </svg>
    <div className="collection-portfolio-chart-axis" aria-hidden="true"><span>{startLabel}</span><span>{endLabel}</span></div>
    <figcaption className="collection-portfolio-chart-caption">Saved portfolio estimates. Adding or removing items can change the total.</figcaption>
    <details className="collection-portfolio-chart-data">
      <summary>View snapshot values</summary>
      <div><table><caption className="sr-only">{periodLabel} saved portfolio values</caption><thead><tr><th scope="col">Saved</th><th scope="col">Estimated value</th></tr></thead><tbody>{validPoints.map((point, index) => <tr key={`${point.at}-${index}`}><th scope="row"><time dateTime={new Date(point.at).toISOString()}>{dateFormat.format(point.at)}</time></th><td>{formatMoney(point.total, money)}</td></tr>)}</tbody></table></div>
    </details>
  </figure>;
}

export function PortfolioItemGrid({ items = EMPTY_ITEMS, resolveItemImage, onOpen, hidden = false, valueForItem, money, mode = "grid" }) {
  return <ul className="collection-portfolio-grid" data-mode={mode === "list" ? "list" : "grid"} aria-label="Collection items">
    {items.map((item, index) => <li key={item.id || `${itemTitle(item)}-${index}`}><button type="button" className="collection-portfolio-item" onClick={() => onOpen?.(item)} aria-label={`Open ${itemTitle(item)}`}>
      <span className="collection-portfolio-item-media"><ItemPhoto src={resolveItemImage?.(item) || ""} fallbackClassName="collection-portfolio-photo-fallback" /></span>
      <span className="collection-portfolio-item-copy"><strong className="collection-portfolio-item-name">{itemTitle(item)}</strong><span className="collection-portfolio-item-meta">{itemContext(item)}</span><span className="collection-portfolio-item-quantity">Qty {item.quantity ?? item.ownedQuantity ?? 1}{item.condition ? ` · ${item.condition}` : ""}</span><span className="collection-portfolio-item-value">{visibleValue(item, { hidden, valueForItem, money })}</span></span>
    </button></li>)}
  </ul>;
}

export function PortfolioMostValuable({ items = EMPTY_ITEMS, resolveItemImage, onOpen, hidden = false, valueForItem, money }) {
  return <section className="collection-portfolio-valuable-section"><div className="collection-portfolio-section-heading"><h2>Most valuable</h2><span>Saved estimates</span></div>{!items.length ? <p className="collection-portfolio-muted">Add a saved value to an item to see your most valuable pieces here.</p> : <ul className="collection-portfolio-most-valuable" aria-label="Most valuable items">
    {items.slice(0, 5).map((item, index) => <li key={item.id || `${itemTitle(item)}-${index}`}><button type="button" className="collection-portfolio-valuable-row" onClick={() => onOpen?.(item)} aria-label={`Open ${itemTitle(item)}`}>
      <span className="collection-portfolio-valuable-media"><ItemPhoto src={resolveItemImage?.(item) || ""} fallbackClassName="collection-portfolio-photo-fallback" /></span>
      <span className="collection-portfolio-valuable-copy"><strong>{itemTitle(item)}</strong><small>{itemContext(item)}</small></span>
      <span className="collection-portfolio-valuable-value">{visibleValue(item, { hidden, valueForItem, money })}</span>
    </button></li>)}
  </ul>}</section>;
}

function StarIcon({ filled = false }) {
  return <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9z" /></svg>;
}

export function PortfolioChooser({ open = false, onClose, portfolios = EMPTY_ITEMS, activeId, onSelect, onCreate, onManage, onToggleFavorite, onMove, notice = null }) {
  const movable = portfolios.filter((portfolio) => portfolio.id !== "all" && portfolio.id !== "main" && (portfolio.canMove ?? portfolio.canManage));
  return <BottomSheet open={open} title="Choose portfolio" onClose={onClose}>
    <div className="collection-portfolio-chooser">
      <p className="collection-portfolio-muted">Organize your collection without duplicating your items.</p>
      {notice}
      {onCreate ? <button type="button" className="collection-portfolio-create" onClick={() => onCreate()}>Add portfolio <span aria-hidden="true">+</span></button> : null}
      <ul className="collection-portfolio-chooser-list">
        {portfolios.map((portfolio) => {
          const all = portfolio.id === "all";
          const current = activeId === portfolio.id;
          const moveIndex = movable.findIndex((entry) => entry.id === portfolio.id);
          return <li className="collection-portfolio-chooser-row" key={portfolio.id}>
            <button type="button" className="collection-portfolio-chooser-select" aria-pressed={current} onClick={() => onSelect?.(portfolio.id)}>
              <span className="collection-portfolio-chooser-mark" aria-hidden="true">{current ? "✓" : all ? "▦" : "▱"}</span><span><strong>{all ? "All portfolios" : portfolio.name || "Untitled portfolio"}</strong><small>{portfolio.count ?? 0} item{portfolio.count === 1 ? "" : "s"}{all ? " across your collection" : ""}</small></span>{current ? <span className="sr-only">Selected</span> : null}
            </button>
            {!all ? <div className="collection-portfolio-chooser-actions">
              {onToggleFavorite ? <button type="button" className="collection-portfolio-icon-button" aria-label={`${portfolio.favorite ? "Remove" : "Mark"} ${portfolio.name || "portfolio"} ${portfolio.favorite ? "from favorites" : "as favorite"}`} aria-pressed={Boolean(portfolio.favorite)} onClick={() => onToggleFavorite(portfolio.id)}><StarIcon filled={Boolean(portfolio.favorite)} /></button> : null}
              {onManage && portfolio.canManage ? <button type="button" className="collection-portfolio-manage" onClick={() => onManage(portfolio.id)} aria-label={`Manage ${portfolio.name || "portfolio"}`}>Manage</button> : null}
              {onMove && moveIndex >= 0 ? <><button type="button" className="collection-portfolio-icon-button" aria-label={`Move ${portfolio.name || "portfolio"} up`} disabled={moveIndex === 0} onClick={() => onMove(portfolio.id, "up")}><span aria-hidden="true">↑</span></button><button type="button" className="collection-portfolio-icon-button" aria-label={`Move ${portfolio.name || "portfolio"} down`} disabled={moveIndex === movable.length - 1} onClick={() => onMove(portfolio.id, "down")}><span aria-hidden="true">↓</span></button></> : null}
            </div> : null}
          </li>;
        })}
      </ul>
      <p className="collection-portfolio-chooser-footer">Portfolio organization is saved on this device.</p>
    </div>
  </BottomSheet>;
}
