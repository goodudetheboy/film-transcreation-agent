# 0001. Frontend stack: Vite + React + TypeScript, not Next.js

Status: Accepted

## Context

The frontend is a single-screen tool: submit a script + target country, get back a
ranked list of flagged lines. No SEO surface, no multi-page routing, no need for
server components. Next.js's dev-server overhead (webpack/Turbopack compilation, RSC
boundaries) was the actual pain point driving this decision — not runtime performance.

## Decision

Vite + React + TypeScript. No Next.js.

## Consequences

- Near-instant HMR during the hackathon build window — the thing that was actually
  slow.
- No built-in API routes / SSR — this is fine because credential-holding logic lives
  in a separate proxy anyway (see 0004), not in the frontend's server.
- Static build output — can deploy to Vercel, Firebase Hosting, or any static host
  without needing Next-specific hosting features (see 0007).
