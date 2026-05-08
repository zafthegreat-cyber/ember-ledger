import { Router } from "express";
import { catalogService } from "../services/catalog.service";
import { createCrudRouter } from "./routeUtils";

export const catalogRouter = Router();

catalogRouter.get("/search", (req, res) => {
  res.json(catalogService.search(String(req.query.q || "")));
});

catalogRouter.use("/", createCrudRouter(catalogService, "Catalog item not found"));

