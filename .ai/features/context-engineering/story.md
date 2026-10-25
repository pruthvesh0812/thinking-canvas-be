---
feature: "context-engineering"
type: story
created: 2026-10-24
status: draft — decisions agreed in conversation (rev 5); slice 0 not started
git_branch: "ccr-7bd29be2-xp0ss9"
pr_url: "[PLACEHOLDER]"
source_spec: "context-engineering.zip (16 files, README + 01–13 + appendices A/B), supplied 2026-10-21"
---

## What
1. Replace today's recency-tiered serializer and navigation tools with one **retrieve → assemble** layer that
   gives every agent the part of the canvas its task needs, in a form that keeps structure (graph, edge labels,
   the user's context notes). It logs what was shown and gives agents one escape hatch (`expand_context`).
2. Replace the fixed **ghost pair** (context node + question node) with a **ghost structure**: the agent returns a
   set of nodes and edges whose shape follows the content, streamed live in node-edge chunks.

## Why
Agents currently see the canvas through a thread-recency lens (`serializer/index.ts`, ~700 lines), or by choosing
to call 8 navigation tools. `neighborhood.ts` records that they empirically do not call them. The spec's design
(scope × budget routing, graph-first retrieval, stubs, logged runs) fits our problem. Its output side (direct DB
writes, Supabase Realtime) and a few assumptions do not fit our architecture; see "Spec conflicts resolved".

## Product decisions (product owner, 2026-10-21 → 10-24)
- **Four agents:** Expander, Stress-Tester, **General** (new), Observer.
  **Articulator and Outer Subconscious are removed.** No agent is triggered by drawing an edge.
- **Invocation is written text, not a button.** The user addresses an agent in what they write: `@expander`,
  `@stress_tester`, `@observer`, or `@agent` (the General agent; internal role name stays `general`). The backend
  has **no mention concept**: the frontend works out which agent was addressed and sends it as `agent` in the
  request. There are **no presets**: choosing the agent fixes the scope, except for General.
- **There is no separate message store.** What the user writes, including the text that invokes an agent, is either
  a **context entry** (`context_entries` + `context_links`) or a **node's own text**: writing `@expander …` in a node
  invokes the agent just as writing it in a note does. The run request points at that row; the backend reads the task
  text live from it, and later runs see it like any other context.
- **A node's context = its own text + its context entries.** Whenever a node is given to an agent in full, it is
  given as one unit: the node's text plus every visible context entry linked to it. A node is never shown without its
  notes, and a note is never shown away from its node.
- **Text that addresses no agent is not an agent call.** It is context, and reaches agents only when a later run
  retrieves it.
- **Different agents may run at the same time** on the same focus; **the same agent may not** run twice on the same
  focus while its previous run is in progress or its ghosts are still pending.
- **The Observer gets an invocation endpoint now**, temporary name `POST /api/observer/run` (renamed later). It
  still also runs at Session Complete.
- **General agent:** handles requests that are neither "expand this" nor "stress test this", e.g. "compare these
  two points", "give me more detail on this". It has no stance of its own; it answers using retrieved context.
- **Edges are labelled, not typed.** The frontend supplies a free-text `edges.label` (≤80 chars). There is no
  edge-type enum, so the spec's per-agent follow/mention/skip policy (file 07) and type-based structural priors
  (file 06 §6.7) are **out of scope**. Direction stays as drawn: `from_node_id` (parent) → `to_node_id` (child).
- **`edges.edge_type` is dropped** (staged; see Slice 1).
- **All agents are available on every pricing tier.** What paid tiers buy is deferred to a later discussion.
- **The ghost pair is removed.** Output is still a ghost (the user accepts or rejects it before it lands), but its
  shape is decided by the content, not fixed to context + question. Making the shape communicate *what kind* of
  content it is (e.g. a comparison vs a breakdown) is a **separate later session**; this story only builds the
  generic node + edge contract.
- **Streaming stays Redis → SSE**, sent in **node-edge chunks**. A small response may arrive as one chunk; a big one
  arrives as several, so the user sees structure grow.
- **No node cap for now.** The agent uses as many nodes as the response needs to be complete. Sizing rules are a
  later discussion.
- **Rejection reasons are free text from the user, or null.** The fixed `too_abstract` / `too_technical` /
  `skip_for_now` set (and the Observer's `connection_feedback` enum) is replaced by one nullable text reason.

## Decisions
| # | Decision |
|---|---|
| D1 | **Ghost structure over Redis/SSE.** Agents never write to `nodes`/`edges`; the frontend writes accepted ghosts, as today. No Supabase Realtime (non-negotiable #8). |
| D2 | **One run endpoint** `POST /api/agent/run { canvas_id, session_id, agent, focus_node_ids[], source: { type: 'context_entry' \| 'node', id } }` for expander / stress_tester / general, plus the temporary `POST /api/observer/run` (same body). `source` is the row holding the invoking text; the backend reads it live (it must belong to the canvas and be visible under the context visibility rule) and validates `agent` against `AgentRole`. |
| D3 | Edges = structure + free-text label (above). |
| D4 | Prompt ids are the user-visible **`n{nodes.seq}`**; new nodes in the output use temp ids `t1, t2, …`. The serializer's `seq:N` label is retired with the serializer. |
| D5 | Scope classification (General only) sits behind `classify()` in `src/lib/`, implemented with Gemini structured output (single provider, non-negotiable #12). Jev is not in the repo; it can be swapped in behind the interface later. |
| D6 | Replace the serializer tiers and the 8 navigation tools, one agent at a time. `expand_context` is the only retrieval tool. |
| D7 | New `agent_runs` table (the spec's logging table, trimmed). It links to `ai_contributions` rather than replacing it. |
| D8 | Scope by agent: Expander → S1, Stress-Tester → S2, Observer → S3, General → `classify()`. |
| D9 | Thread memory = last N turns across this canvas's agent threads, with accept/reject outcome, read from `agent_threads`. No new `thread_notes` table. |

## Output contract (replaces SpawnDescriptor + ghost pair)
The agent returns structure through a schema (AI SDK structured streaming), never free prose with markers:

```ts
type GhostOutput = {
  nodes: { temp_id: string /* t1… */; content: string }[]
  edges: { from: string /* t* | n{seq} */; to: string; label?: string }[]
}
```

The backend:
1. Streams the structured output and **emits a chunk whenever a node and its edges are complete**: the node plus
   every edge whose endpoints are both already known (existing `n{seq}` or an earlier `t*`). A short answer is
   one chunk.
2. **Validates each chunk before publishing** (spec file 09 §9.2, adapted): every `n{seq}` was shown in the prompt;
   every `t*` is defined; no self-edges or duplicate edges; every new node has at least one edge. No node cap (the
   response takes as many nodes as it needs). Unknown ids are dropped, never guessed.
3. **Mints a `ghost_id` (UUID) per temp id** and maps `n{seq}` back to node UUIDs. LLM ids are never sent to the FE.
4. Publishes over `canvas:stream:${sessionId}`:

| Message | Payload |
|---|---|
| `structure_start` | `run_id`, `agent`, `focus_node_ids` (the FE's anchor halos) |
| `ghost_chunk` | `nodes: [{ ghost_id, content }]`, `edges: [{ from, to, label }]` (from/to are node UUIDs or ghost ids) |
| `structure_done` | `run_id`, plus the persisted thread turn reference for accept/reject |
| `structure_error` | `run_id`, reason (validation failed twice, model error) |

Replaces `spawn` / `node_type` / `chunk` / `done`, the `[NODE_TYPE]`/`[QUESTION]` marker router in
`streaming/tokens.ts`, the 1.5 s spawn-animation sleep, `ContextNodeType` and the `GhostPair` thread turn.
The Observer's anchors/levels format (`observer_structures`/`observer_edges`) folds into this contract. Its
level-+1 rule becomes Observer-specific validation.

## Spec → repo mapping
| Spec | Ours | Status |
|---|---|---|
| canvases.title / goal | `title` / `original_intent` | exists |
| nodes.title (title tier) | `nodes.summary` + `direction_marker` | exists; no new column |
| nodes.embedding | `VECTOR(3072)` + `match_nodes` RPC (must keep `set_aside_at IS NULL`) | exists |
| edges.type | — | **out**: labels only |
| edges.label | `edges.label` | exists |
| edges.origin / status (suggested edges) | ghosts | not needed: AI edges only reach `edges` once the user accepts |
| nodes.token_count | — | **add**, computed in `enrichNode` |
| canvases.token_count_total | — | **not added**: one SUM per run (deletes bypass the backend, so a counter would drift) |
| canvas_events / recent activity | `sessions.node_sequence` + `nodes.created_at` | derive; no table |
| thread_notes | `agent_threads.messages` | exists |
| agent_runs | — | **add** (Slice 2) |
| preset actions | agent chosen in the user's text | no presets |
| node type enum | `direction_marker` | exists |
| output schema (file 09) | ghost structure (above) | adapted: streamed as ghosts, not written to the DB |
| Realtime delivery (file 09 §9.4) | Redis → SSE | kept ours |
| canvas summary (file 04) | — | deferred |
| **context notes** | `context_entries` / `context_links` | **missing from the spec; must be a prompt layer** |
| **rejection insights** | `rejection_insights` | **missing from the spec; non-negotiable #10** |
| set-aside nodes | `nodes.set_aside_at` | **missing from the spec; every retrieval read filters it, and any note linked to it** |

## The node unit
Every retrieval strategy loads nodes as units, and every token count is per unit:

| Tier | What the agent sees for one node |
|---|---|
| full | `n{seq}` + the node's text + all its visible context entries (delimited, oldest first) |
| title | `n{seq}` + `summary` + a count of its notes (e.g. `(2 notes)`), so the agent knows to `expand_context` |
| stub | one line: `n{seq}` + the connecting edge's label + `summary` |

- Unit tokens = node text tokens + note tokens. Notes are written by the frontend with no backend notify, so note
  tokens are counted at run time (one aggregate query), not stored. `nodes.token_count` covers the text only.
- Edges follow the same rule: an edge is its label plus the context entries linked to it.
- When the invoking text is the focus node's own text, it appears once, in the focus unit, and the task layer
  refers to it ("the request is the text of n12") rather than repeating it.
- `expand_context` returns full units.

## Prompt layers (ours)
1. System + agent instructions (constant; non-negotiable #4)
2. Tools: `expand_context`
3. Canvas intent: `title`, `original_intent`, canvas-level notes (delimited data)
4. NEGATIVE CONSTRAINTS from active `rejection_insights` (non-negotiable #10)
5. Thread memory (D9)
6. Focus node(s) as full units (text + notes)
7. Loaded nodes as units at their tier (see "The node unit") + edges with labels + notes on edges
8. Not-loaded stubs (`n40 —"needs legal sign-off"→ …`)
9. Task: the text of the `source` row, or the agent's default task when it adds nothing. A `context_entry` source is
   shown here and left out of its node's unit; a `node` source stays in its unit and is referenced here.

Notes are user data, wrapped in delimiters and read live at assembly (never copied into threads); see
CONTEXT-CAPTURE.md. The task text is user data too; it never reaches a system prompt.

## Blast radius
- **Deleted:** `src/agents/articulator.ts`, `outer-subconscious.ts`; `src/pipeline/articulator-pipeline.ts`,
  `outer-sub-pipeline.ts`; edge routing in `src/routes/canvas-event.ts`; `serializer/neighborhood.ts` (superseded);
  marker router in `streaming/tokens.ts`; `buildSpawnDescriptor`; ghost-pair status logic in `routes/ghost-status.ts`.
- **Rewritten:** `serializer/*` → `src/context/*`; `src/tools/*` (8 → `expand_context`); `lib/tier.ts`; `lib/guards.ts`
  (`canAgentFire` checks pending ghost structures on the focus nodes); `AgentRole`, `EdgeType`, `Edge`, `RedisMessage`,
  `ThreadMessage`, `ghostStatusSchema`; `pipeline/rejection-insights.ts` (input = rejected ghost structure);
  `pipeline/session-complete.ts`; `agents/observer.ts`.
- **New:** `agent_runs`; `POST /api/agent/run`; `POST /api/observer/run` (temporary); `run-agent` Inngest function
  (concurrency key `canvas_id + agent`, limit 1, so different agents run in parallel but the same agent queues; the
  spec's canvas-wide limit guarded against agents reading each other's half-written rows, and ours never write to
  the canvas); `src/context/*` (retrieve, assemble, settings, output stream + validation);
  `agents/general.ts`; `classify()`; `nodes.token_count`.
- **Docs:** CORE-CONCEPTS, AGENT-PIPELINE, SERIALIZATION, CANVAS-SYNC, DATABASE-SCHEMA, FRONTEND-CONTRACT,
  LLM-LAYER, CLAUDE.md non-negotiables #9 and #11 (they name the ghost pair / spawn descriptor). Run
  `update-ai-context` per slice.
- **Frontend (separate repo):** detect which agent the user's text addresses and send the run request with its `source`; stop writing `edge_type` and send `label`;
  render the new stream messages; per-ghost accept/reject; remove Articulator/Outer-Sub gestures.

## Slices
Each slice is vertical (request → Inngest → retrieve → assemble → agent → ghost stream → accept/reject → log),
with tests.

**0. Groundwork:** this story; `src/context/settings.ts` (all spec placeholders in one module); base-branch plan.

**1. Removal + `edge_type` staged drop**
- 1a: delete the two agents, their pipelines, edge routing, types and docs. `AgentRole` loses two members and gains
  `general` (exhaustiveness guards point at every site). `getAvailableAgents` returns all agents for every tier.
- 1b, migration A: `edge_type` becomes nullable and its CHECK is dropped; the backend stops reading and writing it.
- 1c, migration B (**only after the frontend stops sending it**): `DROP COLUMN edge_type`. PostgREST rejects unknown
  columns, so dropping first breaks every frontend edge insert.

**2. `@expander` end to end:** `agent_runs` migration; `POST /api/agent/run`; `run-agent`; S1 retrieval (focus +
  1-hop + ancestor summaries + notes); layered assembly with `n{seq}` ids; negative constraints; the **new ghost
  structure contract** (schema output → chunking → validation → `structure_*` messages → thread turn →
  accept/reject in `ghost-status`); `canAgentFire`. The Expander's first-ever caller, and the slice that retires
  the ghost pair.

**3. `@observer` via `POST /api/observer/run`:** whole-canvas retrieval (S3) and the same output contract,
  replacing `serializeCanvasMap` and the separate observer structure format. Session Complete calls the same path.

**4. Rejection Insights on ghost structures:** migration: `rejection_insights.rejection_reason` becomes free
  nullable text (CHECK and the category XOR dropped; `connection_feedback` folds into it). The engine derives severity
  and insight points from the user's text. **A null reason is recorded as an outcome but generates no NEGATIVE
  CONSTRAINT** (decided). Insights still inject as NEGATIVE CONSTRAINTS.

**5. `expand_context`:** one tool (≤2 calls, ≤5 ids, only ids shown in the prompt), logged on the run. Replaces the
  navigation tools.

**6. `@stress_tester` (S2):** `nodes.token_count` + backfill script (like `backfill:enrichment`); budget check;
  whole canvas when it fits, otherwise region + stubs.

**7. `@agent` (General):** `agents/general.ts`; `classify()` → S1/S2/S3, going one scope deeper when unsure; focus =
  0..n selected/addressed nodes (0 = canvas-wide).

**8. Cleanup:** delete the old serializer, tier code, unused tools and ghost-pair remnants once no agent uses them.

**9. Eval harness:** 30–50 fixtures with labelled needed-nodes; metrics from spec file 12. Gate for Slice 10.

**10. Deferred:** skeleton/medium strategy, semantic region, rolling summary, guided traversal, caches. Build when
  real canvases outgrow the whole-canvas strategy (the model context window is ~1M tokens).

**Separate session (not in this story):** making the ghost structure's shape tell the user what kind of content
it is.

## Risks
- Dropping `edge_type` breaks the frontend if the steps run in the wrong order (Slice 1b/1c).
- The new stream contract is a breaking FRONTEND-CONTRACT change; the frontend repo is not built yet, so announce it
  before Slice 2 ships rather than versioning it.
- Structured streaming emits partial objects; a chunk must only be published once its node is final and its edges
  resolve, or the FE renders half-validated ghosts.
- Existing `agent_threads` for the two removed roles and existing `ghost_pair` turns become legacy rows. Leave them;
  readers must tolerate them.
- `ai_contributions.agent_role` and `agent_threads.agent_role` are unconstrained TEXT, so the roster change needs no
  migration; confirm against the live DB.
- Context notes and the task text are user text inside prompts, so they are an injection surface. Keep them delimited,
  never in the system prompt.
- Branch base: `ccr-7bd29be2-xp0ss9` = the pivot branch (PR #18, still open; `main` at `cbda6d9`). Everything here
  depends on the pivot's schema (`nodes.seq`, `context_*`).

## Open questions
1. **Accept/reject granularity — decided 2026-10-26:** accept is **per node**. Ghost nodes carry `depth`; the frontend
   shows depth 1 first and reveals deeper levels on click (everything is already generated, no extra call).
   **Rejecting a node asks the user: delete its whole subtree, or keep the subtree hanging for later use.** Still to
   pin down when `ghost-status` is built: what "hanging for later use" means (stays as pending ghosts? re-attached to
   what, since its parent is gone?), what happens to a hidden child of an accepted node, and the `ghost-status`
   payload (a node id + `reject_scope: 'node' | 'subtree'`).
2. **Response sizing and chunk threshold:** deferred (no cap for now).
3. **Paid tiers:** deferred.

## Test plan
- Unit: agent → scope map; assembly layer order and token accounting; `n{seq}` ↔ UUID mapping; output validation
  (unknown id, self-edge, duplicate, orphan node); concurrency (same agent + same focus is refused while pending,
  a different agent is allowed); the chunker (a node is emitted only when its edges resolve;
  a small output is one chunk); note visibility (a deleted note, deleted link, set-aside node or unscanned
  attachment never appears); a full unit always carries all its visible notes, a title unit shows the note count;
  a node-text source is shown once; negative constraints always present; `getAvailableAgents` returns every agent for
  every tier.
- Integration (fixture canvases): hub node with >25 neighbours; empty node; notes on node, edge and canvas; a
  set-aside neighbour; a canvas at exactly the budget boundary; a model output that fails validation twice →
  `structure_error`, nothing persisted.
- Slice 1: migration A applies to a DB with existing `question`/`relate` rows; a frontend-style edge insert without
  `edge_type` succeeds.
