export function groupedInventoryEntryIds(item = {}) {
  const entries = Array.isArray(item.rawItems) && item.rawItems.length ? item.rawItems : [item];
  return entries.map((entry) => entry?.id).filter(Boolean);
}

export function normalizeInventoryGroupText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function inventoryGroupDisplayName(item = {}) {
  const entries = Array.isArray(item.rawItems) && item.rawItems.length ? item.rawItems : [item];
  const firstEntry = entries[0] || {};
  const name = item.name
    || item.itemName
    || item.item_name
    || item.productName
    || item.product_name
    || item.catalogProductName
    || item.catalog_product_name
    || firstEntry.name
    || firstEntry.itemName
    || firstEntry.item_name
    || firstEntry.productName
    || firstEntry.product_name
    || firstEntry.catalogProductName
    || firstEntry.catalog_product_name
    || "";

  return String(name).trim();
}

export function compareInventoryGroupsAlphabetically(a = {}, b = {}) {
  const byName = inventoryGroupDisplayName(a).localeCompare(inventoryGroupDisplayName(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });

  if (byName !== 0) return byName;

  return String(a.groupId || a.id || "").localeCompare(String(b.groupId || b.id || ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export function inventoryVariantSignature(item = {}) {
  return [
    item.variant,
    item.variantName,
    item.variant_name,
    item.productVariant,
    item.product_variant,
    item.conditionName,
    item.condition_name,
    item.condition,
    item.sealedCondition,
    item.sealed_condition,
    item.finish,
    item.printing,
    item.language,
    item.size,
    item.sealedType,
    item.sealed_type,
    item.productSize,
    item.product_size,
    item.packCount,
    item.pack_count,
  ]
    .map(normalizeInventoryGroupText)
    .filter(Boolean)
    .join("|");
}

export function inventoryProductIdentityGroupKey(item = {}, context = "inventory") {
  const productId = [
    item.catalogProductId,
    item.catalog_product_id,
    item.catalogItemId,
    item.catalog_item_id,
    item.masterCatalogItemId,
    item.master_catalog_item_id,
    item.externalProductId,
    item.external_product_id,
    item.tcgplayerProductId,
    item.tcgplayer_product_id,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean);
  const variant = inventoryVariantSignature(item);

  if (productId) return `${context}:product:${productId}|variant:${variant}`;

  const name = normalizeInventoryGroupText(item.name || item.itemName || item.item_name || item.catalogProductName || item.catalog_product_name || "");
  const setName = normalizeInventoryGroupText(item.setName || item.set_name || item.expansion || item.series || item.productLine || item.product_line || "");
  const productType = normalizeInventoryGroupText(item.productType || item.product_type || item.category || item.sealedType || item.sealed_type || "");
  if (name) return `${context}:name:${name}|set:${setName}|type:${productType}|variant:${variant}`;

  const code = [
    item.barcode,
    item.upc,
    item.sku,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean);
  if (code) return `${context}:code:${code}|set:${setName}|type:${productType}|variant:${variant}`;

  return `${context}:row:${item.id || "unknown"}`;
}

export function inventoryEntryIsSold(entry = {}) {
  const status = normalizeInventoryGroupText(entry.status || entry.inventoryStatus || entry.inventory_status || "");
  return Boolean(
    status.includes("sold") ||
    entry.soldAt ||
    entry.sold_at ||
    entry.saleDate ||
    entry.sale_date ||
    entry.actualSalePrice ||
    entry.actual_sale_price
  );
}

export function groupedInventoryUnsoldEntryIds(item = {}) {
  const entries = Array.isArray(item.rawItems) && item.rawItems.length ? item.rawItems : [item];
  return entries
    .filter((entry) => entry?.id && !inventoryEntryIsSold(entry) && Number(entry.quantity || 0) > 0)
    .map((entry) => entry.id);
}

export function saleRecordInventoryId(sale = {}) {
  return String(
    sale.itemId
    || sale.item_id
    || sale.linkedInventoryItemId
    || sale.linked_inventory_item_id
    || sale.inventoryItemId
    || sale.inventory_item_id
    || ""
  ).trim();
}

function saleLineInventoryId(line = {}) {
  return saleRecordInventoryId(line);
}

function saleLineQuantity(line = {}) {
  const quantity = Number(line.quantitySold ?? line.quantity_sold ?? line.quantity ?? line.qty ?? 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function saleLineName(line = {}) {
  return line.itemName
    || line.item_name
    || line.manualItemName
    || line.manual_item_name
    || line.name
    || line.productName
    || line.product_name
    || "";
}

function inventoryItemName(item = {}) {
  return item.name
    || item.itemName
    || item.item_name
    || item.productName
    || item.product_name
    || item.catalogProductName
    || item.catalog_product_name
    || "";
}

function purchaserIdentity(record = {}) {
  return normalizeInventoryGroupText(
    record.purchaserId
    || record.purchaser_id
    || record.purchaserName
    || record.purchaser_name
    || record.originalBuyer
    || record.original_buyer
    || record.buyerName
    || record.buyer_name
    || record.buyer
    || record.owner
    || "",
  );
}

export function saleInventoryRestoreLines(sale = {}) {
  const lineCollections = [
    sale.saleItems,
    sale.sale_items,
    sale.items,
    sale.lineItems,
    sale.line_items,
  ];
  const explicitLines = lineCollections.find((value) => Array.isArray(value) && value.length);

  if (explicitLines) {
    return explicitLines
      .map((line) => ({
        itemId: saleLineInventoryId(line),
        itemName: saleLineName(line),
        purchaserKey: purchaserIdentity(line),
        quantity: saleLineQuantity(line),
        rawLine: line,
      }))
      .filter((line) => line.quantity > 0 && (line.itemId || line.itemName));
  }

  const itemId = saleRecordInventoryId(sale);
  const quantity = saleLineQuantity(sale);
  if (!itemId || !quantity) return [];

  return [{
    itemId,
    itemName: saleLineName(sale),
    purchaserKey: purchaserIdentity(sale),
    quantity,
    rawLine: sale,
  }];
}

function saleAlreadyRestoredInventory(sale = {}) {
  return Boolean(
    sale.inventoryRestoredAt
    || sale.inventory_restored_at
    || sale.restoredToInventory
    || sale.restored_to_inventory
  );
}

function findInventoryRestoreIndex(items, line, usedIndexes) {
  const itemId = String(line.itemId || "");
  if (itemId) {
    const exactIndex = items.findIndex((item) => String(item.id || "") === itemId);
    if (exactIndex >= 0) return exactIndex;
  }

  const lineName = normalizeInventoryGroupText(line.itemName);
  if (!lineName) return -1;

  const nameMatches = items
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => !usedIndexes.has(index)
      && normalizeInventoryGroupText(inventoryItemName(item)) === lineName);

  if (!nameMatches.length) return -1;

  if (line.purchaserKey) {
    const purchaserMatch = nameMatches.find(({ item }) => purchaserIdentity(item) === line.purchaserKey);
    if (purchaserMatch) return purchaserMatch.index;
  }

  return nameMatches[0].index;
}

export function restoreSaleItemsToInventory(inventoryItems = [], sale = {}, options = {}) {
  const now = options.now || new Date().toISOString();

  if (saleAlreadyRestoredInventory(sale)) {
    return {
      ok: true,
      alreadyRestored: true,
      items: inventoryItems,
      restoredLines: [],
      missingLines: [],
      updatedItems: [],
    };
  }

  const restoreLines = saleInventoryRestoreLines(sale);
  if (!restoreLines.length) {
    return {
      ok: true,
      items: inventoryItems,
      restoredLines: [],
      missingLines: [],
      updatedItems: [],
    };
  }

  const nextItems = inventoryItems.map((item) => ({ ...item }));
  const usedIndexes = new Set();
  const missingLines = [];
  const restoredLines = [];
  const updatedById = new Map();

  restoreLines.forEach((line) => {
    const itemIndex = findInventoryRestoreIndex(nextItems, line, usedIndexes);
    if (itemIndex < 0) {
      missingLines.push(line);
      return;
    }

    usedIndexes.add(itemIndex);
    const currentItem = nextItems[itemIndex];
    const previousQuantity = Number(currentItem.quantity || 0);
    const nextQuantity = previousQuantity + line.quantity;
    const currentStatus = String(currentItem.status || "").trim();
    const normalizedStatus = normalizeInventoryGroupText(currentStatus);
    const nextStatus = normalizedStatus === "sold" || normalizedStatus === "out of stock" ? "In Stock" : currentStatus;
    const updatedItem = {
      ...currentItem,
      quantity: nextQuantity,
      status: nextStatus,
      updatedAt: now,
      updated_at: now,
    };

    nextItems[itemIndex] = updatedItem;
    if (updatedItem.id) updatedById.set(String(updatedItem.id), updatedItem);
    restoredLines.push({
      ...line,
      itemId: updatedItem.id || line.itemId,
      previousQuantity,
      nextQuantity,
    });
  });

  if (missingLines.length) {
    return {
      ok: false,
      items: inventoryItems,
      restoredLines: [],
      missingLines,
      updatedItems: [],
    };
  }

  return {
    ok: true,
    items: nextItems,
    restoredLines,
    missingLines: [],
    updatedItems: Array.from(updatedById.values()),
  };
}

export function saleMatchesInventoryEntry(sale = {}, entry = {}) {
  const saleItemId = saleRecordInventoryId(sale);
  if (saleItemId && entry?.id && String(entry.id) === saleItemId) return true;

  const saleSku = normalizeInventoryGroupText(sale.sku || sale.productSku || sale.product_sku || "");
  const entrySku = normalizeInventoryGroupText(entry.sku || entry.barcode || entry.upc || "");
  const saleName = normalizeInventoryGroupText(sale.itemName || sale.item_name || sale.manualItemName || sale.manual_item_name || "");
  const entryName = normalizeInventoryGroupText(entry.name || entry.itemName || entry.item_name || "");
  return Boolean(saleName && entryName && saleName === entryName && (!saleSku || !entrySku || saleSku === entrySku));
}

export function saleMatchesInventoryGroup(sale = {}, entries = []) {
  return entries.some((entry) => saleMatchesInventoryEntry(sale, entry));
}

export function buildForgeGroupSaleHistory(entries = [], sales = []) {
  return sales
    .filter((sale) => saleMatchesInventoryGroup(sale, entries))
    .map((sale) => ({
      ...sale,
      activityType: "sale",
      activityDate: sale.saleDate || sale.sale_date || sale.soldAt || sale.sold_at || sale.createdAt || sale.created_at || "",
      quantitySold: Number(sale.quantitySold ?? sale.quantity_sold ?? 0),
      finalSalePrice: Number(sale.finalSalePrice ?? sale.final_sale_price ?? 0),
      netProfit: Number(sale.netProfit ?? sale.net_profit ?? sale.estimatedProfitLoss ?? sale.estimated_profit_loss ?? 0),
    }))
    .sort((a, b) => String(b.activityDate || "").localeCompare(String(a.activityDate || "")));
}

export function summarizeForgeGroupedInventoryStatus(entries = [], sales = []) {
  const currentQuantity = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0);
  const soldFromSales = sales.reduce((sum, sale) => sum + Math.max(0, Number(sale.quantitySold ?? sale.quantity_sold ?? 0)), 0);
  const soldWithoutSaleRecord = entries.reduce((sum, entry) => {
    if (!inventoryEntryIsSold(entry)) return sum;
    return sum + Math.max(0, Number(entry.quantity || entry.originalQuantity || entry.original_quantity || 0));
  }, 0);
  const soldQuantity = Math.max(soldFromSales, soldWithoutSaleRecord);
  const listedQuantity = entries.reduce((sum, entry) => {
    const status = normalizeInventoryGroupText(entry.status || "");
    const isListed = status.includes("listed") || Boolean(entry.listingPlatform || entry.listingUrl || Number(entry.listedPrice || 0) > 0);
    return isListed ? sum + Math.max(0, Number(entry.quantity || 0)) : sum;
  }, 0);
  const keptQuantity = entries.reduce((sum, entry) => {
    const status = normalizeInventoryGroupText(entry.status || entry.vaultStatus || entry.vault_status || "");
    const kept = status.includes("kept") || status.includes("vault") || status.includes("personal");
    return kept ? sum + Math.max(0, Number(entry.quantity || 0)) : sum;
  }, 0);
  const totalActivityQuantity = currentQuantity + soldQuantity;
  return {
    currentQuantity,
    totalQuantity: totalActivityQuantity,
    listedQuantity,
    soldQuantity,
    keptQuantity,
    entryCount: entries.length,
    saleCount: sales.length,
  };
}

export function buildPlannedSalePricePatch(entry = {}, nextPrice = 0, changedAt = new Date().toISOString()) {
  const previousPrice = Number(entry.salePrice || entry.plannedSalePrice || entry.planned_sale_price || 0);
  return {
    salePrice: nextPrice,
    plannedSalePrice: nextPrice,
    planned_sale_price: nextPrice,
    plannedSalePriceSource: "manual",
    plannedSalePriceConfidence: "Manual",
    plannedSalePriceReviewedAt: changedAt,
    plannedSalePriceHistory: [
      ...(Array.isArray(entry.plannedSalePriceHistory) ? entry.plannedSalePriceHistory : []),
      {
        price: nextPrice,
        previousPrice,
        changedAt,
        source: "quick_update",
      },
    ],
    updatedAt: changedAt,
  };
}

export function plannedSalePriceUpdateSummary(item = {}) {
  const count = groupedInventoryEntryIds(item).length || 1;
  return count === 1 ? "1 saved entry" : `${count} saved entries`;
}
