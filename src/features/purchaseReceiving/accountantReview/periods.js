import {
  ACCOUNTANT_REVIEW_PERIOD_FLAGS,
  ACCOUNTANT_REVIEW_SEVERITIES,
} from "./constants.js";

export class AccountantReviewPeriodError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountantReviewPeriodError";
    this.code = code;
    this.details = details;
  }
}

function parseTimestamp(value, field) {
  if (typeof value !== "string" || !value.trim() || value.length > 64) {
    throw new AccountantReviewPeriodError("INVALID_REPORTING_DATE", `${field} must be a bounded ISO date or timestamp.`, { field });
  }
  const text = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text);
  if (!dateOnly && !timestamp) {
    throw new AccountantReviewPeriodError("INVALID_REPORTING_DATE", `${field} must use the app's ISO calendar convention.`, { field });
  }
  const expectedDate = text.slice(0, 10);
  const calendarDate = new Date(`${expectedDate}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== expectedDate) {
    throw new AccountantReviewPeriodError("INVALID_REPORTING_DATE", `${field} must be a real calendar date.`, { field });
  }
  const parsed = new Date(dateOnly ? `${text}T00:00:00.000Z` : text);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AccountantReviewPeriodError("INVALID_REPORTING_DATE", `${field} must be a valid calendar date.`, { field });
  }
  return parsed;
}

function twoDigits(value) {
  return String(value).padStart(2, "0");
}

/** Calendar periods use the UTC-normalized instant already used by canonical timestamps. */
export function reportingPeriodFor(value, field = "date") {
  const parsed = parseTimestamp(value, field);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  const quarter = Math.floor((month - 1) / 3) + 1;
  const yearKey = String(year);
  const monthKey = `${yearKey}-${twoDigits(month)}`;
  const quarterKey = `${yearKey}-Q${quarter}`;
  const dayKey = `${monthKey}-${twoDigits(day)}`;
  return Object.freeze({
    instant: parsed.toISOString(),
    dayKey,
    month,
    monthKey,
    quarter,
    quarterKey,
    year,
    yearKey,
  });
}

/**
 * Reporting classification is descriptive only. It never infers filing status,
 * tax treatment, or whether a return should be amended.
 */
export function compareReportingPeriods(originalValue, correctionValue) {
  const original = reportingPeriodFor(originalValue, "original transaction date");
  const correction = reportingPeriodFor(correctionValue, "correction date");
  if (Date.parse(correction.instant) < Date.parse(original.instant)) {
    throw new AccountantReviewPeriodError(
      "CORRECTION_PRECEDES_TRANSACTION",
      "A correction date cannot precede its original transaction date.",
    );
  }
  const sameDay = original.dayKey === correction.dayKey;
  const sameMonth = original.monthKey === correction.monthKey;
  const sameQuarter = original.quarterKey === correction.quarterKey;
  const sameYear = original.yearKey === correction.yearKey;
  let primaryFlag = ACCOUNTANT_REVIEW_PERIOD_FLAGS.NO_PRIOR_PERIOD_ISSUE;
  let severity = ACCOUNTANT_REVIEW_SEVERITIES.INFO;
  if (!sameYear) {
    primaryFlag = ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_YEAR_REVIEW;
    severity = ACCOUNTANT_REVIEW_SEVERITIES.HIGH_ATTENTION;
  } else if (!sameQuarter) {
    primaryFlag = ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_QUARTER_REVIEW;
    severity = ACCOUNTANT_REVIEW_SEVERITIES.REVIEW;
  } else if (!sameMonth) {
    primaryFlag = ACCOUNTANT_REVIEW_PERIOD_FLAGS.PRIOR_MONTH_REVIEW;
    severity = ACCOUNTANT_REVIEW_SEVERITIES.REVIEW;
  } else if (!sameDay) {
    primaryFlag = ACCOUNTANT_REVIEW_PERIOD_FLAGS.SAME_MONTH_ADJUSTMENT;
  }
  const priorPeriodRelevant = !sameMonth;
  const flags = [primaryFlag];
  if (sameYear && sameQuarter && !sameMonth) flags.push(ACCOUNTANT_REVIEW_PERIOD_FLAGS.SAME_QUARTER_ADJUSTMENT);
  if (priorPeriodRelevant) flags.push(ACCOUNTANT_REVIEW_PERIOD_FLAGS.ACCOUNTANT_REVIEW_RECOMMENDED);
  return Object.freeze({
    original,
    correction,
    sameDay,
    sameMonth,
    sameQuarter,
    sameYear,
    priorPeriodRelevant,
    primaryFlag,
    flags: Object.freeze(flags),
    severity,
  });
}
