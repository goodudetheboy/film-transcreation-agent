# 0002. Backend integration surface: Dialogflow CX `detectIntent`, not Agent Engine `reasoningEngines`

Status: Accepted (supersedes an earlier assumption)

## Context

Early planning assumed the backend teammate would deploy via Vertex AI Agent
Builder / "Gemini Enterprise Agent Platform" to **Agent Engine**, callable via the
`reasoningEngines.query` / `reasoningEngines.streamQuery` REST surface (a single
stable endpoint regardless of internal agent complexity, with native SSE streaming
support).

That assumption was wrong. The teammate's actual reference implementation
(`test_agent.py`, committed to this repo) calls a **Dialogflow CX Playbook** via
`SessionsClient.detect_intent()` — a different Google product with a different
contract:

- Session-scoped: `projects/{project}/locations/{location}/agents/{agent}/sessions/{session_id}`,
  a fresh UUID session per call.
- Input isn't a chat message — it's a fixed trigger text ("analyze this scene") plus
  **structured session parameters** (`script`, `country`) passed via
  `query_params.parameters`.
- Output comes back as `response.query_result.response_messages[].text.text[0]` — a
  string that may be wrapped in markdown code fences and must be stripped and
  `JSON.parse`d.
- **`detectIntent` is a single blocking request/response call — not streaming.**
  (Dialogflow CX does have a `streamingDetectIntent` variant, but the reference
  implementation doesn't use it, and we're not assuming it's available.)
- Real values already known for this deployment:
  `PROJECT_ID=silent-scholar-505618-u6`, `LOCATION=us-central1`,
  `AGENT_ID=f475df77-4a24-4d7e-a6ff-a3f5d039f975`.

## Decision

The backend's `services/dialogflowClient.ts` wraps `@google-cloud/dialogflow-cx`'s
`SessionsClient`, mirroring `test_agent.py`'s call shape exactly (new session per
call, same parameter names, same fence-stripping logic). It returns the parsed array
of flagged lines from a single `detectIntent` call — no streaming from Google itself.

## Consequences

- The backend must synthesize the frontend-facing progressive reveal itself, since
  Google isn't streaming to us — see 0006.
- The exact JSON schema of a flagged line isn't confirmed from documentation, only
  inferred from the reference script's generic `json.loads`. Treat the backend's
  flagged-line type as provisional until we've run a real call and inspected actual
  output.
- If the teammate's agent design changes (e.g. moves to Agent Engine later, or adds
  `streamingDetectIntent`), only `dialogflowClient.ts` needs to change — the route
  handler and the frontend's typed-event contract (0006) don't, because the seam was
  designed for exactly this kind of swap.
