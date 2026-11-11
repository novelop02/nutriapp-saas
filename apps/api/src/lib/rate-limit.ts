import type { Request, RequestHandler } from "express";
import { AppError } from "../errors.js";

export type HitResult = { count: number; ttlMs: number };

// Redis in production, a fake in unit tests
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<HitResult>;
}

export type LimiterOptions = {
  store: RateLimitStore;
  name: string;
  limit: number;
  windowMs: number;
  // Return null to skip limiting this request
  key: (req: Request) => string | null;
};

export function rateLimit(opts: LimiterOptions): RequestHandler {
  return async (req, res, next) => {
    const id = opts.key(req);
    if (id === null) return next();

    try {
      const { count, ttlMs } = await opts.store.hit(`rl:${opts.name}:${id}`, opts.windowMs);

      if (count > opts.limit) {
        res.set("Retry-After", String(Math.max(1, Math.ceil(ttlMs / 1000))));
        // No emails or keys in the log: the request log already has the IP
        req.log.warn({ event: "rate_limited", limiter: opts.name, count }, "Rate limit exceeded");
        return next(new AppError(429, "rate_limited", "Too many requests, try again later"));
      }
      next();
    } catch (err) {
      // Fail open: a broken store must not take login down, but it must be loud
      req.log.error(
        { err, event: "rate_limit_store_error", limiter: opts.name },
        "Rate limit store failed, allowing the request",
      );
      next();
    }
  };
}
