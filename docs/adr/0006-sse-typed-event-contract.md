# 0006. SSE typed-event contract, synthesized by the proxy

Status: Accepted (revised after 0002)

## Context

The frontend UI wants a progressive reveal — flagged lines and a running counter
appearing as they're "found," not a spinner followed by one dump. Originally this was
planned as genuine incremental streaming from the agent (Agent Engine's
`streamQuery`). Per 0002, the real backend (`detectIntent`) is a single blocking call
— Google gives us the full result at once, not incrementally.

## Decision

Two things, kept conceptually separate:

1. **Wire contract stays typed SSE events**, not one JSON blob:
   `{type: "progress", stage, line}`, `{type: "line_flagged", ...}`,
   `{type: "line_cleared", ...}`, `{type: "done", summary}`, `{type: "error", ...}`.
   This contract is what the frontend's `apiClient` parses, and it's designed to stay
   stable even if the backend's actual delivery mechanism changes later.

2. **The proxy synthesizes the reveal.** After `dialogflowClient` returns the full
   flagged-lines array from one blocking `detectIntent` call, the route handler drips
   it out as a sequence of SSE frames (small delay between each) rather than writing
   one giant frame. This is an honest simplification: one real Google call, synthetic
   pacing for the UX. It is **not** the agent itself streaming multi-stage progress.

3. **Delivered via `fetch` + `ReadableStream`, not `EventSource`** — see 0009.

## Consequences

- If the teammate's agent later adds genuine incremental delivery (streamingDetectIntent,
  or a move to Agent Engine), only the proxy's internal handling changes — the typed
  event contract and the frontend don't need to.
- Don't claim in the demo narrative that the agent is streaming multi-stage reasoning
  live — it isn't, yet. The counter/reveal is real data, synthetic pacing.
- Revisit this ADR if/when the backend gains real incremental output.
