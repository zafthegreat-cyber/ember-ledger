import "./market-history-table.css";

const formatPrice = (value, money) => Number.isFinite(Number(value)) && Number(value) > 0
  ? money ? money(Number(value)) : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value))
  : "Not supplied";

export default function MarketHistoryTable({ points = [], productName = "Product", money }) {
  if (!points.length) return null;
  return <details className="market-history-data">
    <summary>View price history as a table</summary>
    <div className="market-history-data__scroll" role="region" aria-label={`${productName} price history data`} tabIndex={0}>
      <table>
        <caption>{productName}: price references for the selected date range and condition</caption>
        <thead><tr>{["Date", "Market", "Mid price", "Low quote", "High quote", "Condition"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{points.map((point, index) => {
          const date = new Date(point.date || "");
          const validDate = Number.isFinite(date.getTime());
          return <tr key={`${point.id || point.date || "snapshot"}-${index}`}>
            <th scope="row">{validDate ? <time dateTime={date.toISOString()}>{date.toLocaleString()}</time> : "Date not supplied"}</th>
            {["marketPrice", "midPrice", "lowPrice", "highPrice"].map(key => <td key={key}>{formatPrice(point[key], money)}</td>)}
            <td>{point.condition || "Not specified"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </details>;
}
