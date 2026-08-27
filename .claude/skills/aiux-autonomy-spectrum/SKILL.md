---
name: aiux-autonomy-spectrum
description: "Use when deciding how independently the AI may act: autonomy levels, 'ask before doing vs just do it', per-task permissions, supervised vs autonomous modes. Autonomy Spectrum gives users a dial instead of an on/off switch."
---

# Autonomy Spectrum

Why it matters: Traditional AI controls are binary - the AI is either on or off. But agents operate across a wide range of independence, and users need granular control over how much freedom the agent has per task type. Without this, a single bad experience at high autonomy causes users to abandon the agent entirely.

## The moves

1. **Trust isn't global, so autonomy can't be either.** Make the level per task or domain. A user who lets the agent auto-file receipts may never let it email a client. One dial for everything forces them to set it to the most dangerous task, which leaves the safe tasks manual and the whole feature feeling useless.
2. **The level has to change what the agent does, not what it's called.** If moving from 'Propose & Confirm' to 'Act & Notify' doesn't change a single agent action, you built a labeled radio group, not autonomy. Each rung must map to a visibly different behavior: asks first, acts then tells, or acts silently.
3. **Autonomy must move down as easily as up.** Trust is earned slowly and lost fast. If a good streak promotes the agent but a bad call doesn't demote it, you've built a ratchet, and ratchets are how autonomy creep happens. Let the user, and a failure, drop the level in one move.
4. **Default low, earn the rest.** Start new users and new domains at the cautious end and let demonstrated reliability unlock the higher levels. Defaulting everyone to high autonomy because it demos well is the fastest way to burn trust the first time the agent is wrong.
5. **Show the current level where the action happens.** The user should never have to guess whether the agent will ask first. Surface the active level at the point of action, not buried three screens deep in settings, so consent stays informed and current instead of set once and forgotten.

Reference: https://aiuxdesign.guide/patterns/autonomy-spectrum

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
