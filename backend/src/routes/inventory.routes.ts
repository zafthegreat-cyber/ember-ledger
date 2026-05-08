import { inventoryService } from "../services/inventory.service";
import { createCrudRouter } from "./routeUtils";

export const inventoryRouter = createCrudRouter(inventoryService, "Inventory item not found");

