import { useEffect, useId, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";
import MarketSourceComparison from "./MarketSourceComparison.jsx";
import MarketHistoryTable from "./MarketHistoryTable.jsx";
import { weeklyHistoryPoints, preferredPrintings } from "../utils/marketHistoryPoints.mjs";
import "./market-price-history.css";

const EMPTY_ITEM = Object.freeze({});

const WINDOWS = [
  { key: "3m", label: "3M", days: 92 },
  { key: "6m", label: "6M", days: 183 },
  { key: "1y", label: "1Y", days: 366 },
  { key: "2y", label: "2Y", days: 731 },
  { key: "all", label: "All", days: null },
];

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function asMoney(value, money) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "N/A";
  return money ? money(number) : `$${number.toFixed(2)}`;
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pointDate(row = {}) {
  return row.price_checked_at || row.checked_at || row.created_at || "";
}

function normalizePoint(row = {}) {
  return {
    ...row,
    date: pointDate(row),
    condition: row.condition || row.price_subtype || "Not specified",
    marketPrice: asNumber(row.market_price),
    directLow: asNumber(row.direct_low_price),
    lowPrice: asNumber(row.low_price),
    midPrice: asNumber(row.mid_price),
    highPrice: asNumber(row.high_price),
  };
}

function cutoffForWindow(windowKey) {
  const selected = WINDOWS.find((window) => window.key === windowKey);
  if (!selected?.days) return null;
  const date = new Date();
  date.setDate(date.getDate() - selected.days);
  return date;
}

function filterWindow(points, windowKey) {
  const cutoff = cutoffForWindow(windowKey);
  if (!cutoff) return points;
  return points.filter((point) => {
    const date = new Date(point.date);
    return Number.isFinite(date.getTime()) && date >= cutoff;
  });
}

function average(values) {
  const filtered = values.filter((value) => Number(value) > 0);
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + Number(value), 0) / filtered.length;
}

function volatilityLabel(points) {
  const prices = points.map((point) => point.marketPrice).filter((price) => price > 0);
  if (prices.length < 3) return "Unknown Volatility";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = average(prices);
  if (!avg) return "Unknown Volatility";
  const range = (max - min) / avg;
  if (range < 0.1) return "Low Volatility";
  if (range <= 0.25) return "Medium Volatility";
  return "High Volatility";
}

function snapshotStats(points) {
  const marketPrices = points.map((point) => point.marketPrice).filter((price) => price > 0);
  const lowQuotes = points.map((point) => point.lowPrice).filter((price) => price > 0);
  const highQuotes = points.map((point) => point.highPrice).filter((price) => price > 0);
  const first = marketPrices[0] || 0;
  const latest = marketPrices[marketPrices.length - 1] || 0;
  return {
    lowQuotedPrice: lowQuotes.length ? Math.min(...lowQuotes) : 0,
    highQuotedPrice: highQuotes.length ? Math.max(...highQuotes) : 0,
    lowestMarketPrice: marketPrices.length ? Math.min(...marketPrices) : 0,
    highestMarketPrice: marketPrices.length ? Math.max(...marketPrices) : 0,
    averageMarketPrice: average(marketPrices),
    percentChange: first > 0 ? ((latest - first) / first) * 100 : 0,
  };
}

