import { getRecordGameLabel } from "./collectibleGames.mjs";

// Portfolio organization is device-local presentation metadata. It never writes
// to owned records, costs, purposes, binder assignments, or a cloud repository.
export const PORTFOLIO_STORAGE_PREFIX = "code3-collection-portfolios-v1:";
export const PORTFOLIO_LIMITS = Object.freeze({ portfolios: 100, name: 60, snapshots: 500, memberships: 100000, bytes: 2 * 1024 * 1024 });
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const MARKET_FIELDS = ["marketPrice", "market_price", "marketValue", "market_value", "estimatedMarketValue", "estimated_market_value", "referenceMarketPrice", "catalogMarketPrice"];
const PERIOD_DAYS = Object.freeze({ "1d": 1, "7d": 7, "1m": 30, "3m": 90, "6m": 180, max: null });
const MAX_VALUE = Number.MAX_SAFE_INTEGER / 100;

function fail(message) { throw new Error(message); }
function object(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function exactKeys(value, keys, label) {
  if (!object(value) || Object.keys(value).some((key) => FORBIDDEN.has(key) || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) fail(`${label} has unsupported or missing fields.`);
}
function cleanId(value) { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(value) && !FORBIDDEN.has(value); }
function safeText(value, maximum) { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value); }
function finiteNonnegative(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_VALUE; }
function count(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 100000000; }
function dated(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zone] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= daysInMonth && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 && (zone === "Z" || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) <= 59)) && Number.isFinite(Date.parse(value));
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function createEmptyPortfolioState() {
  return { version: 1, selectedPortfolioId: "main", portfolios: [{ id: "main", name: "Main", favorite: true }], memberships: {}, snapshots: [] };
}

export function validatePortfolioState(value) {
  exactKeys(value, ["version", "selectedPortfolioId", "portfolios", "memberships", "snapshots"], "Portfolio settings");
  if (value.version !== 1) fail("This portfolio settings version is not supported. The saved copy was kept.");
  if (!Array.isArray(value.portfolios) || !value.portfolios.length || value.portfolios.length > PORTFOLIO_LIMITS.portfolios) fail("Portfolio count is not supported.");
  const ids = new Set();
  const names = new Set();
  for (const row of value.portfolios) {
    exactKeys(row, ["id", "name", "favorite"], "Portfolio");
    if (!cleanId(row.id) || row.id === "all" || ids.has(row.id)) fail("Portfolio identities must be unique and supported.");
    if (!safeText(row.name, PORTFOLIO_LIMITS.name) || row.name !== row.name.trim() || names.has(row.name.toLocaleLowerCase()) || typeof row.favorite !== "boolean") fail("Portfolio names must be unique, readable, and at most 60 characters.");
    ids.add(row.id); names.add(row.name.toLocaleLowerCase());
  }
  if (!ids.has("main")) fail("The Main portfolio must be retained.");
  if (value.selectedPortfolioId !== "all" && !ids.has(value.selectedPortfolioId)) fail("Choose an existing portfolio before saving.");
  if (!object(value.memberships) || Object.keys(value.memberships).length > PORTFOLIO_LIMITS.memberships) fail("Portfolio memberships are not supported.");
  for (const [key, portfolioId] of Object.entries(value.memberships)) {
    if (!/^(repository|legacy):\S[\s\S]*$/.test(key) || key.length > 1000 || /[\u0000-\u001f\u007f]/.test(key) || !ids.has(portfolioId) || portfolioId === "main") fail("A portfolio membership is invalid. Original item records were kept.");
  }
  if (!Array.isArray(value.snapshots) || value.snapshots.length > PORTFOLIO_LIMITS.snapshots) fail("At most 500 saved value snapshots are supported.");
  const snapshotIds = new Set();
  for (const row of value.snapshots) {
    exactKeys(row, ["id", "at", "portfolioId", "total", "knownCount", "totalCount", "quantity"], "Value snapshot");
    if (!cleanId(row.id) || snapshotIds.has(row.id) || !dated(row.at) || !(row.portfolioId === "all" || ids.has(row.portfolioId)) || !finiteNonnegative(row.total) || !count(row.knownCount) || !count(row.totalCount) || row.knownCount > row.totalCount || !finiteNonnegative(row.quantity)) fail("A saved value snapshot is invalid. The saved copy was kept.");
    snapshotIds.add(row.id);
  }
  if (JSON.stringify(value).length > PORTFOLIO_LIMITS.bytes) fail("Portfolio settings exceed the supported device storage size.");
  return value;
}

