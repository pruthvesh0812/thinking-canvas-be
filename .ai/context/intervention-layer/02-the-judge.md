---
last-verified: 2026-07-17
verified-against: intervention-spectrum task-02 (phase latch), task-03 (the judge)
stale-after-days: 30
referenced-from: intervention-layer/README.md, CORE-CONCEPTS.md, AGENT-PIPELINE.md
---

# 02 · The Judge

> The maturity gate and router, in one call. Code: `src/agents/orchestrator.ts`
> (the file keeps its old name; the export is `runJudge` / `judgeAgent`),
> registered in `src/mastra.ts`.

---

## What is done

The old **Orchestrator** was a rule-list router: it took the Attunement output plus
a few canvas signals and picked an agent. It never asked *"is there actually
anything worth saying right now?"* — that judgement lived implicitly in the
prompts, and the pipeline generated regardless.

The **judge replaces the Orchestrator** and absorbs the maturity check. One call
over the Attunement posture **plus the full canvas map (complete node content, not
summaries)** returns:

```
{ mature, route?, locus_node_ids?, headroom?, confidence? }
```

- **`mature`** — is there a specific place where *some* agent's move lands a
  genuine, in-range augmentation? If no agent qualifies → `mature: false` → the run
  ends silently. Nothing is shown.
- **`route`** — the single best agent, never a ranked list. We don't dilute help
  with a second-best suggestion.
- **`locus_node_ids`** — the exact nodes the move lands on. These become the
  offer's `anchor_node_ids`, so they are validated against the DB (invented or
  off-canvas ids are dropped — never trust LLM-emitted ids).

Maturity is **per-agent and locus-specific**, not a global score. For each eligible
agent the judge must find *evidence* — a concrete place and reason:

| Agent | Eligible when | Evidence required |
|---|---|---|
| **Expander** | phase = diverging | a trail with momentum + open space 1–2 jumps ahead |
| **Stress-Tester** | phase = converging | a committed subtree with an attackable surface |
| **Outer Subconscious** | any phase | a concept with a strong non-obvious analog |
| **Articulator** | any phase | two nodes with a real but unnamed relationship |

Model: `models.fast()` with `thinking:high` — the judgement lives in the *wording*
of nodes, which summaries lose, so it reads full content and thinks hard about it.

---

## Why it is done this way

- **Maturity belongs to an LLM reading the actual words, not a rule list.** "Is
  this idea ripe for a stress test?" cannot be answered from node counts and
  phase flags. The preconditions live in the prose.
- **One call, not two.** Folding maturity and routing into a single judgement
  avoids a separate gate agent and keeps the hot path to one strong-model call.
- **Single best, never diluted.** Offering the user a menu of AI suggestions is
  itself noise. The judge commits to one move or holds.
- **Dedup against the full rejection-insight set.** A move the user already refused
  is off the table — the judge never re-offers a refusal.

> This supersedes an earlier idea where the **Observer** ran in a "gate mode." That
> is dropped. The Observer **reverts to a content agent only** (it still produces
> its hierarchical structure at Session Complete and continuously); the judge holds
> the canvas-map + maturity + routing role.

---

## Tier enforcement: upgrade, never substitute

Tier is enforced **server-side**, and it never swaps in a weaker agent. If the
genuine best pick is outside the user's plan, the judge still returns it as the
route and sets a `tier_locked` flag. The pipeline turns that into an **upgrade
offer** on the sidebar card (see [`03-show-ruleset.md`](./03-show-ruleset.md)) —
it does not generate a lesser agent's output.

Why: substituting is *actively wrong*. Giving a converging user the Expander
(because the Stress-Tester is locked) re-diverges them — the opposite of what they
need. Better to offer nothing-but-an-upgrade than the wrong help.

---

## The phase model (v1 = one-way latch)

The judge reads `sessions.current_phase` to gate the two phase-bound agents. But
that column was frozen: it defaulted to `diverging` and **`updatePhase()` had zero
call sites**, so the Stress-Tester (which needs `converging`) could never fire.

v1 fixes exactly this, minimally. Code: `maybeAdvancePhase()` in
`src/db/sessions.ts`.

- Phase is a **single one-way latch**: `diverging → converging`, once per session.
- It flips only on a **confident, sustained** shift from Attunement
  (`phase_shift_suggested` with confidence ≥ `PHASE_SHIFT_MIN_CONFIDENCE`, 0.7) —
  hysteresis so it doesn't chatter on one low-confidence read.
- Once converged, it stays converged for the session.

**Deferred to the branching era:** re-divergence (converging → diverging) and
per-frontier phase (one cluster converged while another is still open). Those need
phase to be *local to a branch* rather than session-global — a branching-time
change, captured in [`.ai/features/branching/story.md`](../../features/branching/story.md).

---

## Relation to the frontend

The judge is entirely backend — the FE never sees it directly. The only FE-visible
consequences are downstream:

- a `waiting` message appears (judge said mature), or nothing does (it held);
- a tier-locked pick surfaces as an **upgrade offer** on the sidebar card, which is
  a conversion surface the FE renders.

The FE must **not** try to pre-judge maturity in its trigger ruleset — that would
double-gate and suppress real offers. Its job ends at "a genuine attention signal
happened; POST /trigger."

---

## Key constraints

- **`canAgentFire()` runs before the judge route** — the non-negotiable guard is
  unchanged in spirit; it now also blocks on an in-flight offer for the same node
  (see [`06-concurrency-and-versioning.md`](./06-concurrency-and-versioning.md)).
- **Tier is server-side only, and never substitutes.** Tier-locked → upgrade offer.
- **Never trust LLM-emitted node ids** — `locus_node_ids` are validated against the
  canvas before they become anchors.
- **The Observer is not a judge candidate** — it is a content agent with its own
  surface, never a route the judge picks.
