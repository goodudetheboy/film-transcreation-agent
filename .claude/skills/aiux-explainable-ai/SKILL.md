---
name: aiux-explainable-ai
description: "Use when users ask why the AI decided something: 'show its reasoning', explanations for recommendations or scores, black-box complaints, debugging model decisions, transparency requirements. Explainable AI makes decisions understandable."
---

# Explainable AI (XAI)

Why it matters: AI systems often act as 'black boxes,' hindering understanding of decisions. This reduces trust, complicates debugging, and allows biased or incorrect decisions to go unnoticed.

## The moves

1. **First, decide what the user can do with the explanation.** If the answer is 'nothing,' you don't need an explanation, you need a better decision. Every explanation should map to an action the user can take: change an input, correct data, escalate, appeal. No action, no explanation.
2. **Show the real drivers, ranked. Not a flat list.** Three drivers in order of weight beats nine unordered. If you can't rank them, you don't understand the model well enough to explain it yet, and the right move is to say so, not to fake the ranking.
3. **Make confidence legible, not decorative.** '87%' means nothing to a human deciding whether to act. 'Confident: matches 1,200 similar cases' is an explanation. A bare number is theater dressed as rigor.
4. **Give an exit.** Every explanation needs 'this is wrong → correct or appeal.' An explanation the user can't contest is a press release. The exit is what turns transparency from a marketing claim into a feedback loop.

Reference: https://aiuxdesign.guide/patterns/explainable-ai

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
