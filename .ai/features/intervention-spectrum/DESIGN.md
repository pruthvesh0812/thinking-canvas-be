---
feature: "intervention-spectrum"
type: design
created: 2026-07-03
status: draft
git_branch: "claude/ai-intervention-spectrum-moumhu"
supersedes_when_ratified: "CLAUDE.md non-negotiable #9 · CANVAS-SYNC.md · Orchestrator + Observer roles in CORE-CONCEPTS.md/AGENT-PIPELINE.md"
---

# AI Intervention Spectrum — Design

> The complete design record. `story.md` (same folder) is the build plan — blast
> radius, files, tasks — and defers to this doc for the *why* and the model.

**One line:** replace the binary AI-contribution model (full ghost pair **or**
nothing) with a graduated, boundary-respecting system that decides *whether to
generate* (Trigger) and *how loudly to present it* (Show) as two separate axes,
with a **decide → wait → generate** handshake so the backend never spends a
content-agent token until the user lets a visible timer lapse or approves.

---

## 1. The problem & the reframe

The Ghost Threshold gates **acceptance** — "nothing crosses into the real canvas
without consent." But nothing gates **presentation**: today the pipeline routes to
an agent and immediately materializes two ghost nodes + edges next to the user's
focus and streams tokens in. Even at 40% opacity, *materializing structure is
itself an interruption* — it grabs the eye and forces a context switch regardless
of whether the user ever accepts it.

**The reframe: two consent gates, not one.**

```
   … → [ PRESENTATION gate ]  → … → [ ACCEPTANCE gate ]  → owned node
        (new — this design)          (existing Ghost Threshold)
```

This is a second axis on the product's **Calibrated Nudge** pillar: today it
calibrates cognitive *distance* (the 1–2 jump rule); this adds calibration of
*presence / intensity* — how loudly the AI announces it has something. It isn't
foreign to the system: the **Observer already lives at the low end** ("watches and
queues, does not interrupt"; highlights anchors and waits for a hover-pull). This
generalizes that restraint to every role.

Two payoffs from one idea: it **respects boundaries** (non-intrusive in flow) and
it's **cheaper** (content is generated lazily — the expensive content agent only
runs when the contribution is actually wanted).

---

## 2. The core model — two orthogonal axes

Almost every case below dissolves once these are separated:

