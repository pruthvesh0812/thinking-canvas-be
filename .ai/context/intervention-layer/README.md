---
last-verified: 2026-07-17
verified-against: intervention-spectrum feature (tasks 01–08 shipped)
stale-after-days: 30
referenced-from: CLAUDE.md, CORE-CONCEPTS.md, AGENT-PIPELINE.md, CANVAS-SYNC.md
---

# The Intervention Layer

> **Load this when:** working on *when* and *how loudly* the AI offers help —
> the judge, the decide→wait→generate handshake, offers, the show ruleset, the
> Impact Check, receptivity, or the intervention streaming messages.

This folder is the canonical description of the **intervention layer** — the part
of ThinkingCanvas that decides whether the AI should speak, waits for the human's
permission, and then chooses how gently to surface what it made. It is the core of
the human–AI collaboration model, so it lives in its own folder rather than being
scattered across the general context files.

---

## What the intervention layer is

Before this layer existed, the AI worked in a single binary: on every qualifying
canvas event it either generated a full ghost pair **or** stayed silent. There was
no middle ground and no consent step — materialising a suggestion *was* the
decision.

The intervention layer replaces that binary with a **graduated system built on two
independent questions**:

| Axis | Question | Who answers |
|---|---|---|
| **Trigger** | Should we generate anything at all, right now? | Frontend cheap gate → backend **judge** |
| **Show** | Now that we have something, how loudly do we present it? | Backend **show ruleset** |

Between "decide to generate" and "generate" sits a **consent gate**: the backend
tells the frontend *"something is ready to come"*, a visible timer runs, and the
human can let it lapse, pull it forward, or wave it off. **No content-agent token
is spent until that timer resolves.** This makes help quieter, cheaper, and
consensual all at once.

---

## Why it exists

Three problems, one change:

1. **Interruption is a cost.** Dropping a fully-formed node onto someone's canvas
   mid-thought is itself an interruption, even if the idea is good. The layer adds
   a *presentation* consent gate in front of the existing *acceptance* gate (the
   Ghost Threshold — accept/reject on a materialised ghost).
2. **Generation is expensive.** Judging maturity before generating, and only
   generating after the human okays the timer, makes the whole pipeline lazy — the
   strong model runs on a genuine attention signal, not on every keystroke pause.
3. **Some agents were unreachable.** The Stress-Tester needs a *converging* phase
   that nothing ever set. Fixing the phase model (see [`02-the-judge.md`](./02-the-judge.md))
   is what finally lets it fire.

---

## The two consent gates (don't confuse them)

```
             TRIGGER                    SHOW / present            ACCEPT
  canvas ─▶ [ judge: mature? ] ─wait─▶ [ generate + show ] ─▶ [ accept / reject ]
             decide to help             presentation gate        content gate
                                        (this layer)             (Ghost Threshold,
                                                                  pre-existing)
```

- **Presentation gate (new, this layer):** a deferred timer between decision and
  generation. Deferring or ignoring it means *"not now,"* never *"bad idea."* It
  feeds the **receptivity** model — never `rejection_insights`. See
  [`05-receptivity-and-retention.md`](./05-receptivity-and-retention.md).
- **Acceptance gate (pre-existing):** accept/reject on a materialised ghost. This
  still feeds the **Rejection Insights Engine** exactly as before. Keeping these
  two channels clean is the subtle correctness point of the whole feature.

---

## How intervention happens — the case matrix

Every canvas action falls into one of four **classes**, and each class has a
default answer to *Trigger?* and *Show?*. The frontend owns the cheap trigger gate
(it is the only side that sees raw cursor/dwell events); the backend owns maturity
and everything downstream.

| Class | Meaning | Trigger? | Show? |
|---|---|---|---|
| **flow** | the user is actively producing (typing, creating nodes/edges) | no | no |
| **curation** | the user is arranging/pruning what exists (move, delete, hover) | no | yes |
| **deliberate** | a reflective/meta act (sticky note, toolbox dwell, label hover) | yes | yes |
| **ghost** | the user acts on an existing AI ghost (accept/reject/hover) | special | yes |

### The full per-action matrix

Distilled from the design brainstorm. "Show-only" rows never spend a token — they
just re-surface something already held. Ghost-interaction rows (12–15, 24) run the
**Impact Check** (see [`04-impact-check-and-staleness.md`](./04-impact-check-and-staleness.md)).

