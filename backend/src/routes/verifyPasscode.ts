import { Router } from 'express';

/**
 * Cheap endpoint the frontend calls before showing the main UI. It does
 * nothing itself — passcodeMiddleware (mounted before this in the guarded
 * router) already rejected the request with 401 if the passcode was wrong,
 * so reaching this handler at all means it was correct.
 */
export function verifyPasscodeRoute(): Router {
  const router = Router();
  router.post('/api/verify-passcode', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return router;
}
