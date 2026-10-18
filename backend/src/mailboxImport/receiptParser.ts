import { load } from "cheerio";
import type { MailboxReceipt, ReceiptParserInput } from "./contracts";

type RecordValue = Record<string, unknown>;
type Retailer = { id: string; label: string; domains: readonly string[]; dollarMeansUsd: boolean };
type Money = { amount: number | null; currency: string | null };
type ReceiptItem = MailboxReceipt["items"][number];
type ParsedItem = ReceiptItem & { unitCurrency: string | null; lineCurrency: string | null };

const RETAILERS: readonly Retailer[] = [
  { id: "target", label: "Target", domains: ["target.com"], dollarMeansUsd: true },
  { id: "walmart", label: "Walmart", domains: ["walmart.com"], dollarMeansUsd: true },
  { id: "best-buy", label: "Best Buy", domains: ["bestbuy.com"], dollarMeansUsd: true },
  { id: "gamestop", label: "GameStop", domains: ["gamestop.com"], dollarMeansUsd: true },
  // Pokemon Center uses this domain for more than one country's storefront.
  { id: "pokemon-center", label: "Pokémon Center", domains: ["pokemoncenter.com"], dollarMeansUsd: false },
  { id: "amazon", label: "Amazon", domains: ["amazon.com"], dollarMeansUsd: true },
  { id: "costco", label: "Costco", domains: ["costco.com"], dollarMeansUsd: true },
  { id: "sams-club", label: "Sam's Club", domains: ["samsclub.com"], dollarMeansUsd: true },
  { id: "barnes-noble", label: "Barnes & Noble", domains: ["barnesandnoble.com", "bn.com"], dollarMeansUsd: true },
];
// Purchase Receiving currently represents money as hundredths of a major unit.
const CURRENCIES = new Set(["USD", "CAD", "EUR", "GBP", "AUD", "NZD"]);
const MAX_FIELD_BYTES = 512 * 1024;
const MAX_COMBINED_BYTES = 768 * 1024;
const MAX_ITEMS = 50;
const MAX_MONEY_MINOR = 100_000_000_000;
const PROTECTED_SUBJECT = /\b(?:password|passcode|otp|one[ -]time|verification\s+code|security\s+(?:alert|code|notice)|sign[ -]?in|log[ -]?in|reset\s+(?:your\s+)?(?:account|password)|verify\s+(?:your\s+)?(?:email|account))\b/i;
const PROTECTED_BODY = /\b(?:one[ -]time\s+(?:password|code|passcode)\b|(?:verification|security|login|sign[ -]?in)\s+(?:code|passcode)\s*(?:is\b|:)|(?:reset|change)\s+your\s+password\b|(?:password|access[_ -]?token|api[_ -]?key|authorization|session[_ -]?token)\s*[:=])/i;
const NON_PURCHASE_SUBJECT = /\b(?:shipp?ed|shipping\s+(?:confirmation|update)|out\s+for\s+delivery|delivered|delivery\s+(?:confirmation|update)|ready\s+(?:for|to)\s+(?:pickup|pick\s*up)|refund(?:ed)?|cancel(?:led|ed|lation)|return\s+(?:confirmation|received|label|request)|order\s+(?:update|status)|payment\s+(?:failed|declined)|save\s+\d|sale|promotion|coupon|discount\s+code)\b/i;
const POSITIVE_SUBJECT = /\b(?:order\s+(?:confirmation|confirmed|received|placed)|confirm(?:ed|ation)\s+(?:your\s+)?order|(?:your\s+)?order\b.{0,85}\b(?:confirmed|received|placed)|(?:thank\s+you|thanks)\s+for\s+(?:your\s+)?(?:order|purchase|shopping)|(?:your|purchase|order|payment|sales|electronic|e[ -]?)\s*receipt|receipt\s+(?:for|from)|purchase\s+confirmation)\b/i;

function object(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function string(value: unknown, max = 500): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).normalize("NFKC").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  return result && result.length <= max ? result : null;
}

