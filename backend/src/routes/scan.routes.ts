import { Router } from "express";
import { scanService } from "../services/scan.service";

export const scanRouter = Router();

scanRouter.post("/upc", (req, res) => {
  res.json(scanService.scanUpc(req.body?.upc || req.body?.value || req.body?.input));
});

scanRouter.post("/card", (req, res) => {
  res.json(scanService.scanCard(req.body?.cardNumber || req.body?.name || req.body?.value || req.body?.input));
});

scanRouter.post("/receipt", (req, res) => {
  res.json(scanService.scanReceipt(req.body?.text || req.body?.value || req.body?.input));
});

