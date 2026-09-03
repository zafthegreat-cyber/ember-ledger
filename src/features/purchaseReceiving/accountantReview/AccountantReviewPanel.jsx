import { useMemo, useState } from "react";
import {
  EmptyState,
  MetricCard,
  QuietButton,
  RecordCard,
  SectionHeader,
  StatusBadge,
} from "../../../components/operations/OperationsUI.jsx";
import { formatAccountantReviewMoney } from "./moneyDisplay.js";
import "./accountant-review.css";

const FILTER_KEYS = Object.freeze([
  "year",
  "quarter",
  "month",
  "retailer",
  "productReference",
  "saleId",
  "category",
  "severity",
]);

const EMPTY_FILTERS = Object.freeze(Object.fromEntries(FILTER_KEYS.map((key) => [key, ""])));

const FILTER_LABELS = Object.freeze({
  year: "Year",
  quarter: "Quarter",
  month: "Month",
  retailer: "Retailer",
  productReference: "Product",
  saleId: "Sale",
  category: "Review category",
  severity: "Attention level",
});

const FILTER_OPTION_KEYS = Object.freeze({
  year: "years",
  quarter: "quarters",
  month: "months",
  retailer: "retailers",
  productReference: "productReferences",
  saleId: "saleIds",
  category: "categories",
  severity: "severities",
});

function words(value = "") {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function boundedText(value, fallback = "Not recorded") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function exactSumOrNull(values) {
  if (values.some((value) => !Number.isSafeInteger(value))) return null;
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  const number = Number(total);
  return Number.isSafeInteger(number) ? number : null;
}

function dateLabel(value) {
  if (!value) return "Not recorded";
  const text = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function moneyLabel(minorUnits, currency = "USD", { signed = false } = {}) {
  return formatAccountantReviewMoney(minorUnits, currency, { signed });
}

function recordValue(record, key) {
  const originalPeriod = record?.originalPeriod || {};
  const values = {
    year: record?.originalYear ?? originalPeriod.yearKey ?? originalPeriod.year ?? record?.year,
    quarter: record?.originalQuarter ?? originalPeriod.quarterKey ?? originalPeriod.quarter ?? record?.quarter,
    month: record?.originalMonth ?? originalPeriod.monthKey ?? originalPeriod.month ?? record?.month,
    retailer: record?.retailer ?? record?.retailerLabel ?? record?.vendor,
    productReference: record?.productReference ?? record?.productId ?? record?.effectiveProductReference,
    saleId: record?.saleId ?? record?.saleReference,
    category: record?.category ?? record?.reviewCategory,
    severity: record?.severity ?? record?.reviewSeverity,
  };
  return values[key];
}

function normalizedFilterSeed(value = {}) {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, String(value?.[key] ?? "").trim()]));
}

function normalizedOption(option, key) {
  if (option && typeof option === "object") {
    const value = String(option.value ?? "").trim();
    return value ? { value, label: boundedText(option.label, ["category", "severity"].includes(key) ? words(value) : value) } : null;
  }
  const value = String(option ?? "").trim();
  return value ? { value, label: ["category", "severity"].includes(key) ? words(value) : value } : null;
}

function optionsFor(key, preview, records) {
  const optionKey = FILTER_OPTION_KEYS[key] || key;
  const supplied = Array.isArray(preview?.filterOptions?.[optionKey]) ? preview.filterOptions[optionKey] : [];
  const inferred = records.map((record) => recordValue(record, key));
  const values = [...supplied, ...inferred]
    .map((option) => normalizedOption(option, key))
    .filter(Boolean);
  return [...new Map(values.map((option) => [option.value, option])).values()]
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
}

function recordMatchesFilters(record, filters) {
  return FILTER_KEYS.every((key) => {
    if (!filters[key]) return true;
    if (["year", "quarter", "month"].includes(key)) {
      const suffix = key === "year" ? "yearKey" : key === "quarter" ? "quarterKey" : "monthKey";
      const original = record?.originalPeriod?.[suffix] ?? recordValue(record, key);
      const correction = record?.correctionPeriod?.[suffix] ?? record?.latestCorrectionPeriod?.[suffix];
      return [original, correction].some((value) => String(value ?? "") === filters[key]);
    }
    return String(recordValue(record, key) ?? "") === filters[key];
  });
}