function retailerFor(senderAddress: unknown): Retailer | null {
  if (typeof senderAddress !== "string" || senderAddress.length > 320) return null;
  const address = senderAddress.trim().toLowerCase();
  if (!/^[^\s@<>"\\]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(address)) return null;
  const domain = address.slice(address.lastIndexOf("@") + 1);
  if (domain.includes("..")) return null;
  return RETAILERS.find(retailer => retailer.domains.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))) || null;
}

/** Header-only gate lets the importer skip unrelated message bodies. It is not sender authentication. */
export function isPurchaseReceiptHeader(input: { subject: string; senderAddress: string }): boolean {
  const subject = typeof input?.subject === "string" && Buffer.byteLength(input.subject) <= 1024 ? string(input.subject, 1000) : null;
  return Boolean(subject && retailerFor(input.senderAddress) && !PROTECTED_SUBJECT.test(subject) && !NON_PURCHASE_SUBJECT.test(subject) && POSITIVE_SUBJECT.test(subject));
}

function safeReference(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,239}$/.test(value);
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(text)) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()) || text.slice(0, 10) !== new Date(`${text.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10)) return null;
  return text.length === 10 ? text : parsed.toISOString();
}

function cardNumber(value: string): boolean {
  const digits = value.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, n = 0; i >= 0; i -= 1, n += 1) {
    let digit = Number(digits[i]);
    if (n % 2) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
}

function orderId(value: unknown): string | null {
  const text = string(value, 80);
  return text && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/.test(text) && /\d/.test(text) && !cardNumber(text) ? text : null;
}

function description(value: unknown): string | null {
  const text = string(value, 300);
  if (!text || /[<>]|https?:|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) return null;
  if (/\b(?:password|passcode|api[_ -]?key|access[_ -]?token|bearer|authorization|cookie|cvv|cvc|iban|billing|shipping\s+address|ship\s+to|deliver\s+to|payment|credit\s+card|card\s+(?:number|ending)|visa|mastercard|amex|phone|telephone|social\s+security)\b/i.test(text)) return null;
  if (/\b(?:ignore\b.{0,30}\binstructions|(?:system|assistant|developer)\s*:|(?:run|execute)\s+(?:this\s+)?(?:command|script))\b/i.test(text)) return null;
  if (/\b\d{1,6}\s+(?:\S+\s+){0,5}(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?|court|ct\.?|way|suite|apt)\b/i.test(text)) return null;
  if (/(?:\d[ -]?){13,19}/.test(text) || /\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/.test(text)) return null;
  return text;
}

function quantity(value: unknown): number | null {
  const text = string(value, 8);
  if (!text || !/^\d{1,4}$/.test(text)) return null;
  const number = Number(text);
  return number >= 1 && number <= 1000 ? number : null;
}

function money(value: unknown, currencyHint: unknown, retailer: Retailer): Money {
  const text = string(value, 100);
  if (!text) return { amount: null, currency: null };
  const hint = typeof currencyHint === "string" ? currencyHint.trim().toUpperCase() : "";
  if (hint && !CURRENCIES.has(hint)) return { amount: null, currency: null };
  const found = new Set<string>();
  if (hint) found.add(hint);
  for (const code of text.match(/\b[A-Z]{3}\b/g) || []) {
    if (!CURRENCIES.has(code)) return { amount: null, currency: null };
    found.add(code);
  }
  if (/US\$/.test(text)) found.add("USD");
  if (/(?:C|CA)\$/.test(text)) found.add("CAD");
  if (/(?:A|AU)\$/.test(text)) found.add("AUD");
  if (/NZ\$/.test(text)) found.add("NZD");
  if (/€/.test(text)) found.add("EUR");
  if (/£/.test(text)) found.add("GBP");
  if (found.size > 1) return { amount: null, currency: null };
  let currency = [...found][0] || null;
  if (!currency && /\$/.test(text) && retailer.dollarMeansUsd) currency = "USD";
  if (!currency || /¥/.test(text)) return { amount: null, currency: null };
  if (/\$/.test(text) && !["USD", "CAD", "AUD", "NZD"].includes(currency)) return { amount: null, currency: null };
  let digits = text.replace(/\b(?:USD|CAD|EUR|GBP|AUD|NZD)\b/g, "").replace(/(?:US|CA|AU|NZ|C|A)?\$|[€£]/g, "").trim();
  if (currency === "EUR" && /^\d+,\d{1,2}$/.test(digits)) digits = digits.replace(",", ".");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(digits)) return { amount: null, currency };
  digits = digits.replace(/,/g, "");
  const [whole, fraction = ""] = digits.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return { amount: Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_MONEY_MINOR ? amount : null, currency };
}

function htmlParts(html: string): { text: string; orders: RecordValue[]; unreadable: boolean } {
  if (!html) return { text: "", orders: [], unreadable: false };
  const $ = load(html);
  const orders: RecordValue[] = [];
  let unreadable = false;
  const visit = (value: unknown, inheritedContext = false, depth = 0): void => {
    if (depth > 8 || orders.length > 8) { unreadable = true; return; }
    if (Array.isArray(value)) { if (value.length > 100) { unreadable = true; return; } for (const item of value) visit(item, inheritedContext, depth + 1); return; }
    const node = object(value);
    if (!node) return;
    const context = node["@context"];
    const schema = inheritedContext || (typeof context === "string" && /^https?:\/\/schema\.org\/?$/.test(context)) || /^https?:\/\/schema\.org\/?$/.test(String(object(context)?.["@vocab"] || ""));
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some(type => (schema && type === "Order") || /^https?:\/\/schema\.org\/Order$/.test(String(type)))) orders.push(node);
    if (node["@graph"]) visit(node["@graph"], schema, depth + 1);
  };
  const scripts = $('script[type="application/ld+json"]');
  if (scripts.length > 8) unreadable = true;
  scripts.slice(0, 8).each((_index, element) => {
    const source = $(element).text();
    if (Buffer.byteLength(source) > 128 * 1024) { unreadable = true; return; }
    try { visit(JSON.parse(source)); } catch { unreadable = true; }
  });
  $("script,style,noscript,template,svg,math,iframe,object,embed,link,meta,form,input,textarea,select,button,img,[hidden],[aria-hidden=true]").remove();
  $('[style]').each((_index, element) => { if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test($(element).attr("style") || "")) $(element).remove(); });
  $("br").replaceWith("\n");
  $("p,div,li,tr,h1,h2,h3,h4,section,article").each((_index, element) => { $(element).prepend("\n"); $(element).append("\n"); });
  $("td,th").each((_index, element) => { $(element).append(" "); });
  return { text: $.root().text(), orders, unreadable };
}

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

function textFields(text: string, subject: string, retailer: Retailer): { ids: string[]; totals: Money[]; dates: string[]; items: ParsedItem[]; ambiguousCurrency: boolean } {
  const lines = text.split(/\r?\n/).slice(0, 5000).map(line => line.trim()).filter(Boolean);
  const ids: string[] = [];
  const totals: Money[] = [];
  const dates: string[] = [];
  const items: ParsedItem[] = [];
  const currencyLines = lines.filter(line => /^currency\s*:/i.test(line));
  const currencies = unique(currencyLines.map(line => line.replace(/^currency\s*:\s*/i, "").trim().toUpperCase()));
  const currencyHint = currencies.length === 1 ? currencies[0] : "";
  for (const line of [subject, ...lines]) {
    for (const match of line.matchAll(/\border\s*(?:(?:number|no\.?|id)\s*[:#-]?|[#:]\s*)\s*([a-zA-Z0-9][a-zA-Z0-9_-]{2,79})\b/gi)) { const id = orderId(match[1]); if (id) ids.push(id); }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const total = /^(?:order\s+total|grand\s+total|total(?:\s+(?:paid|charged|amount))?|amount\s+(?:paid|charged))\s*:?\s*(.*?)\s*$/i.exec(line);
    if (total) {
      const value = total[1] || lines[index + 1] || "";
      totals.push(money(value, currencyHint, retailer));
    }
    const date = /^order\s+date\s*:\s*(.+)$/i.exec(line);
    if (date) { const parsed = isoDate(date[1]); if (parsed) dates.push(parsed); }
    const item = /^(?:item|product)\s*:\s*(.+)$/i.exec(line);
    if (item && items.length < MAX_ITEMS) {
      const parts = item[1].split(/\s*\|\s*/);
      const name = description(parts[0]);
      if (!name) continue;
      const fields = [...parts.slice(1)];
      for (const following of lines.slice(index + 1, index + 5)) {
        if (!/^(?:qty|quantity|unit\s+price|line\s+total)\s*:/i.test(following)) break;
        fields.push(following);
      }
      const qty = fields.map(value => /^(?:qty|quantity)\s*:\s*(\d+)$/i.exec(value)?.[1]).find(Boolean);
      const unit = fields.map(value => /^unit\s+price\s*:\s*(.+)$/i.exec(value)?.[1]).find(Boolean);
      const lineTotal = fields.map(value => /^line\s+total\s*:\s*(.+)$/i.exec(value)?.[1]).find(Boolean);
      const unitMoney = money(unit, currencyHint, retailer); const lineMoney = money(lineTotal, currencyHint, retailer);
      items.push({ description: name, quantity: quantity(qty), unitPriceMinorUnits: unitMoney.amount, lineTotalMinorUnits: lineMoney.amount, unitCurrency: unitMoney.currency, lineCurrency: lineMoney.currency });
    }
  }
  return { ids: unique(ids), totals, dates: unique(dates), items, ambiguousCurrency: currencies.length > 1 };
}

function structuredItems(order: RecordValue, currencyHint: string | null, retailer: Retailer, warnings: Set<string>): ReceiptItem[] {
  const offers = Array.isArray(order.acceptedOffer) ? order.acceptedOffer : order.acceptedOffer ? [order.acceptedOffer] : [];
  if (offers.length > MAX_ITEMS) { warnings.add("Too many item rows were supplied; review the original receipt."); return []; }
  const items: ReceiptItem[] = [];
  for (const value of offers) {
    const offer = object(value); if (!offer) continue;
    const name = description(object(offer.itemOffered)?.name);
    if (!name) { warnings.add("An item description was omitted because it was unclear or contained private data."); continue; }
    const itemQuantity = quantity(object(offer.eligibleQuantity)?.value ?? offer.quantity);
    const price = money(offer.price, offer.priceCurrency || currencyHint, retailer);
    const consistentCurrency = price.currency && (!currencyHint || price.currency === currencyHint);
    items.push({ description: name, quantity: itemQuantity, unitPriceMinorUnits: consistentCurrency ? price.amount : null, lineTotalMinorUnits: null });
    if (!consistentCurrency && offer.price != null) warnings.add("An item currency was unclear or differed from the order currency.");
  }
  return items;
}

/** Extract a review candidate only. Never execute HTML, fetch links, or retain raw mailbox content. */
export function parsePurchaseReceipt(input: ReceiptParserInput): MailboxReceipt | null {
  if (!input || !isPurchaseReceiptHeader(input) || !safeReference(input.sourceId) || !safeReference(input.accountReference) || !["aol", "gmail", "yahoo"].includes(input.provider)) return null;
  const receivedAt = isoDate(input.receivedAt);
  if (!receivedAt || typeof input.text !== "string" || typeof input.html !== "string") return null;
  const textBytes = Buffer.byteLength(input.text); const htmlBytes = Buffer.byteLength(input.html);
  if (textBytes > MAX_FIELD_BYTES || htmlBytes > MAX_FIELD_BYTES || textBytes + htmlBytes > MAX_COMBINED_BYTES) return null;
  const retailer = retailerFor(input.senderAddress)!;
  const warnings = new Set<string>(["Review this receipt before saving a purchase.", "The sender domain is recognized; sender authenticity has not been verified."]);
  let html: ReturnType<typeof htmlParts>;
  try { html = htmlParts(input.html); } catch { return null; }
  const text = input.text || html.text;
  if (PROTECTED_BODY.test(`${input.text}\n${html.text}`)) return null;
  if (html.unreadable) warnings.add("Some structured receipt data could not be read.");
  const fallback = textFields(text, input.subject, retailer);
  let ids = [...fallback.ids]; let totals = [...fallback.totals]; let dates = [...fallback.dates]; let items: ReceiptItem[] = [];
  let structuredCurrency: string | null = null;
  if (html.orders.length > 1) {
    warnings.add("Multiple orders were found; the order and item details need manual review.");
    ids = []; totals = []; dates = [];
  } else if (html.orders.length === 1) {
    const order = html.orders[0];
    if (/Order(?:Cancelled|Canceled|Returned|InTransit|Delivered|PaymentDue|Problem)/i.test(String(order.orderStatus || ""))) return null;
    const schemaId = orderId(order.orderNumber); if (schemaId) ids.push(schemaId);
    const date = isoDate(order.orderDate); if (date) dates.push(date);
    const schemaCurrency = typeof order.priceCurrency === "string" && CURRENCIES.has(order.priceCurrency.toUpperCase()) ? order.priceCurrency.toUpperCase() : null;
    const price = order.price ?? order.totalPrice;
    const schemaMoney = money(price, order.priceCurrency, retailer);
    if (price != null) totals.push(schemaMoney);
    structuredCurrency = schemaMoney.currency || schemaCurrency;
    items = structuredItems(order, structuredCurrency, retailer, warnings);
  }
  ids = unique(ids); dates = unique(dates);
  const validTotals = unique(totals.filter(value => value.amount !== null && value.currency).map(value => `${value.currency}:${value.amount}`));
  const ambiguousTotals = fallback.ambiguousCurrency || validTotals.length > 1 || (totals.some(value => value.amount === null) && totals.length > 1);
  const total = validTotals.length === 1 && !ambiguousTotals ? totals.find(value => value.amount !== null && value.currency)! : { amount: null, currency: null };
  const currency = ambiguousTotals ? null : total.currency || structuredCurrency;
  if (!html.orders.length) {
    items = fallback.items.map(({ unitCurrency, lineCurrency, ...item }) => {
      if ((item.unitPriceMinorUnits !== null && unitCurrency !== currency) || (item.lineTotalMinorUnits !== null && lineCurrency !== currency)) warnings.add("An item currency was unclear or differed from the order currency.");
      return { ...item, unitPriceMinorUnits: currency && unitCurrency === currency ? item.unitPriceMinorUnits : null, lineTotalMinorUnits: currency && lineCurrency === currency ? item.lineTotalMinorUnits : null };
    });
  }
  if (ambiguousTotals) warnings.add("Conflicting totals or currencies were found; enter the verified order total.");
  if (ids.length !== 1) warnings.add(ids.length > 1 ? "Multiple order numbers were found; choose the correct order." : "The order number could not be confidently extracted.");
  if (dates.length !== 1) warnings.add("The order date could not be confidently extracted.");
  if (total.amount === null) warnings.add("The order total could not be confidently extracted.");
  if (!currency) warnings.add("The currency could not be confidently extracted.");
  if (!items.length) warnings.add("Item details could not be confidently extracted; add them after reviewing the receipt.");
  if (items.some(item => item.quantity === null || item.unitPriceMinorUnits === null)) warnings.add("Some item quantities or prices need review.");
  if (!currency) items = items.map(item => ({ ...item, unitPriceMinorUnits: null, lineTotalMinorUnits: null }));
  return { sourceId: input.sourceId, provider: input.provider, accountReference: input.accountReference, retailerId: retailer.id, retailerLabel: retailer.label, orderId: ids.length === 1 ? ids[0] : null, receivedAt, orderedAt: dates.length === 1 ? dates[0] : null, currency, totalMinorUnits: total.amount, items, warnings: [...warnings] };
}
