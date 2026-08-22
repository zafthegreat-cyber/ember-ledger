import { getActualVsProjectedRows, formatCurrency, formatPercent } from "../../selectors.js";
import { EmptyState, SectionHeading, StatusPill } from "../../components/Fields.jsx";

export default function ResultsScreen({ state }) {
  const rows = getActualVsProjectedRows(state);
  const soldRows = rows.filter((row) => row.soldQuantity > 0);
  return <section className="flip-section">
    <SectionHeading eyebrow="Learning history" title="Actual versus projected" detail="Original assumptions are retained beside actual costs and completed-sale results. Personalized machine learning is not active in Phase 1." />
    {soldRows.length ? <div className="flip-comparison-list">{soldRows.map((row) => <article key={row.id}>
      <div className="flip-record-card__head"><div><span>{row.productClassification}</span><h3>{row.name}</h3></div><StatusPill tone={row.profitDifference >= 0 ? "good" : "danger"}>{row.profitDifference >= 0 ? "Beat projection" : "Below projection"}</StatusPill></div>
      <div className="flip-comparison-grid">
        <div><span>Projected resale range</span><strong>{formatCurrency(row.originalProjectedResaleLow)} – {formatCurrency(row.originalProjectedResaleHigh)}</strong><small>Mid {formatCurrency(row.originalProjectedResaleMid)}</small></div>
        <div><span>Projected profit</span><strong>{formatCurrency(row.projectedProfit)}</strong><small>{formatPercent(row.projectedRoi)} ROI</small></div>
        <div><span>Recommended max</span><strong>{formatCurrency(row.recommendedMaximumPurchasePrice)}</strong><small>Original ceiling</small></div>
        <div><span>Actual purchase</span><strong>{formatCurrency(row.actualPurchasePrice)}</strong><small>Recorded cost</small></div>
        <div><span>Actual sales proceeds</span><strong>{formatCurrency(row.actualSalesProceeds)}</strong><small>{formatCurrency(row.actualCosts)} recorded costs</small></div>
        <div><span>Actual profit</span><strong className={row.actualProfit >= 0 ? "flip-positive" : "flip-negative"}>{formatCurrency(row.actualProfit)}</strong><small>{formatPercent(row.realizedRoi)} realized ROI</small></div>
        <div><span>Prediction difference</span><strong className={row.profitDifference >= 0 ? "flip-positive" : "flip-negative"}>{formatCurrency(row.profitDifference)}</strong><small>{row.roiDifference === null ? "ROI unavailable" : `${formatPercent(row.roiDifference)} ROI difference`}</small></div>
        <div><span>Days to sell</span><strong>{row.daysToSell === null ? "—" : row.daysToSell}</strong><small>{row.soldQuantity} sold</small></div>
      </div>
    </article>)}</div> : <EmptyState title="No completed result pairs">Add inventory projections and a completed sale to compare the original prediction with actual results.</EmptyState>}
  </section>;
}
