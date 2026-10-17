import {
  STELLAR_PREVIEW_FORMAT_STATES,
  STELLAR_PREVIEW_LIMITS,
  STELLAR_PREVIEW_SECURITY_CATEGORIES,
} from "../constants.js";

const DEFAULT_FILE = Object.freeze({ name: "stellar-tasks.synthetic.json", type: "application/json" });

function safeTask(overrides = {}) {
  return {
    id: "task.synthetic.test",
    name: "Synthetic task",
    site: "Target",
    sku: "SKU.TEST.001",
    productTitle: "Synthetic TCG product",
    quantity: 1,
    maxPrice: "49.99",
    currency: "USD",
    mode: "MONITOR",
    enabled: false,
    status: "WAITING",
    groupName: "Synthetic group",
    ...overrides,
  };
}

function fixture(key, label, payload, expectedState, extra = {}) {
  return Object.freeze({ key, label, payload, expectedState, file: DEFAULT_FILE, ...extra });
}

const passwordField = ["pass", "word"].join("");
const tokenField = ["access", "Token"].join("");
const cookieField = ["session", "Cookie"].join("");
const sessionField = ["session", "Data"].join("");
const proxyPasswordField = ["proxy", "Password"].join("");
const cardNumberField = ["card", "Number"].join("");
const authorizationField = ["authorization", "Header"].join("");
const licenseField = ["license", "Key"].join("");
const secretField = ["client", "Secret"].join("");

