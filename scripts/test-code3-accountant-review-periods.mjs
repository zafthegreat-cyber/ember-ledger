import assert from "node:assert/strict";
import {
  ACCOUNTANT_REVIEW_PERIOD_FLAGS,
  ACCOUNTANT_REVIEW_SEVERITIES,
  AccountantReviewPeriodError,
  compareReportingPeriods,
  reportingPeriodFor,
} from "../src/features/purchaseReceiving/accountantReview/index.js";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (actual, message) => { assert.ok(actual, message); assertions += 1; };

{
  const leapDay = reportingPeriodFor("2024-02-29T23:59:59.000Z");
  equal(leapDay.dayKey, "2024-02-29");
  equal(leapDay.monthKey, "2024-02");
  equal(leapDay.quarterKey, "2024-Q1");
  equal(leapDay.yearKey, "2024");
  equal(leapDay.month, 2);
  equal(leapDay.quarter, 1);
  equal(leapDay.year, 2024);
  ok(Object.isFrozen(leapDay));
}

{
  const sameDay = compareReportingPeriods("2026-03-10", "2026-03-10T20:00:00.000Z");
  equal(sameDay.sameDay, true);
  equal(sameDay.sameMonth, true);
  equal(sameDay.sameQuarter, true);
  equal(sameDay.sameYear, true);
  equal(sameDay.priorPeriodRelevant, false);
  equal(sameDay.primaryFlag, ACCOUNTANT_REVIEW_PERIOD_FLAGS.NO_PRIOR_PERIOD_ISSUE);
  equal(sameDay.severity, ACCOUNTANT_REVIEW_SEVERITIES.INFO);
}

{
  const sameMonth = compareReportingPeriods("2026-03-01", "2026-03-31T23:59:59.000Z");
  equal(sameMonth.sameDay, false);
  equal(sameMonth.sameMonth, true);
  equal(sameMonth.primaryFlag, ACCOUNTANT_REVIEW_PERIOD_FLAGS.SAME_MONTH_ADJUSTMENT);
  equal(sameMonth.priorPeriodRelevant, false);
}

{
  const nextMonth = compareReportingPeriods("2026-04-30T23:59:59.000Z", "2026-05-01T00:00:00.000Z");
  equal(nextMonth.sameMonth, false);
  equal(nextMonth.sameQuarter, true);
  equal(nextMonth.primaryFlag, ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_MONTH_REVIEW);
  ok(nextMonth.flags.includes(ACCOUNTANT_REVIEW_PERIOD_FLAGS.SAME_QUARTER_ADJUSTMENT));
  ok(nextMonth.flags.includes(ACCOUNTANT_REVIEW_PERIOD_FLAGS.ACCOUNTANT_REVIEW_RECOMMENDED));
  equal(nextMonth.severity, ACCOUNTANT_REVIEW_SEVERITIES.REVIEW);
}

{
  const nextQuarter = compareReportingPeriods("2026-03-31T23:59:59.000Z", "2026-04-01T00:00:00.000Z");
  equal(nextQuarter.sameQuarter, false);
  equal(nextQuarter.sameYear, true);
  equal(nextQuarter.primaryFlag, ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_QUARTER_REVIEW);
  equal(nextQuarter.severity, ACCOUNTANT_REVIEW_SEVERITIES.REVIEW);
}

{
  const nextYear = compareReportingPeriods("2025-12-31T23:59:59.000Z", "2026-01-01T00:00:00.000Z");
  equal(nextYear.sameYear, false);
  equal(nextYear.primaryFlag, ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_YEAR_REVIEW);
  equal(nextYear.severity, ACCOUNTANT_REVIEW_SEVERITIES.HIGH_ATTENTION);
  equal(nextYear.original.quarterKey, "2025-Q4");
  equal(nextYear.correction.quarterKey, "2026-Q1");
}

{
  const offset = reportingPeriodFor("2026-04-01T00:30:00+01:00");
  equal(offset.dayKey, "2026-03-31", "periods follow canonical UTC normalization");
}

assert.throws(() => reportingPeriodFor("2026-02-30"), (error) => error instanceof AccountantReviewPeriodError && error.code === "INVALID_REPORTING_DATE"); assertions += 1;
assert.throws(() => reportingPeriodFor("2026-02-30T12:00:00.000Z"), (error) => error instanceof AccountantReviewPeriodError && error.code === "INVALID_REPORTING_DATE"); assertions += 1;
assert.throws(() => reportingPeriodFor("2026-03-10T12:00:00"), (error) => error instanceof AccountantReviewPeriodError && error.code === "INVALID_REPORTING_DATE"); assertions += 1;
assert.throws(() => reportingPeriodFor("03/10/2026"), (error) => error.code === "INVALID_REPORTING_DATE"); assertions += 1;
assert.throws(() => compareReportingPeriods("2026-04-02", "2026-04-01"), (error) => error.code === "CORRECTION_PRECEDES_TRANSACTION"); assertions += 1;

console.log(`Code 3 Accountant Review periods: ${assertions} assertions passed.`);
