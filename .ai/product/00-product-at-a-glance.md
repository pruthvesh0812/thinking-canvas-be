---
last-verified: 2026-09-19
stale-after-days: 30
audience: everyone — ALWAYS LOAD THIS FILE
---

# ThinkingCanvas at a Glance

## One line

**ThinkingCanvas is a thinking environment where AI augments your thinking and never replaces it.** You think out loud as a map of connected ideas. AI contributions arrive as translucent "ghost" suggestions, and nothing becomes part of your map until you choose to accept it.

## The 30-second pitch

Chatbots give you answers. The easier it gets to accept an answer, the less thinking you do. ThinkingCanvas takes the opposite approach. You lay out your thinking on a canvas as nodes (thoughts) and edges (how they relate). The AI watches the *trail* of how your ideas developed and offers small nudges at the right moment. It might reframe what you just said, name a pattern you haven't noticed, or articulate a link you drew but couldn't explain. Every nudge ends in a question that you have to think about. You stay the author of every conclusion.

**The promise:** *you and the AI reach a point together that neither could have reached alone, and you own the arrival.*

## Key facts

| | |
|---|---|
| **Category** | Thinking environment. It is not a note-taking app, a mind-mapping tool, or a chatbot. |
| **Core unit** | A **canvas** (permanent, one per problem) holding **sessions** (individual thinking runs) |
| **North star** | Every canvas starts with one question: *"What are you trying to figure out?"* The answer (`original_intent`) can **never be edited**. |
| **AI form** | **Ghost nodes**: translucent, dashed, floating. **Accept** makes one yours. **Reject** removes it and teaches the AI. **Ignore** is always fine. |
| **AI roles** | 5 roles: **Expander** (opens new directions), **Stress-Tester** (finds weak spots), **Observer** (bird's-eye view and drift), **Outer Subconscious** (cross-domain leaps), **Articulator** (names a link you drew) |
| **Core gestures** | Write a node · draw a **Logical** edge · draw a **Question** edge (a link you sense but can't name) · draw a **Relate** edge (ask the AI to articulate a connection) · click **Session Complete** |
| **Who it's for** | People whose deliverable is a decision, strategy, or structure rather than a document: founders, PMs, researchers, consultants and strategists |
| **Planned pricing** | Free (Expander + Articulator) · Pro $19/mo (all 5 roles + learning + Session Complete insights) · Power $39/mo (v1.5, adds a cognitive profile) |
| **Stack** | Next.js + React Flow (Vercel) · Hono + Mastra + Inngest (Railway) · Supabase Postgres + pgvector · Upstash Redis · Google Gemini (single provider) · Langfuse |
| **Stage** | **Pre-launch.** Both apps are functional end-to-end in local and dev environments. There is no billing, no production deployment evidence, and no users yet. |

## What is actually live right now (2026-09-19)

⚠️ **The vision is ahead of the code.** Read [`03-status/feature-status.md`](./03-status/feature-status.md) before making any claim.

- ✅ **Live:**
  - canvas creation with a north star
  - nodes and edges (Logical / Question / Relate pens)
  - ghost streaming
  - accept, reject with a reason, set aside, restore, delete AI nodes
  - **Articulator** (Relate edge) and **Outer Subconscious** (Question edge)
  - Session Complete with the **Observer**'s async insights
  - carry-forward of unresolved threads
  - browsing past sessions
  - anonymous-first sign-up (Google and email)
  - Rejection Insights learning
- 🟠 **Built but not reachable:** the **Expander** and **Stress-Tester**, and the whole intervention layer (judge, consent timer, glow/offer surfaces, receptivity). The backend route that starts them is not mounted, and the frontend doesn't send the trigger. **So writing a node on its own produces no AI response today.**
- 🔴 **Not built:**
  - billing and checkout (every user is effectively free, with every live AI role)
  - the Observer's interactive structure UI
  - branching
  - cognitive profile
  - multiplayer

## Red lines (never violate, never promise otherwise)

1. **AI never replaces thinking.** No "generate my strategy" or "auto-complete my canvas" feature. Never market that way either.
2. **Nothing enters the canvas without a human click.** No auto-accept, ever.
3. **The north star is immutable.** If the goal changes, that's a new canvas.
4. **Every AI contribution must require a cognitive response.** If you can accept it without thinking, it has failed.
5. **Ignoring the AI is always valid.** Ghosts don't nag, expire, or escalate.

## The single test for any decision

> *Does this make the human think more, or less?*
> If less, it's wrong for ThinkingCanvas, however impressive, convenient, or monetisable it is.
