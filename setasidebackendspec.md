# Backend spec — "Set aside" (soft-archive) for AI nodes

> Hand-off to the **thinking-canvas-api** session. This is a frontend-driven
> feature; the backend's job is the reasoning-exclusion half, the schema, and
> the contract-type source of truth. UI wording ("Set aside") is a frontend
> concern — the DB/contract names below are deliberately independent of it, so
> don't rename them if the product word changes.

## What the feature is

A user can **set aside** an accepted AI node (`owner='ai'`). A set-aside node:
- is **preserved**, never destroyed (recoverable — the user can restore it);
- is **hidden by default** on the canvas (frontend concern);
- must be **completely excluded from all agent reasoning** while set aside —
  the agents must behave as if it isn't on the canvas.

Restore is the exact inverse: the node re-enters reasoning and the canvas.

This replaces the old "accepted AI nodes are permanent and never removable"
rule with "never *destroyed*, but removable from the active canvas + AI
context, reversibly."

## 1. Schema

Add to the `nodes` table:

```sql
ALTER TABLE nodes ADD COLUMN set_aside_at timestamptz NULL;
-- NULL  => active (default)
-- non-NULL => set aside at that instant
CREATE INDEX nodes_active_idx ON nodes (canvas_id) WHERE set_aside_at IS NULL;
```

Notes:
- Prefer the nullable timestamp over a boolean — it carries *when*, and
  `IS NULL` is the active predicate everywhere.
- Only `owner='ai'` nodes are ever set aside (the frontend never offers it on
  human nodes). A CHECK is optional; the frontend is the gate.

## 2. Reasoning exclusion — THE core requirement

Every place the backend assembles graph state for an agent must filter out
set-aside nodes **and any edge touching one**:

- node context for **Expander / Stress-Tester / Outer-Subconscious /
  Articulator** prompt assembly;
- **Observer** structure building (session-complete);
- any **embedding / vector-neighbor retrieval** (a set-aside node must not be
  returned as a neighbor);
- **node_sequence / directional-summary** passes;
- anything that reads the canvas graph to decide what to spawn.

Predicate: `set_aside_at IS NULL` for nodes; for edges, exclude rows where
`from_node_id` or `to_node_id` is a set-aside node. A set-aside node
contributes nothing to any agent's view of the canvas.

Embeddings / summaries are **kept** (not recomputed, not deleted) so restore
is cheap — they're simply not consulted while set aside.

## 3. Who writes the flag + notify contract

Follows the existing write-then-notify split. `set_aside_at` is a
**user-driven mutation of an existing node**, same class as content/position
edits — so:

- **Frontend writes `set_aside_at` directly to Supabase** (anon key + RLS),
  setting it on set-aside and clearing it (NULL) on restore.
- **Frontend then notifies** via two new `canvas-event` types (IDs only, no
  content), so the backend can react:
  - `node.set_aside` — payload `{ canvas_id, session_id, node_id }`
  - `node.restored`  — payload `{ canvas_id, session_id, node_id }`

Backend reaction can be **minimal at first**: if every reasoning read applies
the §2 filter live, the events need only be logged / no-op'd and the next
agent run is automatically correct. Wire real reactions (drop from any cached
context, ai_contributions bookkeeping, analytics) as needed — but the §2 live
filter is what makes the guarantee true, and must land regardless.

If you'd rather make `set_aside_at` **backend-owned** (frontend posts the
event and the backend does the UPDATE), tell us — the frontend can do it
either way. Default assumption is frontend-writes-direct, matching how
content edits already work.

## 4. RLS

The browser uses the anon key. Confirm the `nodes` UPDATE policy lets a user
set/clear `set_aside_at` on nodes in a canvas they own — same policy surface
as updating `content` / position today. If content updates already pass RLS,
add the column to whatever column allow-list that policy uses (if any).

## 5. Contract types — source of truth

`types/index.ts` in **this (backend) repo** is the source the frontend mirrors
(the frontend's copy is generated, never hand-edited). Please update:

- `Node`: add `set_aside_at: string | null` (backend-written OR
  frontend-written per §3 — either way it lives on the row).
- The `canvas-event` union: add the two `event_type`s from §3.

Once merged, the frontend re-mirrors via its `sync-contract-types` skill.
Flag the change in the frontend session so we pull it.

## 6. Explicitly NOT backend concerns

- The **relate-articulation coupling** (a `relate`-triggered AI node hangs
  from two edges; severing one leg, or setting the node aside, takes both legs
  with it) is handled entirely frontend-side — no backend modelling needed
  beyond §2's "exclude edges touching a set-aside node."
- Hiding/showing set-aside nodes, the toggle, and the on-node label are all
  frontend.

## Acceptance

1. Column + index exist; RLS lets the browser set/clear it.
2. With a node set aside, no agent run (spawn, articulate, observe, neighbor
   search) sees that node or its edges — verified by a reasoning run that
   would otherwise reference it.
3. Restore (`set_aside_at → NULL`) brings it fully back into reasoning with no
   embedding recompute needed.
4. `node.set_aside` / `node.restored` events are accepted by `POST
   /api/canvas-event`.
5. `types/index.ts` updated so the frontend can re-mirror.
