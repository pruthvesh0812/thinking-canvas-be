---
feature: "intervention-spectrum"
type: story
created: 2026-06-29
status: draft
git_branch: "claude/ai-intervention-spectrum-moumhu"
---

> **Model authority:** [`DESIGN.md`](./DESIGN.md) — the full flow, the 24-action
> matrix, the judge/phase/concurrency foundation, and the decisions log. This file
> is the **build plan** only (blast radius · files · migration · events · tasks) and
> defers to DESIGN.md wherever they touch the same thing.

## What
Replace the binary AI-contribution model (full ghost pair **or** nothing) with a
graduated system with two axes — **Trigger** (whether to generate) and **Show**
(how loudly to present) — connected by a **decide → wait → generate** handshake so
the backend never spends a content-agent token until the user lets a visible timer
lapse or approves. See DESIGN.md §2 for the pipeline.

## Why
Adds the missing **presentation** consent gate in front of the existing acceptance
gate (the Ghost Threshold): materializing structure is itself an interruption. The
same change makes generation lazy (cheaper) and unlocks the Stress-Tester (unreachable
today — DESIGN.md §4c).

## Blast Radius
| Component | Impact |
|---|---|
| `types/index.ts` | `InterventionOffer` (+ `seq`, `context_snapshot`, `directness`, `status`); extend `RedisMessage` (`waiting`/`offer`/`withdraw`) |
| `src/agents/orchestrator.ts` → **judge** | Repurpose into the judge: input Attunement + **full canvas-map**, one call → `{ mature, route, locus_node_ids, headroom, confidence }`; single best; dedup vs full rejection-insight set; tier→upgrade-offer (never substitute) |
| `src/agents/observer.ts` | **Reverts to content agent only** — the earlier "gate mode" idea is dropped (the judge holds maturity now) |
| `src/db/sessions.ts` | Wire the dead `updatePhase()` (v1: one-way `diverging→converging` latch + hysteresis); add `latest_seq` for the version guard |
| `src/pipeline/agent-pipeline.ts` | Restructure to: judge → publish `waiting` → `step.waitForEvent` (+timeout) → re-judge-if-changed → generate/stream → publish show. Version guard at the publish boundary |
| `src/lib/intervention.ts` | NEW — show-ruleset `directness = f(state, show-rule)` + the receptivity model |
| `src/streaming/offer.ts` | NEW — `publishWaiting()` / `publishOffer()` / `publishWithdraw()` (mirror of `spawn.ts`) |
| `src/db/intervention-offers.ts` | NEW — persist/read offers; `seq` allocation + `latest_seq` compare; status transitions |
| `src/routes/intervention.ts` | NEW — `POST /api/intervention/trigger` (fires the judge), `/process` (go/defer from the timer), `/dismiss` |
| `src/lib/guards.ts` | `canAgentFire()` counts an in-flight offer; add the single-flight/supersession + version-guard checks |
| `src/mastra.ts` | Swap the Orchestrator registration for the judge |
| `src/index.ts` | Register the new route |
| `src/routes/stream.ts` | **No change** — payload-agnostic; forwards new `RedisMessage` types, only special-cases `done`/`ping` |
| `supabase/migrations/` | NEW — `intervention_offers` table + RLS; `sessions.latest_seq` |
| `.ai/context/CANVAS-SYNC.md`, `CLAUDE.md` | Ratify the protocol amendment + the judge role (via `update-ai-context`) |

## Files to Touch
```
CREATE:
  src/lib/intervention.ts               (show ruleset + receptivity model)
  src/streaming/offer.ts                (waiting / offer / withdraw publishers)
  src/db/intervention-offers.ts         (offers + seq / latest_seq)
  src/routes/intervention.ts            (trigger / process / dismiss)
  supabase/migrations/<ts>_intervention_offers.sql

MODIFY / REPURPOSE:
  src/agents/orchestrator.ts  → the judge (maturity + single-best routing, canvas-map)
  src/agents/observer.ts      → drop any gate-mode role (content agent only)
  src/db/sessions.ts          → wire updatePhase(); add latest_seq
  src/pipeline/agent-pipeline.ts → decide→wait→generate handshake + version guard
  src/lib/guards.ts           → in-flight offer + supersession/version guard
  src/mastra.ts               → register judge, retire orchestrator
  types/index.ts, src/index.ts
```