function periodMatchesFilters(period, filters) {
  const periodKey = String(period?.periodKey || "");
  if (filters.year && !periodKey.startsWith(filters.year)) return false;
  if (filters.quarter && periodKey !== filters.quarter && !filters.quarter.startsWith(periodKey)) return false;
  if (filters.month && periodKey !== filters.month && !filters.month.startsWith(periodKey)) return false;
  return true;
}

function summaryForVisibleItems(items, sales, lots) {
  const currencies = [...new Set(items.map((item) => item.currency).filter(Boolean))].sort();
  const currencySummaries = currencies.map((currency) => {
    const currencyItems = items.filter((item) => item.currency === currency);
    return {
      currency,
      salesAffected: new Set(currencyItems.map((item) => item.saleId).filter(Boolean)).size,
      netCogsAdjustmentMinorUnits: exactSumOrNull(currencyItems.map((item) => item.reconciliationAdjustmentMinorUnits ?? item.cogsAdjustmentMinorUnits ?? 0)),
    };
  });
  const singleCurrency = currencySummaries.length === 1 ? currencySummaries[0] : null;
  return {
    reviewItemCount: items.length,
    priorPeriodAdjustments: items.filter((item) => item.periodComparison?.priorPeriodRelevant === true).length,
    currentPeriodAdjustments: items.filter((item) => item.periodComparison?.priorPeriodRelevant !== true).length,
    priorYearItems: items.filter((item) => item.taxReviewFlag === "PRIOR_YEAR_REVIEW").length,
    itemsNeedingReview: items.filter((item) => item.severity && item.severity !== "INFO").length,
    salesAffected: sales.length,
    lotsAffected: lots.length,
    currency: singleCurrency?.currency || null,
    mixedCurrencies: currencySummaries.length > 1,
    currencySummaries,
    netCogsAdjustmentMinorUnits: singleCurrency?.netCogsAdjustmentMinorUnits ?? (currencySummaries.length ? null : 0),
  };
}

function severityTone(value) {
  if (value === "HIGH_ATTENTION") return "danger";
  if (value === "REVIEW") return "warning";
  return "info";
}

function reviewGroupFor(item) {
  const supplied = String(item.reviewGroup || item.reportingImpactGroup || "").trim();
  if (supplied) return supplied;
  const flag = String(item.taxReviewFlag || item.reviewFlag || item.primaryFlag || item.periodClassification?.primaryFlag || "");
  if (flag === "PRIOR_YEAR_REVIEW") return "PRIOR_YEAR";
  if (flag === "PRIOR_QUARTER_REVIEW") return "PRIOR_QUARTER";
  if (flag === "PRIOR_MONTH_REVIEW") return "PRIOR_MONTH";
  if (item.severity === "HIGH_ATTENTION" && !flag) return "NEEDS_REVIEW";
  return "CURRENT_MONTH";
}

function groupLabel(value) {
  return ({
    NEEDS_REVIEW: "Needs Review",
    PRIOR_YEAR: "Prior Year",
    PRIOR_QUARTER: "Prior Quarter",
    PRIOR_MONTH: "Prior Month",
    CURRENT_MONTH: "Current Month",
  })[value] || words(value);
}

function Facts({ rows }) {
  return (
    <dl className="accountant-review-facts">
      {rows.filter((row) => row.value !== undefined && row.value !== null && row.value !== "").map((row) => (
        <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
      ))}
    </dl>
  );
}

function MoneyFlow({ original, adjustment, effective, currency = "USD", labels = {} }) {
  return (
    <div className="accountant-review-money-flow" aria-label={labels.ariaLabel || "Original, adjustment, and current effective values"}>
      <div data-value-basis="ORIGINAL_RECORDED"><span>{labels.original || "Original recorded"}</span><strong>{moneyLabel(original, currency)}</strong><small>Original recorded</small></div>
      <span aria-hidden="true">+</span>
      <div data-value-basis="RECONCILIATION_ADJUSTMENT"><span>{labels.adjustment || "Reconciliation adjustment"}</span><strong>{moneyLabel(adjustment, currency, { signed: true })}</strong><small>Append-only delta</small></div>
      <span aria-hidden="true">=</span>
      <div data-value-basis="CURRENT_EFFECTIVE"><span>{labels.effective || "Current effective projection"}</span><strong>{moneyLabel(effective, currency)}</strong><small>Current effective projection</small></div>
    </div>
  );
}

