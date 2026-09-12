const fixture = (id, scenario, expected = {}) => Object.freeze({
  id,
  scenario,
  synthetic: true,
  sourceReference: `accountant-review.${id}.test`,
  expected: Object.freeze(expected),
});

/** Reserved synthetic QA descriptors. They are never canonical business data. */
export const PHASE2CE_QA_FIXTURES = Object.freeze([
  fixture("same-day-correction", "SAME_DAY", { flag: "NO_PRIOR_PERIOD_ISSUE" }),
  fixture("same-month-correction", "SAME_MONTH", { flag: "SAME_MONTH_ADJUSTMENT" }),
  fixture("next-month-correction", "NEXT_MONTH", { flag: "PRIOR_MONTH_REVIEW" }),
  fixture("next-quarter-correction", "NEXT_QUARTER", { flag: "PRIOR_QUARTER_REVIEW" }),
  fixture("next-year-correction", "NEXT_YEAR", { flag: "PRIOR_YEAR_REVIEW" }),
  fixture("positive-cogs-adjustment", "POSITIVE_COGS", { exactMinorUnits: true }),
  fixture("negative-cogs-adjustment", "NEGATIVE_COGS", { exactMinorUnits: true }),
  fixture("partial-sale-adjustment", "PARTIAL_SALE", { costConserved: true }),
  fixture("reconciliation-reversal", "REVERSAL_CHAIN", { appendOnly: true }),
  fixture("two-reconciliations-one-sale", "MULTIPLE_RECONCILIATIONS", { countedOnce: true }),
  fixture("refund-without-return", "REFUND_ONLY", { inventoryMutation: false }),
  fixture("refund-and-return", "REFUND_AND_RETURN", { distinguished: true }),
  fixture("partial-refund", "PARTIAL_REFUND", { distinguished: true }),
  fixture("prior-year-sale-current-correction", "PRIOR_YEAR_SALE", { severity: "HIGH_ATTENTION" }),
  fixture("quarter-boundary-correction", "QUARTER_BOUNDARY", { priorQuarter: true }),
  fixture("year-boundary-correction", "YEAR_BOUNDARY", { priorYear: true }),
  fixture("month-end-correction", "MONTH_END", { priorMonth: true }),
  fixture("multiple-sales-affected", "MULTIPLE_SALES", { uniqueSaleSummary: true }),
  fixture("multiple-lots", "MULTIPLE_LOTS", { uniqueLotSummary: true }),
  fixture("net-zero-reconciliations", "NET_ZERO", { netAdjustmentMinorUnits: 0 }),
  fixture("current-period-only", "CURRENT_PERIOD", { severity: "INFO" }),
  fixture("prior-period-attention", "PRIOR_PERIOD_ATTENTION", { recommended: true }),
  fixture("impossible-reconciliation-blocked", "UPSTREAM_BLOCKED", { derived: false }),
  fixture("secret-bearing-input", "SECRET_REJECTION", { rejected: true }),
  fixture("exact-money-large-value", "LARGE_EXACT_MONEY", { exactMinorUnits: true }),
  fixture("leap-day-boundary", "LEAP_DAY", { validCalendarDate: true }),
  fixture("prototype-pollution", "PROTOTYPE_POLLUTION", { rejected: true }),
]);

export const PHASE2CE_FIXTURE_COUNT = PHASE2CE_QA_FIXTURES.length;
