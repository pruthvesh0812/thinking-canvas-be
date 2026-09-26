---
feature: "intervention-spectrum"
type: adr
created: 2026-09-26
status: draft
git_branch: "claude/ai-intervention-spectrum-moumhu"
---

# AI Intervention Spectrum — ADR (why → how)

> **Purpose of this file:** `DESIGN.md` is the model authority and `story.md` is
> the build plan. Neither is optimized for "why did we land here." This file
> walks the pipeline **step by step**, and for each step records the **thinking
> that drove the decision** (why) followed by **what it turns into in code**
> (how) — so the reasoning survives independently of the spec. Section numbers
> in parentheses point back to the DESIGN.md section each step expands.

---

## Step 0 — Trigger ruleset lives on the frontend (DESIGN §4a)

**Why**
Most canvas events — typing, creating a node, creating an edge — are the user
mid-thought, heads-down. Materializing anything here is an interruption, and
running the expensive judge (a strong-model, thinking:high call) on every
keystroke would be wasteful before it's even a UX problem. We need a fast,
free, local screen that filters the obvious non-events before anything costs
money or attention. Deciding *whether the AI should even be asked to look* is a
different question from *whether what it finds is any good* — collapsing the
two into one gate was the original mistake (a single Orchestrator call on
every node-create).

**How**
A frontend rule evaluates each canvas event against three inputs: the event's
**class** from the 24-action taxonomy (flow / curation / deliberate / ghost
interaction — DESIGN §2, §3), the state of the visible **deferral timer**, and
the rolling **interaction-texture** signal (a burst of curation reads as
convergence — §7). If true, `POST` to the backend; if false, defer to the next
event. Maturity is explicitly excluded here — this ruleset only answers "is
this an attention signal," never "is there something worth generating."

---

## Step 1 — Attunement + the Judge, one call (DESIGN §4b)

**Why**
The first design had two LLM calls: an Observer "maturity gate" plus a routing
Orchestrator. That's two round-trips to answer what is really one question:
*is there a specific, evidenced place on this canvas where a specific agent's
move is actually ready?* Splitting maturity from routing also meant duplicating
canvas context across two calls. Folding it into a single judge call halves
latency/cost and matches the real mental model — one arbiter decides both
*whether* and *where*.

Maturity also had to stop being a single global "is the canvas mature" score.
Each content agent (Expander, Stress-Tester, Outer Subconscious, Articulator)
has a genuinely different precondition, and that precondition lives in the
**wording** of actual nodes (an "unnamed relationship," a "weak assumption," an
"exhausted trail") — not in a summary. A generic maturity score would be too
coarse to be honest, and reading it off summaries would lose exactly the
signal it needs.

**How**
Attunement runs first, unchanged, and produces cognitive posture
(`phase_shift_suggested`, `question_style`, etc.). Its output plus the **full
canvas-map** (complete node content, not summaries) goes into the judge — the
repurposed `src/agents/orchestrator.ts` — on the strong model. Output schema:
`{ mature: boolean, route: AgentRole | null, locus_node_ids: string[],
headroom: string | null, confidence: number }`.

Rules baked into this one call:
- **Single best agent only**, never a ranked list — a ranked set dilutes help.
- **Dedup against the full active `rejection_insights` set** — a previously
  refused idea is never re-offered.
- **Tier enforcement happens here, not downstream**: if the genuinely-best
  agent is tier-locked, the judge does **not** substitute a weaker one — e.g.
  swapping in Expander for a tier-locked Stress-Tester is actively wrong,
  because Expander re-diverges, which is exactly what the Stress-Tester's own
  system prompt forbids once the user has converged. Instead the judge flags
  an **upgrade offer** to surface later (§5), which preserves both help
  quality and the tier system's own purpose.
- `question_style` needs no separate handling — agents already read it from
  Attunement's block in the serialized context, so the Orchestrator's old copy
  of it was dead weight.

---

