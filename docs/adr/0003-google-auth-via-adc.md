# 0003. Google Cloud auth via Application Default Credentials, never in the browser

Status: Accepted

## Context

Dialogflow CX (and Vertex AI generally) authenticates via Google Cloud IAM — a
service account or user OAuth identity, not a publishable API key. There is no
browser-safe credential model for these APIs. `test_agent.py` confirms this
implicitly: it calls `SessionsClient()` with no explicit credentials, relying on
ADC resolution.

## Decision

Google credentials are only ever resolved server-side, via ADC:
- **Local dev**: `gcloud auth application-default login` — a developer's own Google
  account, cached locally, never checked into the repo.
- **Deployed (Cloud Run)**: an attached service account — ADC resolves automatically,
  no key material anywhere.

The browser never holds, sees, or transmits Google credentials. It only ever talks to
our own proxy (see 0004).

## Consequences

- Whoever runs the proxy locally needs their own Google account IAM-provisioned on
  the `silent-scholar-505618-u6` project (or a service-account key file path set via
  `GOOGLE_APPLICATION_CREDENTIALS`, kept out of git).
- No API key rotation/management burden — ADC handles token refresh.
- Rules out any deployment target that can't provide ADC natively (see 0004 for why
  that excludes Vercel for the proxy specifically).