export function getPortfolioItemKey(item = {}) {
  const origin = item._recordOrigin;
  const id = item.id;
  if (!["repository", "legacy"].includes(origin) || !["string", "number"].includes(typeof id) || !String(id).trim() || (typeof id === "number" && !Number.isFinite(id))) return "";
  return `${origin}:${String(id)}`;
}

export function selectPortfolioItems(items = [], state = createEmptyPortfolioState(), portfolioId = "all") {
  const validIds = new Set((state.portfolios || []).map((row) => row.id));
  const target = portfolioId === "all" || validIds.has(portfolioId) ? portfolioId : "main";
  return items.filter((item) => {
    if (target === "all") return true;
    const assigned = state.memberships?.[getPortfolioItemKey(item)];
    const resolved = assigned && validIds.has(assigned) && assigned !== "all" ? assigned : "main";
    return resolved === target;
  });
}

// Saved prices are per unit. Currency-formatted strings and purchase costs are
// deliberately not guessed into prices; an explicit numeric zero is valid.
export function portfolioNumber(value) {
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value)) return null;
  if (!["number", "string"].includes(typeof value)) return null;
  const number = Number(value);
  return finiteNonnegative(number) ? number : null;
}

export function getPortfolioItemValuation(item = {}) {
  const rawQuantity = item.quantity ?? item.qty ?? item.ownedQuantity;
  const quantity = rawQuantity == null ? 1 : portfolioNumber(rawQuantity);
  const first = (fields) => {
    for (const field of fields) { const value = portfolioNumber(item[field]); if (value !== null) return value; }
    return null;
  };
  const market = first(MARKET_FIELDS);
  const projected = first(["projectedResaleMid"]);
  const source = item._recordOrigin === "repository" && projected !== null ? "projected" : market !== null ? "market" : projected !== null ? "projected" : "unknown";
  const unitValue = source === "projected" ? projected : source === "market" ? market : null;
  const computed = unitValue !== null && quantity !== null ? unitValue * quantity : null;
  const value = computed !== null && finiteNonnegative(computed) ? Math.round((computed + Number.EPSILON) * 100) / 100 : null;
  return { value, unitValue, quantity: quantity ?? 0, source: value === null ? "unknown" : source, label: value === null ? "Value not recorded" : source === "projected" ? "Saved projected estimate" : "Saved market estimate" };
}

export function summarizePortfolio(items = []) {
  let total = 0; let quantity = 0; let knownCount = 0; let marketKnownCount = 0; let projectedKnownCount = 0;
  for (const item of items) {
    const valuation = getPortfolioItemValuation(item);
    if (quantity !== null) quantity = finiteNonnegative(quantity + valuation.quantity) ? quantity + valuation.quantity : null;
    if (valuation.value !== null) { if (total !== null) total = finiteNonnegative(total + valuation.value) ? total + valuation.value : null; knownCount += 1; if (valuation.source === "market") marketKnownCount += 1; else projectedKnownCount += 1; }
  }
  return { total: total === null ? null : Math.round((total + Number.EPSILON) * 100) / 100, knownCount, totalCount: items.length, quantity, isValid: total !== null && quantity !== null, marketKnownCount, projectedKnownCount, unknownCount: items.length - knownCount, valuationLabel: marketKnownCount && projectedKnownCount ? "Saved market and projected estimates" : projectedKnownCount ? "Saved projected estimates" : marketKnownCount ? "Saved market estimates" : "No saved estimates" };
}

export function rankPortfolioItems(items = []) {
  return items.map((item) => ({ item, key: getPortfolioItemKey(item), ...getPortfolioItemValuation(item) }))
    .filter((row) => row.value !== null)
    .sort((left, right) => right.value - left.value || String(left.item.name || left.item.title || "").localeCompare(String(right.item.name || right.item.title || "")) || left.key.localeCompare(right.key));
}

