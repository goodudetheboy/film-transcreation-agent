# 0009. SSE consumption via `fetch` + `ReadableStream`, not `EventSource`

Status: Accepted

## Context

The browser's native `EventSource` API only supports GET requests. The frontend needs
to POST `script`, `targetCountry`, and `passcode` to kick off analysis — a GET-only
transport doesn't fit.

## Decision

`frontend/src/api/apiClient.ts` uses `fetch()` with a POST body, reading the response
via its `ReadableStream` body reader and parsing SSE-formatted frames manually.

## Consequences

- Enables POSTing the request payload, which `EventSource` can't do.
- **Also makes the parser testable under plain Node/Vitest** — native `fetch` exists
  in Node 20+, so `apiClient.test.ts` can feed it a canned `ReadableStream` with no
  browser/jsdom required, and the integration layer can call the real parser against
  a real running backend from a Node test process.
- We own the SSE frame-parsing logic (reassembling frames split across chunk reads,
  etc.) instead of getting it for free from the browser — covered by dedicated parser
  tests.