## Step 2 — Persist the `InterventionOffer`, publish `waiting` (DESIGN §4d, §4f)

**Why**
The judge's decision is just a value in memory until something durable
represents "this offer is in flight." The wait that follows can span minutes
and multiple Inngest steps, so there needs to be a shared handle that
supersession logic and the version guard (Step 5) can both reference. Also:
per an earlier explicit decision, "mature + pipeline waiting" must travel
**asynchronously over the existing SSE channel**, not as a held-open synchronous
HTTP response — this matches how `/api/canvas-event` already behaves
(fire-and-return) and avoids inventing a second transport.

**How**
When `mature`, the pipeline — not the judge — **builds and persists** an
`InterventionOffer` row: `agent_role = route`, `anchor_node_ids = locus`, a
freshly allocated **`seq`** (bumps `sessions.latest_seq` — the version-guard
mechanism from Step 5), a **`context_fingerprint`** (the current value of the
canvas version counter, for staleness detection in Step 4), and
`status = 'waiting'`. It then publishes `{ type: 'waiting', offer }` over Redis
→ SSE, and the Inngest run parks on `step.waitForEvent(...)` with a hard
**timeout**, so an abandoned browser tab never leaves a run parked forever.

---

## Step 3 — The processing timer, shown by default (DESIGN §4d)

**Why**
This *is* the presentation consent gate — the actual second axis this whole
feature exists to add. The timer must be visible by default, not hidden until
some threshold, because visibility is what makes it a consent mechanism rather
than a surveillance one: the user should always be able to see and control
that something is about to happen, never have it sprung on them after the
fact. But a user who is actively waiting for help shouldn't be made to sit
through a countdown they didn't ask for — they get a fast-forward instead.

