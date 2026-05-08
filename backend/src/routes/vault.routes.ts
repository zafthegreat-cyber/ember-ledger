import { vaultService } from "../services/inventory.service";
import { createCrudRouter } from "./routeUtils";

export const vaultRouter = createCrudRouter(vaultService, "Vault item not found");