| # | Action | Class | Trigger | Show | Notes |
|---|---|---|---|---|---|
| 1 | cursor movement | — | no | no | aggregated into a receptivity/attention hint on the FE; never a discrete event |
| 2 | typing | flow | no | no | |
| 3 | node creation (active) | flow | no | no | feeds context + resets the deferral timer |
| 4 | edge creation (active) | flow | no | no | feeds context + resets the deferral timer |
| 5 | move a node | curation | no | yes | surface a glow of held content; may run the Impact Check |
| 7 | delete a node | curation | no | yes | Impact Check — a delete can invalidate a held ghost |
| 8 | delete an edge | curation | no | yes | Impact Check (catches re-parenting) |
| 9 | sticky-note create | deliberate | yes | yes | a reflection / meta signal |
| 10 | sticky-note move | deliberate | yes | yes | |
| 11 | sticky-note delete | deliberate | yes | yes | |
| 12 | accept an OLD ghost node | ghost | see sub-cases | yes | ↓ |
| 12.1 | · nothing processing | | if judge says mature | no | run the judge; trigger only if it passes |
| 12.2 | · timer showing | | re-trigger | yes | pause the timer; re-judge with the new context |
| 12.3 | · already generating | | let it finish | yes (+warn if impact) | Impact Check decides whether to warn |
| 13 | reject an old ghost node | ghost | as 12 | yes | same three sub-cases |
| 14 | accept a ghost edge (observer) | ghost | as 12 | yes | |
| 15 | reject a ghost edge (observer) | ghost | as 12 | yes | |
| 16 | hover on toolbox | deliberate | yes (after dwell) | yes | dwell-timer, then trigger |
| 17 | click a toolbox component | flow | no | no | |
| 18 | focus on a human node | curation | wait → **v2** | yes | v2: after a dwell, ask consent to expand this node |
| 19 | focus on a NEW ghost node | — | no | already shown | |
| 20 | hover on a human node | curation | no | yes | reveal held content anchored here (Impact Check) |
| 21 | hover on a NEW ghost node | — | no | already shown | |
| 22 | hover an AI edge label | deliberate | yes | yes | |
| 24 | hover on an OLD ghost node | ghost | no | yes (+warn if impact) | Impact Check: clean → show; material → show **with warning** |

> A single mid-flow node-move (#5) is incidental → show-only. But a **burst** of
> curation (several moves + a delete + a dwell) reads as the user *consolidating* —
> a converging signal the frontend can legitimately promote to a real trigger. See
> "curation as a rolling signal" in [`05-receptivity-and-retention.md`](./05-receptivity-and-retention.md).

---

## The files in this folder

Read the README first, then the piece you need:

| File | Covers |
|---|---|
| [`01-trigger-and-handshake.md`](./01-trigger-and-handshake.md) | the decide→wait→generate flow, the deferral timer, `waitForEvent`, the intervention route |
| [`02-the-judge.md`](./02-the-judge.md) | the judge (maturity + single-best routing), retiring the Orchestrator, Observer→content-only, the v1 phase latch |
| [`03-show-ruleset.md`](./03-show-ruleset.md) | directness, the backend headline, the 2×2 surface model, tier-locked upgrade offers |
| [`04-impact-check-and-staleness.md`](./04-impact-check-and-staleness.md) | the context fingerprint, the Impact Check, ghost-interaction cases, delete-impact |
| [`05-receptivity-and-retention.md`](./05-receptivity-and-retention.md) | the receptivity model, the offer lifecycle, purge, "offer-response ≠ content rejection" |
| [`06-concurrency-and-versioning.md`](./06-concurrency-and-versioning.md) | `seq`/`latest_seq`, single-flight, supersession, the publish-boundary version guard |
| [`07-streaming-protocol.md`](./07-streaming-protocol.md) | the `RedisMessage` amendment (`waiting`/`offer`/`withdraw`) and the SSE contract with the frontend |

---

## Build status

Shipped incrementally as `intervention-spectrum` tasks 01–08. The design authority
is [`.ai/features/intervention-spectrum/DESIGN.md`](../../features/intervention-spectrum/DESIGN.md);
these files ratify what actually landed in the code. The deferred follow-on
(re-divergence, per-frontier phase, per-branch guard key) lives in
[`.ai/features/branching/story.md`](../../features/branching/story.md).
