---
name: aiux-workspace-native-agents
description: "Use when AI should live inside an existing tool rather than beside it: 'stop making users switch to a chat app', embedded copilots in editors or CRMs, in-context actions, meeting users where they work. Workspace-Native Agent Integration removes context-switching overhead."
---

# Workspace-Native Agent Integration

Why it matters: AI agents are being added to existing professional tools but feel like separate tools, creating context-switching overhead.

## The moves

1. **Anchor the agent to the artifact, not the app.** The agent should act on the document, ticket, or message in focus. If it can't see what the user sees, it's just another chatbot with extra steps.
2. **Make invocation zero-cost or automatic.** Every required click to summon the agent is a reason not to use it. Trigger on selection, on pause, or on explicit shortcut, never on navigation.
3. **Output must land where the work lands.** Suggestions shown in a side panel get ignored. Output inserted inline, into the actual artifact, gets used. Place the result where the cursor already is.
4. **Let users ignore the agent without penalty.** Inline AI that demands resolution before the user can continue is a blocker, not a collaborator. Dismiss must always be one key or zero clicks.

Reference: https://aiuxdesign.guide/patterns/workspace-native-agents

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
