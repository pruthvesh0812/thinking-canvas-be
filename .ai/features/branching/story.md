---
feature: "branching"
type: story
created: 2026-07-03
status: deferred
git_branch: "[future — not scheduled]"
depends_on: "intervention-spectrum"
---

> **Deferred — future release.** This is a placeholder to capture the design intent
> and the blast radius so it isn't lost. It is a **major architectural change** and
> needs its own planning/gatekeeper pass before any code. Not in the
> intervention-spectrum scope.

## What
**Branching as a first-class capability.** A *branch* is an independent line of
thinking that forks from an **anchor node** — it owns its own subtree of
nodes/edges and is explored in parallel **without disturbing the main line or its
sibling branches** (a branch is independent of nodes created after the anchor on
other branches). Both the **AI and the human** can open branches to hold and
compare alternatives.

## Why / origin
Two drivers, one from the intervention-spectrum work and one standalone:

1. **Don't waste a superseded AI response.** When the intervention version guard
   supersedes a stale response (its context snapshot no longer matches the user's
   latest nodes — see `../intervention-spectrum/DESIGN.md` §4e), instead of dropping
   it silently, show a popup: *"This may not be in line with your latest node — but
   it's a valid path from [anchor]. Start a different branch here, independent of
   your nodes after this one?"* The road not taken becomes **explorable** rather than
   discarded.
2. **Explore alternatives without commitment.** The user (or the AI) forks an
   alternative direction from any node and holds several possibilities side by side.

This is the concrete realization of the "phase is local to the frontier" /
"branching-from-any-node" future already anticipated in intervention-spectrum
(DESIGN.md §4c "parallel branch"; §4e version-guard "per key"; §10 open item).

## The model
- A **branch** forks from an **anchor node**; owns a subtree; independent of siblings.
- **Origins:** (a) AI-seeded from a superseded response; (b) human "branch from
  here"; (c) AI-proposed parallel alternatives (generalizes the existing **2–3
  completions, not one** principle from one node's articulations to whole lines of
  thought).
- AI-seeded / AI-proposed branches arrive as **ghost / pending** (the Ghost
  Threshold holds); the human commits which branch(es) to keep.

## Architectural implications (why it's "major")
| Area | Change |
|---|---|
| **Data model** | nodes/edges gain a **branch identity** (fork-anchor + subtree); per-branch trail/sequence; branches independent |
| **Phase** | becomes **per-branch** (each branch has its own diverge/converge) — the intervention version-guard key flips `session → branch` (already designed for this) |
| **Pipeline** | **concurrent** interventions — one in-flight per *branch*, not per session; supersession/version guard keyed by branch |
| **Judge / context** | the judge's canvas-map read **scoped to the branch subtree**; cross-branch comparison becomes an Observer job |
| **Serializer / threads** | branch-aware context serialization; what happens to per-canvas agent threads across branches |
| **Frontend** | render + switch + compare multiple branches; visualize the fork; the "start a branch?" popup on a superseded response |
| **Merge / prune** | new semantics: promote a winning branch, prune siblings, or merge back into the main line |
| **North star / drift** | how `original_intent` + drift detection apply per branch (each branch is still measured against the one north star) |

## Invariant fit-check (Foundation Principles Part III)
- **Ownership split** — AI proposes branches; the **human owns which direction** to
  pursue. ✓
- **Ghost Threshold** — AI-seeded branches are pending until committed. ✓
- **No cognitive atrophy** — choosing among alternatives *requires* a cognitive
  choice; branching reinforces the principle. ✓
- **2–3 completions, not one** — branching generalizes it from a node to a line of
  thought. ✓

## Open questions (for the future planning pass)
- Branch data model: a `branch_id` column + fork-anchor, or a separate branch tree?
- Per-branch trail/sequence semantics; north-star drift across branches.
- Merge / prune interaction, and what happens to agent threads + rejection insights
  / receptivity on merge (scope per branch or per canvas?).
- Multiplayer / shared thinking (Foundation Part IX) if branches are ever shared.

## Dependencies
Builds directly on **intervention-spectrum** — the version guard's per-key design,
the local-phase model, and the superseded / `withdraw` lifecycle are its seams.

## Task Breakdown
Deferred — a dedicated planning/gatekeeper pass produces the tasks before any
implementation begins.