## Redis / Streaming Protocol (amendment — needs ratification)
Generalize `RedisMessage` (DESIGN.md §9); `spawn/chunk/done` stay as the top rung:
```typescript
| { type: 'waiting';  offer }          // "mature + pipeline waiting" (starts the timer)
| { type: 'offer';    offer }          // low-intensity show (glow / sidebar card)
| { type: 'withdraw'; offer_id }       // supersede / no-longer-mature
```
`stream.ts` unchanged. Amends CLAUDE.md #8/#9 — ratify before code lands.

## Supabase Migration
Yes.
- `intervention_offers`: `id · canvas_id · session_id · agent_role · trigger_node_id ·
  anchor_node_ids uuid[] · seq int · context_snapshot · directness · headline text null ·
  status (waiting|shown|pulled|dismissed|superseded|expired) · created_at · resolved_at` (+ RLS).
- `sessions.latest_seq int not null default 0` (version guard, §4e).

## Inngest Events
| Event | Fired from | Handling |
|---|---|---|
| `canvas/intervention.trigger` | `POST /api/intervention/trigger` (trigger ruleset true) | judge → `waiting` → `step.waitForEvent('canvas/intervention.process', {timeout})` → generate |
| `canvas/intervention.process` | `POST /api/intervention/process` (timer go/lapse or "process now") | resumes the parked run |

(dismiss = plain DB write + receptivity update, no event.)

## Guard & lifecycle
- **Single-flight per session** + **monotonic version guard** (`seq` vs
  `sessions.latest_seq`), re-checked at the publish boundary → stale run aborts (§4e).
- Supersession: new mature judgement bumps `latest_seq`, `withdraw`s + cancels the parked run.
- `waitForEvent` hard **timeout** so abandoned runs don't park forever.
- Frontend keys ghosts by `(anchor_node_id, seq)`.

## Risks
- **Judge cost** — full-canvas + thinking:high on the hot path; bounded by the
  frontend trigger ruleset + snapshot verdict-reuse (§6).
- **Offer/rejection cross-contamination** — deferring a timer ≠ rejecting content;
  keep offer-response out of `rejection_insights` (§8).
- **Stale ordering** — the version guard is mandatory, not optional (§4e).
- **Retiring the Orchestrator** — re-home tier + `question_style`; verify the
  Stress-Tester actually fires once phase transitions land.

## Task Breakdown
- **task-01:** types (+ `seq`/`context_snapshot`/`directness`) + `intervention_offers` migration + `sessions.latest_seq` + RLS
- **task-02:** phase transition — wire `updatePhase()` (v1: one-way `diverging→converging` latch + hysteresis); verify Stress-Tester reachable
- **task-03:** the **judge** (repurpose `orchestrator.ts`): canvas-map input, maturity + single-best, tier upgrade-offer; retire Orchestrator from `mastra.ts`; Observer→content-only
- **task-04:** handshake — `agent-pipeline` restructure (`waiting` → `waitForEvent` → re-judge-if-changed → generate) + `src/streaming/offer.ts` + `intervention` route
- **task-05:** concurrency — `seq`/`latest_seq`, supersession + version guard in `guards.ts` + publish-boundary check
- **task-06:** show ruleset `directness = f(state, show-rule)` + 2×2 surfaces + backend headline; Impact Check (snapshot compare) + staleness warnings
- **task-07:** receptivity + interaction-texture (curation-burst) signals
- **task-08:** doc ratification via `update-ai-context` (CANVAS-SYNC.md + non-negotiable #9 + judge role + phase model)
