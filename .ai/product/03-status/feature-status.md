---
last-verified: 2026-09-19
verified-against: src/index.ts · src/routes/* · src/pipeline/* · src/agents/*
stale-after-days: 30
referenced-from: known-gaps.md
---

# Feature Status

> One row per feature: is the backend built, is it *reachable* (mounted / wired),
> and what's left. "Built but unreachable" is the trap this ledger exists to
> catch — code can exist in `src/` and still be dead if nothing routes to it.

| Feature | Backend built | Reachable today | Notes |
|---|---|---|---|
| Auth + ownership on all `/api` routes | ✅ | ✅ | `requireAuth` (JWT) + `ownsCanvas`/`ownsSession`; all routes incl. `/api/intervention/*` (2026-09-19). |
| Articulator (relate edge) | ✅ | ✅ | `articulator-pipeline` on `canvas/edge.existing-nodes`. |
| Outer Subconscious (question edge) | ✅ | ✅ | `outer-sub-pipeline` on `canvas/edge.question`. Free-tier gate still owed (known-gaps #3). |
| Observer (session complete) | ✅ | ✅ | `session-complete` pipeline; writes flat `session_learnings` only. |
| Rejection Insights Engine | ✅ | ✅ | `rejection-insights` pipeline on `canvas/ghost.rejected`. |
| **Intervention layer** (judge, decide→wait→generate, Expander, Stress-Tester, Attunement, receptivity, phase latch, tier-locked upgrade offers) | ✅ | ⚠️ **Backend reachable 2026-09-19; awaiting FE** | `interventionRoute` is now mounted behind `requireAuth` (was built but never mounted — the proactive path was dead). The pipeline fires on `canvas/intervention.trigger`, which only the routes send. **The FE must now call `/intervention/trigger` → `/process`\|`/dismiss` and handle `waiting`/`offer`/`withdraw` SSE** — see known-gaps #11. |
| Impact Check / staleness on delete | ✅ | ✅ | `intervention-impact` pipeline on `canvas/intervention.impact` (node/edge/set-aside deletes). |
| Ghost streaming (spawn/chunk/node_type/done) | ✅ | ✅ | Server-side marker split; enriched `done`; hold-open SSE. |
| Observer structure writes + per-edge accept/reject | ❌ | ❌ | Tables + Zod schema exist; no pipeline writes, no `POST /api/observer-edge-status` (known-gaps #7). |
| `ignored` ghost status | ❌ | ❌ | Typed only (known-gaps #9). |
| Velocity-adaptive debounce | ❌ | ❌ | Fixed 10s today (known-gaps #10). |
| Stripe checkout endpoint | ❌ | ❌ | Webhook only; no `/api/stripe/checkout` (known-gaps #5). |
| Branching / session branching | ❌ | ❌ | Deferred (`.ai/features/branching`, `.ai/features/session-branching`). |

## Retired / intentionally-dead wiring

- `canvas/node.created` is emitted by `canvas-event.ts` (node create + new-node
  edge) but has **zero subscribers by design** — the intervention layer replaced
  the ambient auto-fire model with the FE-driven trigger gate. Do **not** add an
  interim consumer to "reconnect" it: that would re-introduce a judge call on
  every node with no consent gate, which is exactly what the layer removed. The
  correct entry point is the FE calling `/api/intervention/trigger` (known-gaps
  #11).