export function portfolioSeries(snapshots = [], { portfolioId = "all", period = "1m", now = Date.now() } = {}) {
  const selectedPeriod = Object.hasOwn(PERIOD_DAYS, String(period).toLowerCase()) ? String(period).toLowerCase() : "1m";
  const nowTime = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  const cutoff = PERIOD_DAYS[selectedPeriod] == null ? -Infinity : nowTime - PERIOD_DAYS[selectedPeriod] * 86400000;
  const byTime = new Map();
  for (const row of snapshots) {
    const time = Date.parse(row?.at);
    if (row?.portfolioId !== portfolioId || !dated(row.at) || !Number.isFinite(nowTime) || time < cutoff || time > nowTime || !finiteNonnegative(row.total) || !count(row.knownCount) || !count(row.totalCount) || row.knownCount > row.totalCount || (!row.knownCount && row.totalCount > 0) || !finiteNonnegative(row.quantity)) continue;
    byTime.set(time, { ...row });
  }
  const points = [...byTime.entries()].sort(([left], [right]) => left - right).map(([, row]) => row);
  const hasHistory = points.length >= 2;
  const first = points[0]; const last = points.at(-1);
  const comparableCoverage = hasHistory && points.every((point) => point.knownCount === first.knownCount && point.totalCount === first.totalCount && point.quantity === first.quantity);
  const change = hasHistory ? Math.round((last.total - first.total) * 100) / 100 : null;
  return { period: selectedPeriod, points, hasHistory, change, percentChange: hasHistory && first.total > 0 ? (last.total - first.total) / first.total * 100 : null, comparableCoverage, coverageLabel: !hasHistory ? "At least two dated saved snapshots are needed." : comparableCoverage ? "Saved value change includes collection edits and price changes; it is not investment return." : "Collection quantity or priced coverage changed between snapshots; totals are not directly comparable." };
}

export function buildPortfolioCsv(items = [], { includeValues = true } = {}) {
  const cell = (value) => { const text = String(value ?? ""); return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`; };
  const header = ["Name", "Game", "Classification", "Set", "Quantity", ...(includeValues ? ["Unit estimate USD", "Total estimate USD", "Estimate source"] : [])];
  const rows = items.map((item) => {
    const valuation = getPortfolioItemValuation(item);
    return [item.name || item.title || item.cardName || item.productName || "Untitled item", getRecordGameLabel(item), item.productClassification || item.productType || "", item.setName || item.set_name || item.expansion || "", valuation.quantity, ...(includeValues ? [valuation.unitValue ?? "", valuation.value ?? "", valuation.label] : [])];
  });
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

export function createPortfolioStore({ storage, scope } = {}) {
  const scoped = typeof scope === "string" && scope.trim() && scope.length <= 2000;
  const key = scoped ? `${PORTFOLIO_STORAGE_PREFIX}${encodeURIComponent(scope)}` : "";
  let previousRaw; let state = createEmptyPortfolioState(); let writable = false; let loaded = false;
  const result = (ok, error = "") => ({ ok, state: clone(state), error, writable, key });
  function load() {
    writable = false; loaded = true;
    if (!key) return result(false, "Portfolio settings need a signed-in account and workspace scope before they can be saved.");
    try {
      previousRaw = storage.getItem(key);
      if (previousRaw !== null && typeof previousRaw !== "string") fail("Device storage returned an unsupported portfolio copy.");
      if (previousRaw && previousRaw.length > PORTFOLIO_LIMITS.bytes) fail("The saved portfolio settings are too large to read safely.");
      const next = previousRaw === null ? createEmptyPortfolioState() : validatePortfolioState(JSON.parse(previousRaw));
      state = clone(next); writable = true;
      return result(true);
    } catch (error) { return result(false, `Portfolio settings could not be read. The original device copy was kept. ${error?.message || "Device storage is unavailable."}`); }
  }
  function update(mutator) {
    if (!loaded) { const read = load(); if (!read.ok) return read; }
    if (!writable) return result(false, "Portfolio settings cannot be saved until the original device copy can be read safely.");
    let next; let nextRaw;
    try {
      if (storage.getItem(key) !== previousRaw) return result(false, "Portfolio settings changed in another tab. Reload them before saving.");
      if (typeof mutator !== "function") fail("A portfolio update must be a function.");
      const draft = clone(state);
      next = validatePortfolioState(mutator(draft) ?? draft);
      nextRaw = JSON.stringify(next);
      if (nextRaw === previousRaw) return result(true);
      if (storage.getItem(key) !== previousRaw) return result(false, "Portfolio settings changed in another tab. Reload them before saving.");
      storage.setItem(key, nextRaw);
      if (storage.getItem(key) !== nextRaw) fail("Device storage did not confirm the saved portfolio settings.");
      state = clone(next); previousRaw = nextRaw;
      return result(true);
    } catch (error) {
      // Restore only our own failed write, never another tab's newer version.
      try {
        if (nextRaw !== undefined && storage.getItem(key) === nextRaw) {
          if (previousRaw === null) storage.removeItem(key); else storage.setItem(key, previousRaw);
          if (storage.getItem(key) !== previousRaw) writable = false;
        }
      } catch { writable = false; }
      return result(false, `Portfolio settings were not saved. Existing item records are unchanged. ${error?.message || "Device storage is unavailable."}`);
    }
  }
  return { key, load, update };
}
