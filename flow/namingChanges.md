# Naming changes to make in one go

**Rule (from the owner, 2026-10-31): use camelCase always.** Example: `focus_node_ids` becomes `focusNodeIds`.

Nothing here is changed yet. This is the list to fix together, so the code is not half renamed in between.
From now on, new code should use camelCase. (Exception until decided: names that mirror a database column. See "Needs a decision".)

## Why one go

A rename that touches the API payloads, the stream messages and the stored thread JSON has to land at the same time on the backend
and the frontend (the frontend repo is not built yet, so now is the cheapest moment).

## Needs a decision BEFORE the rename

1. **Database columns.** Postgres columns are snake_case (`canvas_id`, `created_at`...) and the Supabase client returns rows with those
   names. Options: (a) keep columns snake_case and add one mapping layer at the db boundary so everything above it is camelCase,
   (b) rename the columns with a migration (big: every query, RLS policy and the frontend). Recommendation: (a).
2. **String values** (not field names): `'stress_tester'`, `'context_entry'`, `'save_off'`, `'saved_off'`, `'ghost_structure'`,
   `'structure_start'`, `'ghost_chunk'`, `'run_in_progress'`... These are values stored in the database or sent over the wire.
   Decide whether they become `'stressTester'` etc. Recommendation: keep values as they are, only rename field names.
3. **Inngest event names** (`agent/run.requested`) follow the `domain/noun.verb` convention in CLAUDE.md. Recommendation: unchanged.
4. **Stored thread JSON** (`agent_threads.messages`) holds fields like `turn_type`, `ghost_structure`, `node_status` that are already saved.
   Renaming them needs either a data migration or readers that accept both. Pre-existing rows are legacy anyway for some turns.

## Field names to rename (from the work on this branch, with counts of use)

Request payloads (`POST /api/agent/run`, `POST /api/ghost-status`):

| Now | Becomes |
|---|---|
| `canvas_id` | `canvasId` |
| `session_id` | `sessionId` |
| `focus_node_ids` | `focusNodeIds` |
| `ghost_id` | `ghostId` |
| `thread_id` | `threadId` |
| `turn_index` | `turnIndex` |
| `subtree_action` | `subtreeAction` |
| `rejection_reason` | `rejectionReason` |
| `interacted_at` | `interactedAt` |
| `source.type` / `source.id` | unchanged |

Stream messages (`structure_start`, `ghost_chunk`, `structure_done`, `structure_error`) and the types they carry:

| Now | Becomes |
|---|---|
| `run_id` | `runId` |
| `focus_node_ids` | `focusNodeIds` |
| `ghost_id`, `frame_id` | `ghostId`, `frameId` |
| `thread_id`, `turn_index` | `threadId`, `turnIndex` |
| `turn_status` (ghost-status response) | `turnStatus` |

Model output schema (what the model writes, see `src/context/ghost-output.ts` and the Expander system prompt):

| Now | Becomes |
|---|---|
| `temp_id` | `tempId` (also change the prompt examples; the prompt test will catch a mismatch) |
| `frame_id` (if it ever returns) | `frameId` |

Shared types in `types/index.ts` that this work added or touched: `AgentRun.*`, `GhostNode.ghost_id/frame_id`, `LoadedNode.note_count`,
`RetrievalResult.focus_node_ids/canvas_notes`, `GhostStructure turn: run_id, focus_node_ids, node_status`.

Function parameters and local names in the new code (all `src/context/*`, `src/pipeline/execute-run.ts`, `src/routes/agent-run*`,
`src/routes/ghost-status*`, `src/db/agent-runs.ts`, `src/streaming/structure.ts`, `scripts/*`): about 70 uses of `canvas_id`,
39 of `run_id`, 37 of `ghost_id`, 31 of `focus_node_ids`, 23 of `temp_id`, 19 of `session_id`, and the rest of the long tail
(`note_count`, `source_type`, `source_id`, `context_snapshot`, `loaded_nodes`, `referenced_node_ids`, `started_at`, `duration_ms`...).

Scale of the whole job: about 250 distinct snake_case names in `src/` + `types/`, 127 of them in `types/index.ts`.
The older code (db layer, serializer, pipelines from before this branch) is mostly snake_case too, so this is a repo-wide rename, not a patch.

## How to do it safely (when we do it)

1. Decide the four questions above.
2. Add the db-boundary mapping layer first (rows in, camelCase out).
3. Rename types and payload schemas, let `tsc` list every place that breaks, fix them.
4. Update `FRONTEND-CONTRACT.md` §12 and the Expander system prompt examples in the same commit.
5. Run all tests; the prompt-example test and the snapshot test will catch prompt/schema drift.
6. Update the frontend contract note so the frontend repo builds against the new names from day one.

## Names of things (not fields)

| Now | Becomes | Where |
|---|---|---|
| `realDeps` | `executionDependencies` | `src/pipeline/run-agent.ts` (added 2026-10-31, walkthrough Stone 4) |

Same family, for consistency when we do the rename (suggestion, not decided): `ExecuteRunDeps` -> `ExecuteRunDependencies`,
`AgentRunDeps` -> `AgentRunDependencies`, `GhostStatusDeps` -> `GhostStatusDependencies`, `RealCanvasDeps` -> `RealCanvasDependencies`,
and the `deps` parameter -> `dependencies`.

