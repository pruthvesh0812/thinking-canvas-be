---
last-verified: 2026-09-19
verified-against: general market knowledge (as of mid-2026), not live research — re-verify competitor specifics before external use
stale-after-days: 60
audience: marketing (battlecards), sales, product strategy, investors
---

# Competitive Landscape

> ⚠️ Competitor details here are general and from memory, not live research. **Verify current features and pricing before using any specific competitor claim externally.** For fresh research, use the `marketing:competitive-brief` skill.

## The frame: who we actually compete with

ThinkingCanvas's real competitor is **the user's current habit when they're stuck on a hard problem.** That's usually one of five things:

| Alternative | What the user does | Why it's attractive | Where it fails the thinking job |
|---|---|---|---|
| **General chatbots** (ChatGPT, Claude, Gemini) | Talk the problem through in chat | Always available, very capable, already paid for | Linear and turn-based. Structure is lost. Hands over conclusions, so it's easy to outsource the thinking. The trail disappears into scrollback. |
| **Docs with AI** (Notion AI, Google Docs + Gemini, Word + Copilot) | Write a doc and ask AI to expand or summarise | Familiar; ends in a shareable artefact | Linear. Optimised for the *output* document, not the act of thinking. The AI writes *for* you. |
| **Whiteboards with AI** (Miro, FigJam, Whimsical, and similar) | Sticky notes, clustering, AI-generated ideas and summaries | Spatial and collaborative; team workshops | Built for teams and workshops, not individual deep thinking. The AI generates *volumes* of stickies (a firehose). No trail, north star, or consent model. |
| **Mind-mapping tools** (XMind, MindMeister, MindNode, and similar, often with AI generation) | Radial maps, sometimes AI-generated from a prompt | Structured and visual | They capture the *destination*, not the trail. AI generation produces the map for you, the opposite of our principle. |
| **Networked-thought / canvas PKM** (Obsidian Canvas, Heptabase, Scapple, Tana, Logseq) | Cards on a canvas, linked notes | Powerful for knowledge work; spatial | Knowledge storage and organisation, not working a single problem. AI, where present, is bolted on as chat or summarisation. |
| **Pen and paper / a walk / a smart friend** | Think alone or with a person | Genuinely good, and the Socratic ideal | Doesn't scale or persist, and there's no cross-domain leap on demand. *This is the experience we're recreating.* |
| **AI "thinking partner" / Socratic tutors** (e.g. tutor modes in major chatbots, Khanmigo-style products) | Guided questioning | Closest philosophically | Mostly education-focused, and still chat-shaped: no spatial trail, no persistent canvas, no consent gate on contributions. |

## Our structural differentiators

| Differentiator | Why it's hard to copy | Status |
|---|---|---|
| **The consent model**: ghosts, per-node accept/reject, nothing auto-enters | Copying the UI is easy. Committing to a product that *withholds* output goes against every incumbent's engagement and output metrics. | ✅ |
| **Sequence as data**: the trail with direction markers | Needs the data model built around ordering and direction from day one | ✅ |
| **Gesture-native AI**: Question and Relate edges as explicit invitations | The interaction language is the product. Incumbents' AI is summoned by a prompt box. | ✅ |
| **Immutable north star + drift detection** | A philosophical stance (goals shouldn't silently morph) that incumbents won't impose | ✅ north star · 🟡 drift via Observer cards |
| **Five specialised roles with a judge** (single best move, or silence) | Multi-agent orchestration with maturity judgement is real engineering; most tools have one "AI" button | 🟠 judge unreachable |
| **Two consent gates + receptivity** (the AI asks before it speaks, and learns *when* you want it) | A new pattern; needs durable parked pipelines | 🟠 |
| **Learning from refusals** (negative constraints per canvas) | Straightforward to copy technically; rarely done because incumbents learn from engagement, not refusal | ✅ |

## Where we lose (be honest internally)

| Situation | Who wins | Implication |
|---|---|---|
| The user needs a finished artefact (a doc, deck, or email) | Docs + AI, chatbots | We don't produce artefacts. Export of *the user's own* structure is an obvious future need. |
| A team workshop or real-time collaboration | Miro / FigJam | Single-user by design today |
| Quick factual questions | Chatbots | Not our job. Don't try. |
| The user wants to be fast rather than deep | Chatbots | The product is deliberately slower. Target people who value depth. |
| The user already lives in Obsidian or Notion | The PKM incumbent | Integration and import may matter more than features |
| Mobile / on the go | Everyone else | The canvas is desktop-first |

## The strategic threat to watch

The biggest competitive threat is a **frontier AI lab or a whiteboard incumbent shipping a "Socratic canvas" mode**: a spatial canvas where the AI asks questions instead of answering. They have distribution. Our defence is **depth of commitment to the philosophy** (the consent model, trail data, and multiple roles are the whole product, not a mode) plus the **learning loop per user and canvas**, which gets more valuable with every session. See `05-risks/killers.md` → K4.

## Battlecard one-liners

- **vs ChatGPT/Claude:** "Chat gives you an answer. ThinkingCanvas gives you *your* answer, and the map of how you got there."
- **vs Miro/FigJam AI:** "Their AI fills the board with stickies. Ours makes one well-timed move and hands the pen back."
- **vs mind-map AI:** "They generate the map for you. We help you build it, and that's where the understanding comes from."
- **vs Notion AI:** "Notion AI writes the doc. ThinkingCanvas is where you figure out what the doc should say."
- **vs Obsidian/Heptabase:** "They store what you know. ThinkingCanvas works on what you don't know yet."
