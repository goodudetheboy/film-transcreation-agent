---
name: aiux-conversational-ui
description: "Use when designing chat or voice interaction: chatbots, assistants, message threads, composer design, 'talk to the app in plain language', turn-taking and context in conversation. Conversational UI makes dialogue feel natural instead of robotic."
---

# Conversational UI

Why it matters: Traditional graphical interfaces require users to learn specific navigation patterns, menu hierarchies, and form layouts. As AI products grow more capable, the gap between what the system can do and what users can discover widens. Users prefer asking for what they need in plain language, but poorly designed conversational interfaces frustrate them with robotic responses, lost context, and dead-end conversations.

## The moves

1. **Never ship a blank chat box.** The empty state is the whole game. Suggested prompts turn 'what can this even do?' into a single click, and they teach users the system's range without a manual. A blank input is not minimalism, it's an unfinished feature.
2. **Show the work: typing, thinking, streaming.** Silence reads as broken. Streamed tokens and honest status cues (searching, generating) make latency tolerable and the system feel alive. A frozen spinner is the fastest way to make a capable model feel dead.
3. **Mix chat with buttons and cards. Don't force everything into text.** When the next step is a finite choice, render a button, not a sentence the user has to compose and the model has to parse. The best conversational UIs let people click or type at every turn, whichever is faster.
4. **Design the misunderstanding, not just the happy path.** A specific clarifying question beats a generic error every time. 'Did you mean X or Y?' keeps the user moving; 'I didn't understand that' sends them away. The recovery turn is where trust is won or lost.
5. **Always give an exit.** When the AI hits its limit, hand off to a human or a structured flow with the context preserved. A conversation the user can't escape, and has to restart by repeating themselves, is worse than the form you replaced.

Reference: https://aiuxdesign.guide/patterns/conversational-ui

When this applies, make the smallest change that genuinely realises the pattern. Do not add UI the product does not need, and say what you changed and why.