function buildChartPath(points, valueKey, width, height, padding, minPrice, maxPrice) {
  const validPoints = points.filter((point) => Number(point[valueKey]) > 0 && point.date);
  if (validPoints.length < 2) return "";
  const minTime = new Date(validPoints[0].date).getTime();
  const maxTime = new Date(validPoints[validPoints.length - 1].date).getTime();
  const timeSpan = Math.max(1, maxTime - minTime);
  const priceSpan = Math.max(1, maxPrice - minPrice);

  return validPoints
    .map((point, index) => {
      const time = new Date(point.date).getTime();
      const x = padding + ((time - minTime) / timeSpan) * (width - padding * 2);
      const y = height - padding - ((Number(point[valueKey]) - minPrice) / priceSpan) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function PriceChart({ points, productName }) {
  const chartId = useId();
  const width = 640;
  const height = 220;
  const padding = 28;
  const prices = points.flatMap((point) => [point.marketPrice, point.midPrice, point.lowPrice, point.highPrice]).filter((price) => price > 0);
  if (points.length < 2 || prices.length < 2) {
    return (
      <div className="market-history-chart empty">
        <p>More history will appear as prices refresh.</p>
      </div>
    );
  }
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const marketPath = buildChartPath(points, "marketPrice", width, height, padding, minPrice, maxPrice);
  const medianPath = buildChartPath(points, "midPrice", width, height, padding, minPrice, maxPrice);
  const lowPath = buildChartPath(points, "lowPrice", width, height, padding, minPrice, maxPrice);
  const highPath = buildChartPath(points, "highPrice", width, height, padding, minPrice, maxPrice);
  const dated = points.filter((point) => point.date);
  const label = (value) => new Date(value).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const price = (value) => `${value >= 100 ? Math.round(value).toLocaleString() : value.toFixed(2)}`;

  return (
    <div className="market-history-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartId}-title`} aria-describedby={`${chartId}-description`}>
        <title id={`${chartId}-title`}>Market price history for {productName}</title>
        <desc id={`${chartId}-description`}>{points.length} snapshots. Lines show market, mid price, and quoted low/high values. Exact values are available in the price history table.</desc>
        <line className="market-history-axis" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line className="market-history-grid" x1={padding} y1={padding} x2={width - padding} y2={padding} />
        <text className="market-history-label" x={padding} y={padding - 8}>{price(maxPrice)}</text>
        <text className="market-history-label" x={padding} y={height - padding - 6}>{price(minPrice)}</text>
        {dated.length ? <text className="market-history-label" x={padding} y={height - 8}>{label(dated[0].date)}</text> : null}
        {dated.length ? <text className="market-history-label" x={width - padding} y={height - 8} textAnchor="end">{label(dated[dated.length - 1].date)}</text> : null}
        {lowPath ? <path className="market-history-low" d={lowPath} /> : null}
        {highPath ? <path className="market-history-high" d={highPath} /> : null}
        {medianPath ? <path className="market-history-median" d={medianPath} /> : null}
        {marketPath ? <path className="market-history-line" d={marketPath} /> : null}
      </svg>
      <div className="market-history-legend">
        <span><b className="legend-dot market" /> Market</span>
        {medianPath ? <span><b className="legend-dot median" /> Mid price</span> : null}
        {lowPath || highPath ? <span><b className="legend-dot range" /> Quoted low/high</span> : null}
      </div>
    </div>
  );
}

function MarketPriceHistorySession({
  catalogProductId,
  tcgplayerProductId,
  externalProductId,
  productName = "Product",
  currentMarketPrice = 0,
  currentLowPrice = 0,
  currentMidPrice = 0,
  currentHighPrice = 0,
  lastPriceChecked = "",
  compact = false,
  money,
  marketItem = EMPTY_ITEM,
}) {
  const [windowKey, setWindowKey] = useState("1y");
  const [condition, setCondition] = useState("All");
  const [historyRows, setHistoryRows] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
  // Weekly TCGplayer market prices back to Feb 2024 (market_price_history_weekly).
  const [weeklyRows, setWeeklyRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookupIds = useMemo(() => {
    const ids = [tcgplayerProductId, externalProductId].filter(Boolean).map(String);
    return [...new Set(ids)];
  }, [externalProductId, tcgplayerProductId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase market history is not configured.");
        return;
      }
      if (!catalogProductId && !lookupIds.length) {
        setHistoryRows([]);
        setCurrentRows([]);
        return;
      }

      setLoading(true);
      setError("");
      const history = [];
      const current = [];

      async function fetchHistoryBy(column, value) {
        const { data, error: queryError } = await supabase
          .from("product_market_price_history")
          .select("*")
          .eq(column, value)
          .order("checked_at", { ascending: true, nullsFirst: false })
          .limit(500);
        if (queryError) throw queryError;
        return data || [];
      }

      async function fetchCurrentBy(column, value) {
        const { data, error: queryError } = await supabase
          .from("product_market_price_current")
          .select("*")
          .eq(column, value)
          .order("checked_at", { ascending: false, nullsFirst: false })
          .limit(20);
        if (queryError) throw queryError;
        return data || [];
      }

      // The 2-year weekly history is separate, so a problem there never hides current prices.
      try {
        const columns = "tcgplayer_product_id,price_subtype,dates,market_cents";
        let weekly = [];
        if (isUuid(catalogProductId)) {
          const { data, error: weeklyError } = await supabase.from("market_price_history_weekly").select(columns).eq("catalog_product_id", catalogProductId).limit(12);
          if (weeklyError) throw weeklyError;
          weekly = data || [];
        }
        if (!weekly.length && lookupIds.length) {
          const { data, error: weeklyError } = await supabase.from("market_price_history_weekly").select(columns).in("tcgplayer_product_id", lookupIds).limit(12);
          if (weeklyError) throw weeklyError;
          weekly = data || [];
        }
        // Popular products also have daily prices for the last 120 days.
        const ids = [...new Set(weekly.map((row) => row.tcgplayer_product_id))];
        if (ids.length) {
          const { data: daily } = await supabase.from("market_price_history_daily").select(columns).in("tcgplayer_product_id", ids).limit(12);
          weekly = [...(daily || []), ...weekly];
        }
        if (!cancelled) setWeeklyRows(weekly);
      } catch {
        if (!cancelled) setWeeklyRows([]);
      }

      try {
        if (isUuid(catalogProductId)) {
          history.push(...await fetchHistoryBy("catalog_product_id", catalogProductId));
          current.push(...await fetchCurrentBy("catalog_product_id", catalogProductId));
        }
        for (const id of lookupIds) {
          if (!history.length) history.push(...await fetchHistoryBy("source_product_id", id));
          if (!current.length) current.push(...await fetchCurrentBy("source_product_id", id));
        }

        if (!cancelled) {
          setHistoryRows(history);
          setCurrentRows(current);
        }
      } catch (queryError) {
        if (!cancelled) {
          setError(queryError.message || "Could not load market price history.");
          setHistoryRows([]);
          setCurrentRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [catalogProductId, lookupIds]);

  const weeklyPoints = useMemo(() => weeklyHistoryPoints(weeklyRows), [weeklyRows]);
  const historyPoints = useMemo(() => (weeklyPoints.length ? weeklyPoints : historyRows.map(normalizePoint).filter((point) => point.date)), [historyRows, weeklyPoints]);
  const fallbackPoint = useMemo(() => {
    const current = currentRows[0] || {};
    const checkedAt = current.checked_at || lastPriceChecked || "";
    return normalizePoint({
      ...current,
      market_price: current.market_price ?? currentMarketPrice,
      low_price: current.low_price ?? currentLowPrice,
      mid_price: current.mid_price ?? currentMidPrice,
      high_price: current.high_price ?? currentHighPrice,
      checked_at: checkedAt,
      condition: current.condition || current.price_subtype || "Not specified",
    });
  }, [currentHighPrice, currentLowPrice, currentMarketPrice, currentMidPrice, currentRows, lastPriceChecked]);

  // Weekly history has one line per printing (Normal, Holofoil, Reverse Holofoil…):
  // show one at a time, the item's own printing first, so lines never mix.
  const availableConditions = useMemo(() => {
    if (weeklyPoints.length) return preferredPrintings(weeklyPoints, marketItem.variant || marketItem.priceSubtype || marketItem.finish || "");
    const values = historyPoints.map((point) => point.condition).filter(Boolean);
    if (fallbackPoint.condition) values.push(fallbackPoint.condition);
    return ["All", ...new Set(values)];
  }, [fallbackPoint.condition, historyPoints, marketItem.finish, marketItem.priceSubtype, marketItem.variant, weeklyPoints]);
  const activeCondition = availableConditions.includes(condition) ? condition : availableConditions[0] || "All";

  const selectedPoints = useMemo(() => {
    const base = historyPoints.length ? historyPoints : fallbackPoint.marketPrice ? [fallbackPoint] : [];
    const byCondition = activeCondition === "All" ? base : base.filter((point) => point.condition === activeCondition);
    return filterWindow(byCondition, windowKey);
  }, [activeCondition, fallbackPoint, historyPoints, windowKey]);

  const latestPoint = selectedPoints[selectedPoints.length - 1] || fallbackPoint;
  const stats = snapshotStats(selectedPoints);
  const volatility = volatilityLabel(selectedPoints);
  const percentLabel = `${stats.percentChange >= 0 ? "+" : ""}${stats.percentChange.toFixed(2)}%`;

  return (
    <section className={compact ? "market-history-panel compact" : "market-history-panel"}>
      <MarketSourceComparison marketItem={marketItem} productName={productName} />
      <div className="compact-card-header">
        <div>
          <h3>Price history</h3>
          <p>{productName}</p>
        </div>
        {loading ? <span className="status-badge">Loading...</span> : <span className="status-badge">{weeklyPoints.length ? `Weekly since ${new Date(weeklyPoints[0].date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : historyPoints.length ? `${historyPoints.length} snapshot${historyPoints.length === 1 ? "" : "s"}` : "Current only"}</span>}
      </div>

      <div className="market-history-summary">
        <div className="card"><p>Market Price</p><h2>{asMoney(latestPoint.marketPrice || currentMarketPrice, money)}</h2></div>
        <div className="card"><p>Direct low</p><h2>{asMoney(latestPoint.directLow, money)}</h2></div>
        <div className="card"><p>Volatility</p><h2>{volatility}</h2></div>
        <div className="card"><p>Mid price</p><h2>{asMoney(latestPoint.midPrice, money)}</h2></div>
      </div>

      <div className="market-history-controls">
        <div>
          <h4>Market Price History</h4>
          <p>
            {latestPoint.condition || "Not specified"}: {asMoney(latestPoint.marketPrice || currentMarketPrice, money)}
            {selectedPoints.length >= 2 ? ` (${percentLabel})` : ""}
          </p>
        </div>
        <label>
          {weeklyPoints.length ? "Printing" : "Condition"}
          <select value={activeCondition} onChange={(event) => setCondition(event.target.value)}>
            {availableConditions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className="chip-row compact-chip-row">
          {WINDOWS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={windowKey === option.key ? "chip active" : "chip"}
              aria-pressed={windowKey === option.key}
              aria-label={option.key === "all" ? "All price history" : option.key === "2y" ? "Last two years" : option.key === "1y" ? "Last year" : option.key === "3m" ? "Last three months" : "Last six months"}
              onClick={() => setWindowKey(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <PriceChart points={selectedPoints} productName={productName} />
      <MarketHistoryTable points={selectedPoints} productName={productName} money={money} />

      {error ? <p className="compact-subtitle error-text">Could not load history: {error}</p> : null}
      {!error && !historyPoints.length ? <p className="compact-subtitle">No historical snapshots yet. Current pricing is shown as the first point.</p> : null}
      {!error && historyPoints.length === 1 ? <p className="compact-subtitle">More history will appear as prices refresh.</p> : null}

      <div className="market-history-summary snapshot">
        <div className="card"><p>Low quoted price</p><h2>{asMoney(stats.lowQuotedPrice, money)}</h2></div>
        <div className="card"><p>High quoted price</p><h2>{asMoney(stats.highQuotedPrice, money)}</h2></div>
        <div className="card"><p>Lowest Market</p><h2>{asMoney(stats.lowestMarketPrice, money)}</h2></div>
        <div className="card"><p>Highest Market</p><h2>{asMoney(stats.highestMarketPrice, money)}</h2></div>
        <div className="card"><p>Average Market</p><h2>{asMoney(stats.averageMarketPrice, money)}</h2></div>
        <div className="card"><p>Change</p><h2>{selectedPoints.length >= 2 ? percentLabel : "N/A"}</h2></div>
      </div>

      <p className="compact-subtitle">
        Last price checked: {latestPoint.date ? new Date(latestPoint.date).toLocaleString() : "Unknown"}
      </p>
      {weeklyPoints.length ? <p className="compact-subtitle">TCGplayer market prices from Feb 2024 via TCGCSV: weekly for every product, daily for popular ones. Market price is an estimate, not a guaranteed sale price.</p> : null}
      <p className="compact-subtitle">Low, mid, high, and direct-low references are quoted prices, not verified completed sales.</p>
    </section>
  );
}

export default function MarketPriceHistoryPanel(props) {
  const item = props.marketItem || EMPTY_ITEM;
  const key = JSON.stringify([props.catalogProductId || "", props.tcgplayerProductId || "", props.externalProductId || "", item.variant || item.priceSubtype || "", item.condition || ""]);
  return <MarketPriceHistorySession key={key} {...props} />;
}
