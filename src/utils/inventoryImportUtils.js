const BARCODE_LENGTHS = new Set([8, 12, 13, 14]);

export const RECEIPT_LINE_ENTRY_TYPES = {
  INVENTORY: "inventory",
  EXPENSE_ONLY: "expense_only",
  SUPPLIES: "supplies",
  MILEAGE_REFERENCE: "mileage_reference",
  IGNORED: "ignored",
};

export const RECEIPT_LINE_ENTRY_LABELS = {
  [RECEIPT_LINE_ENTRY_TYPES.INVENTORY]: "Inventory item",
  [RECEIPT_LINE_ENTRY_TYPES.EXPENSE_ONLY]: "Expense-only record",
  [RECEIPT_LINE_ENTRY_TYPES.SUPPLIES]: "Supplies expense",
  [RECEIPT_LINE_ENTRY_TYPES.MILEAGE_REFERENCE]: "Mileage/gas reference",
  [RECEIPT_LINE_ENTRY_TYPES.IGNORED]: "Ignore line",
};

export function normalizeBarcodeValue(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) return digits;
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isLikelyBarcodeValue(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  return BARCODE_LENGTHS.has(digits.length) || (digits.length >= 8 && digits.length <= 14);
}

function normalizeIdentifierValue(value = "") {
  const normalized = normalizeBarcodeValue(value);
  return normalized || String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function addIdentifier(set, value) {
  const normalized = normalizeIdentifierValue(value);
  if (normalized) set.add(normalized);
}

export function catalogIdentifiersForProduct(product = {}) {
  const identifiers = new Set();
  [
    product.upc,
    product.barcode,
    product.sku,
    product.tcin,
    product.retailerItemNumber,
    product.externalProductId,
    product.tcgplayerProductId,
    product.pokemonTcgApiId,
    product.identifierSearch,
  ].forEach((value) => addIdentifier(identifiers, value));

  [product.upcs, product.barcodes, product.skus, product.identifiers].forEach((collection) => {
    if (!Array.isArray(collection)) return;
    collection.forEach((entry) => {
      if (entry && typeof entry === "object") {
        [
          entry.value,
          entry.id,
          entry.code,
          entry.identifier,
          entry.identifierValue,
          entry.identifier_value,
          entry.upc,
          entry.barcode,
          entry.sku,
        ].forEach((value) => addIdentifier(identifiers, value));
      } else {
        addIdentifier(identifiers, entry);
      }
    });
  });

  return [...identifiers];
}

export function findCatalogProductByBarcode(catalogProducts = [], code = "") {
  const normalized = normalizeIdentifierValue(code);
  if (!normalized) return null;
  return catalogProducts.find((product) => catalogIdentifiersForProduct(product).includes(normalized)) || null;
}

export function buildManualFallbackItemSeed({
  rawValue = "",
  itemName = "",
  destination = "",
  destinations = {},
  productType = "",
  setName = "",
  upcSku = "",
  msrpPrice = "",
  marketPrice = "",
  notes = "",
} = {}) {
  const raw = String(rawValue || itemName || "").trim();
  const normalizedCode = normalizeBarcodeValue(upcSku) || (isLikelyBarcodeValue(raw) ? normalizeBarcodeValue(raw) : "");
  const normalizedDestination = String(destination || "").toLowerCase();
  const destinationSeed = {
    vault: normalizedDestination === "vault",
    forge: normalizedDestination === "forge",
    wishlist: normalizedDestination === "wishlist",
    tidetradr: normalizedDestination === "tidetradr",
    ...destinations,
  };
  return {
    itemName: itemName || (normalizedCode ? `Unmatched UPC ${normalizedCode}` : raw),
    catalogSearchQuery: raw,
    productType,
    setName,
    upcSku: normalizedCode,
    msrpPrice,
    marketPrice,
    notes,
    destinations: destinationSeed,
  };
}

export function classifyReceiptLineForEntry(line = {}) {
  const text = String([line.name, line.itemName, line.productName, line.rawText, line.notes].filter(Boolean).join(" ")).toLowerCase();
  if (!text.trim()) {
    return {
      entryType: RECEIPT_LINE_ENTRY_TYPES.IGNORED,
      label: RECEIPT_LINE_ENTRY_LABELS[RECEIPT_LINE_ENTRY_TYPES.IGNORED],
      suggestedDestination: "expense_only",
      category: "Ignored",
      reason: "Empty receipt line.",
    };
  }
  if (/\b(subtotal|total|tax|change|cash|visa|mastercard|auth|transaction|receipt|balance)\b/.test(text)) {
    return {
      entryType: RECEIPT_LINE_ENTRY_TYPES.IGNORED,
      label: RECEIPT_LINE_ENTRY_LABELS[RECEIPT_LINE_ENTRY_TYPES.IGNORED],
      suggestedDestination: "expense_only",
      category: "Ignored",
      reason: "Receipt summary/payment line.",
    };
  }
  if (/\b(gas|fuel|diesel|parking|toll|vehicle|car wash)\b/.test(text)) {
    return {
      entryType: RECEIPT_LINE_ENTRY_TYPES.MILEAGE_REFERENCE,
      label: RECEIPT_LINE_ENTRY_LABELS[RECEIPT_LINE_ENTRY_TYPES.MILEAGE_REFERENCE],
      suggestedDestination: "expense_only",
      category: "Mileage/Vehicle",
      reason: "Looks like a vehicle or mileage support record.",
    };
  }
  if (/\b(tape|mailer|bubble|label|shipping label|sleeve|toploader|box|boxes|packaging|suppl|storage|binder)\b/.test(text)) {
    return {
      entryType: RECEIPT_LINE_ENTRY_TYPES.SUPPLIES,
      label: RECEIPT_LINE_ENTRY_LABELS[RECEIPT_LINE_ENTRY_TYPES.SUPPLIES],
      suggestedDestination: "expense_only",
      category: "Packaging Supplies",
      reason: "Looks like supplies or packaging.",
    };
  }
  if (/\b(pokemon|tcg|booster|bundle|etb|elite trainer|tin|blister|deck|collection|portfolio|binder collection|pack|card)\b/.test(text)) {
    return {
      entryType: RECEIPT_LINE_ENTRY_TYPES.INVENTORY,
      label: RECEIPT_LINE_ENTRY_LABELS[RECEIPT_LINE_ENTRY_TYPES.INVENTORY],
      suggestedDestination: "forge",
      category: "Inventory/Product Cost",
      reason: "Looks like Pokemon product inventory.",
    };
  }
  return {
    entryType: RECEIPT_LINE_ENTRY_TYPES.EXPENSE_ONLY,
    label: RECEIPT_LINE_ENTRY_LABELS[RECEIPT_LINE_ENTRY_TYPES.EXPENSE_ONLY],
    suggestedDestination: "expense_only",
    category: "Supplies",
    reason: "No catalog/inventory signal found.",
  };
}

export function normalizeBulkImportDestination(value = "", fallback = "Vault") {
  const key = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["forge", "business", "businessinventory"].includes(key)) return "Forge";
  if (["vault", "collection", "personal"].includes(key)) return "Vault";
  if (["wishlist", "wish"].includes(key)) return "Wishlist";
  if (["both", "vaultforge", "forgevault"].includes(key)) return "Both";
  if (["skip", "ignore", "ignored"].includes(key)) return "Skip";
  return fallback;
}

