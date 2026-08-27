---
name: aiux-graceful-handoff
description: "Use when control passes between AI and human: taking over from automation, 'let me finish this manually', resuming automation after manual edits, no lost progress at the switch. Graceful Handoff makes transitions seamless in both directions."
---

# Graceful Handoff

Why it matters: Users feel trapped by automation or lose progress when switching between AI and manual control, causing frustration and interruptions.

## The moves

1. **Warn before the handoff, not at the moment of it.** A handoff that fires the instant the AI gives up is an ambush. The human inherits the wheel with no time to orient and gets blamed for whatever happens next. Lead time is the difference between a takeover and a crash.
2. **Hand off the state, not just the controls.** Passing control without passing context, what the AI was doing, why, and where it stopped, leaves the human reconstructing the situation from scratch at the worst possible time. The state transfer is the handoff. The button is just the trigger.
3. **Always make who-is-in-control unambiguous.** If the user has to guess whether the AI or they are responsible right now, both sides assume the other has it, and no one does. A persistent, explicit mode indicator is the cheapest way to prevent the most expensive failure.
4. **Make it reversible, and resume from state.** A good handoff goes both ways: the human can take over and hand back, with the AI resuming from where things actually are, not restarting from zero. A one-way handoff that loses progress on the round trip just teaches users never to take over.
5. **Choose the moment, don't let the failure choose it.** The best handoffs happen at safe checkpoints, between steps, at natural pauses, not at the instant of breakdown. If the only time you can hand off is the moment the AI fails, that is a design bug to fix, not a transition to polish.

Reference: https://aiuxdesign.guide/patterns/graceful-handoff

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