function ReviewHeading({ record, fallbackTitle, level = 3 }) {
  const severity = record.severity || record.reviewSeverity || "INFO";
  const Heading = level === 4 ? "h4" : "h3";
  return (
    <div className="accountant-review-card__heading">
      <div>
        <span className="accountant-review-card__eyebrow">{words(record.category || record.reviewCategory || "SALE_REPORTING_REVIEW")}</span>
        <Heading>{boundedText(record.title || record.productTitle || record.saleId || record.saleReference || record.inventoryLotId || record.lotId, fallbackTitle)}</Heading>
      </div>
      <StatusBadge tone={severityTone(severity)}>{words(severity)}</StatusBadge>
    </div>
  );
}

function ReviewItemCard({ item, nested = false }) {
  const currency = item.currency || "USD";
  const originalRecordedCogs = item.originalRecordedCogsMinorUnits ?? item.originalCogsMinorUnits;
  const priorEffectiveCogs = item.priorEffectiveCogsMinorUnits ?? originalRecordedCogs;
  const adjustment = item.reconciliationAdjustmentMinorUnits ?? item.cogsAdjustmentMinorUnits ?? item.adjustmentMinorUnits;
  const resultingEffectiveCogs = item.resultingEffectiveCogsMinorUnits ?? item.effectiveCogsMinorUnits;
  const currentEffectiveCogs = item.currentEffectiveCogsMinorUnits ?? resultingEffectiveCogs;
  const resultingProductReference = item.productReference || item.effectiveProductReference;
  const productChanged = Boolean(item.originalProductReference)
    && Boolean(resultingProductReference)
    && item.originalProductReference !== resultingProductReference;
  const currentProductChanged = Boolean(item.originalProductReference)
    && Boolean(item.effectiveProductReference)
    && item.originalProductReference !== item.effectiveProductReference;
  const priorPeriod = item.priorPeriod === true
    || item.periodComparison?.priorPeriodRelevant === true
    || ["PRIOR_MONTH_REVIEW", "PRIOR_QUARTER_REVIEW", "PRIOR_YEAR_REVIEW", "ACCOUNTANT_REVIEW_RECOMMENDED"].includes(item.taxReviewFlag || item.reviewFlag);
  return (
    <RecordCard className="accountant-review-card" data-review-category={item.category || item.reviewCategory || "SALE_REPORTING_REVIEW"}>
      <ReviewHeading record={item} fallbackTitle="Accounting review item" level={nested ? 4 : 3} />
      <Facts rows={[
        { label: "Original transaction date", value: dateLabel(item.originalTransactionDate || item.saleDate) },
        { label: "Correction date", value: dateLabel(item.correctionDate || item.reconciliationDate) },
        { label: "Original period", value: boundedText(item.originalPeriodLabel || item.originalPeriod?.monthKey || item.originalPeriod?.quarterKey || item.originalPeriod?.yearKey) },
        { label: "Correction period", value: boundedText(item.correctionPeriodLabel || item.correctionPeriod?.monthKey || item.correctionPeriod?.quarterKey || item.correctionPeriod?.yearKey) },
        { label: "Product", value: boundedText(item.productTitle || resultingProductReference) },
        { label: "Prior effective product", value: productChanged || currentProductChanged ? boundedText(item.originalProductReference) : null },
        { label: "Resulting product", value: productChanged ? boundedText(resultingProductReference) : null },
        { label: "Current effective product", value: currentProductChanged ? boundedText(item.effectiveProductReference) : null },
        { label: "Quantity", value: item.quantity },
        { label: "Original recorded COGS", value: moneyLabel(originalRecordedCogs, currency) },
        { label: "Current effective COGS", value: moneyLabel(currentEffectiveCogs, currency) },
        { label: "Original recorded profit", value: moneyLabel(item.originalRecordedProfitMinorUnits ?? item.originalProfitMinorUnits, currency) },
        { label: "Prior effective profit", value: moneyLabel(item.priorEffectiveProfitMinorUnits, currency) },
        { label: "This profit adjustment", value: moneyLabel(item.profitAdjustmentMinorUnits, currency, { signed: true }) },
        { label: "Resulting effective profit", value: moneyLabel(item.resultingEffectiveProfitMinorUnits ?? item.effectiveProfitMinorUnits, currency) },
        { label: "Current effective profit", value: moneyLabel(item.currentEffectiveProfitMinorUnits ?? item.effectiveProfitMinorUnits, currency) },
        { label: "Purchase", value: boundedText(item.purchaseId || item.purchaseReference) },
        { label: "Lot", value: boundedText(item.inventoryLotId || item.lotId || item.lotReference) },
        { label: "Money / physical movement", value: words(item.movementClassification || item.movementType || item.refundReturnClassification || "NONE") },
        { label: "Refund amount", value: moneyLabel(item.refundAmountMinorUnits, currency) },
        { label: "Remaining Inventory cost effect", value: moneyLabel(item.inventoryCostAdjustmentMinorUnits ?? item.remainingInventoryEffectMinorUnits, currency, { signed: true }) },
        { label: "Physical Inventory moved", value: item.physicalInventoryMoved === true ? "Yes — supported by disposition history" : "No" },
        { label: "Review flag", value: words(item.taxReviewFlag || item.reviewFlag || (priorPeriod ? "ACCOUNTANT_REVIEW_RECOMMENDED" : "NO_PRIOR_PERIOD_ISSUE")) },
        { label: "Filing status", value: "Filing status unknown" },
      ]} />
      {Number.isSafeInteger(priorEffectiveCogs) && Number.isSafeInteger(adjustment) && Number.isSafeInteger(resultingEffectiveCogs) ? (
        <MoneyFlow
          original={priorEffectiveCogs}
          adjustment={adjustment}
          effective={resultingEffectiveCogs}
          currency={currency}
          labels={{ original: "Prior effective COGS", adjustment: "This adjustment", effective: "Resulting effective COGS", ariaLabel: "Prior effective COGS, this reconciliation adjustment, and resulting effective COGS" }}
        />
      ) : null}
      {priorPeriod ? <p className="accountant-review-attention" role="status">This adjustment affects a transaction from a prior reporting period and may warrant accountant review.</p> : null}
    </RecordCard>
  );
}

