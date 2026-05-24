import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HISTORICAL_SCOUT_IMPORT_BATCH = "2026_05_notebook";
export const HISTORICAL_SCOUT_SOURCE_LABEL = "Facebook groups / friends / admin notes";
export const HISTORICAL_SCOUT_SUBMITTED_BY = "official admin ember";

export const HISTORICAL_SCOUT_IMPORT_2026_05_NOTEBOOK = [
  { date: "2026-01-01", time: "12:25", store_name: "Norfolk BJ's", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-02", time: "19:47", store_name: "Monticello Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-05", time: "15:54", store_name: "Pembroke Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-05", time: "19:30", store_name: "Staples Mill Road", notes: "Henrico / Richmond area note", report_status: "stock_seen" },
  { date: "2026-01-06", time: "08:08", store_name: "Chesapeake Square Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-06", time: "09:39", store_name: "Military Highway Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-06", time: "09:50", store_name: "Pembroke Target", notes: "Leftover stock", report_status: "leftover_stock" },
  { date: "2026-01-06", time: "10:40", store_name: "Dollar General Little Creek", notes: "Near Shore Drive", report_status: "stock_seen" },
  { date: "2026-01-06", time: "11:32", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-06", time: "14:02", store_name: "Greenbrier Target", notes: "Restock now", report_status: "stock_seen" },
  { date: "2026-01-06", time: "15:10", store_name: "Princess Anne Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-06", time: "17:09", store_name: "Nimmo Walgreens", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-06", time: "17:49", store_name: "Greenbrier Target", notes: "Still had stock", report_status: "leftover_stock" },
  { date: "2026-01-06", time: "17:58", store_name: "Lowe's 4708 Portsmouth Blvd", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-07", time: "16:56", store_name: "Newport News BJ's", notes: "Limit 4", report_status: "stock_seen" },
  { date: "2026-01-07", time: "17:15", store_name: "DICK'S Newport News Jefferson Ave", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-08", time: "11:56", store_name: "Hillcrest Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-08", time: "13:06", store_name: "Hillcrest Walmart", notes: "Still had stock", report_status: "leftover_stock" },
  { date: "2026-01-08", time: "17:21", store_name: "Princess Anne Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-08", time: "20:25", store_name: "Greenbrier Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-09", time: "06:37", store_name: "Red Mill Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-09", time: "15:36", store_name: "Jefferson Walmart", notes: "6111 Jefferson Walmart", report_status: "stock_seen" },
  { date: "2026-01-09", time: "15:16", store_name: "Monticello Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-09", time: "16:25", store_name: "Pembroke Target", notes: "Restock now", report_status: "stock_seen" },
  { date: "2026-01-09", time: "16:46", store_name: "Portsmouth Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-09", time: "17:04", store_name: "Marquis Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-09", time: "18:59", store_name: "Salem Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-10", time: "11:18", store_name: "Little Creek NEX", notes: "Military", report_status: "stock_seen" },
  { date: "2026-01-11", time: "09:23", store_name: "Salem Walmart", notes: "Leftover stock", report_status: "leftover_stock" },
  { date: "2026-01-13", time: "12:50", store_name: "Newport News Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-13", time: "13:52", store_name: "Princess Anne Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-15", time: "11:00", store_name: "Pembroke Target", notes: "Only Pokeballs", report_status: "stock_seen" },
  { date: "2026-01-15", time: "16:10", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-15", time: "16:40", store_name: "Towne Center Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-15", time: "15:16", store_name: "Western Branch DICK'S", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-15", time: "18:08", store_name: "Newport News DICK'S Jefferson Ave", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-16", time: "08:38", store_name: "Pembroke Target", notes: "Vendor seen", report_status: "vendor_seen" },
  { date: "2026-01-16", time: "09:27", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-16", time: "11:35", store_name: "Sam's Circle Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-16", time: "12:30", store_name: "Military Highway Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-16", time: "13:37", store_name: "CVS N Military Highway", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-16", time: "15:24", store_name: "Portsmouth Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-18", time: "16:53", store_name: "Hampton Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-20", time: "09:33", store_name: "Greenbrier Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-20", time: "12:16", store_name: "Princess Anne Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-20", time: "13:56", store_name: "Military Highway Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-22", time: "08:14", store_name: "Hampton Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-22", time: "20:28", store_name: "Chesapeake Square Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-23", time: "16:27", store_name: "Nimmo Walgreens", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-23", time: "15:25", store_name: "Salem Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-26", time: "10:41", store_name: "Greenbrier Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-26", time: "17:55", store_name: "Newport News Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "08:19", store_name: "Pembroke Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "09:09", store_name: "Costco Norfolk", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "09:09", store_name: "Costco Newport News", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "12:19", store_name: "Nimmo Walgreens", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "14:00", store_name: "Princess Anne Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "08:00", store_name: "Chesapeake Square Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "17:10", store_name: "Walgreens 12750 Jefferson Ave", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "17:24", store_name: "Newport News Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-30", time: "18:10", store_name: "Military Highway Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-31", time: "09:35", store_name: "Salem Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-01-31", time: "13:42", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-03", time: "11:40", store_name: "First Colonial Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-03", time: "15:14", store_name: "Nimmo Walgreens", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-03", time: "16:58", store_name: "Military Highway Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-03", time: "17:14", store_name: "Princess Anne Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-04", time: "11:23", store_name: "Hillcrest Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-04", time: "15:50", store_name: "Chesapeake Square Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-05", time: "08:19", store_name: "Hampton Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-05", time: "10:40", store_name: "Hillcrest Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-05", time: "15:35", store_name: "Nimmo Walgreens 1101", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-07", time: "09:00", store_name: "Costco Newport News", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-07", time: "09:00", store_name: "Costco Norfolk", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-09", time: null, store_name: "Sam's Club Hampton Roads Area", notes: "Open / all in HR area", report_status: "stock_seen" },
  { date: "2026-02-11", time: "13:45", store_name: "Pembroke Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-12", time: "08:00", store_name: "Grassfield Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-12", time: "09:16", store_name: "First Colonial Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-12", time: "09:00", store_name: "Costco Newport News", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-12", time: "15:21", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-12", time: "19:26", store_name: "CVS 11127 Jefferson Ave", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-02-13", time: "09:06", store_name: "Red Mill Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-09", time: "10:00", store_name: "Hillcrest Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-09", time: "14:30", store_name: "Greenbrier Barnes & Noble", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-09", time: "14:00", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-10", time: "09:00", store_name: "Greenbrier Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-10", time: "09:24", store_name: "Military Highway Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-10", time: "13:45", store_name: "Salem Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-15", time: null, store_name: "Chesapeake Square Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-17", time: "09:30", store_name: "Pembroke Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-17", time: "07:40", store_name: "Greenbrier Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-17", time: "12:42", store_name: "First Colonial Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-20", time: "12:45", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-20", time: null, store_name: "Pembroke Target", notes: "AM", report_status: "stock_seen" },
  { date: "2026-04-21", time: "12:55", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-22", time: "10:47", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-22", time: "10:00", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-22", time: "13:00", store_name: "Pembroke Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-23", time: "10:00", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-23", time: "12:00", store_name: "General Booth CVS", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-23", time: "12:00", store_name: "Nimmo CVS", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-27", time: "11:00", store_name: "BJ's Virginia Beach Blvd", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-28", time: "08:30", store_name: "Chesapeake Square Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-29", time: null, store_name: "BJ's Chesapeake", notes: "Time unknown", report_status: "stock_seen" },
  { date: "2026-04-29", time: null, store_name: "Military Highway Target", notes: "Time unknown", report_status: "stock_seen" },
  { date: "2026-04-29", time: null, store_name: "Chesapeake Square Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-29", time: null, store_name: "Greenbrier Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-30", time: "10:09", store_name: "Chesapeake Square Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-04-30", time: "13:50", store_name: "College Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-01", time: "09:35", store_name: "Salem Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-01", time: "09:30", store_name: "Chesapeake Square Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-01", time: "14:00", store_name: "Newport News Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-01", time: null, store_name: "Nimmo Walmart", notes: "Open", report_status: "stock_seen" },
  { date: "2026-05-07", time: "09:13", store_name: "Chesapeake BJ's", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-07", time: "13:00", store_name: "Chesapeake Square Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-07", time: "13:00", store_name: "Military Circle Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-07", time: "14:30", store_name: "College Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-08", time: null, store_name: "Hillcrest Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-12", time: "15:24", store_name: "Red Mill Walgreens", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-12", time: "15:24", store_name: "Red Mill Walgreens", notes: "Leftover stock", report_status: "leftover_stock" },
  { date: "2026-05-12", time: "11:47", store_name: "Hillcrest Target", notes: "Original time may have been crossed out", report_status: "stock_seen" },
  { date: "2026-05-12", time: "12:51", store_name: "BJ's Virginia Beach Blvd Norfolk VA", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-13", time: "08:38", store_name: "Red Mill Walgreens", notes: "Leftover stock", report_status: "leftover_stock" },
  { date: "2026-05-14", time: "10:56", store_name: "Chesapeake Square Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-14", time: "12:45", store_name: "College Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-14", time: null, store_name: "Portsmouth Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-15", time: null, store_name: "Salem Walmart", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-16", time: "12:50", store_name: "Hillcrest Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-17", time: "09:30", store_name: "Chesapeake BJ's", notes: "Original/crossed time unclear", report_status: "stock_seen" },
  { date: "2026-05-17", time: "12:00", store_name: "Nimmo Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-17", time: "11:21", store_name: "Red Mill Target", notes: "Historical note", report_status: "stock_seen" },
  { date: "2026-05-19", time: "09:30", store_name: "Newport News Target", notes: "Historical note", report_status: "stock_seen" }
];

const NEGATIVE_STOCK_PATTERN = /\b(empty|no stock|still empty|no pokemon|no pok[e\u00e9]mon|checked but nothing|nothing found|nothing there|empty shelf)\b/i;
const VALID_REPORT_STATUSES = new Set(["stock_seen", "vendor_seen", "leftover_stock"]);

const STORE_ALIASES = new Map([
  ["rmt", "Red Mill Target"],
  ["rm t", "Red Mill Target"],
  ["rm target", "Red Mill Target"],
  ["redmill target", "Red Mill Target"],
  ["rm walmart", "Red Mill Walmart"],
  ["pem t", "Pembroke Target"],
  ["fc t", "First Colonial Target"],
  ["fc", "First Colonial Target"],
  ["gb t", "Greenbrier Target"],
  ["gb", "Greenbrier Target"],
  ["gb b and n", "Greenbrier Barnes & Noble"],
  ["gb b n", "Greenbrier Barnes & Noble"],
  ["gb barnes and noble", "Greenbrier Barnes & Noble"],
  ["hc t", "Hillcrest Target"],
  ["hc walmart", "Hillcrest Walmart"],
  ["mil t", "Military Highway Target"],
  ["nn t", "Newport News Target"],
  ["pa t", "Princess Anne Target"],
  ["ches sq t", "Chesapeake Square Target"],
  ["ches sq w", "Chesapeake Square Walmart"],
  ["ches square t", "Chesapeake Square Target"],
  ["ches square w", "Chesapeake Square Walmart"],
]);

export function normalizeHistoricalScoutText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function shouldSkipHistoricalScoutRow(row = {}) {
  const text = `${row.store_name || row.storeName || ""} ${row.notes || ""} ${row.report_status || ""}`;
  if (NEGATIVE_STOCK_PATTERN.test(text)) return true;
  return !VALID_REPORT_STATUSES.has(String(row.report_status || ""));
}

function canonicalStoreName(name = "") {
  const normalized = normalizeHistoricalScoutText(name);
  return STORE_ALIASES.get(normalized) || String(name || "").trim();
}

function buildStoreLookup(stores = []) {
  const lookup = new Map();
  for (const store of stores) {
    const names = [
      store.name,
      store.store_name,
      store.storeName,
      store.nickname,
      `${store.nickname || ""} ${store.chain || store.retailer || ""}`,
      `${store.store_name || store.name || ""} ${store.city || ""}`,
    ];
    for (const name of names) {
      const key = normalizeHistoricalScoutText(name);
      if (key && !lookup.has(key)) lookup.set(key, store);
    }
  }
  return lookup;
}

export function matchHistoricalScoutStore(storeName = "", stores = []) {
  const lookup = buildStoreLookup(stores);
  const canonical = canonicalStoreName(storeName);
  const direct = lookup.get(normalizeHistoricalScoutText(canonical)) || lookup.get(normalizeHistoricalScoutText(storeName));
  return direct || null;
}

function historicalScoutObservedAt(date = "", time = null) {
  const localTime = time || "12:00";
  const parsed = new Date(`${date}T${localTime}:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid historical Scout date/time: ${date} ${time || ""}`.trim());
  }
  return parsed.toISOString();
}

export function historicalScoutImportKey(row = {}, batch = HISTORICAL_SCOUT_IMPORT_BATCH) {
  return [
    batch,
    row.date || "",
    row.time || "time_unknown",
    normalizeHistoricalScoutText(row.store_name || row.storeName || ""),
    row.report_status || "",
    normalizeHistoricalScoutText(row.notes || ""),
  ].join("|");
}

export function buildHistoricalScoutImportRows(inputRows = HISTORICAL_SCOUT_IMPORT_2026_05_NOTEBOOK, options = {}) {
  const stores = options.stores || [];
  const batch = options.batch || HISTORICAL_SCOUT_IMPORT_BATCH;
  return inputRows
    .filter((row) => !shouldSkipHistoricalScoutRow(row))
    .map((row) => {
      const matchedStore = matchHistoricalScoutStore(row.store_name, stores);
      const observedAt = historicalScoutObservedAt(row.date, row.time);
      const notes = [row.notes || "Historical note", row.time ? "" : "Exact time unknown."].filter(Boolean).join(" ");
      const importKey = historicalScoutImportKey(row, batch);
      return {
        store_id: matchedStore?.id || null,
        user_id: null,
        product_id: null,
        report_type: "Store Restock Report",
        quantity_seen: null,
        price_seen: null,
        photo_url: "",
        notes,
        observed_at: observedAt,
        reported_at: observedAt,
        verification_status: "unverified",
        workspace_id: null,
        store_name: canonicalStoreName(row.store_name),
        product_name: "Pokemon TCG",
        product_type: "Pokemon TCG",
        set_name: "",
        quantity_estimate: "",
        report_time: observedAt,
        visibility: "public",
        status: "unverified",
        confidence_score: 25,
        source_type: "historical_import",
        source_label: HISTORICAL_SCOUT_SOURCE_LABEL,
        submitted_by_display: HISTORICAL_SCOUT_SUBMITTED_BY,
        confidence: "unverified_historical",
        imported_batch: batch,
        imported_by_admin: true,
        scout_points_awarded: false,
        import_key: importKey,
        report_status: row.report_status,
      };
    });
}

export function validateHistoricalScoutImportRows(rows = []) {
  const keys = new Set();
  const duplicates = new Set();
  const negativeRows = [];
  for (const row of rows) {
    if (keys.has(row.import_key)) duplicates.add(row.import_key);
    keys.add(row.import_key);
    if (NEGATIVE_STOCK_PATTERN.test(`${row.store_name || ""} ${row.notes || ""}`)) negativeRows.push(row);
  }
  return {
    total: rows.length,
    duplicateKeys: [...duplicates],
    negativeRows,
  };
}

async function fetchStores(supabase) {
  const { data, error } = await supabase
    .from("stores")
    .select("id,name,store_name,nickname,chain,retailer,city,address")
    .limit(1000);
  if (error) throw error;
  return data || [];
}

async function existingImportKeys(supabase, keys = []) {
  const found = new Set();
  const chunkSize = 100;
  for (let index = 0; index < keys.length; index += chunkSize) {
    const chunk = keys.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("store_reports")
      .select("import_key")
      .in("import_key", chunk);
    if (error) throw error;
    for (const row of data || []) found.add(row.import_key);
  }
  return found;
}

async function insertHistoricalScoutRows(supabase, rows = []) {
  const existing = await existingImportKeys(supabase, rows.map((row) => row.import_key));
  const missingRows = rows.filter((row) => !existing.has(row.import_key));
  const chunkSize = 100;
  let inserted = 0;
  for (let index = 0; index < missingRows.length; index += chunkSize) {
    const chunk = missingRows.slice(index, index + chunkSize);
    const { error } = await supabase.from("store_reports").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  return { inserted, skippedExisting: existing.size };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  let stores = [];
  let supabase = null;
  if (supabaseUrl && serviceRoleKey) {
    supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    stores = await fetchStores(supabase);
  }

  const rows = buildHistoricalScoutImportRows(HISTORICAL_SCOUT_IMPORT_2026_05_NOTEBOOK, { stores });
  const validation = validateHistoricalScoutImportRows(rows);
  if (validation.duplicateKeys.length) {
    throw new Error(`Historical Scout import has duplicate import keys: ${validation.duplicateKeys.join(", ")}`);
  }
  if (validation.negativeRows.length) {
    throw new Error(`Historical Scout import includes no-stock/empty rows: ${validation.negativeRows.map((row) => row.import_key).join(", ")}`);
  }

  const unknownStores = rows.filter((row) => !row.store_id).length;
  const unknownTimes = HISTORICAL_SCOUT_IMPORT_2026_05_NOTEBOOK.filter((row) => !row.time && !shouldSkipHistoricalScoutRow(row)).length;
  const skipped = HISTORICAL_SCOUT_IMPORT_2026_05_NOTEBOOK.length - rows.length;
  console.log(`Historical Scout import ${HISTORICAL_SCOUT_IMPORT_BATCH}: ${rows.length} stock-positive rows validated.`);
  console.log(`Skipped ${skipped} empty/no-stock or invalid rows. Unknown stores: ${unknownStores}. Unknown times: ${unknownTimes}.`);

  if (dryRun) {
    console.log("Dry run complete. No Supabase rows were inserted.");
    return;
  }

  if (!supabase) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run with --dry-run.");
  }

  const result = await insertHistoricalScoutRows(supabase, rows);
  console.log(`Historical Scout import complete: ${result.inserted} inserted, ${result.skippedExisting} skipped existing.`);
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === currentFile) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
