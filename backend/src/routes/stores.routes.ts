import { Router } from "express";
import { storesService } from "../services/stores.service";
import { createCrudRouter } from "./routeUtils";

export const storesRouter = Router();

storesRouter.get("/search", (req, res) => {
  res.json(storesService.search(String(req.query.q || "")));
});

storesRouter.use("/", createCrudRouter(storesService, "Store not found"));

