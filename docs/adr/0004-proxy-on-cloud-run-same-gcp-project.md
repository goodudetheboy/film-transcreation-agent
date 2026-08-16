# 0004. Thin proxy deploys to Cloud Run, in the same GCP project as the agent

Status: Accepted

## Context

The frontend can never call Dialogflow CX directly (0003). Something server-side must
hold credentials and relay the call. Vercel (hosting the frontend) could technically
run this as a serverless function, but Vercel has no notion of an "attached GCP
service account" — it would require generating a static service-account JSON key and
pasting it into Vercel's environment variables: a long-lived secret sitting in a
third-party platform instead of zero credential material anywhere.

## Decision

The proxy is a small Express service deployed to **Cloud Run**, in the same GCP
project (`silent-scholar-505618-u6`) as the Dialogflow CX agent — so it gets ADC via
an attached service account for free, with no key file to generate or leak.

## Consequences

- Frontend hosting (Vercel/Firebase, see 0007) is a fully separate concern from proxy
  hosting — the two don't have to live on the same platform, and shouldn't.
- Local dev requires the developer's own ADC (0003), not a copy of the Cloud Run
  service account's credentials.
- Deploying the proxy is out of scope for the initial scaffold — this ADR records the
  target, not a working Cloud Run deploy yet.
