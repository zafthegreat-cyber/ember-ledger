import { createHash } from "crypto";
import { pool } from "../db";

const ALERTABLE_STATUSES = new Set([
  "IN_STOCK",
  "PREORDER",
  "BACKORDER",
  "COMING_SOON",
  "LOADED_NOT_BUYABLE",
]);

type RetailerObservationInput = {
  retailer: string;
  externalId: string;
  name?: string;
  url?: string;
  upc?: string;
  sku?: string;
  sourceType?: string;
  checkedAt?: string;
  status: string;
  rawStatus?: string;
  price?: number | null;
  onlineAvailable?: boolean | null;
  storeAvailable?: boolean | null;
  itemLoaded?: boolean | null;
  stores?: unknown[];
  sourceUrl?: string;
  rawPayload?: Record<string, unknown>;
};

function nowIso() {
  return new Date().toISOString();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeStatus(value = "") {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("in stock") || raw.includes("available")) return "IN_STOCK";
  if (raw.includes("preorder") || raw.includes("pre-order")) return "PREORDER";
  if (raw.includes("backorder") || raw.includes("back order")) return "BACKORDER";
  if (raw.includes("coming") || raw.includes("soon")) return "COMING_SOON";
  if (raw.includes("loaded")) return "LOADED_NOT_BUYABLE";
  if (raw.includes("out") || raw.includes("sold")) return "OUT_OF_STOCK";
  return "UNKNOWN";
}

function boolFromAvailability(value: unknown) {
  const raw = String(value || "").toLowerCase();
  if (typeof value === "boolean") return value;
  if (raw.includes("in stock") || raw.includes("available") || raw === "true") return true;
  if (raw.includes("out") || raw === "false") return false;
  return null;
}

function bestBuyObservationFromProduct(product: Record<string, unknown>): RetailerObservationInput | null {
  const sku = String(product.bestBuySku || product.sku || "").trim();
  if (!sku) return null;
  const rawPayload = product;
  const onlineAvailable = boolFromAvailability(product.onlineAvailability);
  const storeAvailable = boolFromAvailability(product.storeAvailability);
  const status = normalizeStatus(String(product.stockStatus || product.onlineAvailability || product.storeAvailability || ""));
  return {
    retailer: "Best Buy",
    externalId: sku,
    sku,
    upc: String(product.upc || "").trim() || undefined,
    name: String(product.productName || product.name || "").trim() || undefined,
    url: String(product.productUrl || product.url || "").trim() || undefined,
    sourceType: "bestbuy_api",
    checkedAt: String(product.lastChecked || nowIso()),
    status,
    rawStatus: String(product.rawStatus || "").trim() || undefined,
    price: Number(product.salePrice || product.price || 0) || null,
    onlineAvailable,
    storeAvailable,
    itemLoaded: true,
    stores: Array.isArray(product.stores) ? product.stores : [],
    sourceUrl: String(product.productUrl || product.url || "").trim() || undefined,
    rawPayload,
  };
}

async function upsertRetailerProduct(input: RetailerObservationInput) {
  const result = await pool.query(
    `
    insert into retailer_products (
      retailer,
      external_id,
      name,
      url,
      upc,
      sku,
      source_type,
      updated_at
    )
    values ($1,$2,$3,$4,$5,$6,$7,now())
    on conflict (retailer, external_id) do update set
      name = coalesce(excluded.name, retailer_products.name),
      url = coalesce(excluded.url, retailer_products.url),
      upc = coalesce(excluded.upc, retailer_products.upc),
      sku = coalesce(excluded.sku, retailer_products.sku),
      source_type = excluded.source_type,
      updated_at = now()
    returning id
    `,
    [
      input.retailer,
      input.externalId,
      input.name || null,
      input.url || null,
      input.upc || null,
      input.sku || null,
      input.sourceType || "unknown",
    ]
  );
  return result.rows[0]?.id as string;
}

async function getLastObservation(productId: string) {
  const result = await pool.query(
    `
    select *
    from retailer_observations
    where product_id = $1
    order by checked_at desc, created_at desc
    limit 1
    `,
    [productId]
  );
  return result.rows[0] || null;
}

async function insertObservation(input: RetailerObservationInput) {
  const productId = await upsertRetailerProduct(input);
  const previous = await getLastObservation(productId);
  const rawPayload = input.rawPayload || {};
  const payloadHash = sha256(JSON.stringify(rawPayload));
  const result = await pool.query(
    `
    insert into retailer_observations (
      product_id,
      checked_at,
      status,
      raw_status,
      price,
      online_available,
      store_available,
      item_loaded,
      stores,
      payload_hash,
      source_url,
      raw_payload
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb)
    returning id, status, checked_at
    `,
    [
      productId,
      input.checkedAt || nowIso(),
      normalizeStatus(input.status),
      input.rawStatus || null,
      input.price ?? null,
      input.onlineAvailable ?? null,
      input.storeAvailable ?? null,
      input.itemLoaded ?? null,
      JSON.stringify(input.stores || []),
      payloadHash,
      input.sourceUrl || null,
      JSON.stringify(rawPayload),
    ]
  );
  const inserted = result.rows[0];
  return {
    productId,
    observationId: inserted.id as string,
    status: inserted.status as string,
    checkedAt: inserted.checked_at as string,
    previousStatus: previous?.status as string | undefined,
    statusChanged: !previous || previous.status !== inserted.status,
  };
}

function buildAlertMessage(product: Record<string, unknown>, status: string) {
  const name = String(product.productName || product.name || product.sku || "Best Buy product");
  const sku = String(product.bestBuySku || product.sku || "");
  const price = Number(product.salePrice || product.price || 0);
  const url = String(product.productUrl || product.url || "");
  return [
    `Best Buy restock alert: ${name}`,
    sku ? `SKU: ${sku}` : "",
    `Status: ${status}`,
    price ? `Price: $${price.toFixed(2)}` : "",
    url,
  ].filter(Boolean).join("\n");
}

type AlertSendResult = {
  sent: boolean;
  channel: string;
  status: number | undefined;
};

async function sendDiscordAlert(message: string): Promise<AlertSendResult> {
  const webhookUrl = process.env.BESTBUY_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, channel: "none", status: undefined };
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  return { sent: response.ok, channel: "discord", status: response.status };
}

async function logAlert(productId: string, observationId: string, channel: string, message: string, responseStatus?: number) {
  const messageHash = sha256(message);
  try {
    await pool.query(
      `
      insert into retailer_alert_log (
        product_id,
        observation_id,
        channel,
        message_hash,
        response_status
      )
      values ($1,$2,$3,$4,$5)
      `,
      [productId, observationId, channel, messageHash, responseStatus || null]
    );
    return true;
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) return false;
    throw error;
  }
}

async function recordBestBuyProduct(product: Record<string, unknown>, onlyOnChange = true) {
  const observation = bestBuyObservationFromProduct(product);
  if (!observation) return null;
  const recorded = await insertObservation(observation);
  const shouldAlert = ALERTABLE_STATUSES.has(recorded.status) && (!onlyOnChange || recorded.statusChanged);
  let alert = { sent: false, channel: "none", status: undefined as number | undefined, logged: false };
  if (shouldAlert) {
    const message = buildAlertMessage(product, recorded.status);
    const sent = await sendDiscordAlert(message);
    const logged = await logAlert(recorded.productId, recorded.observationId, sent.channel, message, sent.status);
    alert = { ...sent, logged };
  }
  return { ...recorded, alert };
}

export const restockMonitorService = {
  recordBestBuyProduct,
  normalizeStatus,
};
