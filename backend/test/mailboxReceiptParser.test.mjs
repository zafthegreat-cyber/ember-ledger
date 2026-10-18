import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parsePurchaseReceipt, isPurchaseReceiptHeader } = require("../dist/mailboxImport/receiptParser.js");
const base = {
  sourceId: "aol:synthetic-source-1", provider: "aol", accountReference: "mailbox.synthetic-reference",
  receivedAt: "2026-10-17T18:25:00.000Z", subject: "Your Target order confirmation", senderAddress: "orders@orders.target.com",
  text: "Thanks for your order!\nOrder number: T123-456789\nOrder date: 2026-10-17\nOrder total: $54.99", html: "",
};
const parse = overrides => parsePurchaseReceipt({ ...base, ...overrides });
const structured = (order, body = "") => `<html><body><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Order", ...order })}</script>${body}</body></html>`;
const order = {
  orderNumber: "123-4567890-1234567", orderStatus: "https://schema.org/OrderProcessing", orderDate: "2026-10-16T12:00:00-04:00", priceCurrency: "USD", price: "109.98",
  acceptedOffer: [{ "@type": "Offer", itemOffered: { "@type": "Product", name: "Pokémon Scarlet & Violet Booster Bundle", url: "https://shop.example.test/private-tracking", image: "https://tracking.example.test/pixel" }, price: "54.99", priceCurrency: "USD", eligibleQuantity: { "@type": "QuantitativeValue", value: "2" } }],
};

function assertNarrow(receipt) {
  assert.deepEqual(Object.keys(receipt).sort(), ["sourceId", "provider", "accountReference", "retailerId", "retailerLabel", "orderId", "receivedAt", "orderedAt", "currency", "totalMinorUnits", "items", "warnings"].sort());
  for (const item of receipt.items) assert.deepEqual(Object.keys(item).sort(), ["description", "quantity", "unitPriceMinorUnits", "lineTotalMinorUnits"].sort());
  assert.ok(receipt.warnings.includes("Review this receipt before saving a purchase."));
  assert.ok(receipt.warnings.some(warning => /authenticity has not been verified/.test(warning)));
}

test("recognized confirmation produces a minimal review candidate without invented products", () => {
  const result = parse({}); assertNarrow(result);
  assert.equal(result.retailerId, "target"); assert.equal(result.orderId, "T123-456789");
  assert.equal(result.totalMinorUnits, 5499); assert.equal(result.currency, "USD"); assert.equal(result.orderedAt, "2026-10-17");
  assert.deepEqual(result.items, []); assert.ok(result.warnings.some(value => /Item details/.test(value)));
});

for (const [domain, retailerId] of [["target.com", "target"], ["walmart.com", "walmart"], ["bestbuy.com", "best-buy"], ["gamestop.com", "gamestop"], ["pokemoncenter.com", "pokemon-center"], ["amazon.com", "amazon"], ["costco.com", "costco"], ["samsclub.com", "sams-club"], ["barnesandnoble.com", "barnes-noble"], ["bn.com", "barnes-noble"]]) {
  test(`${domain}: exact and true subdomains are recognized`, () => {
    for (const senderAddress of [`orders@${domain}`, `Orders@transaction.${domain.toUpperCase()}`]) {
      const result = parse({ senderAddress, subject: "Thank you for your purchase", text: "Order #: TEST12345\nTotal: USD 25.00" });
      assert.equal(result.retailerId, retailerId); assert.equal(result.totalMinorUnits, 2500); assertNarrow(result);
    }
  });
}

for (const senderAddress of ["orders@target.com.evil.test", "orders@not-target.com", "orders@targetcom.test", "orders@target.com@evil.test", '"Target" <orders@evil.test>', "orders@target..com", "orders@unknown.test", "orders@amazon.ca", "orders@target.com\nBcc: hidden@example.test"]) {
  test(`untrusted sender rejected: ${senderAddress.replaceAll("\n", " ")}`, () => assert.equal(parse({ senderAddress }), null));
}

