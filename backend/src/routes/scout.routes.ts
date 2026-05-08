import { Router } from "express";
import { scoutAlertsService } from "../services/stores.service";
import { createCrudRouter } from "./routeUtils";

export const scoutRouter = Router();

scoutRouter.use("/alerts", createCrudRouter(scoutAlertsService, "Scout alert not found"));

