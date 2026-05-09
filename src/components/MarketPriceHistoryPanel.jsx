import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

const WINDOWS = [
  { key: "3m", label: "3M", days: 92 },
  { key: "6m", label: "6M", days: 183 },
  { key: "1y", label: "1Y", days: 366 },
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
    condition: row.condition || row.price_subtype || "Unopened",
    marketPrice: asNumber(row.market_price),
    listedMedian: asNumber(row.listed_median ?? row.mid_price),
    mostRecentSale: asNumber(row.most_recent_sale ?? row.direct_low_price),
    lowSalePrice: asNumber(row.low_sale_price ?? row.low_price),
    highSalePrice: asNumber(row.high_sale_price ?? row.high_price),
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
  const lowSales = points.map((point) => point.lowSalePrice).filter((price) => price > 0);
  const highSales = points.map((point) => point.highSalePrice).filter((price) => price > 0);
  const first = marketPrices[0] || 0;
  const latest = marketPrices[marketPrices.length - 1] || 0;
  return {
    lowSalePrice: lowSales.length ? Math.min(...lowSales) : 0,
    highSalePrice: highSales.length ? Math.max(...highSales) : 0,
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

function PriceChart({ points }) {
  const width = 640;
  const height = 220;
  const padding = 28;
  const prices = points.flatMap((point) => [point.marketPrice, point.listedMedian, point.lowSalePrice, point.highSalePrice]).filter((price) => price > 0);
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
  const medianPath = buildChartPath(points, "listedMedian", width, height, padding, minPrice, maxPrice);
  const lowPath = buildChartPath(points, "lowSalePrice", width, height, padding, minPrice, maxPrice);
  const highPath = buildChartPath(points, "highSalePrice", width, height, padding, minPrice, maxPrice);

  return (
    <div className="market-history-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Market price history chart">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        {lowPath ? <path className="market-history-low" d={lowPath} /> : null}
        {highPath ? <path className="market-history-high" d={highPath} /> : null}
        {medianPath ? <path className="market-history-median" d={medianPath} /> : null}
        {marketPath ? <path className="market-history-line" d={marketPath} /> : null}
      </svg>
      <div className="market-history-legend">
        <span><b className="legend-dot market" /> Market</span>
        <span><b className="legend-dot median" /> Listed Median</span>
        <span><b className="legend-dot range" /> Low/High</span>
      </div>
    </div>
  );
}

export default function MarketPriceHistoryPanel({
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
}) {
  const [windowKey, setWindowKey] = useState("3m");
  const [condition, setCondition] = useState("All");
  const [historyRows, setHistoryRows] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
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

  const historyPoints = useMemo(() => historyRows.map(normalizePoint).filter((point) => point.date), [historyRows]);
  const fallbackPoint = useMemo(() => {
    const current = currentRows[0] || {};
    const checkedAt = current.checked_at || lastPriceChecked || new Date().toISOString();
    return normalizePoint({
      ...current,
      market_price: current.market_price ?? currentMarketPrice,
      low_price: current.low_price ?? currentLowPrice,
      mid_price: current.mid_price ?? currentMidPrice,
      high_price: current.high_price ?? currentHighPrice,
      listed_median: current.listed_median ?? current.mid_price ?? currentMidPrice,
      low_sale_price: current.low_sale_price ?? current.low_price ?? currentLowPrice,
      high_sale_price: current.high_sale_price ?? current.high_price ?? currentHighPrice,
      checked_at: checkedAt,
      condition: current.condition || current.price_subtype || "Unopened",
    });
  }, [currentHighPrice, currentLowPrice, currentMarketPrice, currentMidPrice, currentRows, lastPriceChecked]);

  const availableConditions = useMemo(() => {
    const values = historyPoints.map((point) => point.condition).filter(Boolean);
    if (fallbackPoint.condition) values.push(fallbackPoint.condition);
    return ["All", ...new Set(values)];
  }, [fallbackPoint.condition, historyPoints]);

  const selectedPoints = useMemo(() => {
    const base = historyPoints.length ? historyPoints : fallbackPoint.marketPrice ? [fallbackPoint] : [];
    const byCondition = condition === "All" ? base : base.filter((point) => point.condition === condition);
    return filterWindow(byCondition, windowKey);
  }, [condition, fallbackPoint, historyPoints, windowKey]);

  const latestPoint = selectedPoints[selectedPoints.length - 1] || fallbackPoint;
  const stats = snapshotStats(selectedPoints);
  const volatility = volatilityLabel(selectedPoints);
  const percentLabel = `${stats.percentChange >= 0 ? "+" : ""}${stats.percentChange.toFixed(2)}%`;

  return (
    <section className={compact ? "market-history-panel compact" : "market-history-panel"}>
      <div className="compact-card-header">
        <div>
          <h3>Market Data</h3>
          <p>{productName}</p>
        </div>
        {loading ? <span className="status-badge">Loading...</span> : <span className="status-badge">{historyPoints.length ? `${historyPoints.length} snapshot${historyPoints.length === 1 ? "" : "s"}` : "Current only"}</span>}
      </div>

      <div className="market-history-summary">
        <div className="card"><p>Market Price</p><h2>{asMoney(latestPoint.marketPrice || currentMarketPrice, money)}</h2></div>
        <div className="card"><p>Most Recent Sale</p><h2>{asMoney(latestPoint.mostRecentSale, money)}</h2></div>
        <div className="card"><p>Volatility</p><h2>{volatility}</h2></div>
        <div className="card"><p>Listed Median</p><h2>{asMoney(latestPoint.listedMedian || latestPoint.midPrice, money)}</h2></div>
      </div>

      <div className="market-history-controls">
        <div>
          <h4>Market Price History</h4>
          <p>
            {latestPoint.condition || "Unopened"}: {asMoney(latestPoint.marketPrice || currentMarketPrice, money)}
            {selectedPoints.length >= 2 ? ` (${percentLabel})` : ""}
          </p>
        </div>
        <label>
          Condition
          <select value={condition} onChange={(event) => setCondition(event.target.value)}>
            {availableConditions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className="chip-row compact-chip-row">
          {WINDOWS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={windowKey === option.key ? "chip active" : "chip"}
              onClick={() => setWindowKey(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <PriceChart points={selectedPoints} />

      {error ? <p className="compact-subtitle error-text">Could not load history: {error}</p> : null}
      {!error && !historyPoints.length ? <p className="compact-subtitle">No historical snapshots yet. Current pricing is shown as the first point.</p> : null}
      {!error && historyPoints.length === 1 ? <p className="compact-subtitle">More history will appear as prices refresh.</p> : null}

      <div className="market-history-summary snapshot">
        <div className="card"><p>Low Sale Price</p><h2>{asMoney(stats.lowSalePrice, money)}</h2></div>
        <div className="card"><p>High Sale Price</p><h2>{asMoney(stats.highSalePrice, money)}</h2></div>
        <div className="card"><p>Lowest Market</p><h2>{asMoney(stats.lowestMarketPrice, money)}</h2></div>
        <div className="card"><p>Highest Market</p><h2>{asMoney(stats.highestMarketPrice, money)}</h2></div>
        <div className="card"><p>Average Market</p><h2>{asMoney(stats.averageMarketPrice, money)}</h2></div>
        <div className="card"><p>Change</p><h2>{selectedPoints.length >= 2 ? percentLabel : "N/A"}</h2></div>
      </div>

      <p className="compact-subtitle">
        Last price checked: {latestPoint.date ? new Date(latestPoint.date).toLocaleString() : "Unknown"}
      </p>
    </section>
  );
}
