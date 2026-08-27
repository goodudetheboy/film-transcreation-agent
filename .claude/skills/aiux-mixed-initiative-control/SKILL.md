---
name: aiux-mixed-initiative-control
description: "Use when human and AI work on the same thing at the same time: co-editing with an agent, interrupting or redirecting mid-task, 'I want to jump in without stopping it', fluid turn-taking. Mixed-Initiative Control lets control flow both ways."
---

# Mixed-Initiative Control

Why it matters: Traditional AI is turn-based - either human or AI is in control. Agentic workflows require fluid back-and-forth where both can work simultaneously on the same artifact, with the human able to interrupt and redirect at any point.

## The moves

1. **One owner per region, and show it.** Every editable section, field, or block has exactly one owner at a time: you, the agent, or nobody. Render it as a color or a label so anyone can answer 'who has this right now' at a glance. A region two parties can both edit is not shared, it is contested, and contested regions are where work gets lost.
2. **Human input always wins, instantly.** The moment you touch a region the agent is writing, the agent releases it and stops in the same tick. It does not queue its change to land after you pause. It discards it. The rule users have to be able to trust is simple: you never lose a keystroke to the agent.
3. **Make the handback explicit, both ways.** 'I fixed this, carry on from here' is a real action the human takes, not something the agent guesses at. And when the agent finishes a region it hands control to nobody, not silently back to itself. Implicit handoffs are how the agent ends up holding a wheel the human thought they had reclaimed.
4. **Surface conflicts, never auto-merge.** When you and the agent both changed the same thing, show it and let the human decide. A silent merge feels clever until it quietly overwrites the sentence someone watched themselves type. The cost of a visible conflict prompt is seconds. The cost of a silent one is trust.
5. **Keep a visible activity log.** Mixed initiative without attribution is just confusion with extra cursors. A running 'AI updated the headline / you took over the CTA' log lets the human reconstruct who did what, which is the whole reason shared control is safe to use at all.

Reference: https://aiuxdesign.guide/patterns/mixed-initiative-control

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