function SaleReviewCard({ sale }) {
  const currency = sale.currency || "USD";
  const productChanged = Boolean(sale.originalProductReference)
    && Boolean(sale.effectiveProductReference)
    && sale.originalProductReference !== sale.effectiveProductReference;
  return (
    <RecordCard className="accountant-review-card">
      <ReviewHeading record={sale} fallbackTitle="Sale review" />
      <Facts rows={[
        { label: "Sale reference", value: boundedText(sale.saleId || sale.saleReference) },
        { label: "Sale date", value: dateLabel(sale.saleDate || sale.originalTransactionDate) },
        { label: "Correction date", value: dateLabel(sale.correctionDate || sale.latestReconciliationDate || sale.reversalChain?.at(-1)?.correctionDate) },
        { label: "Product", value: boundedText(sale.productTitle || sale.productReference) },
        { label: "Original recorded product", value: productChanged ? boundedText(sale.originalProductReference) : null },
        { label: "Current effective product", value: productChanged ? boundedText(sale.effectiveProductReference) : null },
        { label: "Quantity", value: sale.quantity ?? sale.quantitySold },
        { label: "Gross revenue", value: moneyLabel(sale.grossRevenueMinorUnits ?? sale.revenueMinorUnits, currency) },
        { label: "Net proceeds used for profit", value: moneyLabel(sale.netProceedsMinorUnits ?? sale.netRevenueMinorUnits, currency) },
        { label: "Original profit", value: moneyLabel(sale.originalProfitMinorUnits, currency) },
        { label: "Profit adjustment", value: moneyLabel(sale.profitAdjustmentMinorUnits, currency, { signed: true }) },
        { label: "Effective profit", value: moneyLabel(sale.effectiveProfitMinorUnits, currency) },
        { label: "Source lot", value: boundedText(sale.inventoryLotIds?.join(" · ") || sale.lotId || sale.lotReference) },
        { label: "Review period", value: boundedText(sale.reviewPeriodLabel || sale.taxReviewFlags?.map(words).join(" · ")) },
      ]} />
      <MoneyFlow
        original={sale.originalCogsMinorUnits}
        adjustment={sale.reconciliationAdjustmentMinorUnits ?? sale.cogsAdjustmentMinorUnits ?? sale.adjustmentMinorUnits}
        effective={sale.effectiveCogsMinorUnits}
        currency={currency}
        labels={{ original: "Original COGS", adjustment: "COGS adjustment", effective: "Effective COGS", ariaLabel: "Sale COGS review" }}
      />
      {Array.isArray(sale.reversalChain) && sale.reversalChain.length ? (
        <div className="accountant-review-chain">
          <strong>Reconciliation and reversal chain</strong>
          <ol>{sale.reversalChain.map((event, index) => {
            const chainProductChanged = Boolean(event.originalProductReference)
              && Boolean(event.correctedProductReference)
              && event.originalProductReference !== event.correctedProductReference;
            return (
              <li key={event.id || event.eventId || `${sale.saleId || "sale"}-${index}`}>
                <span>{dateLabel(event.correctionDate || event.occurredAt || event.createdAt)}</span>
                <strong>{moneyLabel(event.adjustmentMinorUnits ?? event.cogsAdjustmentMinorUnits, event.currency || currency, { signed: true })}</strong>
                <small>{words(event.category || "RECONCILIATION_REVERSAL_REVIEW")}</small>
                {chainProductChanged ? <small>Product: {boundedText(event.originalProductReference)} → {boundedText(event.correctedProductReference)}</small> : null}
              </li>
            );
          })}</ol>
        </div>
      ) : null}
      <p className="accountant-review-history-note">The historical Sale remains unchanged. Effective values are a separate current projection.</p>
    </RecordCard>
  );
}

