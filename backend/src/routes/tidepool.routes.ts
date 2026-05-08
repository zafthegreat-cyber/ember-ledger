import { Router } from "express";
import { storeReportsService } from "../services/stores.service";
import { jsonError } from "./routeUtils";

export const tidepoolRouter = Router();
export const storeReportsRouter = Router();

storeReportsRouter.get("/", (req, res) => {
  res.json(storeReportsService.list(String(req.query.storeId || "") || undefined));
});

storeReportsRouter.post("/", (req, res) => {
  res.status(201).json(storeReportsService.create(req.body));
});

storeReportsRouter.put("/:id", (req, res) => {
  const report = storeReportsService.update(req.params.id, req.body);
  if (!report) return jsonError(res, 404, "Store report not found");
  return res.json(report);
});

storeReportsRouter.delete("/:id", (req, res) => {
  const report = storeReportsService.remove(req.params.id);
  if (!report) return jsonError(res, 404, "Store report not found");
  return res.json(report);
});

tidepoolRouter.get("/reports", (req, res) => {
  res.json(storeReportsService.list(String(req.query.storeId || "") || undefined));
});

