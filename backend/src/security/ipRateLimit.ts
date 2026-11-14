import type { NextFunction, Request, Response } from "express";

// Per-IP rate limit for public, unauthenticated lookups (audit 2026-11-14).
// Buckets live in memory, so on serverless each warm instance limits on its
// own; that still stops one client from draining the upstream API quota.
type IpRateLimitOptions = {
  maximumRequests?: number;
  windowMs?: number;
  now?: () => number;
  label?: string;
};

type Bucket = { startedAt: number; count: number };

export function clientAddress(request: Pick<Request, "headers" | "ip" | "socket">): string {
  // Vercel puts the real client first in x-forwarded-for.
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.ip || request.socket?.remoteAddress || "unknown";
}

export function createIpRateLimit(options: IpRateLimitOptions = {}) {
  const maximumRequests = options.maximumRequests || 60;
  const windowMs = options.windowMs || 60_000;
  const now = options.now || Date.now;
  const label = options.label || "lookups";
  const buckets = new Map<string, Bucket>();

  return function ipRateLimit(request: Request, response: Response, next: NextFunction) {
    if (request.method === "OPTIONS") return next();
    const key = clientAddress(request);
    const currentTime = now();
    const current = buckets.get(key);
    const bucket = !current || currentTime - current.startedAt >= windowMs ? { startedAt: currentTime, count: 0 } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 1000) {
      for (const [candidateKey, candidate] of buckets) if (currentTime - candidate.startedAt >= windowMs) buckets.delete(candidateKey);
    }
    if (bucket.count > maximumRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.startedAt + windowMs - currentTime) / 1_000));
      response.setHeader("Retry-After", String(retryAfterSeconds));
      return response.status(429).json({ ok: false, error: { code: "rate_limited", message: `Too many ${label}. Try again in a minute.`, retryAfterSeconds } });
    }
    return next();
  };
}
