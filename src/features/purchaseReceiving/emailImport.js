import { normalizePurchaseMoney, multiplyMoney, normalizePurchaseMoneySummary } from "./money.js";
import { assertSafePurchaseReceivingInput } from "./security.js";

function text(value, label, maximum = 500, required = true) {
  if (typeof value !== "string" || value.trim().length > maximum || (required && !value.trim())) {
    throw new Error(`Review ${label} before saving this draft.`);
  }
  return value.trim();
}

function timestamp(value, label) {
  const input = text(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input)) throw new Error(`Review ${label} before saving this draft.`);
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input.slice(0, 10)) {
    throw new Error(`Review ${label} before saving this draft.`);
  }
  return parsed.toISOString();
}

const orderKey = (value) => String(value || "").trim().toUpperCase();
const retailerKey = (value) => String(value || "").normalize("NFKD").toLowerCase().replace(/^retailer-preset:/, "").replace(/[^a-z0-9]/g, "");

/** Receipt matching is conservative across mailboxes: an existing order is opened, never replaced. */
export function receiptDuplicate(receipt, snapshot = {}) {
  const sourceReference = receipt?.sourceReference || (receipt?.sourceId ? `email-receipt:${receipt.sourceId}` : null);
  const order = orderKey(receipt?.externalOrderId || receipt?.orderId);
  const retailers = new Set([receipt?.retailerId, receipt?.retailerLabel, receipt?.vendorName].map(retailerKey).filter(Boolean));
  const collections = [["purchase", snapshot.purchases], ["draft", snapshot.purchaseDrafts || snapshot.existingDrafts]];
  for (const reason of ["source", "order"]) {
    for (const [kind, records] of collections) {
      for (const record of records || []) {
        const matches = reason === "source"
          ? sourceReference && record.sourceReference === sourceReference
          : order && orderKey(record.externalOrderId) === order
            && [record.retailerId, record.retailerLabel, record.vendorName].some((value) => retailers.has(retailerKey(value)));
        if (matches) return { kind, record, reason };
      }
    }
  }
  return null;
}

/** Only reviewed business fields cross into persistence. No mailbox credential or raw email is copied. */
export function buildEmailPurchaseDraft(review) {
  assertSafePurchaseReceivingInput(review);
  const receipt = review?.receipt;
  if (!receipt || !/^email:[a-f0-9]{64}$/.test(receipt.sourceId)
    || !/^mailbox:[a-f0-9]{64}$/.test(receipt.accountReference)
    || !["aol", "gmail", "yahoo"].includes(receipt.provider)) {
    throw new Error("Pull and review this receipt again before saving.");
  }
  const currency = text(review.currency, "the currency", 3).toUpperCase();
  if (!["USD", "CAD", "GBP", "EUR", "AUD", "NZD"].includes(currency)) throw new Error("Choose a supported currency shown on your receipt.");
  if (!Array.isArray(review.items) || !review.items.length || review.items.length > 100) {
    throw new Error("Add the purchased items before saving this draft.");
  }
  const lineItems = review.items.map((item, index) => {
    const quantityText = text(String(item.quantity ?? ""), `item ${index + 1} quantity`, 7);
    const quantityOrdered = Number(quantityText);
    if (!/^\d+$/.test(quantityText) || !Number.isSafeInteger(quantityOrdered) || quantityOrdered < 1 || quantityOrdered > 1_000_000) {
      throw new Error(`Enter a whole quantity for item ${index + 1}.`);
    }
    const unitPrice = normalizePurchaseMoney(text(item.unitPrice, `item ${index + 1} unit price`, 30), { currency, field: `Item ${index + 1} unit price` });
    return {
      title: text(item.title, `item ${index + 1} name`),
      quantityOrdered,
      unitPrice,
      lineAmount: multiplyMoney(unitPrice, quantityOrdered),
      productMatchStatus: "UNRESOLVED",
    };
  });
  const money = normalizePurchaseMoneySummary({
    currency,
    grandTotal: text(review.total, "the order total", 30),
    ...Object.fromEntries(["tax", "shipping", "fees", "discount"].map((field) => [field, review[field] == null || review[field] === "" ? "0" : text(review[field], field, 30)])),
  }, { currency, lineItems });
  if (money.warnings.length) throw new Error("The items, tax, shipping, fees, and discount must add up to the order total. Review the amounts before saving.");
  const sourceReference = `email-receipt:${receipt.sourceId}`;
  const externalOrderId = text(review.externalOrderId ?? "", "the order number", 256, false) || null;
  const draft = {
    sourceType: "ORDER_CANDIDATE",
    sourceReference,
    retailerAccountReference: receipt.accountReference,
    retailerId: text(receipt.retailerId, "the retailer", 256),
    retailerLabel: text(review.retailerLabel, "the retailer name"),
    externalOrderId,
    purchasedAt: timestamp(review.purchasedAt, "the purchase date"),
    currency,
    lineItems,
    money,
    status: "NEEDS_REVIEW",
    confidence: "MEDIUM",
    warnings: ["REVIEW_EMAIL_RECEIPT", "PRODUCT_MATCH_REQUIRED", ...(!externalOrderId ? ["EXTERNAL_ORDER_ID_MISSING"] : [])],
    provenance: [{ type: "EMAIL_EVIDENCE", sourceReference, recordedAt: timestamp(receipt.receivedAt, "the receipt date"), note: "Purchase details reviewed from an email receipt. Original email remains in the mailbox." }],
  };
  assertSafePurchaseReceivingInput(draft);
  return draft;
}
