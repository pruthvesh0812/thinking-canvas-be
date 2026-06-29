---
feature: "intervention-spectrum"
type: story
created: 2026-06-29
status: draft
git_branch: "claude/ai-intervention-spectrum-moumhu"
---

## What
Replace the binary AI-contribution model (full ghost pair **or** nothing) with a
graduated **Intervention Spectrum** — a second consent gate, on *presentation*,
sitting in front of the existing acceptance gate (the Ghost Threshold). The AI
picks the *lowest* intensity that fits the moment — from a silent hold, to an
ambient sidebar marker, to a glow on a node/edge, to a one-line invitation, up to
the existing full ghost pair — and the user escalates (pulls) or de-escalates
(dismisses). The user keeps priority; the AI never barges in unless invited or
the moment is provably ripe.

## Why
The Ghost Threshold gates **acceptance** ("nothing crosses into the real canvas
without consent") but nothing gates **presentation**. The current pipeline routes
to an agent and immediately materializes two ghost nodes + edges next to the
user's focus and streams tokens in. Even at 40% opacity, *materializing structure
is itself an interruption* — it grabs the eye and forces a context switch
regardless of whether the user ever accepts it.

The spectrum closes that gap and does so *in the product's own language*: it adds
an **intensity / presence axis** to the **Calibrated Nudge** pillar (today the
system calibrates cognitive *distance* — the 1–2 jump rule — but delivery is
fixed at maximum volume). It is not a foreign concept here — the **Observer
already lives at the low end of this spectrum** ("watches and queues, does not
interrupt"; highlights anchors and waits for a hover-pull). This feature
generalizes the Observer's restraint to *every* role.

Two payoffs from one idea:
1. **Respects boundaries** — non-intrusive when the user is in flow.
2. **Cheaper** — content is generated *lazily*. At sub-materialize intensities the
   expensive content agent never runs; we only run the cheap Attunement +
   Orchestrator to decide *there's something worth offering*. The content agent
   fires on pull.

## The Spectrum

| Level | User sees | Backend emits | Content generated? | Picked when |
|---|---|---|---|---|
| **0 · Hold** | nothing | nothing (offer row persisted only) | no | user in rapid flow; low-salience signal |
| **1 · Ambient** | sidebar count / agent presence dot | `offer` (no anchor) | no | something waiting, not tied to current focus |
| **2 · Anchored** | glow / halo on the node or edge | `offer` + `anchor_node_ids` | no | a specific node/edge has something; user busy |
| **3 · Invitation** | toast / "hand-raise" beside focused node | `offer` + `headline` | no | user receptive-ish; cheap yes/no door |
| **4 · Materialize** | full ghost pair streams in (today's behavior) | `spawn`→`chunk`→`done` | **yes** | explicit pull, or high salience + high receptivity |

Levels 0–3 are doors, not deliveries. Level 4 is the *unchanged* current
pipeline. The user can always escalate a lower level to 4 (pull) or close it
(dismiss).

## How intensity is decided

Keep "how loud" separate from "which agent." The Orchestrator (LLM) already
decides the *role*; a **pure, deterministic** function decides the *volume* —
matching the house pattern (Attunement = signal reader, Orchestrator = router,
guards = pure logic). `decideIntensity(signals)` computes two scores:

- **Receptivity** — how interruptible the user is right now. Inputs already exist:
  the velocity signal behind the adaptive debounce (high velocity = deep flow =
  back off), `attunement.cognitive_mode`, session `phase` (protect `converging`
  focus harder than `diverging`), and **recent offer-response history** (ignored
  the last N offers → lower the baseline).
- **Salience** — value/urgency of the contribution. Explicit pulls (question
  edge, edge between existing nodes — the two signals that *already* bypass
  debounce) are top salience. A drift warning is high-value but not urgent →
  1–2. An Appreciation → let it land at 2–3, never barge.

`intensity = map(salience, receptivity)`. The one hard rule: **explicit pull =
Level 4, immediately.** Never down-rank a question edge to a glow — the user
asking is sacred.

> v1 keeps this deterministic and testable. An LLM-driven intensity read can be
> layered on later (see Open Questions).

## Blast Radius
| Component | Impact |
|---|---|
| `types/index.ts` | New `InterventionIntensity`, `InterventionOffer`; extend `RedisMessage` union |
| `src/lib/intervention.ts` | NEW — pure `decideIntensity()` + receptivity/salience scoring |
| `src/pipeline/agent-pipeline.ts` | After routing, branch: low intensity → publish offer + stop (no content agent); Level 4 → existing spawn/stream |
| `src/pipeline/intervention-materialize.ts` | NEW — immediate pipeline fired by a pull; runs content agent + streams (today's Steps 4–8) |
| `src/streaming/offer.ts` | NEW — `buildOffer()` + `publishOffer()` / `publishWithdraw()` (mirror of `spawn.ts`) |
| `src/db/intervention-offers.ts` | NEW — persist/read offer rows + status transitions |
| `src/routes/intervention.ts` | NEW — `POST /api/intervention/pull`, `POST /api/intervention/dismiss` |
| `src/lib/guards.ts` | Extend `canAgentFire()` so an *offer* also counts as "in flight" for a trigger node; add a global offer rate cap |
| `src/index.ts` | Register new route + new Inngest function |
| `src/routes/stream.ts` | **No change** — payload-agnostic; forwards any `RedisMessage`, only special-cases `done`/`ping`. New `offer`/`withdraw` types flow through untouched |
| `supabase/migrations/` | NEW migration — `intervention_offers` table + RLS |
| `.ai/context/CANVAS-SYNC.md`, `CLAUDE.md` non-negotiables | Ratify the protocol amendment (see below) — via the `update-ai-context` skill |

## Files to Touch
```
CREATE:
  src/lib/intervention.ts
  src/pipeline/intervention-materialize.ts
  src/streaming/offer.ts
  src/db/intervention-offers.ts
  src/routes/intervention.ts
  supabase/migrations/<ts>_intervention_offers.sql

MODIFY:
  types/index.ts                       → InterventionIntensity, InterventionOffer, RedisMessage
  src/pipeline/agent-pipeline.ts       → intensity branch after Orchestrator
  src/lib/guards.ts                    → offers count as in-flight; offer rate cap
  src/index.ts                         → register route + materialize function

DOCS (via update-ai-context skill, after sign-off):
  .ai/context/CANVAS-SYNC.md           → Redis protocol now carries intervention msgs
  CLAUDE.md                            → amend non-negotiable #9 wording
```

## Redis / Streaming Protocol (the amendment)

This touches a **non-negotiable**: CLAUDE.md #8 ("backend never pushes unsolicited
state") and #9 ("Redis pub/sub = ghost node streaming **only**"). The new
sub-materialize signals (`offer`, `withdraw`) are server→client messages that
aren't ghost tokens.

Resolution: **generalize the channel's contract** rather than violate it. The
`offer`/`withdraw` messages are strictly *less* intrusive than a ghost (advisory,
ephemeral, dismissable, never touching user nodes/edges). `RedisMessage` becomes
"intervention messages," with `spawn/chunk/done` the maximal-intensity subset:

```typescript
type RedisMessage =
  | { type: 'offer';    offer: InterventionOffer }    // NEW — low-intensity, no content
  | { type: 'withdraw'; offer_id: string }             // NEW — AI rescinds (focus moved on)
  | { type: 'spawn';    descriptor: SpawnDescriptor }   // existing — the materialize step
  | { type: 'chunk';    target: string; data: string }  // existing
  | { type: 'done' }                                    // existing
```

This is a deliberate, documented amendment — **it must be ratified by the
engineer before code lands**, because amending a non-negotiable is the engineer's
call. Channel name (`canvas:stream:${sessionId}`) and the SSE route are unchanged.

## The feedback loop — and the trap to avoid

The offer-response is a new learning signal and the seed of the v1.5 **Cognitive
Profile** ("which suggestions you ignore"). **But ignoring an offer ≠ rejecting
content.** An ignored glow means "not now / I'm busy," NOT "that idea was bad." So
offer-response must **not** feed the Rejection Insights Engine — doing so would
wrongly teach the agent its *content* was wrong and poison later prompts.

- **Offer-response** (pulled / dismissed / ignored) → a separate **receptivity
  model** that down/up-ranks future intensity. No `rejection_insights` rows.
- **Content accept/reject** (on a materialized ghost) → feeds Rejection Insights
  exactly as today, unchanged.

Keeping these two channels clean is the subtle correctness point of the feature.

## Guard & lifecycle

- `canAgentFire()` still caps **one pending intervention per trigger node** —
  now an *offer* counts as in-flight too (not just a materialized ghost).
- Global **offer rate cap** so glows don't become wallpaper.
- **Withdraw on stale focus** — when the user's activity moves well past an
  offer's anchor, publish `withdraw` and mark the offer `expired`.
- Offer status: `offered → pulled | dismissed | expired`. `ignored` is inferred
  (mirrors the ghost `ignored` rule: superseded without interaction).

## Supabase Migration
Yes — `intervention_offers` (+ RLS, owner-scoped like every table):
```
id uuid pk · canvas_id · session_id · agent_role · trigger_node_id
anchor_node_ids uuid[] · intensity · salience numeric · headline text null
status (offered|pulled|dismissed|expired) · created_at · resolved_at null
```

## Inngest Events
| Event name | Fired from | Pipeline |
|---|---|---|
| `canvas/intervention.pulled` | `POST /api/intervention/pull` | `intervention-materialize` (immediate) |

(`agent-pipeline` gains an internal branch but no new trigger; dismiss is a plain
DB write + receptivity update, no Inngest event needed.)

## Risks
- **Subtlety vs. discoverability** — if signals are too quiet the AI's value
  disappears. The Ambient sidebar surface must always exist as a floor so there's
  one reliable place to notice held offers.
- **Offer/rejection cross-contamination** — see feedback-loop section; this is the
  easiest thing to get wrong.
- **Stale offers** — anchors the user has moved past are noise; withdraw promptly.
- **Double-fire** — `decideIntensity` must run *after* `canAgentFire`, so a held
  offer blocks a new one on the same node.

## Open Questions
Defaults are pre-selected (marked ✅) so implementation can start; override any.
1. **Decision mechanism** — ✅ deterministic `decideIntensity()` for v1 (vs.
   extending the Orchestrator's LLM output with `intensity`/`salience`).
2. **Level set for v1** — ✅ ship the two directed levels first (Anchored glow +
   Invitation toast) atop the existing Materialize; add Hold/Ambient next (vs. all
   four at once). Lowest-risk, highest-concrete-value.
3. **Tier gating** — leave intensity ungated in v1 (don't couple to `getAvailableAgents`)?
4. **User preference lever** — add a global "interruption tolerance" setting
   (Do-Not-Disturb ↔ Proactive) now, or after the model proves out? It's the
   cleanest explicit "respect my boundaries" control.

## Task Breakdown
- **task-01:** types + `intervention_offers` migration + RLS + `decideIntensity()`
- **task-02:** `src/streaming/offer.ts` + `agent-pipeline` intensity branch + guard update
- **task-03:** `intervention-materialize` pipeline + `intervention` route + `src/index.ts` wiring
- **task-04:** receptivity feedback model (offer-response → intensity baseline) + withdraw-on-stale
- **task-05:** doc ratification via `update-ai-context` (CANVAS-SYNC.md + non-negotiable #9)