export const PHASE_2DB2_STELLAR_PREVIEW_FIXTURES = Object.freeze([
  fixture("minimal-safe", "Minimal safe Stellar-like task export", [safeTask()], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("multi-task", "Multiple safe tasks", [safeTask(), safeTask({ id: "task.synthetic.two.test", sku: "SKU.TEST.002", productTitle: "Second synthetic product" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("multiple-task-groups", "Multiple task groups", { taskGroups: [{ id: "group.target.test", name: "Target synthetic", site: "Target", tasks: [safeTask()] }, { id: "group.walmart.test", name: "Walmart synthetic", site: "Walmart", tasks: [safeTask({ id: "task.walmart.test", site: undefined, sku: "SKU.WALMART.TEST" })] }] }, STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("target-style-identifier", "Target-style identifier", [safeTask({ sku: undefined, tcin: "12345678" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("walmart-style-identifier", "Walmart-style identifier", [safeTask({ site: "Walmart", sku: "WM.TEST.001" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("upc-product", "UPC product", [safeTask({ sku: undefined, upc: "012345678905" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("sku-only-product", "SKU-only product", [safeTask({ productTitle: undefined })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("quantity-more-than-one", "Quantity greater than one", [safeTask({ quantity: 3 })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("integer-max-price", "Integer maximum price", [safeTask({ maxPrice: 50 })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("decimal-max-price", "Decimal-string maximum price", [safeTask({ maxPrice: "50.25" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("missing-price", "Missing maximum price", [safeTask({ maxPrice: undefined, currency: undefined })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("malformed-price", "Malformed maximum price", [safeTask({ maxPrice: "not-money" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "MAX_PRICE_INVALID" }),
  fixture("negative-price", "Negative maximum price", [safeTask({ maxPrice: "-1.00" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "MAX_PRICE_INVALID" }),
  fixture("zero-price", "Zero maximum price", [safeTask({ maxPrice: "0.00" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "MAX_PRICE_INVALID" }),
  fixture("excess-precision-price", "Excess-precision maximum price", [safeTask({ maxPrice: "10.001" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "MAX_PRICE_INVALID" }),
  fixture("extreme-price", "Out-of-range maximum price", [safeTask({ maxPrice: "1000000.01" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "MAX_PRICE_INVALID" }),
  fixture("currency-alias-conflict", "Conflicting currency aliases", [safeTask({ currency: "USD", currencyCode: "CAD" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "CONFLICTING_FIELD_ALIASES" }),
  fixture("multi-currency-export", "Multiple currencies in one export", [safeTask(), safeTask({ id: "task.currency.two.test", sku: "SKU.CURRENCY.002", currency: "CAD" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "MULTIPLE_CURRENCIES_IN_EXPORT" }),
  fixture("malformed-quantity", "Malformed quantity", [safeTask({ quantity: "2" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "QUANTITY_INVALID" }),
  fixture("negative-quantity", "Negative quantity", [safeTask({ quantity: -1 })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "QUANTITY_INVALID" }),
  fixture("nan-style-quantity", "NaN-style quantity", [safeTask({ quantity: "NaN" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "QUANTITY_INVALID" }),
  fixture("infinity-style-quantity", "Infinity-style quantity", [safeTask({ quantity: "Infinity" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "QUANTITY_INVALID" }),
  fixture("duplicate-task", "Duplicate task", [safeTask(), safeTask()], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "DUPLICATE_TASKS_DETECTED" }),
  fixture("unknown-harmless-field", "Unknown harmless field", [safeTask({ futureDisplayHint: "ignored synthetic hint" })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "UNKNOWN_FIELDS_IGNORED" }),
  fixture("deeply-nested-unknown", "Deeply nested harmless unknown field", [safeTask({ futureMetadata: { nested: { safeLabel: "ignored" } } })], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, { expectedWarning: "UNKNOWN_FIELDS_IGNORED" }),
  fixture("password-field", "Password field", [{ ...safeTask(), [passwordField]: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA }),
  fixture("token-field", "Token field", [{ ...safeTask(), [tokenField]: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA }),
  fixture("cookie-field", "Cookie field", [{ ...safeTask(), [cookieField]: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.SESSION_DATA }),
  fixture("session-field", "Session field", [{ ...safeTask(), [sessionField]: { id: "synthetic.invalid" } }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.SESSION_DATA }),
  fixture("proxy-credential", "Proxy credential", [{ ...safeTask(), [proxyPasswordField]: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.PROXY_AUTHENTICATION_DATA }),
  fixture("credential-bearing-url", "Credential-bearing URL", [safeTask({ futureLink: `https://provider.invalid/callback?${["access", "token"].join("_")}=synthetic.invalid` })], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_BEARING_URL }),
  fixture("payment-card-field", "Payment-card field", [{ ...safeTask(), [cardNumberField]: ["4111", "1111", "1111", "1111"].join(" ") }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA }),
  fixture("payment-card-value", "Payment-card-like value in an unknown field", [safeTask({ futureReference: ["4111", "1111", "1111", "1111"].join("") })], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA }),
  fixture("numeric-payment-card-value", "Numeric payment-card-like value in an unknown field", [safeTask({ futureReference: 4111111111111111 })], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA }),
  fixture("cvv-field", "CVV field", [{ ...safeTask(), cvv: "000" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA }),
  fixture("authorization-header", "Authorization header", [{ ...safeTask(), [authorizationField]: ["Bearer", "synthetic.invalid.value"].join(" ") }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA }),
  fixture("license-key", "Bot license key", [{ ...safeTask(), [licenseField]: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.LICENSE_DATA }),
  fixture("nested-secret", "Nested secret", [{ ...safeTask(), futureMetadata: { nested: { [secretField]: "synthetic.invalid" } } }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA }),
  fixture("wrapped-password-field", "Wrapped password field", [{ ...safeTask(), retailerPasswordValue: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA }),
  fixture("wrapped-token-field", "Wrapped token field", [{ ...safeTask(), accessTokenValue: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA }),
  fixture("wrapped-session-field", "Wrapped session field", [{ ...safeTask(), sessionState: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.SESSION_DATA }),
  fixture("profile-export", "Profile export structure", { profiles: [{ name: "Synthetic Person", email: "owner@example.invalid", address: "123 Example Street" }] }, STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA }),
  fixture("proxy-export", "Proxy export structure", { proxies: ["proxy.example.invalid:8080:synthetic-user:synthetic-pass"] }, STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.PROXY_AUTHENTICATION_DATA }),
  fixture("encoded-credential-url", "Percent-encoded credential URL", [safeTask({ futureLink: "https://provider.invalid/callback?access%5Ftoken=synthetic.invalid" })], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_BEARING_URL }),
  fixture("credential-hash-field", "Credential-derived hash field", [{ ...safeTask(), passwordHash: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA }),
  fixture("configuration-export", "Configuration export structure", { config: { profile: { accountEmail: "owner@example.invalid" } } }, STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA }),
  fixture("account-export", "Account export structure", { accounts: [{ username: "synthetic-user" }] }, STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA }),
  Object.freeze({ key: "prototype-pollution-key", label: "Prototype-pollution key", rawText: `{"tasks":[{"__proto__":{"polluted":true}}]}`, expectedState: STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, file: DEFAULT_FILE, expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE }),
  fixture("oversized-field", "Oversized field", [safeTask({ productTitle: "x".repeat(STELLAR_PREVIEW_LIMITS.maximumStringLength + 1) })], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED }),
  fixture("oversized-field-name", "Oversized unknown field name", [{ ...safeTask(), ["x".repeat(STELLAR_PREVIEW_LIMITS.maximumFieldLength + 1)]: "ignored" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED }),
  fixture("control-character-field-name", "Control character in unknown field name", [{ ...safeTask(), ["future\nlabel"]: "ignored" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE }),
  fixture("bidi-field-name", "Bidirectional override in unknown field name", [{ ...safeTask(), ["future\u202elabel"]: "ignored" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE }),
  Object.freeze({ key: "oversized-file", label: "Oversized file", rawText: JSON.stringify({ tasks: [], padding: "x".repeat(STELLAR_PREVIEW_LIMITS.maximumFileBytes + 1) }), expectedState: STELLAR_PREVIEW_FORMAT_STATES.REJECTED, file: DEFAULT_FILE }),
  fixture("oversized-record-set", "Oversized record set", Array.from({ length: STELLAR_PREVIEW_LIMITS.maximumRecords + 1 }, (_, index) => ({ id: `task.${index}.test` })), STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED }),
  fixture("oversized-aggregate-groups", "Oversized aggregate task-group record set", { taskGroups: [
    { id: "group.one.test", tasks: Array.from({ length: 251 }, (_, index) => ({ id: `task.one.${index}.test` })) },
    { id: "group.two.test", tasks: Array.from({ length: 250 }, (_, index) => ({ id: `task.two.${index}.test` })) },
  ] }, STELLAR_PREVIEW_FORMAT_STATES.REJECTED),
  Object.freeze({ key: "malformed-json", label: "Malformed JSON", rawText: "{\"tasks\":[", expectedState: STELLAR_PREVIEW_FORMAT_STATES.REJECTED, file: DEFAULT_FILE }),
  fixture("wrong-root-shape", "Wrong JSON root shape", "not-a-task-export", STELLAR_PREVIEW_FORMAT_STATES.UNKNOWN_FORMAT),
  fixture("empty-export", "Empty task export", [], STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  fixture("unknown-export-version", "Unknown export version", { version: "synthetic-unverified", tasks: [safeTask()] }, STELLAR_PREVIEW_FORMAT_STATES.UNKNOWN_FORMAT),
  fixture("partially-recognized-format", "Partially recognized tasks envelope", { tasks: [safeTask()] }, STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED),
  Object.freeze({ key: "unsupported-file-format", label: "Unsupported file format", payload: [safeTask()], expectedState: STELLAR_PREVIEW_FORMAT_STATES.REJECTED, file: Object.freeze({ name: "stellar-tasks.synthetic.csv", type: "text/csv" }) }),
  fixture("mixed-safe-and-unsafe", "Mixed safe and unsafe records", [safeTask(), { ...safeTask({ id: "task.unsafe.test" }), [tokenField]: "synthetic.invalid" }], STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, { expectedSecurityCategory: STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA }),
]);

const FIXTURE_MAP = new Map(PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.map((entry) => [entry.key, entry]));

export function stellarPreviewFixtureRawText(fixtureValue) {
  return fixtureValue.rawText ?? JSON.stringify(fixtureValue.payload);
}

export function getPhase2db2StellarPreviewFixture(key) {
  const fixtureValue = FIXTURE_MAP.get(String(key || ""));
  if (!fixtureValue) throw new Error(`Unknown Phase 2D-B2 Stellar preview fixture: ${String(key)}.`);
  return fixtureValue;
}

export function listPhase2db2StellarPreviewFixtures() {
  return PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.map(({ key, label, expectedState }) => ({ key, label, expectedState }));
}