**How**
Frontend-owned (not yet built — the FE repo hasn't started this feature). A
circular countdown, default ~10s, adaptive to 5s on high readiness, reset to
5s on manual defer, back to 10s after a response lands. Supports pause/resume
and a **"process now"** button that skips straight to generation. Backend just
waits for the corresponding `canvas/intervention.process` event — it has no
opinion on how the countdown is rendered.

---

## Step 4 — Re-judge if the context changed, then generate (DESIGN §4d, §6)

**Why**
Because the wait can span real time, the canvas may have materially changed
since the judge decided — nodes added, the anchor deleted, direction changed.
Generating against stale context is worse than not generating at all: it lands
a response that doesn't capture the full picture, which is precisely the
premature-generation failure this whole feature is designed to prevent.
Comparing against a full snapshot to detect this would be expensive and would
store content we have no other reason to keep; we only need to know **whether**
something changed, not **what** changed, so a cheap fingerprint is enough.

**How**
At wake, compare the offer's stored `context_fingerprint` to the canvas's
current version counter. Unchanged → proceed with the cached route, generate
directly (also caps judge cost — an unchanged fingerprint means the prior
verdict is reused, no re-run). Changed → re-run Attunement + the judge; if now
not-mature, abort and publish `{ type: 'withdraw', offer_id }`.

The fingerprint mechanism itself had a real design decision inside it: a
node-only `(node_count, max updated_at)` composite was the first proposal, but
it's blind to a **re-parent** (delete edge A–C, create edge B–C) — zero node
rows change, so the composite would silently miss it. That single case is why
the fingerprint has to be a **DB-trigger-driven version counter on BOTH
`nodes` and `edges`**, not nodes alone.

---

## Step 5 — Concurrency / stale-ordering guard (DESIGN §4e)

**Why**
What happens if an earlier-triggered pipeline — built from a smaller, staler
canvas-map — finishes generating *after* a newer, fresher-context pipeline has
already run? "Earlier = less context" is strictly worse here, so the fresher
result must always win. Cancellation alone isn't reliable, because there's
always a race window: the stale run may already be mid-generation by the time
a cancel signal reaches it.

**How**
**Single-flight per session** via `seq` and `sessions.latest_seq`. A new
mature judgment bumps `latest_seq`, marks the previously-parked offer
`superseded`, publishes `{ type: 'withdraw', offer_id }`, and attempts to
cancel the parked Inngest run — that handles the common case. The
authoritative safety net is the **version guard**: every run re-checks
`offer.seq === latest_seq` at the publish boundary (immediately before
`spawn`, and again before streaming); if a newer `seq` exists, the stale run
**aborts silently**, regardless of what state it's in. Frontend idempotency
backs this up — ghosts are keyed by `(anchor_node_id, seq)`, so a late stale
message for an old `seq` is ignored on arrival too.

This is deliberately built as "latest seq **per key**," where key = `session`
today. When branching-from-any-node ships (deferred — see
[`../branching/story.md`](../branching/story.md)), key becomes
`branch/subtree` and concurrent pipelines on *different* branches simply
coexist — a key swap, not a redesign.

---

## Step 6 — Show ruleset: backend decides directness, frontend decides surface (DESIGN §5)

**Why**
Glow-first arrival is universal — nothing should ever barge in fully formed —
but a countdown-style reveal delay makes no sense for a user who is actively
waiting and asked for input, versus a user deep in unrelated thought who
should barely register that anything happened. This needed to collapse into
something simple enough to actually implement, so a continuous "intensity
dial" was rejected in favor of a 2×2 grid.

**How**
`directness = f(attention_state, per-action show-rule)`. Attention state is
only **waiting** or **thinking** — a third "away" state was explicitly cut for
v1. Waiting → `direct` (prominent glow, low reveal threshold, can also skip
via "process now"); thinking → `subtle` (longer timer, high reveal threshold,
protects flow). The frontend crosses this `directness` value with whether the
anchor node is currently in the viewport: in-view + direct → high-intensity
halo; in-view + subtle → low-intensity halo; off-screen (either directness) →
a sidebar card (direct = a normal card, subtle = a lower-intensity one). The
**backend authors the card's plain-language headline**, because only it knows
what the agent actually produced; a tier-locked pick's upgrade offer (Step 1)
is surfaced here too.

---

## Step 7 — Impact Check on ghost-interaction events (DESIGN §3 rows 12–15/24, §6)

**Why**
Actions that mutate context *after* a ghost has already been generated —
accepting/rejecting an old ghost, deleting a node the ghost depended on — can
invalidate that ghost's relevance. The system shouldn't silently show
now-stale content, but it also shouldn't refuse to show anything; the honest
move is to warn and let the user decide whether to trust or regenerate it.

**How**
Compare the canvas's current fingerprint against the fingerprint the
offer/ghost was born with. `none` (unchanged) → show as-is. `material`
(changed) → show with an explicit warning ("this may not capture your latest
change — regenerate?") or offer a re-trigger. This depends on the canvas-sync
surface actually emitting delete/edit events (Step 9), which does not exist
yet — the check is designed, not wired.

---

## Step 8 — Learning loop: receptivity vs. rejection, kept strictly separate (DESIGN §8)

**Why**
This is the trap to avoid: an ignored, deferred, or dismissed *offer* means
"not right now, I'm busy" — it says nothing about whether the underlying idea
was good. If that signal fed the same `rejection_insights` table used for
actual content rejections, it would wrongly teach agents that a good idea was
bad, and poison future prompts (rejection insights are injected as hard
NEGATIVE CONSTRAINTS — non-negotiable #10). Mixing the two channels would be a
quiet, compounding correctness bug, not a crash — which is exactly the kind of
mistake that's worth a hard architectural wall.

**How**
Offer-response outcomes (pulled / dismissed / ignored / "process now") update
a separate, decayed **receptivity aggregate** on the session/canvas that only
tunes future intensity and timer length. They never write to
`rejection_insights`. Only actual accept/reject on a fully materialized ghost
feeds `rejection_insights`, exactly as it does today — unchanged.

---

## Step 9 — Retention: `InterventionOffer` is ephemeral by design (DESIGN §4f)

**Why**
Why keep a row forever if it's only ever relevant during one live flow? Once
an offer reaches a terminal status, nothing ever reads it again, except for
the brief moment its outcome needs folding into the receptivity aggregate
(Step 8). Treating it as permanent history would be storing content we have
no further use for, and would blur the line between "operational state for an
in-flight decision" and "the durable record that AI helped here" — which
already exists elsewhere.

**How**
`InterventionOffer` is durable *only* through the active flow — durable
because the wait spans multiple Inngest steps/requests and the version guard
needs a shared handle, not because it's meant to persist. At a terminal
status: fold the receptivity signal into the running aggregate first, then
purge the row — swept at session close (via the existing `session-complete`
pipeline) plus a TTL sweep for abandoned `waiting` offers whose
`waitForEvent` already expired. The permanent "AI helped here" record
continues to live on the thread (`ghost_pair`) and the `AiContribution`
audit — never on the offer row itself.

---

## Step 10 — Canvas sync dependency (DESIGN §4g — unresolved, flagged not solved)

**Why**
The judge and the fingerprint both depend on reading accurate, current canvas
state from Supabase — the single source of truth. There is deliberately **no**
"push full FE state to BE" endpoint; that would violate the standing rule that
the backend never pushes or pulls unsolicited state (non-negotiable #8). But
`/api/canvas-event`'s Zod schema only accepts `node.created | edge.created`
today (verified directly in `src/routes/canvas-event.ts`) — there is no
delete, edit, or move/re-parent event type. Without those, both the judge's
canvas-map and the fingerprint can silently read stale state whenever the
frontend deletes or edits something and never tells the backend.

**How (not yet built — a documented dependency, not a solved step)**
The frontend (separate repo, not started) must persist **all** mutations, not
just creates, to Supabase directly. The notify surface — `/api/canvas-event`
or the new `/api/intervention/*` routes — must grow to carry
delete/edit/re-parent event types for the cases the backend must actively
react to (the Impact Check, Step 7). A node content edit also invalidates its
create-time `summary` and `embedding`, so a `node.updated` event must re-run
that enrichment step, not just bump the fingerprint. The existing
write-then-notify ordering contract (FE writes to Supabase, then POSTs) is
preserved unchanged — this dependency only asks it to cover more event types,
not to change shape.

---

## Cross-cutting call: scoping out re-divergence (DESIGN §4c)

**Why**
The original brainstorm assumed phase could go back and forth freely, with
several distinct reasons to re-diverge (checkpoint descent, backtrack,
reframe, parallel branch). Handling that cleanly means phase has to be
**local to the frontier** rather than session-global — one cluster converged
while another is still open — which is a materially bigger change than this
feature's actual, immediate bug: today `sessions.current_phase` is frozen at
`'diverging'` because `updatePhase()` exists in code but has **zero call
sites**, so the Stress-Tester can never fire regardless of anything else in
this design. Fixing that one-way latch unlocks the Stress-Tester now, without
taking on frontier-local phase before there's branching to make it necessary.

**How**
v1 wires `updatePhase()` into the pipeline as a single one-way latch:
`diverging → converging`, driven by Attunement's `phase_shift_suggested`, with
hysteresis so a single noisy signal can't flip it back and forth. Once
converged, it stays converged for the session. Re-divergence, local/per-branch
phase, and oscillation are deferred to the branching era and captured
separately in [`../branching/story.md`](../branching/story.md).

---

## See also

- [`DESIGN.md`](./DESIGN.md) — the model authority: full pipeline diagram, the
  24-action matrix, and the decisions/open-questions log this ADR expands on.
- [`story.md`](./story.md) — the build plan: blast radius, files to touch,
  migration, Inngest events, and the task breakdown (`tasks/task-01.md` …
  `task-09.md`).
- [`../branching/story.md`](../branching/story.md) — the deferred follow-on
  this ADR's "cross-cutting call" section points to.
