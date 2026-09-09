import { Router } from 'express';

/** Injectable wrapper around firebase-admin's Auth methods this route needs —
 * see server.ts for the real implementation. Same "inject only what's used"
 * convention as admin.ts's FirebaseUserAdmin. */
export interface DemoAuthAdmin {
  getUidByEmail(email: string): Promise<string | undefined>;
  createCustomToken(uid: string): Promise<string>;
}

export interface DemoSessionRouteDeps {
  demoAuthAdmin: DemoAuthAdmin;
  /** The one pre-provisioned account this endpoint will ever mint a token
   * for. Unset disables the endpoint entirely — see docs/adr/0030. */
  demoAccountEmail?: string;
}

/**
 * Unauthenticated by design (mounted in app.ts before firebaseAuthMiddleware,
 * same tier as /mock-uploads) — its whole purpose is letting a signed-out
 * browser get signed in, via a Firebase custom token for one fixed,
 * pre-provisioned "user"-role account. No password ever passes through this
 * endpoint or the frontend that calls it; see docs/adr/0030.
 */
export function demoSessionRoute(deps: DemoSessionRouteDeps): Router {
  const router = Router();

  router.post('/api/demo-session', async (_req, res) => {
    if (!deps.demoAccountEmail) {
      res.status(503).json({ error: 'demo mode not configured' });
      return;
    }

    let uid: string | undefined;
    try {
      uid = await deps.demoAuthAdmin.getUidByEmail(deps.demoAccountEmail);
    } catch (err) {
      res.status(502).json({ error: `failed to look up demo account: ${err instanceof Error ? err.message : 'unknown error'}` });
      return;
    }
    if (!uid) {
      res.status(503).json({ error: 'demo account not provisioned' });
      return;
    }

    try {
      const token = await deps.demoAuthAdmin.createCustomToken(uid);
      res.status(200).json({ token });
    } catch (err) {
      res.status(502).json({ error: `failed to mint demo token: ${err instanceof Error ? err.message : 'unknown error'}` });
    }
  });

  return router;
}
