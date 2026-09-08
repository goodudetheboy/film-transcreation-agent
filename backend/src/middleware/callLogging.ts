import type { RequestHandler } from 'express';
import type { ApiCallLogStore } from '../services/apiCallLogStore.js';

/** Fire-and-forget per-request log entry, feeding the admin activity
 * dashboard — see docs/adr/0028. Runs after firebaseAuth so req.account is
 * set; a request that never authenticated (401 before reaching here) has
 * nothing to attribute the call to and is skipped. */
export function callLoggingMiddleware(apiCallLogStore: ApiCallLogStore): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const account = req.account;
      if (!account) return;
      void apiCallLogStore.logCall({
        uid: account.uid,
        role: account.role,
        method: req.method,
        // req.originalUrl, not req.path — a nested router (e.g. admin.ts,
        // mounted at '/api/admin') strips its mount prefix from req.path/
        // req.url for the duration of its own dispatch, and that stripped
        // value is still what's current when this 'finish' listener runs;
        // originalUrl is Express's one guarantee of the full request path
        // regardless of how deep the matching route was nested.
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        latencyMs: Date.now() - start,
      });
    });
    next();
  };
}
