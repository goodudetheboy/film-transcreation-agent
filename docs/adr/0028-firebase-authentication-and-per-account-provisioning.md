# 0028. Real accounts: Firebase Authentication, per-account quotas, a killswitch

Status: Accepted (supersedes 0008's passcode-only stance)

## Context

0008 deliberately chose *not* to use real auth: the risk being managed was uncontrolled
GCP API cost from bots/crawlers hitting a public demo URL, not unauthorized access to
non-sensitive data. It closed with an explicit trigger for revisiting that: "If this
becomes a real product post-hackathon... proper auth becomes worth its cost once real
user data is involved."

That trigger fired for a different reason than 0008 anticipated: not "real user data,"
but the need to tell callers apart. A single shared passcode means every demo account,
every dev poking at the app, and the admin are indistinguishable — there's no way to
provision a scoped demo login, cap how much any one caller can spin up, or kill one
misbehaving caller without taking the whole app down for everyone.

## Decision

Replace the shared passcode with real Firebase Authentication (email + password,
admin-provisioned — no self-signup), backed by:

- **Accounts** (`accounts/{uid}`, `services/accountStore.ts`): a `role` ('admin' |
  'user'), a `label` for identifying demo/dev/other accounts in the dashboard, and
  per-account **quotas** (max films, max projects, max concurrent agent runs — Discovery
  jobs + Research runs combined) enforced at creation time
  (`services/quota.ts`, checked in `routes/films.ts`/`routes/projects.ts` before any
  film/project/run is created). Admin is exempt from quotas entirely.
- **Ownership**: `Film.ownerUid`/`Project.ownerUid` are now required fields. Every
  list/get/delete route scopes to the caller's own resources unless `role === 'admin'`.
  Per the user's explicit call: the admin account becomes the owner of the *existing*
  pre-auth shared workspace (backfilled once by `scripts/bootstrap-admin.ts`, not a
  per-record migration decision made by this ADR) — no multi-tenant redesign of
  existing data, just an ownership tag going forward.
- **`/admin`** (frontend route + `routes/admin.ts`, gated on the `admin` custom claim):
  provision/list/update/deprovision accounts, and a **global killswitch**
  (`systemConfig/killswitch`, `middleware/killswitch.ts`) that 503s every route except
  `/api/admin/*` while enabled — the fast "someone got wise" control this ADR exists to
  add.
- **Call-activity log** (`apiCallLog`, `middleware/callLogging.ts`): one doc per
  authenticated request (uid, method, path, status, latency), TTL'd to prune itself,
  feeding the admin dashboard's recent-activity view and each account's 24h-usage
  summary — so a runaway account can be spotted and killed (`disabled: true`, which
  `firebaseAuth.ts` enforces on the caller's *next* request via `verifyIdToken`'s
  `checkRevoked: true`, not after their current token's remaining ~1hr lifetime).

**Firestore's own security rules stay unchanged** (`allow read, write: if false`,
0020) — the backend still talks to Firestore server-side only via ADC. All of the above
is Express-layer enforcement, the same shape the passcode gate already had, just backed
by verified Firebase ID tokens instead of a shared string.

Enabling Firebase Authentication needed one manual step (Firebase console's
"Get Started" on the Authentication tab initializes Identity Platform's base config for
the project — not exposed as a public API, confirmed via testing before asking for it);
everything after that (enabling the email/password provider, registering the web app,
provisioning the admin account, custom claims) was done headlessly via `gcloud`/
`firebase` CLI and the Admin SDK.

## Consequences

- `middleware/passcode.ts`, `routes/verifyPasscode.ts`, `Config.sharedPasscode`, and the
  frontend's `PasscodeGate.tsx` are deleted outright, not kept as a fallback — no
  dual-auth period.
- A `<video>` tag can't carry an `Authorization` header, so `/mock-uploads` (test-mode
  clips only, never real film data) is mounted unauthenticated, ahead of the auth
  middleware — same tier as the health check.
- Ownership enforcement is applied at the film/project boundary (list/get/delete/create)
  and at creation-time quota checks, not on every deeply-nested sub-resource route
  (e.g. a Discovery job's comment/result-merge endpoints still trust an unguessable
  UUID rather than re-checking the parent film's owner on every call) — a deliberate
  scope trim consistent with 0008's own risk calibration (this app's actual exposure is
  cost control, not data confidentiality). Worth tightening if this becomes a real
  product with real user data, per 0008's original framing.
- The call-activity log's "24h" window is computed in application code from a
  single-equality-filter Firestore query (`uid ==`), not a Firestore range query on
  `ts` — avoids a composite-index dependency; correct as long as the TTL (25h) keeps
  each account's log slice small.
