# 0007. Frontend hosting: Vercel or Firebase Hosting, decoupled from the Next.js decision

Status: Accepted

## Context

Wanting "managed deployment" ergonomics (git-push deploys, preview URLs) doesn't
require Next.js — both Vercel and Firebase Hosting serve a plain Vite static build
with the same git-push workflow.

## Decision

Deploy the Vite build to Vercel or Firebase Hosting (either works; Firebase Hosting
sits naturally next to the rest of the GCP-based stack if that's preferred). The proxy
does **not** live on the same platform as the frontend — see 0004.

## Consequences

- Frontend hosting choice is now purely about developer preference/convenience, not
  an architectural constraint.
- `VITE_PROXY_URL` env var configures which proxy the deployed frontend talks to —
  keeps hosting environments independently swappable.
