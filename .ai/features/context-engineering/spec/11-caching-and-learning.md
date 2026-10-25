# 11 — Caching and Learning

Jev calls cost a tiny fraction of a cent. Caching here buys **latency and consistency**, not
money. Each traversal hop is a Jev round trip (likely around a second or more), so repeated runs
benefit from reuse.

**Overriding rule [DECIDED]: invalidate aggressively.** Recall is the priority. A stale cache that
hides a newly added node is exactly the failure this design exists to prevent. When in doubt,
re-traverse.

## 11.1 Provider prompt caching [PROPOSED — do first, it's nearly free]

Prompt layers are ordered stable-first (file 08 §8.1): system + agent instructions, tools,
canvas intent, summary. Mark the cache breakpoint after the stable prefix using the LLM
provider's prompt-caching feature. No invalidation logic needed on our side.

## 11.2 Whole traversal result per (focus node, preset action) [OPTIONAL]

Cache: the final `loaded_nodes` + stubs for `(canvas_id, focus_node_id, agent, preset_action)`.

- Useful when a user re-runs the same preset on the same node ("more examples" twice).
- **Invalidate** if any node or edge in the traversed region changed (`updated_at` newer than
  the cache entry), or any new edge touches a node in the region. Implementation: store the set
  of node ids and the max `updated_at`; on lookup, one query checks for newer rows or new edges
  touching the set.
- **Never cache free-text tasks.** Decisions depend on exact wording.

## 11.3 Per-edge Jev decisions for preset actions [OPTIONAL]

Table `jev_edge_decisions` (file 02). Key: `(preset_action, agent, edge_id)`, valid while
`edge.updated_at` and `target_node.updated_at` match the stored values.

- "Is this `depends_on` edge relevant for Stress test?" stays true until that edge or its target
  changes, so decisions are reused across runs and across nearby focus nodes.
- Higher hit rate than 11.2.
- Before sending a frontier to Jev, look up cached decisions; send only the misses.
- Free-text tasks: no reuse.

## 11.4 Learn policies instead of caching paths [OPTIONAL — highest long-term value]

Log every run's loaded nodes (with tier, reason, the edge type/direction that reached them) and
the nodes the agent actually referenced in its output (`agent_runs.loaded_nodes`,
`referenced_node_ids`, `expand_context_calls`).

Aggregate per agent × scope × (edge type, direction):
- **Usage rate**: of nodes reached via this edge rule, how often were they referenced?
- **Miss rate**: how often did the agent call `expand_context` for a node reached via this rule
  (meaning it should have been loaded fuller)?

Then:
- High usage → move to `follow`, raise its structural prior; can become a hard rule (no Jev
  call needed).
- Near-zero usage → demote to `mention`.
- Frequent `expand_context` on a preset → that preset's scope is too shallow; move it up.

Result: fewer Jev calls, faster traversals, policies tuned from evidence. This dataset is also
what makes a fine-tuned canvas model possible later, and it cannot be copied by competitors.

## 11.5 What not to cache

- Retrieval for S1 (one indexed query; not worth it).
- Anything keyed on positions (positions are not used).
- Summary content as a substitute for fresh retrieval.
