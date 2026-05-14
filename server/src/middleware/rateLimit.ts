import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

export interface LoginRateLimitOptions {
  limit?: number;
  windowMs?: number;
}

export function createLoginRateLimiter(
  opts: LoginRateLimitOptions = {},
): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs ?? 15 * 60_000,
    limit: opts.limit ?? 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many attempts, try again later.' });
    },
  });
}
