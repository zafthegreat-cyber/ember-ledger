// Editable negotiation policy, not a product valuation or a live market feed.
export const BUY_OFFER_PRODUCT_TYPES = Object.freeze([
  { value: "sealed", label: "Sealed product" },
  { value: "single", label: "Single card" },
  { value: "graded", label: "Graded card" },
  { value: "lot", label: "Collection or lot" },
  { value: "supplies", label: "Supplies" },
]);

export const BUY_OFFER_AVAILABILITY = Object.freeze([
  { value: "unknown", label: "Not sure" },
  { value: "retail", label: "Available to buy at MSRP" },
  { value: "plentiful", label: "Easy to find" },
  { value: "limited", label: "Limited availability" },
  { value: "scarce", label: "Hard to find" },
]);

export const BUY_OFFER_DEMAND = Object.freeze([
  { value: "unknown", label: "Not sure" },
  { value: "low", label: "Low demand" },
  { value: "steady", label: "Steady demand" },
  { value: "high", label: "High demand" },
]);

const PRODUCT_POINTS = { sealed: 5, single: 0, graded: -5, lot: -15, supplies: -10 };
const AVAILABILITY_POINTS = { retail: -5, plentiful: -5, limited: 0, scarce: 3, unknown: -5 };
const DEMAND_POINTS = { low: -10, steady: 0, high: 5, unknown: -5 };
const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const DECIMAL = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;
const RATE_DENOMINATOR = 10_000n;

export function defaultBuyOffer(mode = "resale") {
  const selectedMode = mode === "collection" ? "collection" : "resale";
  return {
    title: "", mode: selectedMode, productType: "sealed", marketPrice: "", msrp: "", askingPrice: "",
    availability: "unknown", demand: "unknown", basePercent: selectedMode === "collection" ? "85" : "70",
    acquisitionCosts: "0", sellingFeePercent: "0", sellingCosts: "0", minimumProfit: "0",
  };
}

function parseDecimal(value, field, label, errors, { optional = false, positive = false, percent = false } = {}) {
  const empty = value === undefined || value === null || (typeof value === "string" && !value.trim());
  if (empty && optional) return null;
  // Length is bounded before parsing to avoid accepting enormous numeric strings.
  const text = typeof value === "string" ? value.trim() : "";
  const match = text.length <= 18 && DECIMAL.exec(text);
  if (!match) {
    errors[field] = `${label} must be a ${percent ? "percentage" : "USD amount"} with at most two decimal places.`;
    return null;
  }
  const units = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
  if (units > (percent ? 10_000n : MAX_MINOR)) {
    errors[field] = percent ? `${label} must be between 0 and 100%.` : `${label} is too large to calculate safely.`;
    return null;
  }
  if (positive && units === 0n) {
    errors[field] = `${label} must be greater than zero.`;
    return null;
  }
  return units;
}

function selectedOption(options, value, field, label, errors) {
  const option = options.find((candidate) => candidate.value === value);
  if (!option) errors[field] = `Choose a supported ${label}.`;
  return option;
}

function floorRate(amount, rate) { return amount * rate / RATE_DENOMINATOR; }
function ceilingRate(amount, rate) { return (amount * rate + RATE_DENOMINATOR - 1n) / RATE_DENOMINATOR; }
function min(...values) { return values.reduce((smallest, value) => value < smallest ? value : smallest); }