export function normalizeBulkImportRow(row = {}, defaults = {}) {
  const itemName = String(row.itemName || row.productName || row.name || row.title || row.originalText || "").trim();
  const quantity = Math.max(1, Math.floor(Number(String(row.quantity || row.qty || defaults.quantity || 1).replace(/[^\d.]/g, "")) || 1));
  const unitCost = Number(String(row.unitCost || row.costPaid || row.cost || row.price || "").replace(/[$,%]/g, ""));
  const code = normalizeBarcodeValue(row.upcSku || row.upc || row.barcode || row.sku || row.code || "");
  return {
    itemName: itemName || (isLikelyBarcodeValue(code) ? `Unmatched UPC ${code}` : ""),
    quantity,
    destination: normalizeBulkImportDestination(row.destination || defaults.destination, defaults.destination || "Vault"),
    purchaserName: row.purchaserName || row.purchaser || row.buyer || defaults.purchaserName || "",
    unitCost: Number.isFinite(unitCost) ? unitCost : "",
    store: row.store || row.vendor || row.source || defaults.store || "",
    purchaseDate: row.purchaseDate || row.date || defaults.purchaseDate || "",
    notes: row.notes || row.memo || "",
    upcSku: code,
  };
}

function splitImportLine(line = "") {
  if (line.includes(",")) {
    const cells = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
      if (char === "\"") {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  }
  return line.split(/\t|\|/).map((cell) => cell.trim());
}

export function parseBulkImportText(text = "", defaults = {}) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headerCells = splitImportLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeaders = headerCells.some((cell) => /^(name|item|product|title|qty|quantity|destination|purchaser|buyer|cost|price|vendor|store|date|notes|upc|sku|barcode|code)$/.test(cell));
  const dataLines = hasHeaders ? lines.slice(1) : lines;
  const valueAt = (cells, aliases, fallbackIndex = -1) => {
    const index = hasHeaders ? headerCells.findIndex((header) => aliases.some((alias) => header.includes(alias))) : fallbackIndex;
    return index >= 0 ? cells[index] || "" : "";
  };

  return dataLines.map((line) => {
    const cells = splitImportLine(line);
    if (hasHeaders) {
      return normalizeBulkImportRow({
        originalText: line,
        itemName: valueAt(cells, ["name", "item", "product", "title"], 0),
        quantity: valueAt(cells, ["qty", "quantity", "count"], 1),
        destination: valueAt(cells, ["destination"], -1),
        purchaserName: valueAt(cells, ["purchaser", "buyer"], -1),
        unitCost: valueAt(cells, ["cost", "price", "paid"], -1),
        store: valueAt(cells, ["store", "vendor", "source"], -1),
        purchaseDate: valueAt(cells, ["date"], -1),
        notes: valueAt(cells, ["note", "memo"], -1),
        upcSku: valueAt(cells, ["upc", "sku", "barcode", "code"], -1),
      }, defaults);
    }

    const quantityMatch =
      line.match(/\b(?:qty|quantity)\s*[:#-]?\s*(\d+)\b/i) ||
      line.match(/\bx\s*[:#-]?\s*(\d+)\b/i) ||
      line.match(/\b(\d+)\s*x\b/i) ||
      line.match(/^\s*(\d+)\s+(?=\S)/i);
    const quantity = quantityMatch?.[1] || 1;
    const priceMatch = line.match(/\$\s*(\d+(?:\.\d{1,2})?)\b|\b(\d+\.\d{2})\b/);
    const codeMatch = line.match(/\b(?:upc|sku|barcode|code)\s*[:#-]?\s*([A-Z0-9-]{6,})\b/i);
    const cleanedName = line
      .replace(/\b(?:qty|quantity|x)\s*[:#-]?\s*\d+\b/gi, "")
      .replace(/\b\d+\s*x\b/gi, "")
      .replace(/^\s*\d+\s+(?=\S)/i, "")
      .replace(/\$\s*\d+(?:\.\d{1,2})?\b|\b\d+\.\d{2}\b/g, "")
      .replace(/\b(?:upc|sku|barcode|code)\s*[:#-]?\s*[A-Z0-9-]{6,}\b/gi, "")
      .replace(/[,|-]+/g, " ")
      .trim();
    return normalizeBulkImportRow({
      originalText: line,
      itemName: cleanedName,
      quantity,
      unitCost: priceMatch?.[1] || priceMatch?.[2] || "",
      upcSku: codeMatch?.[1] || "",
    }, defaults);
  });
}

export function validateManualFallbackDraft(draft = {}) {
  const errors = [];
  if (!String(draft.itemName || "").trim()) errors.push("Enter a product name.");
  const quantity = Number(draft.quantity || 1);
  if (!Number.isFinite(quantity) || quantity < 1) errors.push("Quantity must be at least 1.");
  const cost = draft.cost ?? draft.unitCost ?? draft.costPaid;
  if (cost !== "" && cost !== undefined && Number(cost) < 0) errors.push("Cost cannot be negative.");
  if (!draft.destination && !Object.values(draft.destinations || {}).some(Boolean)) errors.push("Choose a destination.");
  return { valid: errors.length === 0, errors };
}
