import { Router } from "express";
import { ownerSecurity } from "../auth/ownerAuthorization";

type OwnerSecurity = Pick<typeof ownerSecurity, "inspectSession">;

export function createAuthRouter(security: OwnerSecurity = ownerSecurity) {
  const router = Router();
  router.get("/session", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const result = await security.inspectSession(request);
    return response.status(result.status).json(result.body);
  });
  return router;
}

export const authRouter = createAuthRouter();