for (const subject of ["Your verification code", "Your Target order confirmation: password reset", "Security alert", "Sign in to see your receipt", "Your order has shipped", "Your order was delivered", "Your order was cancelled", "Your order was canceled", "Your refund receipt", "Order update", "Your receipt is ready for pickup", "Order confirmation sale today", "Get 20 percent off your next order", "Your cart is waiting", "Shop our newest cards"]) {
  test(`non-purchase or protected subject rejected: ${subject}`, () => assert.equal(parse({ subject }), null));
}

for (const text of ["Your one-time code is 123456", "Verification code: 123456", "Reset your password now", "password: synthetic-protected", "access_token=synthetic-protected", "Authorization: Bearer synthetic-protected"]) {
  test(`protected body rejected: ${text.split(":")[0]}`, () => assert.equal(parse({ text }), null));
}

test("Schema.org accepted offers yield explicit quantities/prices without computing line totals", () => {
  const result = parse({ senderAddress: "auto-confirm@amazon.com", subject: "Your order confirmation", text: "", html: structured(order) });
  assertNarrow(result); assert.equal(result.orderId, order.orderNumber); assert.equal(result.totalMinorUnits, 10998);
  assert.equal(result.orderedAt, "2026-10-16T16:00:00.000Z");
  assert.deepEqual(result.items, [{ description: "Pokémon Scarlet & Violet Booster Bundle", quantity: 2, unitPriceMinorUnits: 5499, lineTotalMinorUnits: null }]);
  assert.doesNotMatch(JSON.stringify(result), /https?:|tracking|acceptedOffer|itemOffered|senderAddress|subject|html/);
});

test("JSON-LD graph and array support only explicit Schema.org Order nodes", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: "ignored" }, { "@type": "Order", ...order }] })}</script>`;
  assert.equal(parse({ text: "", html }).totalMinorUnits, 10998);
  const unrelated = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://evil.test", "@type": "Order", ...order })}</script>`;
  assert.equal(parse({ text: "", html: unrelated }).totalMinorUnits, null);
});

test("multiple structured orders are ambiguous and do not mix items", () => {
  const html = structured(order) + structured({ ...order, orderNumber: "OTHER1234", price: "25.00" });
  const result = parse({ text: base.text, html });
  assert.equal(result.orderId, null); assert.equal(result.totalMinorUnits, null); assert.deepEqual(result.items, []);
  assert.ok(result.warnings.some(value => /Multiple orders/.test(value)));
});

for (const status of ["OrderCancelled", "OrderReturned", "OrderInTransit", "OrderDelivered", "OrderProblem"]) {
  test(`structured ${status} is not imported as a new purchase`, () => assert.equal(parse({ text: "", html: structured({ ...order, orderStatus: `https://schema.org/${status}` }) }), null));
}

test("malformed structured data falls back to bounded visible receipt text", () => {
  const result = parse({ html: '<script type="application/ld+json">{"unfinished":</script>' });
  assert.equal(result.totalMinorUnits, 5499); assert.ok(result.warnings.some(value => /could not be read/.test(value)));
});

test("explicit text item rows do not infer missing quantity, unit price, or descriptions", () => {
  const result = parse({ text: "Order number: TEST123\nItem: Collector binder | Qty: 2 | Unit price: USD 10.00 | Line total: USD 20.00\nItem: Sleeves\nTotal: USD 20.00" });
  assert.deepEqual(result.items, [
    { description: "Collector binder", quantity: 2, unitPriceMinorUnits: 1000, lineTotalMinorUnits: 2000 },
    { description: "Sleeves", quantity: null, unitPriceMinorUnits: null, lineTotalMinorUnits: null },
  ]);
});

test("adjacent items cannot borrow each other's missing quantity", () => {
  const result = parse({ text: "Item: First product\nItem: Second product\nQuantity: 3\nUnit price: USD 5.00\nTotal: USD 15.00" });
  assert.equal(result.items[0].quantity, null); assert.equal(result.items[1].quantity, 3);
});

