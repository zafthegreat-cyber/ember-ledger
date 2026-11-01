import "./market-history-table.css";

export default function CollectionValueCoverage({ summary, money }) {
  return <section className="collection-value-coverage" aria-label="Collection value coverage">
    <p><strong>{summary.pricedQuantity} of {summary.ownedQuantity} owned copies have a value.</strong> {summary.unpricedQuantity} {summary.unpricedQuantity === 1 ? "copy is" : "copies are"} unpriced.</p>
    <p>{summary.listedQuantity} listed copies are included in owned totals. {summary.wantedQuantity} wanted copies are tracked separately.</p>
    <details className="market-history-data">
      <summary>View owned collection breakdown as a table</summary>
      <div className="market-history-data__scroll" role="region" aria-label="Owned collection breakdown" tabIndex={0}>
        <table>
          <caption>Owned copies and known values. Wishlist budgets are excluded; listed copies are counted once.</caption>
          <thead><tr><th scope="col">Type</th><th scope="col">Owned copies</th><th scope="col">Priced copies</th><th scope="col">Unpriced copies</th><th scope="col">Known value</th></tr></thead>
          <tbody>{summary.groups.map(group => <tr key={group.label}><th scope="row">{group.label}</th><td>{group.quantity}</td><td>{group.pricedQuantity}</td><td>{group.quantity - group.pricedQuantity}</td><td>{group.pricedQuantity ? money(group.value) : "Unknown"}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">Total owned</th><td>{summary.ownedQuantity}</td><td>{summary.pricedQuantity}</td><td>{summary.unpricedQuantity}</td><td>{summary.pricedQuantity ? money(summary.totalKnownValue) : "Unknown"}</td></tr></tfoot>
        </table>
      </div>
    </details>
  </section>;
}
