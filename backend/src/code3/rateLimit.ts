import type { NextFunction, Request, Response } from "express";
import type { AuthPrincipal } from "../auth/authPrincipal";

type RateLimitOptions = {
  maximumRequests?: number;
  windowMs?: number;
  now?: () => number;
};

type Bucket = { startedAt: number; count: number };

export function createOwnerRateLimit(options: RateLimitOptions = {}) {
  const maximumRequests = options.maximumRequests || 300;
  const windowMs = options.windowMs || 60_000;
  const now = options.now || Date.now;
  const buckets = new Map<string, Bucket>();

  return function ownerRateLimit(_request: Request, response: Response, next: NextFunction) {
    const principal = response.locals.authPrincipal as AuthPrincipal | undefined;
    if (!principal) return response.status(401).json({ ok: false, error: { code: "authentication_required", message: "Sign in is required." } });
    const key = `${principal.provider}:${principal.subject}`;
    const currentTime = now();
    const current = buckets.get(key);
    const bucket = !current || currentTime - current.startedAt >= windowMs
      ? { startedAt: currentTime, count: 0 }
      : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > maximumRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.startedAt + windowMs - currentTime) / 1_000));
      response.setHeader("Retry-After", String(retryAfterSeconds));
      return response.status(429).json({
        ok: false,
        error: { code: "rate_limited", message: "Too many owner-data requests. Try again later.", retryAfterSeconds },
      });
    }
    if (buckets.size > 100) {
      for (const [candidateKey, candidate] of buckets) {
        if (currentTime - candidate.startedAt >= windowMs) buckets.delete(candidateKey);
      }
    }
    return next();
  };
}