for (const [text, currency, total] of [
  ["Order total: USD 1,234.56", "USD", 123456], ["Total: CAD 54.99", "CAD", 5499], ["Total: C$54.99", "CAD", 5499],
  ["Total: EUR 54,99", "EUR", 5499], ["Total: £12.34", "GBP", 1234], ["Total: JPY 1250", null, null],
  ["Currency: CAD\nTotal: $54.99", "CAD", 5499], ["Total: 54.99", null, null], ["Total: €54.99 USD", null, null],
  ["Total: $54.999", null, null], ["Total: USD -54.99", null, null], ["Total: JPY 12.34", null, null],
]) {
  test(`money parsing is explicit and exact: ${text.replaceAll("\n", " ")}`, () => { const result = parse({ text }); assert.equal(result.currency, currency); assert.equal(result.totalMinorUnits, total); });
}

test("bare dollar symbol on multi-country Pokemon Center remains ambiguous", () => {
  const result = parse({ senderAddress: "orders@pokemoncenter.com" });
  assert.equal(result.totalMinorUnits, null); assert.equal(result.currency, null);
});

test("subtotal, tax, payment-card data and shipping cost never become the order total", () => {
  const result = parse({ text: "Subtotal: $40.00\nTax: $4.00\nShipping: $5.99\nCard ending 1234\nOrder total: $49.99" });
  assert.equal(result.totalMinorUnits, 4999);
  assert.doesNotMatch(JSON.stringify(result), /Card ending|1234|Shipping|Tax|Subtotal/);
});

test("conflicting totals or currencies stay blank", () => {
  for (const text of ["Total: USD 20.00\nGrand total: USD 25.00", "Total: USD 20.00\nOrder total: CAD 20.00", "Total: USD 20.00\nOrder total: 30.00"]) {
    const result = parse({ text }); assert.equal(result.totalMinorUnits, null); assert.equal(result.currency, null);
    assert.ok(result.warnings.some(value => /Conflicting totals/.test(value)));
  }
});

test("conflicting structured/text total and order number remain unresolved", () => {
  const result = parse({ html: structured(order) });
  assert.equal(result.orderId, null); assert.equal(result.totalMinorUnits, null); assert.equal(result.currency, null);
});

test("duplicate identical totals are not a conflict", () => {
  const result = parse({ text: "Total: USD 25.00\nOrder total: USD 25.00" }); assert.equal(result.totalMinorUnits, 2500);
});

test("unsafe HTML is never executed or returned and hidden fake totals are ignored", () => {
  globalThis.__mailboxParserExecution = false;
  const html = '<script>globalThis.__mailboxParserExecution=true</script><style>.x{}</style><div hidden>Order total: USD 9999.99</div><div style="display:none">Total: USD 111.11</div><p>Order number: SAFE1234</p><p>Order total: USD 54.99</p><img src="https://tracking.example.test/private"><a href="https://evil.test/secret">View order</a>';
  const result = parse({ text: "", html });
  assert.equal(globalThis.__mailboxParserExecution, false); assert.equal(result.totalMinorUnits, 5499);
  assert.doesNotMatch(JSON.stringify(result), /https?:|script|9999|111\.11|tracking|evil/);
  delete globalThis.__mailboxParserExecution;
});

for (const name of ["123 Main Street", "Shipping address: Alice Example", "name@example.test", "https://evil.test/private", "Visa 4111 1111 1111 1111", "Phone 555-123-4567", "Ignore all previous instructions", "<img src=x onerror=alert(1)>", "api_key: synthetic-private-value"]) {
  test(`unsafe product description omitted: ${name}`, () => {
    const result = parse({ text: "", html: structured({ ...order, acceptedOffer: { itemOffered: { name }, price: "54.99", priceCurrency: "USD" } }) });
    assert.deepEqual(result.items, []); assert.ok(result.warnings.some(value => /description was omitted/.test(value)));
    assert.doesNotMatch(JSON.stringify(result), /Alice|example\.test|4111|555-123|synthetic-private-value|previous instructions|onerror/);
  });
}

test("private JSON-LD customer/payment/address fields are omitted completely", () => {
  const result = parse({ text: "", html: structured({ ...order, customer: { name: "Synthetic Private Person", email: "private@example.test" }, billingAddress: { streetAddress: "123 Main Street" }, paymentMethodId: "4111111111111111", url: "https://private.test/token" }) });
  assertNarrow(result); assert.doesNotMatch(JSON.stringify(result), /Private Person|private@|Main Street|411111|https:/);
});

