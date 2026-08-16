import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

export function rateLimitMiddleware(opts: { windowMs: number; max: number }): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
