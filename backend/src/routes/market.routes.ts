import { Router } from "express";
import { marketService } from "../services/market.service";
import { getMarketSourceSnapshot } from "../services/marketSources.service";
import { jsonError } from "./routeUtils";

export const marketRouter = Router();

marketRouter.get("/sources/:productId", (req, res) => {
  const snapshot = getMarketSourceSnapshot(req.params.productId);
  if (!snapshot) return jsonError(res, 400, "A valid TCGplayer product ID is required.");
  if (snapshot.status === "unavailable") return jsonError(res, 503, "The public price snapshot is temporarily unavailable.");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  return res.json(snapshot);
});

marketRouter.get("/search", (req, res) => {
  res.json(marketService.searchMarketData(String(req.query.q || "")));
});

marketRouter.get("/item/:id", (req, res) => {
  const item = marketService.getMarketPriceByCatalogId(req.params.id);
  if (!item) return jsonError(res, 404, "Market item not found");
  return res.json(item);
});

marketRouter.post("/refresh/:id", (req, res) => {
  const item = marketService.refreshMarketPrice(req.params.id);
  if (!item) return jsonError(res, 404, "Market item not found");
  return res.json(item);
});

