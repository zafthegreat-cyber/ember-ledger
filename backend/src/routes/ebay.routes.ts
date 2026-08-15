import { Response, Router } from "express";
import {
  EbayApiError,
  checkEbayHealth,
  readEbayConfig,
  searchEbayListings,
} from "../services/ebayBrowse.service";

export const ebayRouter = Router();

function sendEbayError(res: Response, error: unknown) {
  if (error instanceof EbayApiError) {
    if (error.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
    return res.status(error.status).json({
      ok: false,
      providerId: "ebay",
      error: { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds },
      checkedAt: new Date().toISOString(),
    });
  }
  return res.status(500).json({
    ok: false,
    providerId: "ebay",
    error: { code: "upstream_error", message: "The eBay connector encountered an unexpected server error." },
    checkedAt: new Date().toISOString(),
  });
}

ebayRouter.get("/health", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const verify = String(req.query.verify || "").toLowerCase() === "true";
    const result = await checkEbayHealth(verify);
    return res.json(result);
  } catch (error) {
    return sendEbayError(res, error);
  }
});

ebayRouter.post("/search", async (req, res) => {
  try {
    const configuration = readEbayConfig();
    if (!configuration.configured) {
      throw new EbayApiError(
        "missing_configuration",
        `eBay is not configured on the server. Missing: ${configuration.missing.join(", ")}.`,
        503,
      );
    }
    const result = await searchEbayListings(req.body || {}, configuration.config);
    res.setHeader("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    return sendEbayError(res, error);
  }
});