function LotReviewCard({ lot }) {
  const currency = lot.currency || "USD";
  return (
    <RecordCard className="accountant-review-card">
      <ReviewHeading record={lot} fallbackTitle="Acquisition lot review" />
      <Facts rows={[
        { label: "Lot reference", value: boundedText(lot.inventoryLotId || lot.lotId || lot.lotReference) },
        { label: "Purchase", value: boundedText(lot.purchaseId || lot.purchaseReference) },
        { label: "Quantity acquired", value: lot.originalQuantity ?? lot.quantityAcquired },
        { label: "Quantity sold", value: lot.soldQuantity ?? lot.quantitySold },
        { label: "Quantity remaining", value: lot.remainingAvailableQuantity ?? lot.quantityRemaining ?? lot.currentQuantity },
        { label: "Pre-reconciliation lot cost", value: moneyLabel(lot.preReconciliationCostMinorUnits, currency) },
        { label: "Earlier correction effect", value: moneyLabel(lot.priorCorrectionEffectMinorUnits, currency, { signed: true }) },
        { label: "Reconciliation-only effect", value: moneyLabel(lot.reconciliationAdjustmentMinorUnits, currency, { signed: true }) },
        { label: "Later Inventory adjustments", value: moneyLabel(lot.otherInventoryAdjustmentMinorUnits ?? lot.laterInventoryAdjustmentMinorUnits, currency, { signed: true }) },
        { label: "Realized COGS effect", value: moneyLabel(lot.realizedCogsEffectMinorUnits, currency, { signed: true }) },
        { label: "Remaining Inventory effect", value: moneyLabel(lot.remainingInventoryEffectMinorUnits, currency, { signed: true }) },
        { label: "Reconciliation date", value: dateLabel(lot.latestReconciliationDate || lot.reconciliationDate) },
      ]} />
      <MoneyFlow
        original={lot.originalLotCostMinorUnits}
        adjustment={lot.totalEffectiveAdjustmentMinorUnits ?? lot.costAdjustmentMinorUnits ?? lot.adjustmentMinorUnits}
        effective={lot.effectiveLotCostMinorUnits}
        currency={currency}
        labels={{ original: "Original lot cost", adjustment: "Total effective adjustment", effective: "Effective lot cost", ariaLabel: "Acquisition lot cost review including earlier corrections and reconciliation" }}
      />
      <p className="accountant-review-history-note">Realized and remaining effects reconcile to the reconciliation-only effect. Later disposition or correction effects are shown separately and remain included in the total effective adjustment.</p>
    </RecordCard>
  );
}

