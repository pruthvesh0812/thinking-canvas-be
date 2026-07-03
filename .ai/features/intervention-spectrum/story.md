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

**Glow-first *arrival* (decided).** Every ghost — anchored to a node — arrives as a
glow (halo on the node + the ghost edge's endpoints); it never barges in
fully-formed. The **reveal** is then gated by `f(attention state, show-rule)` — see
"Attention states × show rules" (waiting reveals on a glance; thinking needs a
deliberate hover). Whether reveal is instant (content pre-generated) or generates
on the spot (lazy) is invisible backend state. So the Show rungs differ by
*surface* and *headline*, not by whether content shows:

| Level | User sees | Backend emits | Content generated? | Picked when |
|---|---|---|---|---|
| **0 · Hold** | nothing | nothing (offer row persisted only) | no | user in rapid flow; low-salience signal |
| **1 · Ambient** | sidebar count / dot · "processing" waveform | `offer` (no anchor) | no | something waiting or working, not tied to current focus |
| **2 · Anchored glow** *(default)* | glow / halo on the node + ghost-edge ends | `offer` + `anchor_node_ids` | **lazy — on hover** | anything tied to a node |
| **3 · Invitation** | glow **+ one-line headline** beside the node | `offer` + `headline` | no | worth naming the topic without forcing a hover |
| **4 · Pre-generated** | glow with content ready *behind* it (zero hover latency) | `spawn`→`chunk`→`done` then held behind glow | **eager** | high confidence + user waiting |

**Lazy-on-hover is the default** (glow from the cheap gate decision → content
generates on the hover the glow invites). Pre-generation (Level 4) is the special
case for high-confidence + waiting. The user always escalates by hovering/pulling
or de-escalates by dismissing.

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

## Two axes: Trigger (generate) vs Show (reveal)

The intensity ladder above is only the **Show** axis. There is a second,
orthogonal axis — **Trigger** (whether to *generate* at all) — and separating
them is what makes the per-action behaviour coherent. A response can be
generated-and-held (glow only), then revealed later by a pure Show event that
generates nothing new.

Canvas actions fall into four intent classes, and the class — not the specific
action — decides Trigger/Show:

| Action class | Actions | Trigger | Show | Rationale |
|---|---|---|---|---|
| **Flow / creation** (heads-down) | typing, node create, edge create, toolbox click | no | no | mid-thought; context not ripe — don't touch |
| **Curation / attention** (eyes on canvas) | move node, delete node/edge, focus/hover human node | no | yes | user is looking at structure — safe to surface held content |
| **Deliberate / help-seeking** | sticky-note create/move/delete, toolbox dwell, hover AI edge label | yes | yes | an intentional "help me" signal |
| **Ghost interaction** (context-changing) | accept/reject ghost, accept/reject observer edge, hover old ghost | via impact check | yes (+warn if stale) | the action mutates context → must re-check staleness |

Consequence: **generation is no longer driven by `canvas/node.created`.** Creation
events only feed context and reset the attention timer; the actual trigger is
*timer-expiry + maturity gate* (or an explicit deliberate/pull signal). Show is
driven by the curation/attention signals.

Reusable primitive: sustained-attention items (toolbox hover, human-node focus)
are **dwell timers** — the same countdown mechanism as the idle timer, anchored
to a thing instead of the whole canvas.

## The Observer maturity & impact gate (new Observer job)

Before any generation, the Observer runs a **maturity gate** with a **dedicated
prompt**, over the **full canvas-map (complete node content, not summaries)**, on
its strong model (thinking:high). Decided: the judgment is the **LLM's**, not a
heuristic — because the preconditions below live in the actual *wording* of nodes,
which summaries lose.

**Foundation — maturity is per-agent and locus-specific, not a global score.**
The gate does not ask "is the canvas mature?" (fuzzy, inconsistent). For each
*eligible* agent it asks: "is there a specific place where this agent's move lands
a genuine, in-range augmentation?" — and it must return **evidence** (which nodes,
what is unexplored/untested/unconnected). No evidence → that agent fails. No agent
passes → **hold** (not mature yet).

Preconditions are taken from each agent's actual system prompt (`src/agents/*.ts`):