- **Trigger** = *should the AI generate?* (spend tokens, produce a response)
- **Show** = *should an existing response be revealed?* (surface what's held)

### The augmentation pipeline (decide → wait → generate → show)

Two backend phases, with the user's consent-timer *between* the decision and
generation:

```
  canvas event
       │
  ┌────▼──────────────┐   false → defer to next event
  │ 1. TRIGGER ruleset │   attention/action gate — FRONTEND; NOT maturity
  └────┬──────────────┘
       │ true → POST
  ┌────▼──────────────────────────┐   not mature → silent "no pipeline"
  │ 2. Attunement + JUDGE          │   new Orchestrator: canvas-map → {mature, route}
  └────┬──────────────────────────┘
       │ mature → push "mature + pipeline waiting" over SSE; park on waitForEvent
  ┌────▼──────────────┐
  │ 3. PROCESSING timer│   FRONTEND shows it (default). User may pause/defer,
  │    (the consent)   │   hit "process now", or let it lapse
  └────┬──────────────┘
       │ go / lapse → (re-judge if context changed — §4d)
  ┌────▼──────────────┐
  │ 4. GENERATE        │   the parked single-best agent streams
  └────┬──────────────┘
       │ response
  ┌────▼──────────────┐
  │ 5. SHOW ruleset    │   directly vs subtly  ×  anchor in-view vs off-screen
  └───────────────────┘        → glow (hi/lo) or sidebar card (§5)
```

The judge (phase 2) is **eager** — so the timer only appears when something is
genuinely coming; **generation (phase 4) is lazy** — only after the user lets the
timer lapse or approves.

### Action taxonomy — class decides Trigger/Show (not the specific action)

| Class | Examples | Trigger | Show | Rationale |
|---|---|---|---|---|
| **Flow / creation** (heads-down) | typing, node/edge create, toolbox click | no | no | mid-thought; context not ripe — don't touch |
| **Curation / attention** (eyes on canvas) | move node, delete node/edge, hover/focus human node | no* | yes | looking at structure — safe to surface held content |
| **Deliberate / help-seeking** | sticky-note create/move/delete, toolbox dwell, hover AI-edge label | yes | yes | an intentional "help me" signal |
| **Ghost interaction** (context-changing) | accept/reject ghost or observer edge, hover old ghost | via impact check | yes (+warn if stale) | mutates context → must re-check staleness |

\* a *burst* of curation promotes to a Trigger — see §7.

**Consequence:** generation is **no longer driven by `canvas/node.created`.** The
**trigger ruleset** (not creation events) decides whether to invoke the judge;
generation happens only after the processing timer. Creation events feed context
and reset the timer.

---

## 3. Full per-action matrix

Transcribed from the brainstorm, with the open items (1, 20) resolved. "Class"
per §2. Ghost-interaction rows (12–15, 24) run the **Impact Check** (§6).

| # | Action | Class | Trigger | Show | Notes |
|---|---|---|---|---|---|
| 1 | cursor movement | — | no | no | **Decided:** an aggregated receptivity/attention hint (dwell = soft focus), computed frontend-side; never a discrete trigger/show, never raw-streamed |
| 2 | typing | flow | no | no | |
| 3 | node creation (active) | flow | no | no | feeds context + resets timer |
| 4 | edge creation (active) | flow | no | no | feeds context + resets timer |
| 5 | move a node | curation | no | yes | surface glow of held content; may run Impact Check |
| 6 | move an edge | — | — | — | N/A — edges are not moved |
| 7 | delete a node | curation | no | yes | Impact Check — a delete can invalidate a held ghost |
| 8 | delete an edge | curation | no | yes | Impact Check |
| 9 | sticky-note creation | deliberate | yes | yes | reflection/meta signal |
| 10 | sticky-note moving | deliberate | yes | yes | |
| 11 | sticky-note deletion | deliberate | yes | yes | |
| 12 | accept an OLD ghost node | ghost | see sub-cases | yes | ↓ |
| 12.1 | · no current processing | | if judge says mature | no | run the judge; trigger only if it passes |
| 12.2 | · processing timer showing | | re-trigger | yes | pause the timer; if judge says mature → re-trigger with new context, else re-trigger existing |
| 12.3 | · processing already started | | let it finish | yes (+warn if impact) | Impact Check: no impact → let the ghost land; impact → land it **with a warning** ("this may not capture the node you just accepted — regenerate?") |
| 13 | reject an old ghost node | ghost | as 12 (reject) | yes | same three sub-cases |
| 14 | accept a ghost edge (observer) | ghost | as 12 | yes | |
| 15 | reject a ghost edge (observer) | ghost | as 12 (reject) | yes | |
| 16 | hover on toolbox | deliberate | yes (after dwell) | yes | dwell-timer: wait, check time, then trigger |
| 17 | click a toolbox component | flow | no | no | |
| 18 | focus on a human node | curation | wait → **v2** | yes | after a dwell, ask consent to expand this node (v2) |
| 19 | focus on a NEW ghost node | — | no | already shown | |
| 20 | hover on a human node | curation | no | yes | **Decided:** show-only — reveal held content anchored here (via Impact Check); focus (18) is the stronger dwell signal that earns the v2 expand |
| 21 | hover on a NEW ghost node | — | no | already shown | |
| 22 | hover AI edge label / description | deliberate | yes | yes | |
| 23 | focus on an OLD ghost node | — | — | — | no focus affordance here |
| 24 | hover on an OLD ghost node | ghost | no | yes (+warn if impact) | Impact Check: no impact → show; impact → show **with warning** |

**Reusable primitive:** sustained-attention items (16 toolbox, 18 focus) are
**dwell timers** — the same countdown mechanism as the idle timer, anchored to a
thing instead of the whole canvas.

---

## 4. Trigger axis — decide, then wait, then generate

### 4a. The trigger ruleset (frontend — the cheap gate)

The attention/action gate that decides whether to invoke the (expensive) judge —
**not** a maturity check (that is the judge's job, §4b). Runs **frontend-side** on
each canvas event from: the action **class** (§2 taxonomy) + the **deferral timer**
+ the rolling **interaction-texture** signal (§7). True → POST to the backend;
false → defer to the next event. Because maturity is excluded, the backend judge
only ever runs on a genuine attention signal.

### 4b. The judge (the "new Orchestrator") — maturity + routing in one call

The judge **replaces the old Orchestrator** and **absorbs the maturity check**.
Input: Attunement's output + the **full canvas-map (complete node content, not
summaries)**. Model: strong (thinking:high). One call, one output:
`{ mature, route?, locus_node_ids?, headroom?, confidence? }`. The judgment is the
**LLM's** — the preconditions live in the *wording* of nodes, which summaries lose.

> This supersedes the earlier "Observer gate-mode" idea. The **Observer reverts to
> a content agent only**; the **judge** holds the canvas-map + maturity + routing
> role. (Attunement still runs first and supplies posture.)

**Maturity is per-agent and locus-specific, not a global score.** For each eligible
agent the judge asks "is there a specific place where this agent's move lands a
genuine, in-range augmentation?" and must return **evidence**. No agent passes →
not mature → hold. Preconditions from `src/agents/*.ts`:

| Agent | Eligible when | Evidence the judge must find | "Not mature" when |
|---|---|---|---|
| **Expander** | phase = diverging | a trail with momentum **and** open space 1–2 jumps ahead along it | isolated node (no trail) · direction exhausted · already densely branched |
| **Stress-Tester** | phase = converging | a committed subtree with ≥1 attackable surface: contradiction / hidden assumption / scope gap / dependency risk | nothing committed (pure diverge) · no attackable surface |
| **Outer Subconscious** | any phase | a concept with a strong non-obvious analog — **cross- OR intra-domain** | purely literal/local content, no associative lift |
| **Articulator** | any phase | two existing nodes with a real but *unnamed* relationship (2–3 readings, no question node) | no such pair · link already labeled |

- **Single best agent** (never a ranked set — we don't dilute help). {Expander,
  Stress-Tester} chosen by `session.current_phase`; Outer-Sub / Articulator are
  phase-agnostic and can outrank both on stronger evidence.
- **Dedup vs. the FULL active rejection-insight set** — never re-offer a refusal.
- **1–2 jump:** coarse in-range filter here; the content agent enforces exact distance.
- **Tier:** pick the genuine best; if it is tier-locked, **do not substitute a
  weaker agent** (Stress-Tester→Expander for a converging user is *actively wrong* —
  Expander re-diverges, which the Stress-Tester prompt forbids). Emit an **upgrade
  offer** for the sidebar card instead (§5) — preserves help quality + is a
  conversion surface.
- **Retiring the Orchestrator:** routing → the judge; `getAvailableAgents` → the
  tier rule above; `question_style` already comes from Attunement via the serializer
  (the Orchestrator's copy was only logged); swap the `src/mastra.ts` registration.
  The immediate articulator/outer-sub **edge** pipelines never used the Orchestrator
  → untouched.
- **New proactive path for Outer-Sub & Articulator [OPEN — §10]:** as judge
  candidates they can be offered *without* an explicit edge (needs the judge to
  supply the node + an intra/cross hint, or the two node ids).

### 4c. Phase model (v1 = one-way arc)

**v1 scope:** the arc is **diverge → transition → converge**, one way only.
Re-divergence, local (per-frontier) phase, and oscillation are **deferred** — they
arrive with branching (the "parallel branch" case), captured in
[`../branching/story.md`](../branching/story.md).

**Finding (verified in code):** `sessions.current_phase` defaults to `'diverging'`
(migration `…0001` L25) and **`updatePhase()` has zero call sites** — nothing writes
it, so phase is frozen at `diverging` and the Stress-Tester (which needs
`converging`) **never fires** today. v1 fixes exactly this:

- Phase is a **single latch**: `diverging → converging`, once, driven by
  Attunement's `phase_shift_suggested` (its prompt already reads the shift — and the
  "transition" is that in-flight moment) via `updatePhase()`.
- **Hysteresis:** require a confident/sustained shift before flipping so it doesn't
  chatter. Once converged, it stays converged for the session (no going back in v1).
- The **judge** reads `session.current_phase` to gate {Expander (diverging),
  Stress-Tester (converging)}; Outer-Sub / Articulator are phase-agnostic.

> **Deferred (future, with branching):** re-divergence has four distinct reasons —
> checkpoint descent, backtrack, reframe, parallel branch — and handling them cleanly
> means making phase **local to the frontier** rather than session-global (one
> cluster converged while another is still open). That is a branching-era change.

### 4d. The handshake: decide → wait → generate

1. Judge says **mature** → backend pushes a **`mature + pipeline waiting`** message
   **over SSE** (async — decided; not a synchronous HTTP body), and the Inngest run
   **parks on `step.waitForEvent`** (with a hard **timeout** so an abandoned tab
   never leaves a run parked forever).
2. The frontend shows the **processing timer** (shown by **default** — decided).
   The user can **pause/defer**, hit **"process now"** (a *waiting* user skips
   straight ahead), or let it **lapse** — any of which POSTs the go/defer event.
   Timer period: default 10s; 5s on high readiness; reset on manual defer; back to
   10s after a response. The ambient "processing" waveform is the low-key surface
   for this phase.
3. On go/lapse the parked run wakes and **generates** (the single-best agent
   streams). Judge said **not mature** → silent "no pipeline"; nothing is shown.
4. **Re-judge on change (decided):** the judge stamped its decision with a
   **context snapshot**. At wake: snapshot unchanged → generate with the cached
   route; **changed materially** (user added nodes during the wait) → re-run
   Attunement + judge, or **abort + `withdraw`** if no longer mature. The timer thus
   doubles as the "let them finish" window *and* keeps the decision honest.

### 4e. Concurrency & stale ordering — single-flight + version guard

The long "waiting" phase means a newer trigger can arrive mid-wait. Freshest
context must always win (an earlier judge saw *less* canvas). For now (single-user,
single frontier): **single-flight per session** + a **monotonic version guard**:

- Each intervention gets a per-session **`seq`**; the session tracks **`latest_seq`**.
- **Supersession (common case):** a new mature judgement bumps `latest_seq`, marks
  the parked one `superseded`, publishes **`withdraw`**, cancels the parked run.
- **Version guard (handles the race):** cancellation always races — the stale run
  may already be generating. So every run **re-checks it is still `latest` at the
  publish boundary** (before `spawn`, before streaming); a newer `seq` → **abort
  silently**. *This is the answer to "the stale pipe finishes after the fresh one":
  it wakes, sees it lost, drops.*
- **Frontend idempotency:** ghosts keyed by `(anchor_node_id, seq)` — a late stale
  message for an older seq is ignored.
- **Forward-compatible:** the guard is "latest seq **per key**" — key = `session`
  now, key = `branch/subtree` when branching-from-any-node lands (then concurrent
  pipelines on *different* branches coexist; only same-branch collides). A key swap,
  not a redesign.

### 4f. `InterventionOffer` — the lifecycle spine

The judge does **not** return an `InterventionOffer`. It returns a *decision*
(`{ mature, route, locus_node_ids, headroom, confidence }`); when `mature`, the
**pipeline builds + persists** the offer from it, emits `waiting` (carrying a
subset), then parks. The offer is the persisted handle (`intervention_offers`) every
later step references by `id`/`seq`:

| Step | Offer |
|---|---|
| judge → `mature` | **created**: `agent_role=route`, `anchor_node_ids=locus`, `seq` (bumps `sessions.latest_seq`), `context_snapshot`, `status='waiting'`; `headline`/`directness` null |
| publish `waiting` (SSE) | payload = subset (`id`, anchor, agent, timer params) — no content yet |
| parked wait | source of truth for "in flight" — supersession + `canAgentFire` read/write it |
| process/go | wake; `context_snapshot`≠current → re-judge; guard checks `seq==latest_seq` before publish |
| generation | build `SpawnDescriptor` (existing) referencing `offer.id`; stream |
| done → show | set `directness` (show ruleset) + backend `headline`; `status='shown'`; publish `offer`/`spawn…done` |
| user acts | `status → pulled/dismissed/superseded/expired`; dismiss/defer → receptivity model (§8) |

Relationship to existing types: `SpawnDescriptor` (unchanged) = the ghost graph,
built only at generation; `GhostPair` (unchanged) = the post-generation thread
record for accept/reject; `offer.id` links all three. `headline`/`directness` are
filled at *show* (they need the generated content + the attention state then).

---

## 5. Show axis — the show ruleset

After generation, a **show ruleset** decides how subtly to surface the result —
**show directly vs. show subtly**, crossed with the frontend fact **anchor in the
viewport vs. off-screen**. Glow-first *arrival* holds: nothing barges in
fully-formed; hover reveals.

| | Anchor **in view** | Anchor **off-screen** |
|---|---|---|
| **Show directly** | high-intensity glow (node + ghost-edge ends) | normal toast/card in the sidebar |
| **Show subtly** | low-intensity glow | low-intensity sidebar card |

- **Split:** the **backend** emits the result + `{ directness, anchor_node_ids,
  headline }`; the **frontend** picks glow-vs-card from viewport position and renders
  the intensity.
- **Sidebar card:** clicking it **pans the view to the anchor**, which then glows.
  The card carries a plain-language **headline the backend supplies** (only it knows
  what the agent produced) — e.g. *"Worth a look when you're free — I found a
  tension between this node and an earlier one."* A **tier-locked** pick surfaces its
  upgrade offer here.
- **Directness = f(attention state, action's show-rule).** Two states only
  (decided): **waiting** → directly (they asked; a waiting user can also "process
  now" up-front); **thinking** → subtly (protect the flow). The per-action show-rule
  modulates: hovering an old ghost (24) always reveals (+ Impact Check); a node-move
  (5) surfaces the glow but never auto-reveals. ("Away" is dropped.)

---

## 6. Context snapshot & staleness (the Impact Check)

Every offer/ghost is stamped with the **context snapshot** it was born from (a
context hash or trigger node-sequence index). Two jobs use it:

1. **Wake-time re-judge (§4d):** at generation, unchanged snapshot → cached route;
   material change → re-judge or abort+withdraw.
2. **Ghost-interaction impact (matrix 12–15, 24):** on accept/reject/hover of an
   existing ghost, or a delete of a depended-on node, the judge classifies the
   change — `none` → show as-is; `material` → show-with-warning ("may not capture
   your latest change — regenerate?") or re-trigger.

This generalizes the existing "2 new nodes without interaction → ignored" rule into
a real staleness model, and it is what powers the version guard's "is this still
current" check (§4e). It also caps judge cost: **unchanged snapshot ⇒ reuse the
prior verdict** instead of re-running.

---

## 7. Curation as a rolling signal

Not per-action rules. A single node-move mid-flow is incidental → show-only. Model
an accumulated **interaction-texture** signal = f(recent action sequence,
dwell/time): a *burst* of curation (several moves + a delete + dwell) = the user
consolidating → a **converging signal** that legitimately **triggers** (invoke the
judge; Stress-Tester likely eligible) *and* is a strong show moment. It is the
action-texture sibling of Attunement's content-texture, and extends "Sequence as
Data" from nodes to interactions. Frontend computes it (it feeds the trigger
ruleset, §4a); backend gets the aggregate. Threshold to pin down: promote to
trigger when `curation actions ≥ N in window W` or `sustained dwell ≥ D`.

---

## 8. The learning loop — and the trap to avoid

The offer-response is a new learning signal and the seed of the v1.5 **Cognitive
Profile**. **But ignoring/deferring an offer ≠ rejecting content.** A deferred timer
or ignored glow means "not now / I'm busy," NOT "that idea was bad." So:

- **Offer-response** (deferred / dismissed / ignored / "process now") → a separate
  **receptivity model** that down/up-ranks future intensity + timer length. **No
  `rejection_insights` rows.**
- **Content accept/reject** (on a materialized ghost) → feeds Rejection Insights
  exactly as today, unchanged.

Keeping these two channels clean is the subtle correctness point of the feature.

---

## 9. Streaming protocol amendment (needs ratification)

This touches a **non-negotiable**: CLAUDE.md #8 ("backend never pushes unsolicited
state") and #9 ("Redis pub/sub = ghost node streaming **only**"). The new signals
are strictly *less* intrusive than a ghost (advisory, ephemeral, dismissable, never
touching user nodes/edges). Resolution — **generalize the channel's contract**;
`spawn/chunk/done` become the maximal-intensity subset:

```typescript
type RedisMessage =
  | { type: 'waiting';  offer: InterventionOffer }   // NEW — "mature + pipeline waiting" (§4d)
  | { type: 'offer';    offer: InterventionOffer }    // NEW — low-intensity show (glow/card, §5)
  | { type: 'withdraw'; offer_id: string }            // NEW — supersede / no-longer-mature (§4e)
  | { type: 'spawn';    descriptor: SpawnDescriptor }  // existing
  | { type: 'chunk';    target: string; data: string } // existing
  | { type: 'done' }                                   // existing
```

`src/routes/stream.ts` needs **no change** — it is payload-agnostic (only
special-cases `done`/`ping`). This amendment must be **ratified before code lands**
(via the `update-ai-context` skill: CANVAS-SYNC.md, non-negotiable #9, and the
new **judge** role that retires the Orchestrator).

---

## 10. Decisions log

### Decided ✓
- Two consent gates: presentation (new) + acceptance (existing).
- Two axes: **Trigger** (generate) vs **Show** (reveal); class-based taxonomy.
- **Trigger ruleset** = frontend attention/action gate only; **maturity is the
  judge's job**, never in the ruleset.
- **Judge = the new Orchestrator**: Attunement + **full canvas-map** → one call
  `{ mature, route }`; single best agent; dedup vs. the **full** rejection-insight
  set; thinking:high, LLM judgment. **Retires the Orchestrator**; the **Observer
  reverts to a content agent only**.
- **Tier:** never substitute a weaker agent — tier-locked best → **upgrade offer** on
  the sidebar card. `question_style` from Attunement.
- **decide → wait → generate handshake**: `mature + pipeline waiting` **async over
  SSE**; Inngest **`waitForEvent` + hard timeout**; timer between decision and gen.
- **Processing timer shown by default**; a *waiting* user can **"process now"**.
- **Re-judge on material change** at wake (context snapshot); else reuse cached route.
- **Concurrency:** single-flight per session + **monotonic version guard**
  (latest-seq-wins, abort at publish boundary), built **per key** (session now →
  branch later).
- **Show model:** 2×2 **directness × in-view** → glow (hi/lo) or sidebar card;
  backend supplies the headline; glow-first *arrival*.
- **Attention states:** two only — waiting / thinking (no "away").
- **Phase (v1):** one-way `diverging → converging` **single latch** + hysteresis
  (session-level). Re-divergence + local/per-frontier phase + oscillation **deferred**
  to branching.
- **Curation** = rolling interaction-texture signal (not per-action).
- **Learning:** offer-response ≠ content-rejection (separate receptivity model).
- **Redis protocol** generalized (`waiting`/`offer`/`withdraw`) — pending ratification.

### Open ?
- **Proactive Outer-Sub / Articulator** in v1, or keep explicit-edge-only (judge
  over Expander/Stress-Tester +Observer)? *Rec: enable, scoped to strong evidence.*
- **Phase hysteresis threshold** — the confidence + sustained-over-window definition.
- **Level set for v1** — which show/timer surfaces ship first.
- **User "interruption tolerance" setting** (DND ↔ Proactive) now or later?
- **Branching-from-any-node** (future) — flips the guard key to `branch`; may scope
  the judge's canvas-map read to the subtree. Captured as its own deferred story:
  [`../branching/story.md`](../branching/story.md) (incl. the "start a branch from a
  superseded response" popup).

---

## 11. Build plan

See **`story.md`** (same folder) for blast radius, files to touch, the migration,
Inngest events, risks, and the task breakdown. This doc is the authority for the
model and the decisions; `story.md` is the authority for *how* it gets built.