function PeriodSummaryCard({ period, defaultCurrency = "USD" }) {
  const currency = period.currency || defaultCurrency;
  return (
    <RecordCard className="accountant-review-card accountant-review-period-card">
      <ReviewHeading record={period} fallbackTitle="Reporting period" />
      <Facts rows={[
        { label: "Period", value: boundedText(period.periodKey || period.periodLabel || period.label) },
        { label: "Sales affected", value: safeCount(period.saleCount ?? period.salesAffected) },
        { label: "Lots affected", value: safeCount(period.affectedLotCount ?? period.lotsAffected) },
        { label: "Review items", value: safeCount(period.reviewItemCount ?? period.priorPeriodItems) },
        { label: "Original profit", value: moneyLabel(period.originalProfitMinorUnits, currency) },
        { label: "Profit adjustment", value: moneyLabel(period.profitAdjustmentMinorUnits, currency, { signed: true }) },
        { label: "Effective profit", value: moneyLabel(period.currentEffectiveProfitMinorUnits ?? period.effectiveProfitMinorUnits, currency) },
      ]} />
      <MoneyFlow
        original={period.originalRealizedCogsMinorUnits ?? period.originalCogsMinorUnits}
        adjustment={period.reconciliationAdjustmentMinorUnits ?? period.cogsAdjustmentMinorUnits}
        effective={period.currentEffectiveCogsMinorUnits ?? period.effectiveRealizedCogsMinorUnits ?? period.effectiveCogsMinorUnits}
        currency={currency}
        labels={{ original: "Original realized COGS", adjustment: "Later adjustments", effective: "Current effective COGS", ariaLabel: "Reporting-period COGS projection" }}
      />
      <p className="accountant-review-history-note">Current projection including later corrections. The original historical snapshot remains preserved.</p>
    </RecordCard>
  );
}

function Summary({ preview, visibleCount, summary: suppliedSummary }) {
  const summary = suppliedSummary || preview.summary || {};
  const currency = summary.currency || preview.currency || preview.items?.find((item) => item.currency)?.currency || "USD";
  return (
    <div className="accountant-review-summary" role="region" aria-label="Accountant Review summary">
      <MetricCard label="Prior-period adjustments" value={safeCount(summary.priorPeriodAdjustments ?? summary.priorPeriodCount)} helper="Original and correction periods differ" tone={safeCount(summary.priorPeriodAdjustments ?? summary.priorPeriodCount) ? "warning" : "neutral"} />
      <MetricCard label="Current-period adjustments" value={safeCount(summary.currentPeriodAdjustments ?? summary.currentPeriodCount)} helper="Same reporting period" />
      <MetricCard label="Net COGS adjustment" value={moneyLabel(summary.netCogsAdjustmentMinorUnits, currency, { signed: true })} helper="Append-only reconciliation delta" />
      <MetricCard label="Sales affected" value={safeCount(summary.salesAffected)} helper="Historical Sales remain unchanged" />
      <MetricCard label="Lots affected" value={safeCount(summary.lotsAffected)} helper="Exact-cost provenance retained" />
      <MetricCard label="Prior-year items" value={safeCount(summary.priorYearItems)} helper="High-attention review, not a tax conclusion" tone={safeCount(summary.priorYearItems) ? "warning" : "neutral"} />
      <MetricCard label="Items needing review" value={safeCount(summary.itemsNeedingReview ?? summary.reviewItems)} helper="Operational attention only" tone={safeCount(summary.itemsNeedingReview ?? summary.reviewItems) ? "warning" : "neutral"} />
      <MetricCard label="Items shown" value={`${visibleCount} of ${safeCount(preview.unfilteredItemCount ?? summary.reviewItemCount ?? summary.totalItems ?? preview.items?.length)}`} helper="Filters are local to this view" />
      {summary.mixedCurrencies ? <MetricCard label="Combined currency total" value="Not combined" helper="Exact totals remain separated by currency" tone="warning" /> : null}
      {(summary.mixedCurrencies ? summary.currencySummaries || [] : []).map((entry) => (
        <MetricCard
          key={entry.currency}
          label={`${entry.currency} net COGS adjustment`}
          value={moneyLabel(entry.netCogsAdjustmentMinorUnits, entry.currency, { signed: true })}
          helper={`${safeCount(entry.salesAffected)} affected Sale${safeCount(entry.salesAffected) === 1 ? "" : "s"}`}
        />
      ))}
    </div>
  );
}

