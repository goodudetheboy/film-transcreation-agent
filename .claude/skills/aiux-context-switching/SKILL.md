---
name: aiux-context-switching
description: "Use when users move between tasks, topics, or projects with an AI: 'it forgets when I change topics', resuming earlier threads, multiple parallel conversations, preserving context across switches. Context Switching maintains continuity."
---

# Context Switching

Why it matters: Users frequently switch between different tasks, topics, or projects when working with AI systems, but lose context and have to repeat information each time they switch. This creates friction and reduces productivity.

## The moves

1. **Isolation is the feature, not memory.** Anyone can store history. The hard part is keeping Context A's facts out of Context B's answers. If threads bleed into each other, you haven't built context switching, you've built one big confused context with tabs on top of it.
2. **Make the active context impossible to miss.** The user must always know which thread they're in and what it remembers before they read an answer. Invisible context is how a perfectly correct answer to the wrong question slips through and quietly erodes trust.
3. **Show what carried over, and let them cut it.** When you bring context forward, name it ('Continuing from your Q3 planning') and give a one-click way to drop it. Continuity the user can't see or sever is just leakage they haven't caught yet.
4. **Stale context is worse than no context.** A fact that was true last week, resurfaced as current, is a confident lie. Timestamp what you remember and let it decay, or you'll keep answering today's question with yesterday's truth.
5. **Default to a clean break when the switch is real.** Not every topic change needs a saved, named, synced thread. When tasks are genuinely independent, a fresh start beats the overhead of managing contexts nobody comes back to.

Reference: https://aiuxdesign.guide/patterns/context-switching

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
