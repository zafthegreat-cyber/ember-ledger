import { Router } from "express";
import { bestBuyService } from "../services/bestbuy.service";

export const bestBuyRouter = Router();

bestBuyRouter.get("/search", (req, res) => {
  res.json(bestBuyService.searchProducts(String(req.query.q || "")));
});

bestBuyRouter.get("/sku/:sku", (req, res) => {
  res.json(bestBuyService.getProductBySku(req.params.sku));
});

bestBuyRouter.get("/availability", (req, res) => {
  const sku = String(req.query.sku || "");
  const zip = String(req.query.zip || "");
  res.json({
    online: bestBuyService.checkOnlineAvailability(sku),
    local: bestBuyService.checkLocalAvailability(sku, zip),
  });
});

bestBuyRouter.post("/match-catalog", (req, res) => {
  res.json(bestBuyService.matchBestBuySkuToCatalogItem(req.body?.sku, req.body?.productName));
});

