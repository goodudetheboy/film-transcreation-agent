# 0021. Test mode simulates realistic wait times, via one shared helper

Status: Accepted

## Context

Every mock in this app previously resolved instantly (`createMockCaptioningClient`,
the `upload-video` test-mode branch, etc.). That was fine when test mode only stood
in for a single blocking call, but the new prep screen and Discovery agent panels are
built around real state-driven progress — an instantly-resolving mock makes that UI
impossible to actually see or demo without hitting a paid Google API.

## Decision

One shared primitive, `backend/src/services/testDelay.ts`:

```ts
export function simulateDelay(range: { minMs: number; maxMs: number }, scale = 1): Promise<void>
```

Every mock that used to resolve instantly now calls this with its own base range,
multiplied by `config.mockDelayScale` (`MOCK_DELAY_SCALE` env var, default `1`) — the
one knob to speed up local iteration (e.g. `0.1`) without touching every mock's own
numbers:

- video/subtitle upload mocks: 800–1500ms
- a mock Discovery pass: 6000–9000ms (long enough that a pass's "running" state, and
  the prep screen's "discovery" stage, are genuinely visible/demoable, not flashed)
- the prep pipeline's synthetic "finalizing" step: 500–1000ms

The pre-existing `upload-video` mock branch (unchanged since 0015/earlier) was
retrofitted to call this too, for consistency — leaving it instant while every new
mock waited would have been a visible seam in a demo.

## Consequences

- Test mode is now meaningfully slower to click through than before — acceptable and
  intentional; `MOCK_DELAY_SCALE=0.1` (or lower) in local `.env` is the escape hatch
  for fast iteration.
- `simulateDelay` has no jitter/backoff semantics beyond a uniform random range — it
  is purely for UI demoability, not a stand-in for real network/API latency
  distributions.
