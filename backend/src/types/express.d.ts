import type { Account } from '../services/accountTypes.js';

/** Set by firebaseAuth.ts once a request's bearer token verifies against a
 * provisioned account — see docs/adr/0028. */
declare global {
  namespace Express {
    interface Request {
      account?: Account;
    }
  }
}

export {};