export default function AccountantReviewPanel({ preview = {}, onFiltersChange }) {
  const allItems = Array.isArray(preview.items) ? preview.items : [];
  const saleReviews = Array.isArray(preview.saleReviews) ? preview.saleReviews : [];
  const lotReviews = Array.isArray(preview.lotReviews) ? preview.lotReviews : [];
  const periodSummaries = Array.isArray(preview.periodSummaries)
    ? preview.periodSummaries
    : ["months", "quarters", "years"].flatMap((key) => Array.isArray(preview.periodSummaries?.[key]) ? preview.periodSummaries[key] : []);
  const allFilterableRecords = useMemo(() => [...allItems, ...saleReviews, ...lotReviews, ...periodSummaries], [allItems, saleReviews, lotReviews, periodSummaries]);
  const [filters, setFilters] = useState(() => normalizedFilterSeed(preview.activeFilters));

  function changeFilters(next) {
    setFilters(next);
    onFiltersChange?.(Object.freeze({ ...next }));
  }

  const filtersActive = FILTER_KEYS.some((key) => filters[key]);
  const previewCurrency = preview.currency || allItems.find((item) => item.currency)?.currency || saleReviews.find((item) => item.currency)?.currency || "USD";
  const visibleItems = useMemo(() => allItems.filter((item) => recordMatchesFilters(item, filters)), [allItems, filters]);
  const visibleSaleIds = useMemo(() => new Set(visibleItems.map((item) => item.saleId).filter(Boolean)), [visibleItems]);
  const visibleLotIds = useMemo(() => new Set(visibleItems.map((item) => item.inventoryLotId || item.lotId).filter(Boolean)), [visibleItems]);
  const visibleSales = useMemo(() => saleReviews.filter((item) => !filtersActive || visibleSaleIds.has(item.saleId)), [saleReviews, filtersActive, visibleSaleIds]);
  const visibleLots = useMemo(() => lotReviews.filter((item) => !filtersActive || visibleLotIds.has(item.inventoryLotId || item.lotId)), [lotReviews, filtersActive, visibleLotIds]);
  const visiblePeriods = useMemo(() => periodSummaries.filter((item) => periodMatchesFilters(item, filters)), [periodSummaries, filters]);
  const visibleSummary = useMemo(() => summaryForVisibleItems(visibleItems, visibleSales, visibleLots), [visibleItems, visibleSales, visibleLots]);
  const groupedItems = useMemo(() => {
    const groups = new Map();
    visibleItems.forEach((item) => {
      const key = reviewGroupFor(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const order = ["NEEDS_REVIEW", "PRIOR_YEAR", "PRIOR_QUARTER", "PRIOR_MONTH", "CURRENT_MONTH"];
    return [...groups.entries()].sort((left, right) => {
      const leftRank = order.indexOf(left[0]);
      const rightRank = order.indexOf(right[0]);
      return (leftRank < 0 ? order.length : leftRank) - (rightRank < 0 ? order.length : rightRank);
    });
  }, [visibleItems]);
  return (
    <section
      className="accountant-review"
      aria-label="Accountant Review"
      data-accountant-review="read-only"
      data-accounting-mutation="false"
      data-filing-status="FILING_STATUS_UNKNOWN"
    >
      <SectionHeader
        eyebrow="Read-only accounting review"
        title="Accountant Review"
        description="Review current projections from append-only reconciliation history. No journal, tax filing, or accounting mutation occurs here."
      />
      <div className="accountant-review-boundary" role="note">
        <StatusBadge tone="neutral">Read only</StatusBadge>
        <p>Original Transaction Period != Correction Period · Original COGS != Reconciliation Adjustment · Historical Record != Current Effective Projection · Accountant Review != Accounting Mutation</p>
        <small>These operational review flags are not tax or legal conclusions. Filing status remains unknown. Sale dates use their recorded calendar date; reconciliation timestamps use the UTC calendar date because no authoritative owner-business time zone is configured.</small>
      </div>

      <Summary preview={preview} visibleCount={visibleItems.length} summary={filtersActive ? visibleSummary : preview.summary} />

      <fieldset className="accountant-review-filters">
        <legend>Filter Accountant Review</legend>
        {FILTER_KEYS.map((key) => (
          <label key={key}>
            <span>{FILTER_LABELS[key]}</span>
            <select value={filters[key]} onChange={(event) => changeFilters({ ...filters, [key]: event.target.value })}>
              <option value="">All {FILTER_LABELS[key].toLowerCase()} values</option>
              {optionsFor(key, preview, allFilterableRecords).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ))}
        <div className="accountant-review-filter-actions">
          <span>{filtersActive ? `${visibleItems.length} review item${visibleItems.length === 1 ? "" : "s"} shown` : "Showing all review items"}</span>
          <QuietButton onClick={() => changeFilters({ ...EMPTY_FILTERS })} disabled={!filtersActive}>Clear Filters</QuietButton>
        </div>
      </fieldset>

      <section aria-label="Accounting review items">
        <SectionHeader title="Review Items" description="Original records remain distinct from later corrections and current effective projections." />
        {visibleItems.length ? <div className="accountant-review-groups">{groupedItems.map(([group, items]) => <section key={group} className="accountant-review-group" aria-label={groupLabel(group)}><h3>{groupLabel(group)}</h3><div className="accountant-review-grid">{items.map((item, index) => <ReviewItemCard key={item.id || item.reviewItemId || `${item.saleId || "review"}-${index}`} item={item} nested />)}</div></section>)}</div> : <EmptyState title={filtersActive ? "No review items match these filters" : "No accounting review items"}>{filtersActive ? "Clear or change a filter to review another period." : "No append-only reconciliation currently requires accountant review."}</EmptyState>}
      </section>

      {visibleSales.length ? <section aria-label="Sale-level accounting review"><SectionHeader title="Sales Affected" description="Original Sale values and current effective projections are shown separately." /><div className="accountant-review-grid">{visibleSales.map((sale, index) => <SaleReviewCard key={sale.id || sale.saleId || `sale-review-${index}`} sale={sale} />)}</div></section> : null}
      {visibleLots.length ? <section aria-label="Lot-level accounting review"><SectionHeader title="Lots Affected" description="Exact realized and remaining Inventory effects remain visibly conserved." /><div className="accountant-review-grid">{visibleLots.map((lot, index) => <LotReviewCard key={lot.id || lot.lotId || `lot-review-${index}`} lot={lot} />)}</div></section> : null}
      {!filtersActive && visiblePeriods.length ? <section aria-label="Reporting period summaries"><SectionHeader title="Period Summaries" description="Current projections include later corrections without replacing original historical snapshots." /><div className="accountant-review-grid">{visiblePeriods.map((period, index) => <PeriodSummaryCard key={period.id || `${period.granularity || "period"}-${period.periodKey}-${period.currency || "currency"}-${index}`} period={period} defaultCurrency={previewCurrency} />)}</div></section> : null}
      {filtersActive ? <p className="accountant-review-history-note" role="note">Summary totals above include only the review items shown. Clear filters to view complete month, quarter, and year projections.</p> : null}

      <aside className="accountant-review-guidance">
        <strong>Review guidance</strong>
        <p>A prior-period adjustment may warrant accountant review. Code 3 does not infer filing status or provide tax treatment from this preview.</p>
      </aside>
    </section>
  );
}