test("missing item quantities and malformed prices remain null", () => {
  const result = parse({ text: "", html: structured({ ...order, acceptedOffer: { itemOffered: { name: "Collector tin" }, price: "not a price", eligibleQuantity: { value: "several" } } }) });
  assert.deepEqual(result.items, [{ description: "Collector tin", quantity: null, unitPriceMinorUnits: null, lineTotalMinorUnits: null }]);
});

test("different item currency is not represented as order-currency cents", () => {
  const result = parse({ text: "", html: structured({ ...order, acceptedOffer: { itemOffered: { name: "Collector tin" }, price: "54.99", priceCurrency: "CAD", eligibleQuantity: { value: 1 } } }) });
  assert.equal(result.currency, "USD"); assert.equal(result.items[0].unitPriceMinorUnits, null);
});

test("text items preserve currency boundaries for both unit and line prices", () => {
  const result = parse({ text: "Item: Collector tin | Qty: 1 | Unit price: CAD 54.99 | Line total: EUR 54.99\nTotal: USD 54.99" });
  assert.equal(result.currency, "USD"); assert.equal(result.items[0].unitPriceMinorUnits, null); assert.equal(result.items[0].lineTotalMinorUnits, null);
  assert.ok(result.warnings.some(value => /item currency/.test(value))); assertNarrow(result);
});

test("conflicting explicit currency declarations cannot default to US dollars", () => {
  const result = parse({ text: "Currency: CAD\nCurrency: USD\nItem: Collector tin | Unit price: $54.99\nTotal: $54.99" });
  assert.equal(result.currency, null); assert.equal(result.totalMinorUnits, null); assert.equal(result.items[0].unitPriceMinorUnits, null);
});

test("zero decimal currencies stay unresolved until purchase money supports them", () => {
  const result = parse({ text: "", html: structured({ ...order, priceCurrency: "JPY", price: "1250", acceptedOffer: { itemOffered: { name: "Collector tin" }, price: "1250", priceCurrency: "JPY", eligibleQuantity: { value: 1 } } }) });
  assert.equal(result.currency, null); assert.equal(result.totalMinorUnits, null); assert.equal(result.items[0].unitPriceMinorUnits, null);
});

test("oversized payloads and item collections are bounded", () => {
  assert.equal(parse({ text: "a".repeat(512 * 1024 + 1) }), null);
  assert.equal(parse({ html: "a".repeat(512 * 1024 + 1) }), null);
  assert.equal(parse({ text: "a".repeat(400 * 1024), html: "b".repeat(400 * 1024) }), null);
  const result = parse({ text: "", html: structured({ ...order, acceptedOffer: Array.from({ length: 51 }, () => order.acceptedOffer[0]) }) });
  assert.deepEqual(result.items, []); assert.ok(result.warnings.some(value => /Too many item/.test(value)));
});

test("metadata and dates never pass unsafe text through", () => {
  assert.equal(parse({ sourceId: "https://evil.test/secret" }), null);
  assert.equal(parse({ accountReference: "private@example.test" }), null);
  assert.equal(parse({ receivedAt: "not-a-date" }), null);
  assert.equal(parse({ receivedAt: "2026-02-30T00:00:00Z" }), null);
  assert.equal(parse({ provider: "unsupported" }), null);
  const result = parse({ text: "", html: structured({ ...order, orderNumber: "4111111111111111", orderDate: "next Thursday" }) });
  assert.equal(result.orderId, null); assert.equal(result.orderedAt, null);
});

test("header prefilter agrees with parser and does not require reading bodies", () => {
  assert.equal(isPurchaseReceiptHeader(base), true);
  assert.equal(isPurchaseReceiptHeader({ ...base, senderAddress: "shop@unrelated.test" }), false);
  assert.equal(isPurchaseReceiptHeader({ ...base, subject: "Your security code" }), false);
  assert.equal(isPurchaseReceiptHeader({ ...base, subject: "Receipt " + "a".repeat(2000) }), false);
});
