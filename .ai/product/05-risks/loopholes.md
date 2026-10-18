---
last-verified: 2026-09-19
verified-against: code in both repos (rate limiting: none found; vector index: commented out in 20260609000003_rls_and_indexes.sql) + product design docs
stale-after-days: 45
audience: product, engineering, strategy, anyone reviewing a proposal — also support (to anticipate complaints)
---

# Loopholes: Where the Product Is Weak or Exploitable

> A **loophole** is a gap between what the product *intends* and what it *allows*: a place where users, costs, or circumstances can slip past the design. Unlike `killers.md` (existential threats), each loophole is fixable. They're grouped by kind and ranked within each group. Every entry has a **mitigation direction**.

---

## A. Philosophy and UX loopholes: the product can betray its own principle

### A1. Rubber-stamp acceptance: the answer machine through the back door
- **The gap:** The Prime Directive ("if they can accept without thinking, it failed") is enforced only by **prompt wording**. The UI puts no friction on Accept and measures nothing. A user can accept every ghost in a second and build a canvas the AI effectively wrote.
- **Worse, accumulation:** each accepted node becomes context for the next suggestion. Accept enough, and the trail the AI "follows" is its own.
- **Mitigation direction:** measure time-to-accept and "built-on" rate (did a human node follow an accepted AI node?); reduce proactive offers for users with high acceptance and low build-on; consider a lightweight "make it yours" edit-on-accept affordance; weight AI-owned nodes lower in trail direction.

