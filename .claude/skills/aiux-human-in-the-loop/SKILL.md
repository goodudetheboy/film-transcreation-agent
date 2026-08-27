---
name: aiux-human-in-the-loop
description: "Use when AI output needs human review, approval, or sign-off before it takes effect or reaches someone: approval queues, 'a person checks before send', moderation of AI answers, override and reject controls. Human-in-the-Loop keeps automation accountable to human judgment."
---

# Human-in-the-Loop

Why it matters: Fully automated AI systems risk critical errors and lack transparency. Users need review and override capabilities for safety and trust.

## The moves

1. **First, decide if the human can actually say no.** Human-in-the-loop is only a loop if the human can break it. If reject is buried, the context is missing, or overruling the AI gets the reviewer second-guessed, you have a spectator, not an approver. Design the no before you design the yes.
2. **Route by stakes, not by reflex.** Reviewing everything trains people to review nothing. Auto-resolve the cases the AI is reliably right on and reserve a human for the consequential and uncertain ones. The fewer items in the queue, the more likely each one actually gets read.
3. **Approving has to cost something to mean something.** If approve is one click and there is no consequence for waving through a bad call, you have built a rubber stamp. Show the reviewer what they are signing, make reject as easy as approve, and record who approved on what evidence. A click is not a review.
4. **Give the reviewer enough to overrule, not just to agree.** Confidence, reason, and the raw content the user saw are the minimum. A reviewer who only sees the AI's verdict will defer to it every time. Show the work behind the call so a human can disagree with it.
5. **A rubber stamp is worse than honest automation.** Full automation at least admits no one looked. A review queue people click through manufactures a 'human-approved' record on top of an unreviewed decision and parks a person in the blame seat. If you can't make the review real, don't fake it: automate openly and own the risk.

Reference: https://aiuxdesign.guide/patterns/human-in-the-loop

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
