---
feature: "intervention-spectrum"
type: design
created: 2026-07-03
status: draft
git_branch: "claude/ai-intervention-spectrum-moumhu"
supersedes_when_ratified: "CLAUDE.md non-negotiable #9 · CANVAS-SYNC.md · Observer role in CORE-CONCEPTS.md"
---

# AI Intervention Spectrum — Design

> The complete design record. `story.md` (same folder) is the build plan — blast
> radius, files, tasks — and defers to this doc for the *why* and the model.

**One line:** replace the binary AI-contribution model (full ghost pair **or**
nothing) with a graduated, boundary-respecting system that decides *whether to
generate* (Trigger) and *how loudly to present it* (Show) as two separate axes,
gated by an Observer maturity check, so the AI helps at the right moment without
ever barging into the user's flow.

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

A response can be generated-and-held (glow only), then revealed later by a pure
Show event that generates nothing new.

### The augmentation pipeline

```
Attention timer ──► Maturity gate ──► Generate & HOLD ──► Show ──► Reveal
 (frontend-owned,     (Observer:        (single best      (glow    (hover /
  visible, pausable)   who + where +     agent streams,    first)   state ×
                       phase, full        held behind             show-rule)
                       canvas)            a glow)
```

### Action taxonomy — class decides Trigger/Show (not the specific action)

| Class | Examples | Trigger | Show | Rationale |
|---|---|---|---|---|
| **Flow / creation** (heads-down) | typing, node/edge create, toolbox click | no | no | mid-thought; context not ripe — don't touch |
| **Curation / attention** (eyes on canvas) | move node, delete node/edge, hover/focus human node | no* | yes | looking at structure — safe to surface held content |
| **Deliberate / help-seeking** | sticky-note create/move/delete, toolbox dwell, hover AI-edge label | yes | yes | an intentional "help me" signal |
| **Ghost interaction** (context-changing) | accept/reject ghost or observer edge, hover old ghost | via impact check | yes (+warn if stale) | mutates context → must re-check staleness |

\* a *burst* of curation promotes to a Trigger — see §7.

**Consequence:** generation is **no longer driven by `canvas/node.created`.**
Creation events only feed context and reset the attention timer; the real trigger
is *timer-expiry + maturity gate* (or a deliberate/pull signal).

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
| 12.1 | · no current processing | | if gate says yes | no | run the maturity gate; trigger only if it passes |
| 12.2 | · processing timer showing | | re-trigger | yes | pause the timer; if gate yes → re-trigger with new context, else re-trigger existing |
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

## 4. Trigger axis

### 4a. The interactive deferral timer (frontend-owned — decided)

Today's debounce is an invisible, fixed 10s Inngest timer. This makes it visible +
user-controlled, matching the UI concept (a circular countdown + an ambient
"processing" waveform along the canvas floor, with pause/resume):

- **Adaptive period:** default 10s; **5s on HIGH readiness**; reset to 5s on manual
  defer (pause then resume creating); back to 10s after a response lands.
- **Ownership:** the **frontend owns the visible attention-timer** (idle detection,
  countdown, pause/resume are local + responsive) and POSTs the trigger on expiry;
  the **backend owns maturity + generation**. The Inngest debounce demotes to a
  duplicate-collapse safety net. Backend must NOT also own "when to fire."
- The ambient waveform is a low-intensity surface with two states: **processing**
  (working) vs. an offer glow (**has something**).

### 4b. The Observer maturity & impact gate (the heart of the Trigger axis)

Before any generation, the Observer runs a **maturity gate** with a **dedicated
prompt**, over the **full canvas-map (complete node content, not summaries)**, on
its strong model (thinking:high). The judgment is the **LLM's** — because the
preconditions live in the actual *wording* of nodes, which summaries lose.

**Foundation: maturity is per-agent and locus-specific, not a global score.** For
each eligible agent it asks "is there a specific place where this agent's move
lands a genuine, in-range augmentation?" and must return **evidence** (which
nodes, what is unexplored/untested/unconnected). No evidence → that agent fails.
No agent passes → **hold** (not mature yet). Preconditions from `src/agents/*.ts`:

| Agent | Eligible when | Evidence the gate must find | "Not mature" when |
|---|---|---|---|
| **Expander** | local phase = diverging | a trail with momentum **and** open space 1–2 jumps ahead along it | isolated node (no trail) · direction exhausted · already densely branched |
| **Stress-Tester** | local phase = converging | a committed subtree with ≥1 attackable surface: contradiction / hidden assumption / scope gap / dependency risk | nothing committed (pure diverge) · no attackable surface |
| **Outer Subconscious** | any phase | a concept with a strong non-obvious analog — **cross- OR intra-domain** | purely literal/local content, no associative lift |
| **Articulator** | any phase | two existing nodes with a real but *unnamed* relationship (2–3 readings, no question node) | no such pair · link already labeled |

- **Selection: single best agent** (decided — never a ranked set; we don't dilute
  help). Within {Expander, Stress-Tester} the pick is by *local* phase; Outer-Sub /
  Articulator are phase-agnostic and can outrank both on stronger evidence.
- **Dedup vs. the FULL active rejection-insight set** (decided) — never re-offer a
  refusal.
- Output: `{ agent, locus_node_ids, headroom, jump_distance, confidence }`.
- **1–2 jump ownership:** gate does a *coarse* in-range filter; the content agent
  enforces exact distance.
- **Cost mitigation (mandatory):** full-canvas + thinking:high is the most
  expensive call and runs on the hot path. The Impact Check gates the gate — **if
  nothing material changed since the last pass, reuse the prior verdict** instead
  of re-running.

**New proactive path for Outer-Sub & Articulator.** Today they fire ONLY on
explicit edges, via immediate pipelines that bypass the Orchestrator. Making them
gate candidates lets the gate *proactively* offer an associative leap or articulate
an undrawn link — more help, but new anchoring (proactive Outer-Sub needs the node
+ an intra/cross hint; proactive Articulator needs the two node ids). **[OPEN — see
§10]**

#### The gate replaces the Orchestrator (decided) — re-homing

Only the main pipeline consumes the Orchestrator's routing. Retiring it:

| Orchestrator did… | Re-homed to |
|---|---|
| **route** (which agent) | the gate (single best) |
| **tier enforcement** (`getAvailableAgents`) | gate selection — but **never substitute a weaker agent**. If the best pick is tier-locked, surface a low-intensity **upgrade offer** ("Stress-Tester could help here — Pro"). Substituting Stress-Tester→Expander for a converging user is *actively wrong* (Expander re-diverges, which the Stress-Tester prompt forbids). Preserves help quality + is a conversion surface |
| **`question_style`** | already sourced from Attunement via the serializer (agents read the ATTUNEMENT block; the Orchestrator's copy is only logged) — drops cleanly |
| registered in `src/mastra.ts` (tracing) | swap for the gate agent |

Immediate pipelines (articulator/outer-sub explicit-edge triggers) never used the
Orchestrator → untouched. **Attunement stays** — it supplies posture
(`question_style`), orthogonal to the gate's headroom judgment.

### 4c. Phase model

**Finding (verified in code):** `sessions.current_phase` defaults to `'diverging'`
(migration `…0001` L25) and **`updatePhase()` has zero call sites** — nothing ever
writes it. Phase is frozen at `diverging` all session ⇒ Orchestrator rule 4
(`converging → stress_tester`) is **unreachable**: the **Stress-Tester never fires**
via the main pipeline today, and `phase_shift_suggested` only nudges
`question_style`, never the phase. We build transitions from zero.

**Re-divergence has four reasons** — and the reason decides the AI response:

| Reason | What happened | AI response |
|---|---|---|
| **Checkpoint descent** | converged on X; X is a settled base; explore options *from* X | Expander on X's children — healthy recursion |
| **Backtrack** | a stress-test broke the converged idea → reopen the *same* level | Expander that **carries the breaking insight** forward |
| **Reframe** | new dimension reopens the space | Expander a level up; Observer may flag drift |
| **Parallel branch** | attention moved to a different, still-open region | not "re"-divergence at all |

The last row is the tell: on a spatial graph, **phase is a property of the current
frontier, not the whole session** (one cluster can be converged while another is
open). So:

- Keep `session.current_phase` as a cheap **coarse/dominant** phase.
- The **gate computes an ephemeral LOCAL phase** at its chosen locus and picks
  Expander-vs-Stress-Tester on *that*; it advances phase via `updatePhase()` when
  the dominant read shifts.
- Design for **oscillation**, not a one-way latch; apply **hysteresis** (require a
  confident/sustained shift before flipping — a curation burst is a strong
  converging signal); **record transitions** (the click + re-divergence are what
  the Observer and Session Complete care about; flip-count is a health signal).
- Re-divergence then needs **no special detector** — it emerges when the frontier
  moves to a reopening region. Only **backtrack** needs explicit carry-forward.

---

## 5. Show axis

### 5a. The spectrum (Show levels)

| Level | User sees | Backend emits | Content generated? |
|---|---|---|---|
| **Hold** | nothing | offer row persisted only | no |
| **Ambient** | sidebar count/dot · "processing" waveform | `offer` (no anchor) | no |
| **Anchored glow** *(default)* | glow/halo on node + ghost-edge ends | `offer` + `anchor_node_ids` | lazy — on reveal |
| **Invitation** | glow **+ one-line headline** | `offer` + `headline` | no |
| **Pre-generated** | glow with content ready behind it (zero reveal latency) | `spawn`→`chunk`→`done`, held behind glow | eager |

**Lazy-on-reveal is the default** (glow from the cheap gate decision → content
generates on the reveal it invites). Pre-generation is the special case for high
confidence + a waiting user.

### 5b. Glow-first *arrival* + reveal threshold (decided)

Every ghost **arrives** as a glow — it never barges in fully-formed. The **reveal**
is gated by `f(attention state, the action's show-rule)`. Whether reveal is instant
(pre-generated) or generates on the spot (lazy) is invisible backend state.

### 5c. Attention states (two only) × show rules

| State | Inferred (frontend) | Timer / glow | Reveal threshold |
|---|---|---|---|
| **Waiting** | idle right after a deliberate / pull signal | shorter timer · more prominent glow | **low** — a glance/soft-hover or short beat reveals; pre-generate more readily |
| **Thinking** | idle after flow/creation, may resume | longer timer · subtler glow | **high** — only a deliberate hover reveals; protect the flow |

The per-action show-rule modulates on top: hovering an old ghost (24) always
reveals (+ Impact Check); a node-move (5) surfaces the glow but never auto-reveals.
("Away" is dropped — two states only.)

---

## 6. Context snapshot & staleness (the Impact Check)

Every ghost is generated against a **context snapshot** and the canvas then moves
on. On any context-changing action (accept/reject an old ghost, delete a
depended-on node, hover an old ghost), the Observer's impact check classifies the
change: `none` → show as-is; `material` → show-with-warning ("may not capture your
latest change — regenerate?") or re-trigger. This unifies matrix cases 2, 7–8,
12–15, 24, and generalizes the existing "2 new nodes without interaction → ignored"
rule into a real staleness model. Each offer/ghost records the snapshot it was born
from (a context hash or trigger node-sequence index). The Impact Check also gates
the gate (verdict reuse — §4b).

---

## 7. Curation as a rolling signal

Not per-action rules. A single node-move mid-flow is incidental → show-only. Model
an accumulated **interaction-texture** signal = f(recent action sequence,
dwell/time): a *burst* of curation (several moves + a delete + dwell) = the user
consolidating → a **converging signal** that legitimately **triggers** (run the
gate; Stress-Tester likely eligible) *and* is a strong show moment. It is the
action-texture sibling of Attunement's content-texture, and extends "Sequence as
Data" from nodes to interactions. Frontend computes it; backend gets the aggregate.
Threshold to pin down: promote to trigger when `curation actions ≥ N in window W`
or `sustained dwell ≥ D`.

---

## 8. The learning loop — and the trap to avoid

The offer-response is a new learning signal and the seed of the v1.5 **Cognitive
Profile**. **But ignoring an offer ≠ rejecting content.** An ignored glow means
"not now / I'm busy," NOT "that idea was bad." So:

- **Offer-response** (pulled / dismissed / ignored) → a separate **receptivity
  model** that down/up-ranks future intensity. **No `rejection_insights` rows.**
- **Content accept/reject** (on a materialized ghost) → feeds Rejection Insights
  exactly as today, unchanged.

Keeping these two channels clean is the subtle correctness point of the feature.

---

## 9. Streaming protocol amendment (needs ratification)

This touches a **non-negotiable**: CLAUDE.md #8 ("backend never pushes unsolicited
state") and #9 ("Redis pub/sub = ghost node streaming **only**"). The new
sub-materialize signals are strictly *less* intrusive than a ghost (advisory,
ephemeral, dismissable, never touching user nodes/edges). Resolution — **generalize
the channel's contract**; `spawn/chunk/done` become the maximal-intensity subset:

```typescript
type RedisMessage =
  | { type: 'offer';    offer: InterventionOffer }   // NEW — low-intensity, no content
  | { type: 'withdraw'; offer_id: string }            // NEW — AI rescinds (focus moved on)
  | { type: 'spawn';    descriptor: SpawnDescriptor }  // existing
  | { type: 'chunk';    target: string; data: string } // existing
  | { type: 'done' }                                   // existing
```

`src/routes/stream.ts` needs **no change** — it's payload-agnostic (only
special-cases `done`/`ping`). This amendment must be **ratified before code lands**
(via the `update-ai-context` skill: CANVAS-SYNC.md, non-negotiable #9, and the
Observer's new gate role).

---

## 10. Decisions log

### Decided ✓
- Two consent gates: presentation (new) + acceptance (existing).
- Two axes: **Trigger** (generate) vs **Show** (reveal); class-based action taxonomy.
- **Timer:** frontend-owned, visible, pausable; adaptive 5/10s.
- **Attention states:** two only — waiting / thinking (no "away").
- **Glow-first arrival**; reveal = f(state, show-rule).
- **Maturity gate:** dedicated prompt, **full canvas content**, thinking:high, LLM
  judgment; per-agent, locus-specific, evidence-based.
- **Selection: single best agent**; dedup vs. **full** active rejection-insight set.
- **Gate replaces the Orchestrator**; tier → **upgrade offer, never substitute**;
  `question_style` from Attunement.
- **Phase:** local to the frontier (coarse session phase kept); oscillating +
  hysteretic; only **backtrack** carries insight forward.
- **Impact Check / context snapshot** for staleness + gate verdict-reuse.
- **Curation** = rolling interaction-texture signal (not per-action).
- **Learning:** offer-response ≠ content-rejection (separate receptivity model).
- **Redis protocol** generalized (`offer`/`withdraw`) — pending ratification.

### Open ?
- **Proactive Outer-Sub / Articulator** in v1, or keep explicit-edge-only (gate
  over Expander/Stress-Tester +Observer)? *Rec: enable, scoped to strong evidence.*
- **Impact Check on curation** (move/delete `show`) routes through staleness? *Lean yes.*
- **Local phase** adopt as above? *Lean yes.*
- **Phase hysteresis threshold** — confidence + sustained-over-window definition.
- **Level set for v1** — Anchored glow + Invitation first, add Hold/Ambient later?
- **User "interruption tolerance" setting** (DND ↔ Proactive) now or later?

---

## 11. Build plan

See **`story.md`** (same folder) for blast radius, files to touch, the migration,
Inngest events, risks, and the task breakdown. This doc is the authority for the
model and the decisions; `story.md` is the authority for *how* it gets built.