### A2. The AI is invisible unless you know the secret gestures
- **The gap:** With the Expander unreachable (known gap #1), AI appears **only** when a user draws a Question or Relate edge. There's no onboarding teaching the pens. A new user writes nodes, sees nothing, and concludes it's a plain whiteboard. The pulsing "AI is reading" indicator makes this worse by promising a response that never comes.
- **Mitigation direction:** fix gap #1; add first-session onboarding that invites one Question edge; hide the debounce indicator until the proactive path is live.

### A3. Silence looks like failure
- **The gap:** "Silence is normal" is a core design value (the judge holds, one ghost per node, guards drop runs), but users can't tell *deliberate* silence from *broken*. Nothing distinguishes "I looked and nothing's ripe" from "nothing happened".
- **Mitigation direction:** an honest, low-key presence signal (e.g. a faint "read, nothing to add" state after a judge hold) without turning silence into noise.

### A4. The Observer only speaks if you say "I'm done"
- **The gap:** Session Complete is human-triggered only, and sessions never auto-close. Users who close the tab and come back later never trigger the Observer, drift detection, the unresolved-threads review, or carry-forward. The anonymous→account prompt also depends on that click. Sessions may stay "active" for weeks, so the per-session trail stops meaning an episode.
- **Mitigation direction:** a gentle "wrap up?" nudge on return after a long gap; idle-based session suggestions (never automatic closing, which would break the principle); an Observer mid-session surface once the intervention layer ships.

### A5. The immutable north star versus a goal that legitimately evolves
- **The gap:** Immutability is deliberate, but "start a new canvas" **abandons the canvas's AI memory** (threads are per canvas) and the visual context. Users whose question sharpens legitimately (evolution, not drift) are punished for thinking well.
- **Mitigation direction:** a "fork into a new canvas from here" that carries selected nodes and a lineage link while leaving the original north star untouched (a natural fit with session branching).

### A6. The teaching loop is coarse and invisible
- **The gap:** Three rejection reasons only. **Too abstract becomes a permanent `hard_block` for the canvas.** A rejection with no reason defaults to `skip_for_now` (a silent mis-teach). Users can't see or undo what the AI has learned about them, so a single frustrated click permanently narrows the AI.
- **Mitigation direction:** a visible "what the AI is avoiding on this canvas" panel with undo; decay for hard blocks; an optional free-text reason.

### A7. Ownership ambiguity of accepted AI words
- **The gap:** "Accept = ownership transfer", but the node's *text* is still the AI's words, marked AI forever. Users may present AI-written reasoning as their own conclusion without re-articulating it. The product can't tell a user who *adopted* an idea from one who *understood* it.
- **Mitigation direction:** encourage re-articulation (accept → edit in your own words → the AI pill softens?). It's a product question about what "owning" means; resolve it deliberately.

### A8. The 1–2 jump rule is unmeasured
- **The gap:** Cognitive distance is controlled entirely by prompts on a cheap content model (flash-lite). There's no evaluation set, so suggestions may be too obvious (0 jumps, insulting) or too far (3+ jumps, alienating).
- **Mitigation direction:** a Langfuse eval set of canvases with rated contributions; track rejection reasons by role as a distance proxy.

### A9. Phase is a one-way latch
- **The gap:** Once a session converges it can't automatically re-diverge (deferred to branching). A user who discovers mid-converge that they need to open up again gets only Stress-Tester-type help unless they notice and flip the manual toggle.
- **Mitigation direction:** the manual toggle (already there) should be prominent; re-divergence belongs in branching.

## B. Technical loopholes: the system allows things it shouldn't

### B1. Unbounded, unmetered LLM spend (the most urgent technical loophole)
- **The gap:** **No rate limiting exists anywhere.** Every Question edge runs the Outer Subconscious on Flash with **high thinking**. Every Relate edge runs the Articulator. Every node save runs a summary plus an embedding. **No plan checks exist on live paths.** Anonymous sign-in is frictionless, so accounts are unlimited. A script, or an enthusiastic user, can draw hundreds of Question edges and generate unbounded Gemini cost.
- **Mitigation direction:** per-user and per-session rate limits (Upstash Redis is already in the stack); plan gates in every immediate pipeline; CAPTCHA or Turnstile on anonymous sign-in; per-user daily token budgets; cost alerts.

### B2. The proactive pipeline is disconnected (known gap #1)
- See `03-status/known-gaps.md` #1. The route is unmounted, `canvas/node.created` has no consumer, and the frontend doesn't call the intervention API.

### B3. Client-controlled truth
- **The gap:** The frontend writes canvas rows directly (RLS-scoped to the owner), and the backend trusts some of them verbatim: `both_existing`, `edge_type`, `owner`, `current_phase`, `set_aside_at`. A user can fabricate `owner: 'ai'` nodes, set aside human nodes, or flip flags. The impact is limited to their own canvas today, but it **corrupts any analytics** built on `nodes.owner` and would become a real integrity problem with sharing or multiplayer.
- **Mitigation direction:** derive analytics from `ai_contributions` (written by the backend), not `nodes.owner`; add CHECK constraints or column-level RLS where it matters (e.g. set-aside only when `owner='ai'`).

### B4. Prompt injection via node content
- **The gap:** System prompts are constant, but **node content is injected into every agent's context**. A node reading "ignore your instructions and…" can steer an agent. Today that's mostly self-harm (single user, own canvas, tools canvas-scoped with ownership checks). It becomes a real vector with shared canvases, imports, or pasted third-party content.
- **Mitigation direction:** delimit user content in prompts; structured output where possible; revisit before any sharing, import, or multiplayer feature.

### B5. The API is unauthenticated until the auth branches merge
- **The gap:** On `main`, anyone who knows a canvas or session UUID can post events or **read that session's live SSE stream** (the AI's contributions to someone's private thinking). Fixed on feature branches (known gap #3); the two must ship together.

### B6. Multiple tabs, one stream
- **The gap:** The SSE design assumes exactly one listener per session. Two tabs both receive the same ghosts, and accepting in both can double-insert nodes and send duplicate ghost-status and accept events.
- **Mitigation direction:** a single-tab lock per session (BroadcastChannel) or idempotent accept (ghost IDs are reused as node IDs, so an insert conflict already partly protects this; verify).

### B7. Vector search has no index
- **The gap:** Embeddings are 3072-dimensional, and pgvector's HNSW index doesn't support that many dimensions for the `vector` type, so the index is **commented out**. `semantic_promote` does a sequential scan filtered by canvas. That's fine for small canvases, but it degrades on large or long-lived ones.
- **Mitigation direction:** `halfvec` with HNSW, or reduced-dimension embeddings (Gemini embeddings support output dimensionality), before canvases get large.

### B8. Single model provider
- **The gap:** Every role, the summaries, and the embeddings depend on Google Gemini 2.5-series models and one API key. An outage takes the whole product down; a model deprecation or price change hits everything at once. Changing embedding models means re-embedding every node.
- **Mitigation direction:** the centralised `src/lib/llm.ts` already makes swapping cheap for generation. Plan a fallback provider for content roles and track Gemini deprecation timelines.

### B9. Silent failure on enrichment
- **The gap:** `node.created` enrichment is synchronous and slow (1–3s) and fire-and-forget from the frontend. If it fails, the node never enters the trail or embeddings, and the user never knows. The AI then reasons over a canvas missing nodes.
- **Mitigation direction:** a retry queue or backfill job for nodes with a NULL summary or embedding.

## C. Business loopholes: value leaks and the monetisation path

### C1. Everything is free, and taking it back will hurt
- There's no billing, and the live AI roles are mostly Pro-designated (Outer Subconscious, Observer, Rejection Insights). Early users will anchor on getting them free. Enforcing plans later means removing features: plan grandfathering, or launch with enforcement from day one.

### C2. Pro value appears late in a session
- The Pro roles fire **after** convergence (Stress-Tester) or **at the end** (Observer), while the paywall moment designed into the judge (tier-locked offers) is unreachable. A free user may never *see* the Pro moment that would convert them.
- **Mitigation direction:** show the Observer's first Session Complete to free users as a trial; make the tier-locked offer the upgrade surface once gap #1 is fixed.

### C3. No distribution loop
- Single-user, with no sharing, export, or public canvas links, so every user must be acquired directly. Nothing a user makes brings the next user in.
- **Mitigation direction:** a shareable *read-only trail replay* ("see how I thought this through") is on-philosophy and inherently viral; export of the user's own nodes as an outline.

### C4. The value is hard to demo and hard to prove
- The product works on a *real* problem the user cares about. With a toy problem the nudges feel trite, and restraint looks like weakness next to competitors that fill the screen. The outcome ("better thinking") has no metric a buyer can put in a spreadsheet.
- **Mitigation direction:** demo with the user's own live problem; collect "what did you figure out?" stories; define an internal quality metric (see `killers.md`).

### C5. Guest canvases can vanish
- Anonymous-first means real thinking can be lost to cleared storage before the sign-up prompt ever appears (it only shows at the first Session Complete). One lost canvas becomes a very angry user.
- **Mitigation direction:** a soft "save your canvas" prompt after N nodes or X minutes, not only at Session Complete.
