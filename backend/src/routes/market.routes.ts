import { Router } from "express";
import { marketService } from "../services/market.service";
import { jsonError } from "./routeUtils";

export const marketRouter = Router();

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

