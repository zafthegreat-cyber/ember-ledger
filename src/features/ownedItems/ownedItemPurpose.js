export const OWNED_ITEM_PURPOSES = Object.freeze({
  PERSONAL_COLLECTION: "PERSONAL_COLLECTION",
  FOR_RESALE: "FOR_RESALE",
  HOLD: "HOLD",
  KIDS_COMMUNITY: "KIDS_COMMUNITY",
  UNASSIGNED: "UNASSIGNED",
});

export const OWNED_ITEM_PURPOSE_OPTIONS = Object.freeze([
  { value: OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION, label: "Personal collection" },
  { value: OWNED_ITEM_PURPOSES.FOR_RESALE, label: "For resale" },
  { value: OWNED_ITEM_PURPOSES.HOLD, label: "Hold" },
  { value: OWNED_ITEM_PURPOSES.KIDS_COMMUNITY, label: "Kids & community" },
  { value: OWNED_ITEM_PURPOSES.UNASSIGNED, label: "Unassigned" },
]);

const VALID_PURPOSES = new Set(Object.values(OWNED_ITEM_PURPOSES));

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function explicitPurpose(record = {}) {
  const candidates = [record.ownedItemPurpose, record.itemPurpose];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim().toUpperCase();
    if (VALID_PURPOSES.has(value)) return value;
  }
  return "";
}

export function inferOwnedItemPurpose(record = {}) {
  const explicit = explicitPurpose(record);
  if (explicit) return explicit;

  const searchable = [
    record.workspace,
    record.destination,
    record.recordType,
    record.type,
    record.status,
    record.currentStatus,
    record.collectionType,
    record.inventoryType,
    record.sourceModule,
  ]
    .map(normalizedText)
    .join(" ");

  if (/(kids|community|donat|giveaway|gift pack)/.test(searchable)) {
    return OWNED_ITEM_PURPOSES.KIDS_COMMUNITY;
  }
  if (/(wishlist|watch list|long[- ]?term hold|hold)/.test(searchable)) {
    return OWNED_ITEM_PURPOSES.HOLD;
  }
  if (
    record.forSale === true ||
    record.isInventory === true ||
    /(forge|resale|inventory|seller|listed|sold|to sell)/.test(searchable)
  ) {
    return OWNED_ITEM_PURPOSES.FOR_RESALE;
  }
  if (
    record.personalCollection === true ||
    /(vault|personal collection|my collection|collection item|binder)/.test(searchable)
  ) {
    return OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION;
  }
  return OWNED_ITEM_PURPOSES.UNASSIGNED;
}

export function normalizeOwnedItem(record = {}) {
  const ownedItemPurpose = inferOwnedItemPurpose(record);
  return {
    ...record,
    ownedItemPurpose,
    purposeSource: explicitPurpose(record) ? "explicit" : "legacy-compatibility",
  };
}

export function ownedItemWorkspace(record = {}) {
  const purpose = inferOwnedItemPurpose(record);
  if (
    purpose === OWNED_ITEM_PURPOSES.PERSONAL_COLLECTION ||
    purpose === OWNED_ITEM_PURPOSES.HOLD ||
    purpose === OWNED_ITEM_PURPOSES.KIDS_COMMUNITY
  ) {
    return "collection";
  }
  if (purpose === OWNED_ITEM_PURPOSES.FOR_RESALE) return "business";
  return "unassigned";
}

export function changeOwnedItemPurpose(
  record,
  nextPurpose,
  { at = new Date().toISOString(), changedBy = "owner", reason = "Purpose updated" } = {},
) {
  const normalizedNextPurpose = String(nextPurpose || "").trim().toUpperCase();
  if (!VALID_PURPOSES.has(normalizedNextPurpose)) {
    throw new Error("Select a valid owned-item purpose.");
  }

  const previousPurpose = inferOwnedItemPurpose(record);
  if (previousPurpose === normalizedNextPurpose && explicitPurpose(record)) return { ...record };

  const historyEntry = {
    id: `purpose-${String(record?.id || "item")}-${at}`,
    type: "OWNED_ITEM_PURPOSE_CHANGED",
    from: previousPurpose,
    to: normalizedNextPurpose,
    at,
    changedBy,
    reason: String(reason || "Purpose updated").trim() || "Purpose updated",
  };

  return {
    ...record,
    ownedItemPurpose: normalizedNextPurpose,
    purposeUpdatedAt: at,
    purposeHistory: [...(Array.isArray(record?.purposeHistory) ? record.purposeHistory : []), historyEntry],
    updatedAt: at,
  };
}

export function summarizePurposeCompatibility(records = []) {
  const summary = Object.fromEntries(Object.values(OWNED_ITEM_PURPOSES).map((purpose) => [purpose, 0]));
  let explicitCount = 0;
  let compatibilityCount = 0;

  for (const record of Array.isArray(records) ? records : []) {
    const purpose = inferOwnedItemPurpose(record);
    summary[purpose] += 1;
    if (explicitPurpose(record)) explicitCount += 1;
    else compatibilityCount += 1;
  }

  return {
    byPurpose: summary,
    explicitCount,
    compatibilityCount,
    unmappedCount: summary[OWNED_ITEM_PURPOSES.UNASSIGNED],
  };
}
