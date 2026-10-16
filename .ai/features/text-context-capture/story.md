---
feature: "text-context-capture"
type: story
created: 2026-10-16
status: in-progress — schema, types and docs built; agent consumption and four open decisions pending
git_branch: "feature/pivot-text-context-capture-2026-10-16T1703"
source: "Text-Only Context Capture — Requirements (Oct 16, 2026, @Pruthvesh) · frontend ask: thinking-canvas-frontend .ai/features/text-context-capture/backend-requirements.md (B1–B14)"
---

## What
The backend half of the frontend's text-only context capture: tables for user notes and their links, a stable node number, edge labels, and removal reasons — plus, in the same change, removal of the Intervention Spectrum so the product no longer carries it.

## Why
Product pivot: typing users had no place to put the "why" behind a node, so agents saw only labels. Voice and text are meant to share one context store. The Intervention Spectrum (judge → offer → consent timer) is no longer part of the product, as of now, and its schema and code were in the way.

## Blast Radius
- **Removed:** `src/routes/intervention.ts`, `src/streaming/offer.ts`, `src/lib/intervention.ts`, `src/db/intervention-offers.ts`, `src/pipeline/agent-pipeline.ts` (the intervention + impact pipelines), `src/agents/orchestrator.ts` (the judge); `waiting`/`offer`/`withdraw` stream messages; `InterventionOffer` types; receptivity + `maybeAdvancePhase` in `src/db/sessions.ts`; the in-flight-offer half of `canAgentFire`; `serializeJudgeContext` + `buildFullRejectionBlock`; `.ai/context/intervention-layer/`.
- **Changed:** `canvas-event` (delete / set-aside / restore events are now acknowledged and ignored — kept in the schema so the frontend can't 400), `session-complete` (no offer purge), `JudgeMapNode` → `ContentMapNode`.
- **DB:** `20261016000001_drop_intervention_layer.sql` (**destructive** — drops `intervention_offers`, `sessions.latest_seq`/`receptivity*`, `canvases.canvas_version`, `allocate_session_seq`, the fingerprint triggers); `20261016000002_context_capture.sql` (new tables, `nodes.seq`, `canvases.next_node_seq`, `edges.label`).

## Status of the frontend's 14 requirements
| # | Requirement | Status |
|---|---|---|
| B1 | `context_entries` | **Done** — client-generated id, soft delete, `updated_at` trigger, 4000-char backstop |
| B2 | `context_links` | **Done**, with deviations: no `canvas_id` on links (RLS goes through the entry); `state` is `active\|deleted`, and a trigger retires links when their node/edge row is deleted; partial unique index on active links |
| B3 | `nodes.seq` | **Done** — trigger + monotonic `canvases.next_node_seq`, backfilled in creation order, never reused/renumbered; arrives with every node select |
| B4 | Decision log | **Cut** — no consumer; entry/link timestamps + `origin` already record it. Revisit if something needs to read it |
| B5 | Removal reasons | **Done** — `component_removal_reasons`, no FK to the deleted component |
| B6 | Notify events | **Dropped for v1** — agents read notes live; the frontend sends nothing. Revisit only if the agent redesign wants a note to trigger a run |
| B7 | Settings endpoint | **Deferred** (settings infrastructure to be discussed). Until then: frontend constants + the DB backstop |
| B8 | "?" rule | **Pending decision** — with the 10 s dwell gone it may be a pure data predicate the frontend computes; backend would add only `edges.owner` and a dismissal column. Needs: does "after the user moves on" survive? |
| B9 | Undo | **No backend work** — undo is in-memory on the frontend; RLS allows the updates |
| B10 | Drafts | **Frontend-local for v1** (overrides the spec's "backend stores drafts") |
| B11 | Live updates | **Not built** — same-browser tabs sync client-side; Realtime stays off (non-negotiable #8); revisit with sharing |
| B12 | Agents read notes | **Pending the agent redesign** — design in `CONTEXT-CAPTURE.md`: live read, active links only, skip set-aside targets, budget for canvas notes, lazy rolling summary only when raw notes exceed it |
| B13 | `edges.label` | **Done** (column + type). Not yet shown to agents |
| B14 | v2 / attachments | Later |

## Verification
`tsc --noEmit` clean; `vitest` 9/9. Both migrations applied on top of the full existing chain on a scratch Postgres 16 (stubs for `auth.*` and pgvector) and exercised with assertions: seq assignment, no reuse after deleting the last node, upsert-of-existing keeps number and burns no counter, client-supplied seq ignored, renumbering rejected, entry/link constraints, retire triggers (incl. `/all`), RLS isolation between two users, canvas cascade, and backfill on a populated database. **Not covered:** pgvector, real Supabase roles, and PostgREST's own upsert SQL (tested the equivalent `ON CONFLICT` at SQL level). `database.types.ts` was hand-edited (no Docker for `supabase gen types`) — regenerate when convenient.

## Left behind on purpose (the agent redesign decides)
Attunement, `sessions.current_phase` + `updatePhase()` (no caller), `lib/tier.ts` (`getAvailableAgents`, now unused), the Expander and Stress-Tester agents (no caller — nothing runs an agent on node creation; `node.created` still sends `canvas/node.created`, which nothing subscribes to), and the model tables that still list an Orchestrator (`ARCHITECTURE.md`, `LLM-LAYER.md`, `LOGGING.md`, `EXTERNAL-DOCS.md`). The `branching` and `session-branching` stories still reference intervention concepts.

## Open Questions
1. What drives agents now, and how do they read notes (B12)?
2. B8: does the "?" wait for the user to move on, or appear immediately? Human-drawn edges only?
3. Rolling summary: lazy-on-read when canvas notes exceed a budget — agreed?
4. Auth: Plane 2/3 still have no user auth (Supabase JWT is only used on direct Supabase calls). Separate story before launch.
