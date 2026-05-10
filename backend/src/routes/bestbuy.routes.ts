import { Request, Router } from "express";
import { bestBuyService } from "../services/bestbuy.service";
import { restockMonitorService } from "../services/restockMonitor.service";

export const bestBuyRouter = Router();

function isMonitorEnabled() {
  return String(process.env.BESTBUY_MONITOR_ENABLED || "").toLowerCase() === "true";
}

function isMonitorAuthorized(req: Request) {
  const secret = process.env.BESTBUY_MONITOR_SECRET || "";
  if (!secret) return true;
  const auth = String(req.headers.authorization || "");
  const querySecret = String(req.query.secret || "");
  return auth === `Bearer ${secret}` || querySecret === secret;
}

function extractProducts(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const objectPayload = payload as Record<string, unknown>;
  if (Array.isArray(objectPayload.products)) return objectPayload.products as Record<string, unknown>[];
  if (objectPayload.error) return [];
  return [objectPayload];
}

bestBuyRouter.get("/search", async (req, res) => {
  res.json(await bestBuyService.searchProducts(String(req.query.q || "")));
});

bestBuyRouter.get("/sku/:sku", async (req, res) => {
  res.json(await bestBuyService.getProductBySku(req.params.sku));
});

bestBuyRouter.get("/availability", async (req, res) => {
  const sku = String(req.query.sku || "");
  const zip = String(req.query.zip || "");
  res.json({
    online: await bestBuyService.checkOnlineAvailability(sku),
    local: await bestBuyService.checkLocalAvailability(sku, zip),
  });
});

bestBuyRouter.post("/match-catalog", (req, res) => {
  res.json(bestBuyService.matchBestBuySkuToCatalogItem(req.body?.sku, req.body?.productName));
});

bestBuyRouter.all("/monitor/run", async (req, res) => {
  if (!isMonitorEnabled()) {
    return res.status(202).json({
      ok: true,
      enabled: false,
      message: "Best Buy monitoring is disabled until BESTBUY_MONITOR_ENABLED=true is set.",
    });
  }
  if (!isMonitorAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "Monitor request is not authorized." });
  }

  const query = String(req.body?.query || req.query.q || process.env.BESTBUY_MONITOR_QUERY || "pokemon tcg");
  const zip = String(req.body?.zip || req.query.zip || process.env.BESTBUY_MONITOR_ZIP || "");
  const skuInput = String(req.body?.sku || req.query.sku || process.env.BESTBUY_MONITOR_SKUS || "");
  const skus = skuInput.split(",").map((sku) => sku.trim()).filter(Boolean);
  const onlyOnChange = String(req.body?.onlyOnChange ?? process.env.BESTBUY_ALERT_ONLY_ON_CHANGE ?? "true").toLowerCase() !== "false";

  const products: Record<string, unknown>[] = [];
  if (skus.length) {
    for (const sku of skus) {
      const availability = await bestBuyService.checkLocalAvailability(sku, zip);
      products.push(...extractProducts(availability));
    }
  } else {
    const search = await bestBuyService.searchProducts(query);
    products.push(...extractProducts(search));
  }

  if (products.some((product) => product.error)) {
    return res.status(503).json({
      ok: false,
      sourceStatus: "error",
      message: "Best Buy monitor could not fetch live products.",
    });
  }

  const recorded = [];
  for (const product of products) {
    const row = await restockMonitorService.recordBestBuyProduct(product, onlyOnChange);
    if (row) recorded.push(row);
  }

  res.json({
    ok: true,
    enabled: true,
    query: skus.length ? undefined : query,
    skus,
    zip,
    checkedCount: products.length,
    recordedCount: recorded.length,
    alertCount: recorded.filter((row) => row.alert?.logged).length,
    recorded,
  });
});