| Agent | Eligible when | Evidence the gate must find | "Not mature" when |
|---|---|---|---|
| **Expander** | local phase = diverging | a trail with momentum **and** open space 1–2 jumps ahead along it | isolated node (no trail) · direction exhausted · already densely branched |
| **Stress-Tester** | local phase = converging | a committed subtree with ≥1 attackable surface: contradiction / hidden assumption / scope gap / dependency risk | nothing committed (pure diverge) · no attackable surface |
| **Outer Subconscious** | any phase | a concept with a strong non-obvious analog — **cross- OR intra-domain** (not only distant fields) | purely literal/local content, no associative lift |
| **Articulator** | any phase | two existing nodes with a real but *unnamed* relationship (emits 2–3 readings, no question node) | no such pair · link already labeled/explicit |

Selection is **single best agent** (decided — never a ranked set; we don't dilute
help). Within {Expander, Stress-Tester} the pick is by *local* phase; Outer-Sub /
Articulator are phase-agnostic and can outrank both when their evidence is
stronger. Output: `{ agent, locus_node_ids, headroom, jump_distance, confidence }`
— **deduped against the FULL active rejection-insight set** (decided) so it never
re-offers a refusal. No qualifying agent → hold.

**Consequence — Outer-Sub & Articulator gain a proactive path.** Today they fire
ONLY on explicit edges, via immediate pipelines that bypass the Orchestrator
(question edge → Outer-Sub; edge-between-existing → Articulator). Making them gate
candidates lets the gate *proactively* offer an associative leap or articulate an
undrawn link — more help, but new anchoring (proactive Outer-Sub needs the gate to
supply the node + intra/cross hint; proactive Articulator needs the two node ids).
**Decision (open):** enable proactive Outer-Sub/Articulator in v1, or keep them
explicit-only and let the gate choose among Expander/Stress-Tester (+Observer)?

**1–2 jump ownership:** gate does a *coarse* in-range filter; the content agent
enforces exact distance — don't pay the gate to be precise.

### The gate replaces the Orchestrator (decided) — what to re-home

Traced every dependent (grep + `agent-pipeline.ts`): only the main pipeline
consumes the Orchestrator's routing. Retiring it means:

| Orchestrator did… | Re-homed to |
|---|---|
| **route** (which agent) | the gate (single best) |
| **tier enforcement** (`getAvailableAgents`) | gate selection — but *don't substitute a weaker agent*; if the best pick is tier-locked, surface a low-intensity **upgrade offer** (substituting Stress-Tester→Expander for a converging user is actively wrong — Expander re-diverges, which the Stress-Tester prompt forbids) |
| **`question_style`** | already sourced from Attunement via the serializer (agents read the ATTUNEMENT block, not the Orchestrator's copy, which is only logged) — drops cleanly |
| registered in `src/mastra.ts` (tracing) | swap for the gate agent |

The immediate pipelines (articulator/outer-sub) never used the Orchestrator → untouched.

**Cost:** full-canvas + thinking:high is the most expensive call and now runs on
the hot path. Mitigation — the Impact Check gates the gate: **if nothing material
changed since the last pass, reuse the prior verdict** instead of re-running.

## Phase transitions (must be built — currently absent)

**Finding (verified in code):** `sessions.current_phase` defaults to `'diverging'`
(migration `…0001` L25) and **`updatePhase()` has zero call sites** — nothing ever
writes it. Phase is frozen at `diverging` all session. Therefore Orchestrator
rule 4 (`converging → stress_tester`) is **unreachable** — the Stress-Tester never
fires via the main pipeline today, and `phase_shift_suggested` only nudges
`question_style`, never the phase.

We build transitions from zero — design for **oscillation**, not a one-way latch:
- Phase is a both-ways state, flippable any number of times in a session.
- **Hysteresis:** require a confident/sustained shift before flipping (don't
  chatter on noise). A curation burst (see below) is a strong converging signal.
- **Record transitions** — the click (diverge→converge) and re-divergence are what
  the Observer + Session Complete care about; flip-count is a health signal.

### Re-divergence has four reasons — and phase is really LOCAL, not global

Why a brainstormer reopens after converging (the reason decides the AI response):

| Reason | What happened | AI response |
|---|---|---|
| **Checkpoint descent** | converged on X; X is a settled base; explore options *from* X | Expander on X's children — healthy recursion |
| **Backtrack** | a stress-test broke the converged idea → reopen the *same* level | Expander that **carries the breaking insight** forward |
| **Reframe** | new dimension reopens the space | Expander a level up; Observer may flag drift |
| **Parallel branch** | attention moved to a different, still-open region | not "re"-divergence at all |

The last row is the tell: on a spatial graph, **phase is a property of the
current frontier, not the whole session** (one cluster can be converged while
another is wide open). Recommended foundation:
- Keep `session.current_phase` as a cheap **coarse/dominant** phase (Attunement's
  session-level read).
- The **gate computes an ephemeral LOCAL phase** for its chosen locus's
  neighborhood and picks Expander-vs-Stress-Tester on *that*; it advances phase
  via `updatePhase()` when the dominant read shifts.
- Then re-divergence needs **no special detector** — it emerges when the frontier
  moves to a reopening region. The only reason needing explicit handling is
  **backtrack**: carry the Stress-Tester's breaking insight into the re-divergence.

## Context snapshot & staleness (Impact Check)

Every ghost is generated against a **context snapshot** and the canvas then moves
on. On any context-changing action (accept/reject an old ghost, delete a
depended-on node, hover an old ghost), the Observer's impact check classifies the
change: `none` → show as-is; `material` → show-with-warning ("this may not
capture your latest change — regenerate?") or re-trigger. This unifies list
cases 2, 12–15, and 24, and generalizes the existing "2 new nodes without
interaction → ignored" rule into a real staleness model.

Each `intervention_offer` / ghost therefore records the snapshot it was born from
(e.g. a context hash or the trigger node-sequence index) so impact can be judged.

## The interactive deferral timer

Today's debounce is an invisible, fixed 10s Inngest timer. This makes it
**visible + user-controlled**, matching the UI concept (a circular countdown +
an ambient "processing" waveform along the canvas floor, with pause/resume):

- Adaptive period: default 10s; **5s on HIGH readiness**; reset to 5s when the
  user manually defers (pauses then resumes creating); back to 10s after a
  response lands.
- **Ownership (decision):** recommended — the **frontend owns the visible
  attention-timer** (idle detection, countdown, pause/resume are local +
  responsive) and POSTs the trigger on expiry; the **backend owns
  content-maturity + generation**. The Inngest debounce demotes to a safety net
  that collapses duplicate triggers.
- The ambient waveform is a new low-intensity surface with two states:
  **processing** (working) vs. an offer glow (**has something**) — both belong on
  the Ambient rung of the spectrum.

## Attention states (two only: waiting / thinking) × show rules

Decided: only **waiting** and **thinking** (no "away"). Glow-first is the *arrival*
default (nothing barges in fully-formed); the **reveal threshold** is then
`f(attention state, the action's show-rule)` — this is how the state pairs with the
per-action Show matrix:

| State | How inferred (frontend) | Timer / glow | Reveal threshold |
|---|---|---|---|
| **Waiting** | idle right after a deliberate / pull signal | shorter timer · more prominent glow | **low** — a glance/soft-hover or a short beat reveals (they asked; don't make them hover-hunt); pre-generate more readily |
| **Thinking** | idle after flow/creation, may resume | longer timer · subtler glow | **high** — only a deliberate hover reveals; protect the flow |

The per-action show-rule modulates on top: hovering an old ghost (case 24) always
reveals (+ impact check); a node-move surfaces the glow but never auto-reveals.
Cursor movement feeds state inference (dwell = soft focus) as a frontend-aggregated
hint — never raw event streaming, and never itself a Trigger or discrete Show event.

## Curation as a rolling signal (answering "pair with time + prior actions?")

Yes — but **not** per-action rules. A single node-move mid-flow is incidental →
show-only. Model an accumulated **interaction-texture** signal = f(recent action
sequence, dwell/time): a *burst* of curation (several moves + a delete + dwell) =
the user consolidating → a **converging signal** that legitimately **triggers**
(run the gate; stress-tester likely eligible) *and* is a strong show moment. It is
the action-texture sibling of Attunement's content-texture, and extends "Sequence
as Data" from nodes to interactions. Frontend computes it; backend gets the
aggregate. Threshold to pin down: promote to trigger when `curation actions ≥ N in
window W` or `sustained dwell ≥ D`; below that, show-only.

## Blast Radius
| Component | Impact |
|---|---|
| `types/index.ts` | New `InterventionIntensity`, `InterventionOffer`; extend `RedisMessage` union |
| `src/lib/intervention.ts` | NEW — pure `decideIntensity()` + receptivity/salience scoring |
| `src/agents/observer.ts` | Add **gate mode** (`runMaturityGate()`) → candidate set `[{ agent, locus_node_ids, headroom, jump_distance, confidence }]`; dedicated prompt, **full canvas content** (not summaries), thinking:high; advances phase |
| `src/db/sessions.ts` | Wire the existing-but-**dead** `updatePhase()` — called by the gate to flip phase (both directions) |
| `src/pipeline/agent-pipeline.ts` | Trigger source changes (no longer `node.created`-driven); gate + phase-advance BEFORE routing; branch on intensity: low → offer + stop, pre-gen → spawn/stream |
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
  src/agents/observer.ts               → runMaturityGate() (lightweight gate mode)
  src/pipeline/agent-pipeline.ts       → maturity gate + intensity branch; new trigger source
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
context_snapshot text/jsonb  (hash or trigger node-sequence index — for the Impact Check)
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
- **Gate cost** — decided as full-canvas + thinking:high, the most expensive call,
  on the hot path. Mitigation is mandatory: the Impact Check reuses the prior
  verdict when nothing material changed, so the gate doesn't re-run per tick.
- **Timing split-brain** — timer is frontend-owned (decided); backend must NOT also
  try to own "when to fire" — Inngest debounce is only a duplicate-collapse safety net.
- **Stress-Tester regression latent today** — it's already unreachable (frozen
  phase). Building phase transitions is what unlocks it; verify it actually fires.

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
5. **Timer ownership** — ✅ DECIDED: frontend owns the visible attention-timer +
   pause/resume, POSTs on expiry; backend owns maturity + generation.
6. **Maturity gate weight** — ✅ DECIDED: full canvas content + LLM judgment +
   dedicated prompt (thinking:high). Cost mitigated by verdict-reuse via Impact Check.
7. **Attention states** — ✅ DECIDED: two only (waiting / thinking); "away" dropped.
8. **Glow-first** — ✅ DECIDED: glow-first *arrival*; reveal = f(state, show-rule).
9. **Gate ↔ Orchestrator** — ✅ DECIDED: gate replaces it (single best); re-home
   routing/tier/`question_style` per the table above.
10. **Selection & dedup** — ✅ DECIDED: single best agent (no ranked set); dedup vs.
    the full active rejection-insight set; tier-lock → upgrade offer, never substitute.
11. **Impact check on curation** — does move/delete "show" route through the impact
    check too (a delete can invalidate a held ghost)? (Leaning: yes.)
12. **Local vs global phase** — adopt ephemeral **local** phase at the gate's locus
    (coarse `session.current_phase` kept as dominant)? (Leaning: yes — re-divergence
    falls out for free.)
13. **Proactive Outer-Sub / Articulator** — enable their new gate-driven proactive
    path in v1, or keep them explicit-edge-only and gate over Expander/Stress-Tester?
14. **Phase hysteresis** — what counts as a confident shift (confidence threshold +
    sustained over the window)?

## Task Breakdown
- **task-01:** types (+ `context_snapshot`) + `intervention_offers` migration + RLS + `decideIntensity()`
- **task-02:** phase transitions — wire `updatePhase()`, oscillating flip + hysteresis, local phase at locus, backtrack carry-forward; verify Stress-Tester now reachable
- **task-03:** Observer `runMaturityGate()` (full-canvas prompt, single-best pick) **replacing the Orchestrator** — re-home tier (upgrade-offer) + drop redundant `question_style`; retire orchestrator from `mastra.ts`
- **task-04:** `src/streaming/offer.ts` + glow-first-arrival + reveal = f(state, show-rule) + `agent-pipeline` intensity branch + guard update
- **task-05:** `intervention-materialize` pipeline + `intervention` route (pull/dismiss) + `src/index.ts` wiring
- **task-06:** Impact Check (snapshot compare) — staleness warnings, withdraw-on-stale, gate verdict-reuse
- **task-07:** receptivity + interaction-texture (curation-burst) signals → intensity/trigger; attention-state inference
- **task-08:** doc ratification via `update-ai-context` (CANVAS-SYNC.md + non-negotiable #9 + Observer's new gate role + phase model)
