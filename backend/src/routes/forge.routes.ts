import { Router } from "express";
import { expensesService, salesService } from "../services/inventory.service";
import { createCrudRouter } from "./routeUtils";

export const forgeRouter = Router();

forgeRouter.use("/sales", createCrudRouter(salesService, "Sale not found"));
forgeRouter.use("/expenses", createCrudRouter(expensesService, "Expense not found"));

