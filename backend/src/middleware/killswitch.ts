import type { RequestHandler } from 'express';
import type { KillswitchStore } from '../services/killswitchStore.js';

/** 503s every route except /api/admin/* (so an admin can always reach the
 * controls needed to flip it back off) while the global killswitch is on —
 * see docs/adr/0028. Must run after firebaseAuth so an already-401 request
 * doesn't get a misleading 503 instead, and before rateLimit/callLogging so a
 * killed request doesn't still count against the caller. */
export function killswitchMiddleware(killswitchStore: KillswitchStore): RequestHandler {
  return async (req, res, next) => {
    if (req.path.startsWith('/api/admin')) {
      next();
      return;
    }
    const state = await killswitchStore.get();
    if (state.enabled) {
      res.status(503).json({ error: 'service temporarily disabled', reason: state.reason ?? undefined });
      return;
    }
    next();
  };
}
