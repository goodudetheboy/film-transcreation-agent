import type { RequestHandler } from 'express';
import type { AccountStore } from '../services/accountStore.js';

export interface DecodedIdentity {
  uid: string;
  email: string;
  /** Firebase custom claim, set server-side via setCustomUserClaims — see
   * scripts/bootstrap-admin.ts and routes/admin.ts. */
  role?: string;
}

/** Injectable so tests never need a real Firebase project — see
 * server.ts for the real implementation (firebase-admin's verifyIdToken). */
export type VerifyIdToken = (idToken: string) => Promise<DecodedIdentity>;

export interface FirebaseAuthDeps {
  verifyIdToken: VerifyIdToken;
  accountStore: AccountStore;
}

/** Replaces the old passcode gate (see docs/adr/0028, supersedes 0008's
 * passcode-only stance). Verifies the bearer token, then loads the matching
 * `accounts/{uid}` doc — a valid Firebase identity alone isn't enough, it
 * must also be a provisioned, non-disabled account. */
export function firebaseAuthMiddleware(deps: FirebaseAuthDeps): RequestHandler {
  return async (req, res, next) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) {
      res.status(401).json({ error: 'missing bearer token' });
      return;
    }

    let decoded: DecodedIdentity;
    try {
      decoded = await deps.verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'invalid or expired token' });
      return;
    }

    const account = await deps.accountStore.getAccount(decoded.uid);
    if (!account) {
      res.status(401).json({ error: 'no provisioned account for this identity' });
      return;
    }
    if (account.disabled) {
      res.status(403).json({ error: 'account disabled' });
      return;
    }

    req.account = account;
    next();
  };
}
