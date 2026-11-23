// Weekly market price history rows (market_price_history_weekly) as chart
// points, one line per printing. Pure, for tests.

/** Rows { price_subtype, dates[], market_cents[] } (weekly and daily) -> points sorted by date, one per printing per day. */
export function weeklyHistoryPoints(rows = []) {
  const points = [];
  const seen = new Set();
  for (const row of rows || []) {
    const dates = Array.isArray(row?.dates) ? row.dates : [];
    const cents = Array.isArray(row?.market_cents) ? row.market_cents : [];
    const printing = String(row?.price_subtype || "Normal");
    dates.forEach((date, index) => {
      const value = Number(cents[index]);
      if (!date || cents[index] === null || cents[index] === undefined || !Number.isFinite(value) || value <= 0) return;
      if (seen.has(`${printing}|${date}`)) return;
      seen.add(`${printing}|${date}`);
      points.push({
        id: `${printing}-${date}`,
        date: `${date}T12:00:00Z`,
        condition: printing,
        marketPrice: value / 100,
        midPrice: 0,
        lowPrice: 0,
        highPrice: 0,
        directLow: 0,
      });
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

const squash = (value = "") => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Printings in the history, the item's own printing first, then by how much history each has. */
export function preferredPrintings(points = [], itemPrinting = "") {
  const counts = new Map();
  for (const point of points) counts.set(point.condition, (counts.get(point.condition) || 0) + 1);
  const wanted = squash(itemPrinting).replace(/foil$/, "");
  const score = (name) => {
    const key = squash(name).replace(/foil$/, "");
    if (wanted && key === wanted) return 2;
    if (wanted && (key.includes(wanted) || wanted.includes(key))) return 1;
    return 0;
  };
  return [...counts.keys()].sort((a, b) => score(b) - score(a) || counts.get(b) - counts.get(a) || a.localeCompare(b));
}
