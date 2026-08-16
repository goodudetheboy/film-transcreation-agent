# 0011. Deploy: backend on Cloud Run, frontend on Firebase Hosting, same GCP project

Status: Accepted

## Context

0004 already decided the backend belongs on Cloud Run, in the same GCP project as
the Dialogflow CX agent, so it gets ADC via an attached service account instead of
a pasted key. 0007 left frontend hosting open between Vercel and Firebase Hosting.
The user asked to deploy everything on Google Cloud with one script — Firebase
Hosting is the natural fit here since it's part of the same GCP project umbrella
and needs no separate account/platform.

## Decision

- **Backend** → Cloud Run, deployed via `gcloud run deploy --source backend`
  (Google Cloud Buildpacks, no Dockerfile to maintain). This is why
  `backend/package.json` now has a `start` script (`node dist/server.js`) alongside
  `build` (`tsc`) — buildpacks run `npm run build` then `npm start` automatically.
  `backend/tsconfig.json` excludes test files from the build so `dist/` only ever
  contains runtime code.
- **Frontend** → Firebase Hosting, deployed via `firebase deploy --only hosting`
  from the pre-built `frontend/dist`. `firebase.json`/`.firebaserc` pin the project
  and hosting config; `VITE_BACKEND_URL` is baked in at build time by pointing it
  at whatever the Cloud Run deploy just returned as its service URL — Vite env vars
  are compile-time, not runtime, so the frontend must be rebuilt after any backend
  URL change (a fresh Cloud Run deploy keeps the same URL across revisions, so this
  is mostly a first-deploy concern).
- `scripts/deploy.sh` does both in order: deploy backend → capture its URL → build
  frontend against that URL → deploy frontend. It reads `SHARED_PASSCODE` from the
  developer's local `backend/.env` rather than hardcoding it, so the passcode never
  lives in a committed file.
- `backend/.gcloudignore` added — `backend/` had no local ignore file, and
  `gcloud run deploy --source backend` treats that directory as its own root. Without
  it, the deploy would upload `node_modules/` (slow) and, critically, the real
  `backend/.env` (a secret) into the Cloud Build source archive.
- **The `--allow-unauthenticated` flag is intentional**, not an oversight — matches
  0005/0008's decision that the passcode + rate limit are the access control, not
  IAM/IAP (IAP was already rejected for locking out judges).

## Consequences

- **One-time manual step this doesn't and shouldn't script**: the Cloud Run
  service's default compute service account needs the Dialogflow API Client role
  (or equivalent) on the project before real (non-test-mode) requests will work in
  production — the deployed equivalent of the developer's local
  `gcloud auth application-default login`. Granting IAM roles is an infrastructure
  change, not something to bundle into a "push my code" script without a human
  explicitly running it.
- Also not scripted, and required once before `scripts/deploy.sh` works at all:
  `gcloud auth login` (deploy permissions, distinct from ADC login), `firebase login`,
  Firebase enabled on the GCP project, and the Cloud Run/Cloud Build APIs enabled.
- Re-running `scripts/deploy.sh` is safe/idempotent — Cloud Run deploys a new
  revision under the same service URL, Firebase Hosting deploys a new release.
- Still on the developer to do the `docs/runbook.md` checklist (GCP budget alert,
  real passcode, tear-down plan) before actually sharing a deployed URL — this ADR
  is about the deploy mechanism, not the safety checklist, which is unchanged.

## Update: GitHub Actions (`.github/workflows/deploy.yml`)

Same two-step deploy (backend, then frontend against its URL), automated on push to
`main`. Auth uses a single dedicated service account (not a personal credential) —
reused for both the `gcloud run deploy` step and the `firebase-tools deploy` step,
since both consume whatever credentials `google-github-actions/auth` exports,
regardless of how that auth was obtained. `SHARED_PASSCODE` is a repo secret, never
committed.

## Update: switched to Workload Identity Federation (no stored key)

The user asked directly whether a Google credential had to live in GitHub at all.
Researched current (2026) support before answering rather than assuming: confirmed
via the official `google-github-actions/auth` repo that WIF is the recommended
approach over a JSON key secret, and confirmed Firebase Hosting deploys specifically
now support WIF-derived credentials (added November 2024 — this used to be a real
gap, it isn't anymore).

Switched `.github/workflows/deploy.yml`'s auth step from `credentials_json` (a
`GCP_SA_KEY` secret) to `workload_identity_provider` + `service_account`, with
`permissions: id-token: write` added at the job level. No code downstream of the
auth step changed — `gcloud run deploy` and `firebase-tools deploy` both already
consumed the credentials file `google-github-actions/auth` exports, whether that
credential came from a key or from WIF token exchange.

Setup (one-time, see `docs/runbook.md`): create a Workload Identity Pool, an OIDC
provider trusting `https://token.actions.githubusercontent.com`, with an
**attribute-condition restricting it to this exact repo** (`assertion.repository ==
'goodudetheboy/film-transcreation-agent'`) — not just the GitHub org, so no other
repo under the same account can impersonate the deploy service account even if
compromised. The provider/service-account identifiers aren't secret (the security
boundary is the attribute-condition, not obscurity), so they're stored as GitHub
repo *variables*, not secrets — `SHARED_PASSCODE` is now the only actual secret
this workflow needs.

