# 0030. `?demo=1` auto-sign-in via a backend-minted Firebase custom token

Status: Accepted

## Context

The hackathon submission form takes exactly one URL — there's no second field
for a login a judge could be handed separately. [0028](0028-firebase-authentication-and-per-account-provisioning.md)
gates the whole app behind Firebase email/password sign-in, so a judge
opening the bare app URL hits [SignInGate](../../frontend/src/components/SignInGate.tsx)
with nothing to type into it.

Putting a credential in the URL itself (`?user=...&pass=...`) was considered
and rejected: query strings land in browser history, server/proxy access
logs, and referrer headers in plaintext, and the credential would have to
live somewhere reachable by that link (frontend source or a shared URL) to
work at all — a real, standing secret exposed by design.

## Decision

One pre-provisioned, ordinary `"user"`-role account
(`demo@cinema.vietrochack.com`, created the normal way via
`POST /api/admin/accounts`) is the designated demo account. A `?demo=1` query
param on the frontend URL triggers an automatic sign-in to it:

1. Frontend (`App.tsx`'s `onAuthStateChanged` callback) sees no signed-in
   user and `?demo=1` in the URL, and calls the new unauthenticated
   `POST /api/demo-session`.
2. Backend (`routes/demoSession.ts`, mounted in `app.ts` before
   `firebaseAuthMiddleware` — same tier as `/mock-uploads`, but still behind
   its own `rateLimitMiddleware` instance) looks up `demoAccountEmail`
   (`DEMO_ACCOUNT_EMAIL` env var) in Firebase Auth and mints a short-lived
   custom token via `firebase-admin`'s `createCustomToken`.
3. Frontend calls `signInWithCustomToken(auth, token)`, which fires
   `onAuthStateChanged` again with the real user — same code path as a normal
   login from here on.

No password is ever entered, stored, or transmitted anywhere in this flow.
The only thing that can leak is the flag `?demo=1` itself, which grants
nothing on its own.

**Local-dev signing gotcha, worth recording**: `firebase-admin`'s
`createCustomToken` needs to sign a JWT via IAM's `signBlob`, which requires
knowing *which* service account to sign as. Off-GCP (any local dev machine),
it can't auto-discover this via the GCE metadata server the way it does on
Cloud Run — `initializeApp()` in `server.ts` now passes an explicit
`serviceAccountId: firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com`
to skip that discovery step, and the calling identity needs
`roles/iam.serviceAccountTokenCreator` granted on that service account (see
progress log for the exact `gcloud` command run for local dev).

## Consequences

- `demo@cinema.vietrochack.com` is a normal, fully-functional `"user"`
  account, not a read-only or specially sandboxed one — this app has no
  read-only enforcement anywhere (roles are only `"admin"`/`"user"`, per
  [accountTypes.ts](../../backend/src/services/accountTypes.ts)). It's
  scoped only by whatever quotas (`maxFilms`/`maxProjects`/
  `maxConcurrentAgentRuns`) were set when it was provisioned. A judge with
  the link can create/edit/delete within those caps.
- `POST /api/demo-session` is unauthenticated by design, so it's rate-limited
  (own limiter instance, same config knobs as the main API) to bound abuse;
  it 503s cleanly if `DEMO_ACCOUNT_EMAIL` is unset or the account doesn't
  exist in Firebase Auth yet.
- **Deploying this to Cloud Run needs two things this ADR doesn't set up**:
  `DEMO_ACCOUNT_EMAIL` in the Cloud Run service's env config, and the Cloud
  Run runtime service account granted `roles/iam.serviceAccountTokenCreator`
  on `firebase-adminsdk-fbsvc@...` (same requirement as local dev, different
  identity) — unverified whether Cloud Run's own metadata-server discovery
  makes the explicit `serviceAccountId` unnecessary there; flagged as a
  pre-deploy TODO rather than assumed.
- Killing demo access after judging ends is one `PATCH /api/admin/accounts/:uid`
  call setting `disabled: true` — same admin lever as any other account,
  nothing demo-specific to remember to revoke.
