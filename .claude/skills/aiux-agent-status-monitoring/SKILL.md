---
name: aiux-agent-status-monitoring
description: "Use when users need to follow long-running AI work without watching it: progress for background agents, 'what is the agent doing now', status badges, task dashboards, notifications when input is needed. Agent Status and Monitoring keeps users informed at the right level of attention."
---

# Agent Status & Monitoring

Why it matters: Traditional loading indicators don't work for agentic tasks that take minutes or hours, involve parallel activities, or need occasional user input. Users need to stay informed without being forced to constantly monitor agent activity.

## The moves

1. **Match the tier to the stakes, not to the event.** Most agent activity is 'glance if you care,' a little is 'you must look now.' Ambient badges for the first, an interrupting notification for the second, and never the reverse. The whole design is a sorting rule for how much of the user's attention each event has earned.
2. **Guard the interrupt budget like it's finite, because it is.** Every notification you fire spends a little of the user's willingness to look at the next one. Blow it on progress milestones and the one alert that matters arrives to a user who has already learned to swipe you away. An interrupt is for a decision, not for a status.
3. **Status is a window, not a door.** Let users check in on the work without disrupting it: a panel they pull open on demand, never a thing that pauses the agent or demands acknowledgment. If checking progress costs the user a click and the agent a stall, you have rebuilt the spinner with extra steps.
4. **Don't make them babysit it.** If the user has to keep the status panel open and watch it to feel safe, your ambient layer has failed. The promise of this pattern is that they can walk away and trust they'll be pulled back exactly when, and only when, they're needed.
5. **Auto-dismiss the noise, keep the record.** Completed tasks should clear themselves so the surface doesn't silt up with finished work. But 'dismissed from view' is not 'gone': everything the agent did belongs in the audit trail, where the user can reconstruct what happened after the badge is long gone.

Reference: https://aiuxdesign.guide/patterns/agent-status-monitoring

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
