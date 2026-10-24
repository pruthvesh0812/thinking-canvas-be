---
feature: "context-engineering"
type: story
created: 2026-10-24
status: draft — decisions D1–D9 agreed in conversation; slice 0 not started
git_branch: "ccr-7bd29be2-xp0ss9"
pr_url: "[PLACEHOLDER]"
source_spec: "context-engineering.zip (16 files, README + 01–13 + appendices A/B), supplied 2026-10-21"
---

## What
Replace today's recency-tiered serializer and navigation tools with one **retrieve → assemble** layer that
gives every agent the part of the canvas its task needs, in a form that keeps structure (graph + edge labels +
the user's context notes), logs what was shown, and gives agents one escape hatch (`expand_context`).

## Why
Agents currently see the canvas through a thread-recency lens (serializer/index.ts, ~700 lines) or by choosing
to call 8 navigation tools — which `neighborhood.ts` records they empirically do not. The spec's design
(scope × budget routing, graph-first retrieval, stubs, logged runs) fits our problem; its output side and a few
assumptions do not fit our architecture (see "Conflicts resolved").

## Product decisions (made by the product owner, 2026-10-21 → 10-24)
- **Agent roster is four:** Expander, Stress-Tester, **General** (new), Observer.
  **Articulator and Outer Subconscious are removed.**
- **No edge-triggered agents.** Every run has a focus (a node, a set of nodes, or the whole canvas).
- **Edges are labelled, not typed.** The frontend supplies a free-text `edges.label` (≤80 chars). There is no
  edge-type enum, so the spec's per-agent follow/mention/skip policy (file 07) and type-based structural priors
  (file 06 §6.7) are **out of scope**. Direction stays as drawn: `from_node_id` (parent) → `to_node_id` (child).
- **`edges.edge_type` is dropped** (staged — see Slice 1).
- **All agents are available on every pricing tier.** `getAvailableAgents()` stops gating by tier. What a paid
  tier still buys (Rejection Insights, Session Complete learnings) is a separate open question — see Open Questions.
- **General agent** = the free-text agent. Handles requests that are neither "expand this" nor "stress test
  this": "compare these two points", "give me more detail on this", "how does X relate to Y". It has no stance of
  its own; it answers the question using retrieved context.

## Decisions (D1–D9)
| # | Decision |
|---|---|
| D1 | **Keep the ghost model** (SpawnDescriptor → Redis → SSE → accept/reject). Adopt the spec's *input* side only. No agent writes to `nodes`/`edges`; no Realtime. Structured multi-node output is a separate future decision (Observer is the precedent). |
| D2 | **Explicit invocation:** `POST /api/agent/run { canvas_id, session_id, agent, focus_node_ids[], task? }`. Expander/Stress-Tester via presets; General via free text; Observer stays at Session Complete. |
| D3 | Edges = structure + free-text label. See product decisions above. |
| D4 | Prompt ids are the user-visible **`n{nodes.seq}`**, not per-run aliases. Stable across runs and matches the user's own notes. The serializer's `seq:N` label is retired with the serializer. |
| D5 | Scope/intent classification sits behind `classify()` in `src/lib/`, implemented with Gemini structured output (single provider, non-negotiable #12). Jev is not in the repo and is not a dependency; it can be swapped in behind the interface later. |
| D6 | Replace `serializer/index.ts` tiers and the 8 navigation tools, one agent at a time. `expand_context` is the only retrieval tool. |
| D7 | New `agent_runs` table (the spec's logging table, trimmed). It *links* to `ai_contributions` (ghost lifecycle) rather than replacing it. |
| D8 | Preset → agent/scope table lives in one settings module (see Slice 2). |
| D9 | Thread memory = last N turns across this canvas's agent threads, with accepted/rejected status, read from `agent_threads`. No new `thread_notes` table. |

## Spec → repo mapping
| Spec | Ours | Status |
|---|---|---|
| canvases.title / goal | `title` / `original_intent` | exists |
| nodes.title (title tier) | `nodes.summary` + `direction_marker` | exists — no new column |
| nodes.embedding | `VECTOR(3072)` + `match_nodes` RPC (must keep `set_aside_at IS NULL`) | exists |
| edges.label | `edges.label` | exists |
| nodes.token_count | — | **add**, computed in `enrichNode` |
| canvases.token_count_total | — | **not added**; one SUM per run (deletes bypass the backend, a counter would drift) |
| canvas_events / recent activity | `sessions.node_sequence` + `nodes.created_at` | derive; no table |
| thread_notes | `agent_threads.messages` | exists |
| agent_runs | — | **add** (Slice 2) |
| edges.origin / status | — | not needed: AI edges only exist after the user accepts a ghost |
| node type enum | `direction_marker` | exists |
| canvas summary (file 04) | — | deferred |
| **context notes** | `context_entries` / `context_links` | **missing from the spec — must be a prompt layer** |
| **rejection insights** | `rejection_insights` | **missing from the spec — non-negotiable #10** |
| set-aside nodes | `nodes.set_aside_at` | **missing from the spec — every retrieval read filters it, and any note linked to one** |

## Prompt layers (ours)
1. System + agent instructions (constant; non-negotiable #4)
2. Tools: `expand_context` (+ agent-specific)
3. Canvas intent: `title`, `original_intent`, canvas-level notes (delimited data)
4. NEGATIVE CONSTRAINTS from active `rejection_insights` (non-negotiable #10)
5. Thread memory (D9)
6. Focus node(s), full, with their notes
7. Loaded nodes by tier (full / summary-as-title / stub) + edges with labels + notes on edges
8. Not-loaded stubs (`n40 —"needs legal sign-off"→ …`)
9. Task
Notes are user data, wrapped in delimiters, read live at assembly (never copied into threads) — see CONTEXT-CAPTURE.md.

## Blast radius
- **Deleted:** `src/agents/articulator.ts`, `outer-subconscious.ts`; `src/pipeline/articulator-pipeline.ts`,
  `outer-sub-pipeline.ts`; edge routing in `src/routes/canvas-event.ts`; `serializer/neighborhood.ts` (superseded).
- **Rewritten:** `serializer/*`, `src/tools/*` (8 → `expand_context`), `lib/tier.ts`, `AgentRole`, `EdgeType`,
  `SERIALIZATION_RULES`, `Edge` type, `SpawnDescriptor.context_edge/question_edge.edge_type`.
- **New:** `agent_runs`, `POST /api/agent/run`, `run-agent` Inngest function, `src/context/*` (retrieve, assemble,
  settings), `classify()`, `nodes.token_count`.
- **Docs:** CORE-CONCEPTS, AGENT-PIPELINE, SERIALIZATION, DATABASE-SCHEMA, FRONTEND-CONTRACT, LLM-LAYER, CLAUDE.md
  (run `update-ai-context` per slice).
- **Frontend (separate repo):** stop writing `edge_type`; send `label`; stop reading `edge_type` from the spawn
  descriptor; add the agent-run UI; remove Articulator/Outer-Sub affordances (`relate` / `question` edge gestures).

## Slices
Each slice is vertical: route → Inngest → retrieve → assemble → agent → ghost stream → log, with tests.

**0. Groundwork** — this story; `src/context/settings.ts` (all spec placeholders in one module); confirm base-branch plan.
**1. Removal + `edge_type` staged drop**
  - 1a: delete the two agents/pipelines/routing/types/docs; `AgentRole` loses two members (exhaustiveness guards
    will point at every place); `getAvailableAgents` returns all agents.
  - 1b migration A: `edge_type` → nullable, CHECK dropped; backend stops reading/writing it; spawn descriptor stops
    sending it (FRONTEND-CONTRACT change — announce).
  - 1c migration B (**only after the frontend stops sending it**): `DROP COLUMN edge_type`. PostgREST rejects unknown
    columns, so dropping first breaks every frontend edge insert.
**2. Expander on a node** — `agent_runs` migration; `POST /api/agent/run`; `run-agent`; S1 retrieval (focus +
  1-hop + ancestor summaries + notes); layered assembly; `n{seq}` ids; negative constraints; `canAgentFire`.
  Presets: expand / more examples / reframe → Expander. First caller the Expander has ever had.
**3. `expand_context`** — one tool (≤2 calls, ≤5 ids, only ids shown in the prompt), logged on the run; replaces the
  navigation tools for migrated agents.
**4. Stress-Tester (S2)** — `nodes.token_count` (+ backfill script, like `backfill:enrichment`); budget check;
  whole-canvas strategy when it fits, otherwise region + stubs.
**5. General agent** — new `generalAgent` (role `general`); `classify()` → scope S1/S2/S3 with "go one scope
  deeper when unsure"; focus = 0..n selected nodes (0 = canvas-wide).
**6. Observer on the shared retriever (S3)** — retire `serializeCanvasMap` and the tier code.
**7. Eval harness** — 30–50 fixtures with labelled needed-nodes, metrics from spec file 12. Gate for Slice 8.
**8. Deferred** — skeleton/medium, semantic region, rolling summary, guided traversal, caches (build when real
  canvases outgrow the whole-canvas strategy; the model context window is ~1M tokens).

## Risks
- Dropping `edge_type` breaks the frontend if ordered wrong (Slice 1b/1c).
- Existing `agent_threads` for the two removed roles become orphaned rows — harmless, leave them.
- `ai_contributions.agent_role` and `agent_threads.agent_role` are unconstrained TEXT (no CHECK), so no migration
  is needed for the roster change; confirm against the live DB.
- Replacing the serializer changes every agent's prompt at once if done carelessly — hence one agent per slice.
- Context notes are user text inside prompts: injection surface. Keep them delimited, never in the system prompt.
- Branch base: `ccr-7bd29be2-xp0ss9` = the pivot branch (PR #18, still open, `main` at `cbda6d9`). Everything here
  depends on the pivot's schema (`nodes.seq`, `context_*`).

## Open questions
1. **General agent output:** assumed a **ghost pair** (context node + optional question), same as the Expander and
   Stress-Tester. If it should answer in a different form (e.g. a comparison table, multiple nodes), D1 must be revisited.
2. **What do paid tiers buy now?** Agents are no longer gated. Rejection Insights and Session Complete learnings are
   currently Pro+ per CORE-CONCEPTS — keep that, or open them up too?
3. **Presets:** final list and wording of preset actions per agent (Slice 2 needs only the Expander's).
4. **Spec numbers** (budget thresholds, k values, similarity floors) start at the spec's placeholders and are tuned by Slice 7.
5. Whether the Observer should also accept an explicit user invocation, or stay Session-Complete-only.

## Test plan
- Unit: scope/preset map; assembly layer order and token accounting; `n{seq}` id mapping (and rejection of unknown ids);
  note visibility rule (deleted note / deleted link / set-aside node / unscanned attachment never appear);
  negative constraints always present; `getAvailableAgents` returns every agent for every tier.
- Integration (fixture canvases): hub node with >25 neighbours; empty node; node with notes on node, edge and canvas;
  set-aside neighbour; canvas at exactly the budget boundary.
- Slice 1: migration A applies to a DB with existing `question`/`relate` rows; frontend-style insert without `edge_type` succeeds.