/** Local USD negotiation estimate. All money arithmetic stays in integer cents. */
export function calculateBuyOffer(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { marketPrice: "Enter the product and a current market price to estimate an offer." } };
  }
  const values = { ...defaultBuyOffer(input.mode), ...input };
  const errors = {};
  const mode = values.mode;
  if (mode !== "resale" && mode !== "collection") errors.mode = "Choose resale or personal collection.";
  const product = selectedOption(BUY_OFFER_PRODUCT_TYPES, values.productType, "productType", "product type", errors);
  const availability = selectedOption(BUY_OFFER_AVAILABILITY, values.availability, "availability", "availability", errors);
  const demand = selectedOption(BUY_OFFER_DEMAND, values.demand, "demand", "demand level", errors);
  const hasMsrp = values.productType === "sealed" || values.productType === "supplies";
  if (values.availability === "retail" && !hasMsrp) errors.availability = "Retail / MSRP availability applies to sealed products and supplies.";

  const market = parseDecimal(values.marketPrice, "marketPrice", "Market price", errors, { positive: true });
  const msrp = hasMsrp ? parseDecimal(values.msrp, "msrp", "MSRP", errors, { optional: values.availability !== "retail", positive: true }) : null;
  const asking = parseDecimal(values.askingPrice, "askingPrice", "Asking price", errors, { optional: true, positive: true });
  const baseRate = parseDecimal(values.basePercent, "basePercent", "Base offer", errors, { percent: true });
  const acquisition = parseDecimal(values.acquisitionCosts, "acquisitionCosts", "Acquisition costs", errors);
  // Hidden resale fields may retain draft values, but never affect a collection offer.
  const feeRate = mode === "resale" ? parseDecimal(values.sellingFeePercent, "sellingFeePercent", "Selling fee", errors, { percent: true }) : 0n;
  const selling = mode === "resale" ? parseDecimal(values.sellingCosts, "sellingCosts", "Selling costs", errors) : 0n;
  const minimumProfit = mode === "resale" ? parseDecimal(values.minimumProfit, "minimumProfit", "Minimum profit", errors) : 0n;
  if (Object.keys(errors).length) return { valid: false, errors };

  const fees = ceilingRate(market, feeRate);
  const totalRequired = acquisition + selling + minimumProfit + fees;
  if (totalRequired > MAX_MINOR) {
    return { valid: false, errors: { acquisitionCosts: "Combined costs, fees and minimum profit are too large to calculate safely." } };
  }
  const factors = [
    { key: "base", label: "Your base offer", points: Number(baseRate) / 100 },
    { key: "product", label: product.label, points: PRODUCT_POINTS[values.productType] },
    { key: "availability", label: `Availability: ${availability.label}`, points: AVAILABILITY_POINTS[values.availability] },
    { key: "demand", label: `Demand: ${demand.label}`, points: DEMAND_POINTS[values.demand] },
  ];
  const rawRate = baseRate + BigInt((factors[1].points + factors[2].points + factors[3].points) * 100);
  const modeMaxRate = mode === "resale" ? 9_500n : 10_000n;
  const targetRate = rawRate < 1_000n ? 1_000n : min(rawRate, modeMaxRate);
  const reference = values.availability === "retail" ? min(market, msrp) : market;
  const rawCeiling = (mode === "resale" ? market - totalRequired : reference - acquisition);
  const financialCeiling = rawCeiling < 0n ? 0n : rawCeiling;
  const policyCeiling = floorRate(reference, min(targetRate + 500n, 10_000n));
  const maximum = min(financialCeiling, policyCeiling, ...(asking === null ? [] : [asking]));
  const target = min(floorRate(reference, targetRate), maximum);
  const opening = floorRate(target, 9_500n);
  const blocked = target === 0n;
  const warnings = ["These editable percentages are negotiation assumptions, not verified product values. Check recent sold prices, condition and authenticity before making an offer."];
  if (values.availability === "unknown") warnings.push("Availability is unknown; the estimate applies a cautious 5 percentage point reduction.");
  if (values.demand === "unknown") warnings.push("Demand is unknown; the estimate applies a cautious 5 percentage point reduction.");
  if (targetRate !== rawRate) warnings.push(`The adjusted target is limited to ${mode === "resale" ? "10–95%" : "10–100%"} before costs and other caps.`);
  if (values.availability === "retail") warnings.push("Because this product can be bought at MSRP, the reference is the lower of market price and MSRP.");
  else if (msrp !== null) warnings.push("MSRP is context only because retail availability is not selected; this estimate uses market price.");
  if (mode === "resale" && feeRate === 0n && selling === 0n && acquisition === 0n) warnings.push("No fee or cost allowance is entered. Add expected selling fees, selling costs and acquisition costs before relying on this resale estimate.");
  const blockedReason = blocked ? "No positive target offer fits these inputs. Review the price, costs and profit requirement." : "";
  if (blocked) warnings.push(blockedReason);
  const limits = [
    { label: mode === "resale" ? "After costs and minimum profit" : "After acquisition costs", amountMinor: Number(financialCeiling) },
    { label: "Negotiation maximum (adjusted target + 5 points, capped at 100%)", amountMinor: Number(policyCeiling) },
    ...(asking === null ? [] : [{ label: "Seller asking price", amountMinor: Number(asking) }]),
  ];
  return {
    valid: true, errors: {}, mode, currency: "USD", blocked, blockedReason,
    openingMinor: Number(opening), targetMinor: Number(target), maximumMinor: Number(maximum),
    marketMinor: Number(market), referenceMinor: Number(reference), msrpMinor: msrp === null ? null : Number(msrp),
    askingMinor: asking === null ? null : Number(asking), marketPercentBps: Number(target * RATE_DENOMINATOR / market),
    askingPercentBps: asking === null ? null : Number(target * RATE_DENOMINATOR / asking),
    adjustedPercent: Number(targetRate) / 100, factors, limits, warnings,
    projectedProfitMinor: mode === "resale" ? Number(market - target - fees - selling - acquisition) : null,
  };
}
