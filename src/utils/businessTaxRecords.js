import {
  buildInventoryValuationExportRows,
  summarizeInventoryValuation,
} from "./inventoryValuationUtils.js";

const NO_VENDOR_LABEL = "No vendor";
const NO_VEHICLE_LABEL = "No vehicle";
const UNASSIGNED_PURCHASER_LABEL = "Unassigned purchaser";

const VENDOR_RULES = [
  { label: "Walmart", pattern: /^wal\s*-?\s*mart\b|^walmart\b/ },
  { label: "Target", pattern: /^target\b/ },
  { label: "GameStop", pattern: /^game\s*stop\b|^gamestop\b/ },
  { label: "Best Buy", pattern: /^best\s*buy\b/ },
  { label: "Costco", pattern: /^costco\b/ },
  { label: "Sam's Club", pattern: /^sam'?s\s+club\b/ },
  { label: "Barnes & Noble", pattern: /^barnes\s*(and|&)\s*noble\b/ },
  { label: "Pokemon Center", pattern: /^pokemon\s+center\b/ },
  { label: "TCGplayer", pattern: /^tcg\s*player\b|^tcgplayer\b/ },
  { label: "eBay", pattern: /^e\s*-?\s*bay\b|^ebay\b/ },
  { label: "Amazon", pattern: /^amazon\b/ },
  { label: "USPS", pattern: /^usps\b|^united\s+states\s+postal\b/ },
  { label: "UPS", pattern: /^ups\b/ },
  { label: "FedEx", pattern: /^fed\s*ex\b|^fedex\b/ },
];

function toNumber(value, fallback = 0) {
  const cleaned = typeof value === "string" ? value.replace(/[$,%\s,]/g, "") : value;
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function keyForLabel(label = "") {
  return cleanText(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unassigned";
}

function titleCase(value = "") {
  const cleaned = cleanText(value);
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((part) => {
      if (/^(tcg|usps|ups)$/i.test(part)) return part.toUpperCase();
      if (/^ebay$/i.test(part)) return "eBay";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function normalizeBusinessVendor(value = "") {
  const raw = cleanText(value);
  if (!raw) return { key: "__missing_vendor__", label: NO_VENDOR_LABEL, cleaned: "" };
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\w\s&'-]/g, " ")
    .replace(/\b(store|st|location|loc|number|no)\.?\s*#?\s*\d+\b/gi, " ")
    .replace(/#\s*\d+\b/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/\bsuper\s*center\b|\bsupercenter\b|\bneighborhood\s+market\b|\bmarketplace\b|\bstore\b|\blocation\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const rule = VENDOR_RULES.find((entry) => entry.pattern.test(cleaned));
  const label = rule?.label || titleCase(cleaned || raw) || NO_VENDOR_LABEL;
  return { key: keyForLabel(label), label, cleaned };
}

export function recordDateValue(record = {}) {
  return record.date || record.purchaseDate || record.purchase_date || record.saleDate || record.sale_date || record.soldAt || record.sold_at || String(record.createdAt || record.created_at || "").slice(0, 10) || "";
}

export function recordYear(record = {}) {
  const value = recordDateValue(record);
  if (!value) return "";
  const date = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 4) : String(date.getFullYear());
}

export function itemPurchaserNameForTax(item = {}) {
  return cleanText(item.purchaserName || item.purchaser_name || item.buyer || "") || UNASSIGNED_PURCHASER_LABEL;
}

export function groupExpensesByVendor(expenses = []) {
  const groups = new Map();
  expenses.forEach((expense) => {
    const vendor = normalizeBusinessVendor(expense.vendor || expense.store || expense.merchant || "");
    if (!groups.has(vendor.key)) {
      groups.set(vendor.key, {
        key: vendor.key,
        vendorName: vendor.label,
        originalVendors: new Set(),
        expenses: [],
        total: 0,
        count: 0,
        mostRecentDate: "",
        receiptCount: 0,
        missingReceiptCount: 0,
        categoryTotals: {},
        purchaserTotals: {},
      });
    }
    const group = groups.get(vendor.key);
    const amount = toNumber(expense.amount);
    const category = cleanText(expense.category || "Uncategorized");
    const buyer = cleanText(expense.buyer || expense.purchaserName || expense.purchaser_name || "") || UNASSIGNED_PURCHASER_LABEL;
    const date = recordDateValue(expense);
    const hasReceipt = expenseHasReceipt(expense);
    group.originalVendors.add(expense.vendor || expense.store || expense.merchant || NO_VENDOR_LABEL);
    group.expenses.push(expense);
    group.total += amount;
    group.count += 1;
    group.receiptCount += hasReceipt ? 1 : 0;
    group.missingReceiptCount += hasReceipt ? 0 : 1;
    group.categoryTotals[category] = (group.categoryTotals[category] || 0) + amount;
    group.purchaserTotals[buyer] = (group.purchaserTotals[buyer] || 0) + amount;
    if (!group.mostRecentDate || (date && date > group.mostRecentDate)) group.mostRecentDate = date;
  });
  return [...groups.values()].map((group) => ({
    ...group,
    originalVendorNames: [...group.originalVendors].sort((a, b) => a.localeCompare(b)),
    expenses: [...group.expenses].sort((a, b) => String(recordDateValue(b)).localeCompare(String(recordDateValue(a)))),
    averageAmount: group.count ? group.total / group.count : 0,
  })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.vendorName.localeCompare(b.vendorName));
}

export function expenseHasReceipt(expense = {}) {
  return Boolean(
    expense.receiptImage ||
    expense.receiptImageUrl ||
    expense.receiptPhoto ||
    expense.receipt_photo ||
    expense.receipt_image ||
    expense.receipt_url ||
    expense.photoUrl ||
    expense.imageUrl
  );
}

export function normalizeExpenseCategory(value = "") {
  const key = cleanText(value).toLowerCase();
  if (/inventory|product|sealed|card|pokemon|tcg/.test(key)) return "Inventory/Product Cost";
  if (/ship|postage|usps|ups|fedex/.test(key)) return "Shipping";
  if (/pack|label|box|sleeve|mailer|tape/.test(key)) return "Packaging Supplies";
  if (/fee|platform|marketplace|seller/.test(key)) return "Platform Fees";
  if (/mileage|gas|fuel|vehicle|parking/.test(key)) return "Mileage/Vehicle";
  if (/event|giveaway|show/.test(key)) return "Events/Giveaways";
  if (/software|subscription|domain|app/.test(key)) return "Software/Subscriptions";
  if (/supply|supplies|equipment|storage/.test(key)) return "Supplies";
  return value || "Supplies";
}

export function normalizeMileagePurpose(value = "") {
  const key = cleanText(value).toLowerCase();
  if (/ship|drop.?off|post office|usps|ups|fedex|mail/.test(key)) return "Shipping/drop-off";
  if (/restock|check|scout|signal|drop|radar/.test(key)) return "Store restock check";
  if (/inventory|store run|target|walmart|gamestop|barnes|best buy|pickup/.test(key)) return "Inventory run";
  if (/event|show|trade night|giveaway|spark|kids/.test(key)) return "Event";
  if (/meet|marketplace|pickup|local sale|handoff/.test(key)) return "Marketplace meetup";
  if (/suppl|packag|box|label|sleeve|tape|mailer/.test(key)) return "Supplies";
  return key ? "Other" : "Uncategorized";
}

export function expenseFromReceiptLine(item = {}, receipt = {}, options = {}) {
  const id = options.id || item.expenseId || item.id || "";
  const amount = toNumber(item.totalCost || item.lineTotal || item.amount || (toNumber(item.quantity, 1) * toNumber(item.unitCost || item.unitPrice)));
  const itemName = cleanText(item.suggestedMatchName || item.itemName || item.productName || item.rawText || "Receipt line");
  const receiptImage = receipt.receiptImageUrl || receipt.imageUrl || receipt.receiptImage || "";
  const receiptId = receipt.id || receipt.receiptId || "";
  return {
    id,
    expenseId: id,
    date: receipt.purchaseDate || String(receipt.purchasedAt || "").slice(0, 10) || recordDateValue(receipt),
    vendor: receipt.storeName || receipt.merchant || receipt.vendor || "",
    category: normalizeExpenseCategory(item.category || itemName),
    subcategory: itemName,
    buyer: item.buyer || item.purchaserName || options.buyer || "",
    amount,
    paymentMethod: receipt.paymentMethod || "",
    linkedItemId: item.createdInventoryItemId || item.linkedItemId || "",
    linkedSaleId: "",
    notes: [item.notes, receiptId ? `Receipt ${receipt.transactionNumber || receiptId}` : "", item.rawText ? `Raw line: ${item.rawText}` : ""].filter(Boolean).join(" | "),
    receiptImage,
    receiptPhoto: receiptImage,
    receiptImageUrl: receiptImage,
    receiptId,
    rawReceiptText: item.rawText || "",
    receiptSplitMode: item.destination || "expense_only",
    receiptTax: receipt.tax || "",
    taxDeductible: Boolean(options.taxDeductible),
    createdAt: receipt.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function groupMileageByVehicle(trips = [], vehicles = [], options = {}) {
  const selectedYear = String(options.year || new Date().getFullYear());
  const vehicleById = new Map(vehicles.map((vehicle) => [String(vehicle.id), vehicle]));
  const groups = new Map();
  trips.forEach((trip) => {
    const vehicle = vehicleById.get(String(trip.vehicleId || trip.vehicle_id || ""));
    const vehicleName = cleanText(trip.vehicleName || trip.vehicle_name || vehicle?.name || "") || NO_VEHICLE_LABEL;
    const key = trip.vehicleId || trip.vehicle_id || vehicle?.id ? `vehicle:${trip.vehicleId || trip.vehicle_id || vehicle?.id}` : `name:${keyForLabel(vehicleName)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        vehicleName,
        vehicleId: trip.vehicleId || trip.vehicle_id || vehicle?.id || "",
        vehicle,
        trips: [],
        tripCount: 0,
        totalMiles: 0,
        ytdMiles: 0,
        businessMiles: 0,
        personalMiles: 0,
        totalVehicleCost: 0,
        totalMileageValue: 0,
        purposeTotals: {},
        lastTripDate: "",
      });
    }
    const group = groups.get(key);
    const date = recordDateValue(trip);
    const miles = toNumber(trip.businessMiles || trip.business_miles || trip.miles);
    const personalMiles = toNumber(trip.personalMiles || trip.personal_miles);
    const purpose = normalizeMileagePurpose(trip.purpose || trip.category || "");
    group.trips.push(trip);
    group.tripCount += 1;
    group.totalMiles += miles;
    group.businessMiles += miles;
    group.personalMiles += personalMiles;
    if (recordYear(trip) === selectedYear) group.ytdMiles += miles;
    group.totalVehicleCost += toNumber(trip.totalVehicleCost || trip.total_vehicle_cost);
    group.totalMileageValue += toNumber(trip.mileageValue || trip.mileage_value);
    group.purposeTotals[purpose] = (group.purposeTotals[purpose] || 0) + miles;
    if (!group.lastTripDate || (date && date > group.lastTripDate)) group.lastTripDate = date;
  });
  return [...groups.values()].map((group) => ({
    ...group,
    topPurposes: Object.entries(group.purposeTotals)
      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0) || a[0].localeCompare(b[0]))
      .map(([purpose, miles]) => ({ purpose, miles })),
    trips: [...group.trips].sort((a, b) => String(recordDateValue(b)).localeCompare(String(recordDateValue(a)))),
  })).sort((a, b) => String(b.lastTripDate).localeCompare(String(a.lastTripDate)) || a.vehicleName.localeCompare(b.vehicleName));
}

// #33-#35: exports can leave people's names and free-text notes out. The
// default keeps them (bookkeeping needs them); the UI offers the switch.
const PRIVATE_SALE_FIELDS = ["buyerName", "buyer_name", "customerName", "customer_name", "buyerEmail", "buyer_email", "buyerPhone", "buyer_phone", "shippingAddress", "shipping_address", "notes", "sellerNotes", "internalNotes"];

export function stripPrivateSaleFields(sale = {}) {
  const copy = { ...sale };
  PRIVATE_SALE_FIELDS.forEach((field) => { if (field in copy) copy[field] = ""; });
  return copy;
}

export function stripPrivateTripFields(trip = {}) {
  return { ...trip, driver: "", notes: "" };
}

export function buildMileageExportRows(vehicleGroups = [], { includePrivateFields = true } = {}) {
  const rows = [];
  vehicleGroups.forEach((group) => {
    rows.push({
      section: "Vehicle summary",
      vehicle: group.vehicleName,
      date: group.lastTripDate || "",
      purpose: "All trips",
      miles: group.totalMiles || 0,
      tripCount: group.tripCount || 0,
      totalVehicleCost: group.totalVehicleCost || 0,
      mileageValue: group.totalMileageValue || 0,
      notes: "Mileage records for review with your tax professional. Code 3 TCG does not provide tax advice.",
    });
    (group.topPurposes || []).forEach((entry) => {
      rows.push({
        section: "Purpose summary",
        vehicle: group.vehicleName,
        date: "",
        purpose: entry.purpose,
        miles: entry.miles,
        tripCount: "",
        totalVehicleCost: "",
        mileageValue: "",
        notes: "",
      });
    });
    (group.trips || []).forEach((trip) => {
      rows.push({
        section: "Trip",
        vehicle: group.vehicleName,
        date: recordDateValue(trip),
        purpose: normalizeMileagePurpose(trip.purpose || trip.category || ""),
        miles: toNumber(trip.businessMiles || trip.business_miles || trip.miles),
        tripCount: 1,
        totalVehicleCost: toNumber(trip.totalVehicleCost || trip.total_vehicle_cost),
        mileageValue: toNumber(trip.mileageValue || trip.mileage_value),
        notes: includePrivateFields
          ? cleanText([trip.purpose, trip.driver, trip.notes].filter(Boolean).join(" | "))
          : cleanText(normalizeMileagePurpose(trip.purpose || trip.category || "")),
      });
    });
  });
  return rows;
}

export const SALES_PLATFORM_OPTIONS = [
  "Whatnot",
  "eBay",
  "TCGplayer",
  "Facebook Marketplace",
  "Instagram",
  "In-person",
  "Local card show/event",
  "Code 3 TCG",
  "Other",
];

// A59 (2026-10-31): sales channel profiles. Typical fee shapes per channel so a
// new sale is pre-filled instead of typed from scratch. These are estimates
// from the channels' published seller fees and are always editable; the exact
// fee is whatever the payout statement says.
export const SALES_CHANNEL_DEFAULTS = {
  "Whatnot": { feePercent: 0.08, processingPercent: 0.029, processingFixed: 0.30, shipsItems: true, note: "Whatnot takes about 8% plus payment processing; shipping labels are bought through the app." },
  "eBay": { feePercent: 0.1325, processingPercent: 0, processingFixed: 0.30, shipsItems: true, note: "eBay's final value fee for trading cards is about 13.25% of the total plus $0.30 per order (managed payments included)." },
  "TCGplayer": { feePercent: 0.1075, processingPercent: 0.025, processingFixed: 0.30, shipsItems: true, note: "TCGplayer charges about 10.75% commission plus 2.5% + $0.30 processing; Direct orders differ." },
  "Facebook Marketplace": { feePercent: 0.05, processingPercent: 0, processingFixed: 0, shipsItems: true, note: "Facebook charges a selling fee on shipped checkout orders; local cash sales have no fee." },
  "Instagram": { feePercent: 0, processingPercent: 0.029, processingFixed: 0.30, shipsItems: true, note: "No platform fee; payment-app processing applies if you invoice." },
  "In-person": { feePercent: 0, processingPercent: 0, processingFixed: 0, shipsItems: false, note: "Cash or card at the table; card readers add their own processing." },
  "Local card show/event": { feePercent: 0, processingPercent: 0, processingFixed: 0, shipsItems: false, note: "Table fees belong in Expenses, not on each sale." },
  "Code 3 TCG": { feePercent: 0, processingPercent: 0, processingFixed: 0, shipsItems: true, note: "No platform fee during beta." },
  "Other": { feePercent: 0, processingPercent: 0, processingFixed: 0, shipsItems: true, note: "" },
};

export function getSalesChannelDefaults(platform = "") {
  return SALES_CHANNEL_DEFAULTS[normalizeSalesPlatform(platform)] || SALES_CHANNEL_DEFAULTS.Other;
}

/** Fee estimate for a channel: {platformFees, paymentProcessingFees, note}. */
export function estimateChannelFees(platform = "", grossSale = 0) {
  const defaults = getSalesChannelDefaults(platform);
  const gross = Math.max(0, toNumber(grossSale, 0));
  const round = (value) => Math.round(value * 100) / 100;
  return {
    platformFees: round(gross * defaults.feePercent + (defaults.processingPercent ? 0 : defaults.processingFixed)),
    paymentProcessingFees: round(defaults.processingPercent ? gross * defaults.processingPercent + defaults.processingFixed : 0),
    note: defaults.note,
    shipsItems: defaults.shipsItems,
  };
}

// A57/A58: shipping and return tracking on a sale record.
export const SHIP_STATUS_OPTIONS = ["Not shipped", "Label bought", "Shipped", "Delivered", "Local pickup", "Not applicable"];
export const SALE_STATUS_OPTIONS = ["Completed", "Payment pending", "Partially refunded", "Returned", "Cancelled"];

export function normalizeShipStatus(value = "") {
  const text = cleanText(value);
  return SHIP_STATUS_OPTIONS.find((option) => option.toLowerCase() === text.toLowerCase()) || (text ? titleCase(text) : "Not shipped");
}

export function normalizeSaleStatus(value = "") {
  const text = cleanText(value);
  return SALE_STATUS_OPTIONS.find((option) => option.toLowerCase() === text.toLowerCase()) || (text ? titleCase(text) : "Completed");
}

/** Build the return/refund correction for a sale: keeps the original amounts and records what came back. */
export function applySaleReturn(sale = {}, { refundAmount = 0, quantityReturned = 0, returnDate = "", reason = "" } = {}) {
  const refund = Math.max(0, toNumber(refundAmount, 0));
  const gross = toNumber(sale.grossSale ?? sale.gross_sale, 0);
  const full = refund >= gross - 0.005 || toNumber(quantityReturned, 0) >= toNumber(sale.quantitySold ?? sale.quantity_sold, 1);
  return {
    ...sale,
    saleStatus: full ? "Returned" : "Partially refunded",
    discountsRefunds: Math.max(0, toNumber(sale.discountsRefunds ?? sale.discounts_refunds, 0) + refund),
    returnDate: cleanText(returnDate) || new Date().toISOString().slice(0, 10),
    returnReason: cleanText(reason),
    quantityReturned: Math.max(0, toNumber(quantityReturned, 0)),
    originalGrossSale: toNumber(sale.originalGrossSale, 0) || gross,
    updatedAt: new Date().toISOString(),
  };
}

const SALES_PLATFORM_RULES = [
  { label: "Whatnot", pattern: /^what\s*not\b|^whatnot\b/ },
  { label: "eBay", pattern: /^e\s*-?\s*bay\b|^ebay\b/ },
  { label: "TCGplayer", pattern: /^tcg\s*player\b|^tcgplayer\b/ },
  { label: "Facebook Marketplace", pattern: /^facebook\b|^fb\b|marketplace/ },
  { label: "Instagram", pattern: /^instagram\b|^ig\b/ },
  { label: "In-person", pattern: /^in.?person\b|^cash\b|^local pickup\b|^in.?store\b/ },
  { label: "Local card show/event", pattern: /^local card show\b|^card show\b|^event\b|trade night/ },
  { label: "Code 3 TCG", pattern: /^ember\s*(and|&)?\s*tide\b|^emberandtide\b|^code\s*3\s*tcg\b/ },
];

export function normalizeSalesPlatform(value = "") {
  const raw = cleanText(value);
  if (!raw) return "Other";
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\w\s&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const rule = SALES_PLATFORM_RULES.find((entry) => entry.pattern.test(cleaned));
  if (rule) return rule.label;
  const existing = SALES_PLATFORM_OPTIONS.find((platform) => platform.toLowerCase() === raw.toLowerCase());
  return existing || titleCase(raw);
}

export function saleHasReference(sale = {}) {
  return Boolean(
    sale.receiptImage ||
    sale.receiptImageUrl ||
    sale.referenceImage ||
    sale.referenceImageUrl ||
    sale.screenshotUrl ||
    sale.screenshot_url ||
    sale.orderId ||
    sale.order_id ||
    sale.referenceId ||
    sale.reference_id ||
    sale.transactionId ||
    sale.transaction_id ||
    sale.externalUrl ||
    sale.external_url
  );
}

export function calculateSalesRecordTotals(input = {}, linkedItem = {}) {
  const quantitySold = Math.max(0, toNumber(input.quantitySold ?? input.quantity_sold ?? input.quantity, 0));
  const shippingCharged = Math.max(0, toNumber(input.shippingCharged ?? input.shipping_charged, 0));
  const grossSource = input.grossSale ?? input.gross_sale ?? input.grossSaleAmount ?? input.gross_sale_amount;
  const explicitGross = grossSource !== undefined && grossSource !== null && String(grossSource) !== "" ? toNumber(grossSource, NaN) : NaN;
  const finalSalePrice = Math.max(0, toNumber(input.finalSalePrice ?? input.final_sale_price ?? input.salePriceEach ?? input.sale_price_each ?? input.salePrice ?? input.sale_price, 0));
  const grossSale = Number.isFinite(explicitGross) && explicitGross > 0
    ? explicitGross
    : (quantitySold * finalSalePrice) + shippingCharged;
  const platformFees = Math.max(0, toNumber(input.platformFees ?? input.platform_fees ?? input.fees, 0));
  const paymentProcessingFees = Math.max(0, toNumber(input.paymentProcessingFees ?? input.payment_processing_fees ?? input.processingFees ?? input.processing_fees, 0));
  const shippingCost = Math.max(0, toNumber(input.shippingCost ?? input.shipping_cost, 0));
  const suppliesCost = Math.max(0, toNumber(input.suppliesCost ?? input.supplies_cost, 0));
  const discountsRefunds = Math.max(0, toNumber(input.discountsRefunds ?? input.discounts_refunds ?? input.refunds ?? input.discounts, 0));
  const totalFees = platformFees + paymentProcessingFees;
  const costBasisSource = input.costBasis ?? input.cost_basis ?? input.itemCost ?? input.item_cost;
  const explicitCostBasis = costBasisSource !== undefined && costBasisSource !== null && String(costBasisSource) !== "" ? toNumber(costBasisSource, NaN) : NaN;
  const unitCost = toNumber(linkedItem.unitCost ?? linkedItem.unit_cost ?? linkedItem.costPaid ?? linkedItem.cost_paid, 0);
  const costBasis = Number.isFinite(explicitCostBasis)
    ? Math.max(0, explicitCostBasis)
    : quantitySold * unitCost;
  const netProceeds = grossSale - totalFees - shippingCost - suppliesCost - discountsRefunds;
  const profitSource = input.estimatedProfitLoss ?? input.estimated_profit_loss ?? input.netProfit ?? input.net_profit;
  const explicitProfit = profitSource !== undefined && profitSource !== null && String(profitSource) !== "" ? toNumber(profitSource, NaN) : NaN;
  const estimatedProfitLoss = Number.isFinite(explicitProfit) ? explicitProfit : netProceeds - costBasis;

  return {
    quantitySold,
    finalSalePrice,
    shippingCharged,
    grossSale,
    platformFees,
    paymentProcessingFees,
    totalFees,
    shippingCost,
    suppliesCost,
    discountsRefunds,
    netProceeds,
    costBasis,
    estimatedProfitLoss,
  };
}

export function validateManualSaleDraft(form = {}, options = {}) {
  const errors = {};
  const linkedItem = options.linkedItem || {};
  const itemName = cleanText(form.manualItemName || form.itemName || linkedItem.name || "");
  const hasLinkedItem = Boolean(form.itemId || form.item_id || linkedItem.id);
  const totals = calculateSalesRecordTotals(form, linkedItem);
  if (!hasLinkedItem && !itemName) errors.itemName = "Enter an item name or choose Business inventory.";
  if (totals.quantitySold <= 0) errors.quantitySold = "Quantity sold must be greater than zero.";
  if (totals.grossSale <= 0) errors.grossSale = "Enter a sale amount greater than zero.";
  ["shippingCharged", "platformFees", "paymentProcessingFees", "shippingCost", "suppliesCost", "discountsRefunds", "costBasis"].forEach((field) => {
    if (toNumber(form[field], 0) < 0) errors[field] = "Use zero or a positive amount.";
  });
  if (!cleanText(form.platform)) errors.platform = "Choose a sales channel.";
  // #36/#37: a sale needs a real date, otherwise it cannot be placed in a tax
  // year and used to show up in every year's report.
  const saleDateError = validateSaleDate(form.saleDate ?? form.sale_date ?? form.date ?? form.soldAt ?? form.sold_at, options);
  if (saleDateError) errors.saleDate = saleDateError;
  return { valid: Object.keys(errors).length === 0, errors, totals };
}

export function validateSaleDate(value, { now = new Date(), required = true } = {}) {
  const text = cleanText(value);
  if (!text) return required ? "Enter the sale date so it lands in the right year's report." : "";
  const date = new Date(text.includes("T") ? text : `${text}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Enter a valid sale date (YYYY-MM-DD).";
  const today = new Date(now);
  today.setHours(23, 59, 59, 999);
  if (date.getTime() > today.getTime() + 24 * 60 * 60 * 1000) return "Sale date cannot be in the future.";
  if (date.getFullYear() < 2000) return "Sale date looks wrong; check the year.";
  return "";
}

/** Sales with no usable date: reported separately instead of in every year. */
export function undatedSales(sales = []) {
  return (Array.isArray(sales) ? sales : []).filter((sale) => !recordDateValue(sale));
}

export function normalizeSalesRecord(row = {}, linkedItem = {}) {
  const totals = calculateSalesRecordTotals(row, linkedItem);
  const itemName = cleanText(row.itemName || row.item_name || row.manualItemName || row.manual_item_name || linkedItem.name || "Manual sale");
  const platform = normalizeSalesPlatform(row.platform || row.channel || "");
  return {
    id: row.id || "",
    itemId: row.itemId || row.item_id || linkedItem.id || "",
    linkedInventoryItemId: row.linkedInventoryItemId || row.linked_inventory_item_id || row.itemId || row.item_id || linkedItem.id || "",
    itemName,
    sku: row.sku || linkedItem.sku || "",
    platform,
    channel: platform,
    buyerName: cleanText(row.buyerName || row.buyer_name || row.customerName || row.customer_name || ""),
    saleDate: recordDateValue(row),
    quantitySold: totals.quantitySold,
    finalSalePrice: totals.finalSalePrice,
    shippingCharged: totals.shippingCharged,
    grossSale: totals.grossSale,
    platformFees: totals.platformFees,
    paymentProcessingFees: totals.paymentProcessingFees,
    totalFees: totals.totalFees,
    shippingCost: totals.shippingCost,
    suppliesCost: totals.suppliesCost,
    discountsRefunds: totals.discountsRefunds,
    netProceeds: totals.netProceeds,
    itemCost: totals.costBasis,
    costBasis: totals.costBasis,
    estimatedProfitLoss: totals.estimatedProfitLoss,
    netProfit: totals.estimatedProfitLoss,
    notes: cleanText(row.notes || ""),
    receiptImage: row.receiptImage || row.receipt_image || row.receiptImageUrl || row.receipt_image_url || row.referenceImage || row.reference_image || "",
    receiptImageUrl: row.receiptImageUrl || row.receipt_image_url || row.receiptImage || row.receipt_image || row.referenceImage || row.reference_image || "",
    referenceId: row.referenceId || row.reference_id || row.orderId || row.order_id || row.transactionId || row.transaction_id || "",
    shipCarrier: cleanText(row.shipCarrier || row.ship_carrier || row.carrier || ""),
    trackingNumber: cleanText(row.trackingNumber || row.tracking_number || row.tracking || ""),
    shipStatus: normalizeShipStatus(row.shipStatus || row.ship_status || ""),
    shippedAt: row.shippedAt || row.shipped_at || "",
    saleStatus: normalizeSaleStatus(row.saleStatus || row.sale_status || ""),
    returnDate: row.returnDate || row.return_date || "",
    returnReason: cleanText(row.returnReason || row.return_reason || ""),
    quantityReturned: Math.max(0, toNumber(row.quantityReturned ?? row.quantity_returned, 0)),
    originalGrossSale: toNumber(row.originalGrossSale ?? row.original_gross_sale, 0),
    workspaceId: row.workspaceId || row.workspace_id || "",
    workspace_id: row.workspace_id || row.workspaceId || "",
    workspaceName: row.workspaceName || row.workspace_name || "",
    createdAt: row.createdAt || row.created_at || (recordDateValue(row) ? `${recordDateValue(row)}T12:00:00.000Z` : ""),
    updatedAt: row.updatedAt || row.updated_at || "",
  };
}

export function buildSalesRecordFromDraft(form = {}, linkedItem = {}, options = {}) {
  const validation = validateManualSaleDraft(form, { linkedItem });
  const saleDate = form.saleDate || form.sale_date || new Date().toISOString().slice(0, 10);
  const base = normalizeSalesRecord({
    ...form,
    id: options.id || form.id || "",
    itemId: form.itemId || linkedItem.id || "",
    itemName: linkedItem.name || form.manualItemName || form.itemName || "",
    sku: linkedItem.sku || form.sku || "",
    saleDate,
    platform: normalizeSalesPlatform(form.platform),
    workspaceId: options.workspaceId || form.workspaceId || linkedItem.workspaceId || linkedItem.workspace_id || "",
    workspaceName: options.workspaceName || form.workspaceName || linkedItem.workspaceName || linkedItem.workspace_name || "",
    createdAt: options.createdAt || `${saleDate}T12:00:00.000Z`,
    updatedAt: options.updatedAt || new Date().toISOString(),
  }, linkedItem);
  return {
    valid: validation.valid,
    errors: validation.errors,
    sale: {
      ...base,
      manualEntry: !base.itemId,
      inventoryAdjustmentMode: base.itemId ? "linked_inventory_quantity" : "manual_inventory_adjustment",
      notes: cleanText([
        form.notes,
        !base.itemId ? "Manual sale entry. Inventory adjustment is manual for now." : "",
      ].filter(Boolean).join(" | ")),
    },
  };
}

export function summarizeSalesRecords(sales = [], options = {}) {
  const selectedYear = options.year ? String(options.year) : "";
  const normalized = sales
    .map((sale) => normalizeSalesRecord(sale))
    .filter((sale) => !selectedYear || recordYear(sale) === selectedYear);
  const byPlatform = {};
  const byMonth = {};
  normalized.forEach((sale) => {
    const platform = sale.platform || "Other";
    byPlatform[platform] = byPlatform[platform] || { label: platform, count: 0, grossSales: 0, netProceeds: 0, estimatedProfitLoss: 0, itemsSold: 0 };
    byPlatform[platform].count += 1;
    byPlatform[platform].grossSales += sale.grossSale;
    byPlatform[platform].netProceeds += sale.netProceeds;
    byPlatform[platform].estimatedProfitLoss += sale.estimatedProfitLoss;
    byPlatform[platform].itemsSold += sale.quantitySold;

    const month = (recordDateValue(sale) || "").slice(0, 7) || "undated";
    byMonth[month] = byMonth[month] || { label: month, count: 0, grossSales: 0, netProceeds: 0, estimatedProfitLoss: 0, itemsSold: 0 };
    byMonth[month].count += 1;
    byMonth[month].grossSales += sale.grossSale;
    byMonth[month].netProceeds += sale.netProceeds;
    byMonth[month].estimatedProfitLoss += sale.estimatedProfitLoss;
    byMonth[month].itemsSold += sale.quantitySold;
  });

  return {
    count: normalized.length,
    itemsSold: normalized.reduce((sum, sale) => sum + sale.quantitySold, 0),
    grossSales: normalized.reduce((sum, sale) => sum + sale.grossSale, 0),
    estimatedFees: normalized.reduce((sum, sale) => sum + sale.totalFees, 0),
    estimatedShippingCosts: normalized.reduce((sum, sale) => sum + sale.shippingCost, 0),
    estimatedSuppliesCost: normalized.reduce((sum, sale) => sum + sale.suppliesCost, 0),
    estimatedDiscountsRefunds: normalized.reduce((sum, sale) => sum + sale.discountsRefunds, 0),
    estimatedNetProceeds: normalized.reduce((sum, sale) => sum + sale.netProceeds, 0),
    estimatedCostBasis: normalized.reduce((sum, sale) => sum + sale.costBasis, 0),
    estimatedProfitLoss: normalized.reduce((sum, sale) => sum + sale.estimatedProfitLoss, 0),
    receiptCoverage: {
      total: normalized.length,
      withReference: normalized.filter(saleHasReference).length,
      missingReference: normalized.filter((sale) => !saleHasReference(sale)).length,
    },
    byPlatform: Object.values(byPlatform).sort((a, b) => b.grossSales - a.grossSales || a.label.localeCompare(b.label)),
    byMonth: Object.values(byMonth).sort((a, b) => String(b.label).localeCompare(String(a.label))),
    records: normalized,
  };
}

function salesDateSortValue(sale = {}) {
  const value = recordDateValue(sale);
  if (!value) return "";
  return String(value).slice(0, 10);
}

function salesRecordIdentityText(value = "") {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function compareSalesRecordsByDate(a = {}, b = {}, direction = "newest") {
  const dateA = salesDateSortValue(a);
  const dateB = salesDateSortValue(b);
  if (dateA && dateB && dateA !== dateB) {
    return direction === "oldest" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
  }
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  const createdA = String(a.createdAt || a.created_at || "");
  const createdB = String(b.createdAt || b.created_at || "");
  if (createdA !== createdB) {
    return direction === "oldest" ? createdA.localeCompare(createdB) : createdB.localeCompare(createdA);
  }
  return String(a.itemName || a.item_name || "").localeCompare(String(b.itemName || b.item_name || ""), undefined, { sensitivity: "base", numeric: true });
}

export function filterSalesRecordsByDateRange(sales = [], options = {}) {
  const from = String(options.from || options.dateFrom || "").slice(0, 10);
  const to = String(options.to || options.dateTo || "").slice(0, 10);
  return sales.filter((sale) => {
    const saleDate = salesDateSortValue(sale);
    if ((from || to) && !saleDate) return false;
    if (from && saleDate < from) return false;
    if (to && saleDate > to) return false;
    return true;
  });
}

export function sortSalesRecords(sales = [], direction = "newest") {
  const resolvedDirection = direction === "oldest" ? "oldest" : "newest";
  return [...sales].sort((a, b) => compareSalesRecordsByDate(a, b, resolvedDirection));
}

function saleLineCollections(sale = {}) {
  return [
    sale.saleItems,
    sale.sale_items,
    sale.items,
    sale.lineItems,
    sale.line_items,
  ].find((value) => Array.isArray(value) && value.length) || [];
}

function normalizeSaleLineRecord(sale = {}, line = null, index = 0, totalLineQuantity = 0) {
  const normalizedSale = normalizeSalesRecord(sale);
  const rawLine = line || sale;
  const quantitySold = Math.max(0, toNumber(rawLine.quantitySold ?? rawLine.quantity_sold ?? rawLine.quantity ?? rawLine.qty, normalizedSale.quantitySold || 1));
  const finalSalePrice = Math.max(0, toNumber(rawLine.finalSalePrice ?? rawLine.final_sale_price ?? rawLine.salePriceEach ?? rawLine.sale_price_each ?? rawLine.salePrice ?? rawLine.sale_price, normalizedSale.finalSalePrice));
  const explicitGross = rawLine.grossSale ?? rawLine.gross_sale ?? rawLine.grossSaleAmount ?? rawLine.gross_sale_amount;
  const proportionalShare = totalLineQuantity > 0 && normalizedSale.quantitySold > 0 ? quantitySold / totalLineQuantity : 1;
  const grossSale = explicitGross !== undefined && explicitGross !== null && String(explicitGross) !== ""
    ? Math.max(0, toNumber(explicitGross, 0))
    : finalSalePrice > 0
      ? quantitySold * finalSalePrice
      : normalizedSale.grossSale * proportionalShare;
  const itemName = cleanText(
    rawLine.itemName
    || rawLine.item_name
    || rawLine.manualItemName
    || rawLine.manual_item_name
    || rawLine.productName
    || rawLine.product_name
    || rawLine.name
    || normalizedSale.itemName
  ) || "Sale item";
  const itemId = rawLine.itemId
    || rawLine.item_id
    || rawLine.linkedInventoryItemId
    || rawLine.linked_inventory_item_id
    || rawLine.inventoryItemId
    || rawLine.inventory_item_id
    || normalizedSale.itemId
    || "";
  const sku = rawLine.sku || rawLine.upc || rawLine.barcode || normalizedSale.sku || "";
  return {
    ...normalizedSale,
    lineId: `${normalizedSale.id || "sale"}-${index}`,
    saleId: normalizedSale.id,
    itemId,
    linkedInventoryItemId: itemId,
    itemName,
    sku,
    quantitySold,
    finalSalePrice,
    grossSale,
    netProceeds: normalizedSale.netProceeds * proportionalShare,
    costBasis: normalizedSale.costBasis * proportionalShare,
    estimatedProfitLoss: normalizedSale.estimatedProfitLoss * proportionalShare,
    netProfit: normalizedSale.estimatedProfitLoss * proportionalShare,
    parentSale: normalizedSale,
  };
}

export function salesRecordItemGroupKey(record = {}) {
  const itemId = cleanText(record.itemId || record.item_id || record.linkedInventoryItemId || record.linked_inventory_item_id || "");
  if (itemId) return `item:${itemId.toLowerCase()}`;
  const sku = salesRecordIdentityText(record.sku || record.upc || record.barcode || "");
  if (sku) return `sku:${sku}`;
  const name = salesRecordIdentityText(record.itemName || record.item_name || record.manualItemName || record.manual_item_name || "");
  return `name:${name || "sale-item"}`;
}

export function flattenSalesRecordLines(sales = []) {
  return sales.flatMap((sale) => {
    const lines = saleLineCollections(sale);
    if (!lines.length) return [normalizeSaleLineRecord(sale)];
    const totalLineQuantity = lines.reduce((sum, line) => sum + Math.max(0, toNumber(line.quantitySold ?? line.quantity_sold ?? line.quantity ?? line.qty, 1)), 0);
    return lines.map((line, index) => normalizeSaleLineRecord(sale, line, index, totalLineQuantity));
  });
}

export function groupSalesRecordsByDate(sales = [], options = {}) {
  const direction = options.direction === "oldest" ? "oldest" : "newest";
  const groups = new Map();
  sortSalesRecords(sales, direction).forEach((sale) => {
    const date = salesDateSortValue(sale) || "undated";
    if (!groups.has(date)) {
      groups.set(date, {
        key: `date:${date}`,
        label: date === "undated" ? "Undated sales" : date,
        date,
        records: [],
        quantitySold: 0,
        grossSales: 0,
        estimatedProfitLoss: 0,
      });
    }
    const normalizedSale = normalizeSalesRecord(sale);
    const group = groups.get(date);
    group.records.push(normalizedSale);
    group.quantitySold += normalizedSale.quantitySold;
    group.grossSales += normalizedSale.grossSale;
    group.estimatedProfitLoss += normalizedSale.estimatedProfitLoss;
  });
  return [...groups.values()];
}

export function groupSalesRecordsByItem(sales = [], options = {}) {
  const direction = options.direction === "oldest" ? "oldest" : "newest";
  const groups = new Map();
  flattenSalesRecordLines(sales).forEach((line) => {
    const key = salesRecordItemGroupKey(line);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        itemName: line.itemName || "Sale item",
        sku: line.sku || "",
        records: [],
        quantitySold: 0,
        grossSales: 0,
        netProceeds: 0,
        estimatedProfitLoss: 0,
        latestSaleDate: "",
        platforms: new Set(),
      });
    }
    const group = groups.get(key);
    group.records.push(line);
    group.quantitySold += line.quantitySold;
    group.grossSales += line.grossSale;
    group.netProceeds += line.netProceeds;
    group.estimatedProfitLoss += line.estimatedProfitLoss;
    group.platforms.add(line.platform || "Other");
    const saleDate = salesDateSortValue(line);
    if (saleDate && (!group.latestSaleDate || saleDate > group.latestSaleDate)) group.latestSaleDate = saleDate;
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      platforms: [...group.platforms].sort((a, b) => a.localeCompare(b)),
      records: sortSalesRecords(group.records, direction),
    }))
    .sort((a, b) => {
      if (a.latestSaleDate !== b.latestSaleDate) return String(b.latestSaleDate).localeCompare(String(a.latestSaleDate));
      return a.itemName.localeCompare(b.itemName, undefined, { sensitivity: "base", numeric: true });
    });
}

export function buildSalesReviewView(sales = [], options = {}) {
  const viewMode = options.viewMode || "newest";
  const dateFrom = options.dateFrom || options.from || "";
  const dateTo = options.dateTo || options.to || "";
  const filteredSales = filterSalesRecordsByDateRange(sales, { from: dateFrom, to: dateTo });
  const direction = viewMode === "oldest" ? "oldest" : "newest";
  const sortedSales = sortSalesRecords(filteredSales, direction);
  return {
    viewMode,
    dateFrom,
    dateTo,
    filtersActive: Boolean(dateFrom || dateTo),
    filteredSales,
    sortedSales,
    dateGroups: groupSalesRecordsByDate(filteredSales, { direction }),
    itemGroups: groupSalesRecordsByItem(filteredSales, { direction }),
  };
}

export function buildSalesExportRows(sales = [], { includePrivateFields = true } = {}) {
  return sales.map((sale) => {
    const normalized = normalizeSalesRecord(includePrivateFields ? sale : stripPrivateSaleFields(sale));
    return {
      section: "Sale record",
      date: normalized.saleDate,
      platform: normalized.platform,
      itemName: normalized.itemName,
      sku: normalized.sku,
      quantitySold: normalized.quantitySold,
      grossSale: normalized.grossSale,
      platformFees: normalized.platformFees,
      paymentProcessingFees: normalized.paymentProcessingFees,
      shippingCost: normalized.shippingCost,
      suppliesCost: normalized.suppliesCost,
      discountsRefunds: normalized.discountsRefunds,
      netProceeds: normalized.netProceeds,
      costBasis: normalized.costBasis,
      estimatedProfitLoss: normalized.estimatedProfitLoss,
      receiptOrReference: saleHasReference(normalized) ? "Attached/reference present" : "Missing",
      saleStatus: normalized.saleStatus,
      shipStatus: normalized.shipStatus,
      returnDate: normalized.returnDate,
      notes: includePrivateFields ? normalized.notes : "",
    };
  });
}

export function summarizePurchaserInventory(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const name = itemPurchaserNameForTax(item);
    if (!groups.has(name)) groups.set(name, { name, quantity: 0, costBasis: 0, marketValue: 0, plannedSaleValue: 0, records: [] });
    const group = groups.get(name);
    const quantity = toNumber(item.quantity, 1);
    group.quantity += quantity;
    group.costBasis += quantity * toNumber(item.unitCost || item.unit_cost || item.costPaid || item.cost_paid);
    group.marketValue += quantity * toNumber(item.marketPrice || item.market_price || item.marketValue || item.market_value);
    group.plannedSaleValue += quantity * toNumber(item.salePrice || item.sale_price || item.plannedSalePrice || item.planned_sale_price);
    group.records.push(item);
  });
  return [...groups.values()].sort((a, b) => b.costBasis - a.costBasis || a.name.localeCompare(b.name));
}

export function buildYearEndTaxSummary({ year, expenses = [], mileageTrips = [], vehicles = [], inventoryItems = [], sales = [] } = {}) {
  const selectedYear = String(year || new Date().getFullYear());
  const yearlyExpenses = expenses.filter((expense) => recordYear(expense) === selectedYear);
  const yearlyMileageTrips = mileageTrips.filter((trip) => recordYear(trip) === selectedYear);
  const yearlyInventoryItems = inventoryItems.filter((item) => !recordDateValue(item) || recordYear(item) === selectedYear);
  // Undated sales are listed separately (undatedSaleCount) rather than counted
  // in every year's totals.
  const yearlySales = sales.filter((sale) => recordYear(sale) === selectedYear);
  const undatedSaleRows = undatedSales(sales);
  const salesSummary = summarizeSalesRecords(yearlySales, { year: selectedYear });
  const expenseGroups = groupExpensesByVendor(yearlyExpenses);
  const mileageGroups = groupMileageByVehicle(yearlyMileageTrips, vehicles, { year: selectedYear });
  const purchaserTotals = summarizePurchaserInventory(yearlyInventoryItems);
  const valuationSummary = summarizeInventoryValuation(yearlyInventoryItems, { context: "forge", salesSummary });
  const expenseTotal = yearlyExpenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const mileageMiles = yearlyMileageTrips.reduce((sum, trip) => sum + toNumber(trip.businessMiles || trip.business_miles || trip.miles), 0);
  const mileageValue = yearlyMileageTrips.reduce((sum, trip) => sum + toNumber(trip.mileageValue || trip.mileage_value), 0);
  const inventoryCostBasis = yearlyInventoryItems.reduce((sum, item) => sum + toNumber(item.quantity, 1) * toNumber(item.unitCost || item.unit_cost || item.costPaid || item.cost_paid), 0);
  const inventoryMarketValue = yearlyInventoryItems.reduce((sum, item) => sum + toNumber(item.quantity, 1) * toNumber(item.marketPrice || item.market_price || item.marketValue || item.market_value), 0);
  const plannedSaleValue = yearlyInventoryItems.reduce((sum, item) => sum + toNumber(item.quantity, 1) * toNumber(item.salePrice || item.sale_price || item.plannedSalePrice || item.planned_sale_price), 0);
  const missingReceiptCount = expenseGroups.reduce((sum, group) => sum + group.missingReceiptCount, 0);

  return {
    year: selectedYear,
    generatedAt: new Date().toISOString(),
    disclaimer: "Tax records summary for review with your tax professional. Code 3 TCG does not provide tax advice.",
    undatedSaleCount: undatedSaleRows.length,
    undatedSaleIds: undatedSaleRows.map((sale) => sale.id || "").filter(Boolean),
    undatedSaleNote: undatedSaleRows.length
      ? `${undatedSaleRows.length} sale${undatedSaleRows.length === 1 ? " has" : "s have"} no date and ${undatedSaleRows.length === 1 ? "is" : "are"} left out of every year's totals until you add one.`
      : "",
    expenses: {
      total: expenseTotal,
      count: yearlyExpenses.length,
      vendorGroups: expenseGroups,
      missingReceiptCount,
      byCategory: expenseGroups.reduce((acc, group) => {
        Object.entries(group.categoryTotals).forEach(([category, amount]) => {
          acc[category] = (acc[category] || 0) + amount;
        });
        return acc;
      }, {}),
    },
    mileage: {
      totalMiles: mileageMiles,
      totalValue: mileageValue,
      tripCount: yearlyMileageTrips.length,
      vehicleGroups: mileageGroups,
    },
    inventory: {
      itemCount: yearlyInventoryItems.length,
      quantity: yearlyInventoryItems.reduce((sum, item) => sum + toNumber(item.quantity, 1), 0),
      costBasis: inventoryCostBasis,
      marketValue: inventoryMarketValue,
      plannedSaleValue,
      purchaserTotals,
      valuationSummary,
      missingCostCount: valuationSummary.missingCostCount,
      missingMarketValueCount: valuationSummary.missingMarketValueCount,
      missingPlannedSalePriceCount: valuationSummary.missingPlannedSalePriceCount,
      missingReceiptCount: valuationSummary.receiptCoverage.missingReceipt,
      receiptCoverage: valuationSummary.receiptCoverage,
      purchaserBreakdown: valuationSummary.purchaserBreakdown,
    },
    sales: {
      count: salesSummary.count,
      revenue: salesSummary.grossSales,
      profit: salesSummary.estimatedProfitLoss,
      grossSales: salesSummary.grossSales,
      estimatedFees: salesSummary.estimatedFees,
      estimatedShippingCosts: salesSummary.estimatedShippingCosts,
      estimatedNetProceeds: salesSummary.estimatedNetProceeds,
      estimatedCostBasis: salesSummary.estimatedCostBasis,
      estimatedProfitLoss: salesSummary.estimatedProfitLoss,
      itemsSold: salesSummary.itemsSold,
      byPlatform: salesSummary.byPlatform,
      byMonth: salesSummary.byMonth,
      receiptCoverage: salesSummary.receiptCoverage,
      records: salesSummary.records,
    },
  };
}

export function buildTaxRecordExportRows(summary = {}) {
  const rows = [
    { section: "Summary", label: "Year", value: summary.year, count: "", notes: summary.disclaimer || "" },
    { section: "Expenses", label: "Total expenses", value: summary.expenses?.total || 0, count: summary.expenses?.count || 0, notes: `${summary.expenses?.missingReceiptCount || 0} missing receipt(s)` },
    { section: "Mileage", label: "Business miles", value: summary.mileage?.totalMiles || 0, count: summary.mileage?.tripCount || 0, notes: `Mileage value ${summary.mileage?.totalValue || 0}` },
    { section: "Inventory", label: "Cost basis", value: summary.inventory?.costBasis || 0, count: summary.inventory?.quantity || 0, notes: `Planned sale value ${summary.inventory?.plannedSaleValue || 0}` },
    { section: "Sales", label: "Sales revenue", value: summary.sales?.revenue || 0, count: summary.sales?.count || 0, notes: `Estimated profit/loss ${summary.sales?.profit || 0}` },
  ];
  (summary.expenses?.vendorGroups || []).forEach((group) => {
    rows.push({ section: "Expense vendor", label: group.vendorName, value: group.total, count: group.count, notes: `${group.missingReceiptCount} missing receipt(s)` });
  });
  (summary.mileage?.vehicleGroups || []).forEach((group) => {
    rows.push({ section: "Mileage vehicle", label: group.vehicleName, value: group.totalMiles, count: group.tripCount, notes: `Mileage value ${group.totalMileageValue}` });
  });
  if (summary.inventory?.valuationSummary) {
    rows.push(...buildInventoryValuationExportRows(summary.inventory.valuationSummary, { sectionPrefix: "Inventory valuation" }));
  }
  if (summary.inventory?.receiptCoverage) {
    rows.push({
      section: "Documentation coverage",
      label: "Inventory receipts",
      value: summary.inventory.receiptCoverage.withReceipt || 0,
      count: summary.inventory.receiptCoverage.total || 0,
      notes: `${summary.inventory.receiptCoverage.missingReceipt || 0} inventory receipt(s) missing`,
    });
  }
  (summary.inventory?.purchaserTotals || []).forEach((group) => {
    rows.push({ section: "Inventory purchaser", label: group.name, value: group.costBasis, count: group.quantity, notes: `Planned sale value ${group.plannedSaleValue}` });
  });
  (summary.sales?.byPlatform || []).forEach((group) => {
    rows.push({ section: "Sales platform", label: group.label, value: group.grossSales, count: group.count, notes: `Estimated net proceeds ${group.netProceeds}; estimated profit/loss ${group.estimatedProfitLoss}` });
  });
  (summary.sales?.byMonth || []).forEach((group) => {
    rows.push({ section: "Sales month", label: group.label, value: group.grossSales, count: group.count, notes: `${group.itemsSold} item(s) sold` });
  });
  if (summary.sales?.receiptCoverage) {
    rows.push({
      section: "Documentation coverage",
      label: "Sales references",
      value: summary.sales.receiptCoverage.withReference,
      count: summary.sales.receiptCoverage.total,
      notes: `${summary.sales.receiptCoverage.missingReference} sale reference(s) missing`,
    });
  }
  return rows;
}
