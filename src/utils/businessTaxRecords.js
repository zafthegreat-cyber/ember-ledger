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
  const number = Number.parseFloat(value);
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
  return record.date || record.purchaseDate || record.purchase_date || record.soldAt || record.sold_at || String(record.createdAt || record.created_at || "").slice(0, 10) || "";
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
    const hasReceipt = Boolean(expense.receiptImage || expense.receiptImageUrl || expense.receipt_image || expense.receipt_url || expense.photoUrl);
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

export function groupMileageByVehicle(trips = [], vehicles = []) {
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
        trips: [],
        tripCount: 0,
        totalMiles: 0,
        totalVehicleCost: 0,
        totalMileageValue: 0,
        lastTripDate: "",
      });
    }
    const group = groups.get(key);
    const date = recordDateValue(trip);
    group.trips.push(trip);
    group.tripCount += 1;
    group.totalMiles += toNumber(trip.businessMiles || trip.business_miles || trip.miles);
    group.totalVehicleCost += toNumber(trip.totalVehicleCost || trip.total_vehicle_cost);
    group.totalMileageValue += toNumber(trip.mileageValue || trip.mileage_value);
    if (!group.lastTripDate || (date && date > group.lastTripDate)) group.lastTripDate = date;
  });
  return [...groups.values()].map((group) => ({
    ...group,
    trips: [...group.trips].sort((a, b) => String(recordDateValue(b)).localeCompare(String(recordDateValue(a)))),
  })).sort((a, b) => String(b.lastTripDate).localeCompare(String(a.lastTripDate)) || a.vehicleName.localeCompare(b.vehicleName));
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
  const yearlySales = sales.filter((sale) => !recordDateValue(sale) || recordYear(sale) === selectedYear);
  const expenseGroups = groupExpensesByVendor(yearlyExpenses);
  const mileageGroups = groupMileageByVehicle(yearlyMileageTrips, vehicles);
  const purchaserTotals = summarizePurchaserInventory(yearlyInventoryItems);
  const expenseTotal = yearlyExpenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const mileageMiles = yearlyMileageTrips.reduce((sum, trip) => sum + toNumber(trip.businessMiles || trip.business_miles || trip.miles), 0);
  const mileageValue = yearlyMileageTrips.reduce((sum, trip) => sum + toNumber(trip.mileageValue || trip.mileage_value), 0);
  const inventoryCostBasis = yearlyInventoryItems.reduce((sum, item) => sum + toNumber(item.quantity, 1) * toNumber(item.unitCost || item.unit_cost || item.costPaid || item.cost_paid), 0);
  const inventoryMarketValue = yearlyInventoryItems.reduce((sum, item) => sum + toNumber(item.quantity, 1) * toNumber(item.marketPrice || item.market_price || item.marketValue || item.market_value), 0);
  const plannedSaleValue = yearlyInventoryItems.reduce((sum, item) => sum + toNumber(item.quantity, 1) * toNumber(item.salePrice || item.sale_price || item.plannedSalePrice || item.planned_sale_price), 0);
  const salesRevenue = yearlySales.reduce((sum, sale) => sum + toNumber(sale.grossSale || sale.gross_sale || sale.finalSalePrice || sale.final_sale_price), 0);
  const salesProfit = yearlySales.reduce((sum, sale) => sum + toNumber(sale.netProfit || sale.net_profit), 0);
  const missingReceiptCount = expenseGroups.reduce((sum, group) => sum + group.missingReceiptCount, 0);

  return {
    year: selectedYear,
    generatedAt: new Date().toISOString(),
    disclaimer: "Tax records summary for review with your tax professional. Ember & Tide does not provide tax advice.",
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
    },
    sales: {
      count: yearlySales.length,
      revenue: salesRevenue,
      profit: salesProfit,
    },
  };
}

export function buildTaxRecordExportRows(summary = {}) {
  const rows = [
    { section: "Summary", label: "Year", value: summary.year, count: "", notes: summary.disclaimer || "" },
    { section: "Expenses", label: "Total expenses", value: summary.expenses?.total || 0, count: summary.expenses?.count || 0, notes: `${summary.expenses?.missingReceiptCount || 0} missing receipt(s)` },
    { section: "Mileage", label: "Business miles", value: summary.mileage?.totalMiles || 0, count: summary.mileage?.tripCount || 0, notes: `Mileage value ${summary.mileage?.totalValue || 0}` },
    { section: "Inventory", label: "Cost basis", value: summary.inventory?.costBasis || 0, count: summary.inventory?.quantity || 0, notes: `Planned sale value ${summary.inventory?.plannedSaleValue || 0}` },
    { section: "Sales", label: "Sales revenue", value: summary.sales?.revenue || 0, count: summary.sales?.count || 0, notes: `Net profit ${summary.sales?.profit || 0}` },
  ];
  (summary.expenses?.vendorGroups || []).forEach((group) => {
    rows.push({ section: "Expense vendor", label: group.vendorName, value: group.total, count: group.count, notes: `${group.missingReceiptCount} missing receipt(s)` });
  });
  (summary.mileage?.vehicleGroups || []).forEach((group) => {
    rows.push({ section: "Mileage vehicle", label: group.vehicleName, value: group.totalMiles, count: group.tripCount, notes: `Mileage value ${group.totalMileageValue}` });
  });
  (summary.inventory?.purchaserTotals || []).forEach((group) => {
    rows.push({ section: "Inventory purchaser", label: group.name, value: group.costBasis, count: group.quantity, notes: `Planned sale value ${group.plannedSaleValue}` });
  });
  return rows;
}
