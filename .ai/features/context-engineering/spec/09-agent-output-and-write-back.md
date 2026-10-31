# 09 — Agent Output and Write-Back

## 9.1 Output schema [DECIDED]

Agents return **structure, never coordinates**. Layout is done by frontend code from the shape +
edges. Enforce the schema with **tool use** (the output tool's input schema), not by asking for
JSON in prose — this removes parse failures, leaving validation to catch meaning errors only.

Example (stress tester on focus `n1`; edge direction follows `src <type> dst`, file 02):

```json
{
  "nodes": [
    { "temp_id": "t1", "text": "Metered billing makes monthly invoices unpredictable", "type": "claim" },
    { "temp_id": "t2", "text": "Would heavy users churn when bills spike?", "type": "question" }
  ],
  "edges": [
    { "from": "t1", "to": "n1", "type": "contradicts", "label": "unpredictable bills" },
    { "from": "t2", "to": "t1", "type": "questions" },
    { "from": "t2", "to": "n5", "type": "relates_to", "label": "heavy-user segment" }
  ],
  "thread_note": "Stress-tested usage-based billing; flagged bill unpredictability and churn."
}
```

Tool input schema [PROPOSED]:

```json
{
  "type": "object",
  "required": ["nodes", "edges", "thread_note"],
  "properties": {
    "nodes": {
      "type": "array", "maxItems": 7,
      "items": {
        "type": "object", "required": ["temp_id", "text", "type"],
        "properties": {
          "temp_id": { "type": "string", "pattern": "^t[0-9]+$" },
          "text": { "type": "string", "maxLength": 600 },
          "type": { "enum": ["idea", "question", "claim", "evidence", "task", "note"] }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object", "required": ["from", "to", "type"],
        "properties": {
          "from": { "type": "string" },
          "to": { "type": "string" },
          "type": { "enum": ["elaborates", "supports", "contradicts", "depends_on",
                             "example_of", "questions", "alternative_to", "relates_to"] },
          "label": { "type": "string", "maxLength": 140 }
        }
      }
    },
    "thread_note": { "type": "string", "maxLength": 200 }
  }
}
```

Design rules:
- **Two id spaces.** New nodes: `t1`, `t2`, … Existing nodes: the short aliases from the prompt
  (`n1`, `n5`, …; file 08 §8.2).
- **Edges are the only source of structure.** No `parent` field on nodes. Hierarchy = an
  `elaborates` edge from child to parent.
- **Enums** for node `type` and edge `type`, identical to the data model (file 02). Free-text
  relation names are not allowed; the free-text reason goes in `label`.
- **Array order = reading order.** Matters for the sequence shape; layout follows it.
- **`thread_note`** is a one-line record of the contribution, written to `thread_notes` so later
  runs don't repeat it.

## 9.2 Validation (code, before any write) [DECIDED]

1. Every existing-node alias referenced exists in the run's alias map → map to UUID. Unknown
   alias → error (catches hallucinated references).
2. Every edge endpoint is either a mapped existing node or a `temp_id` defined in `nodes`.
3. No self-edges; no duplicate edges (same from/to/type).
4. No cycles among `elaborates` edges (hierarchy must stay a tree/DAG).
5. Node count ≤ cap (7 [PLACEHOLDER]).
6. Every new node is connected to at least one edge [PROPOSED] (no orphans dropped on the canvas).

On failure: retry the LLM call **once** with the validation errors appended. Fail again →
`agent_runs.status = failed`, `error` set, stop. Nothing is written on failure.

*Optional semantic checks* (Jev, file 10 §10.5): drop new nodes that duplicate existing nodes.

## 9.3 Write transaction [DECIDED]

One transaction (Postgres function / RPC, so it is atomic):

1. Insert `nodes` for each new node: real UUID for each `temp_id`, `created_by = agent`,
   `created_by_run = run.id`, no x/y yet (or a provisional position next to the focus).
2. Insert `edges`:
   - new ↔ new: `origin = agent`, `status = accepted`
   - new ↔ existing: `origin = agent`, `status = suggested`
   - existing ↔ existing: `origin = agent`, `status = suggested`
3. Insert `thread_notes` row.
4. Update `agent_runs`: `status = done`, `output`, `referenced_node_ids`, `finished_at`.

**Why suggested:** an edge into the user's own nodes changes how *their* ideas are connected. The
AI should not do that silently (principle P9). The user accepts or rejects (file 03 §3.3).

## 9.4 After the write

1. **Realtime → frontend.** The frontend is subscribed to the canvas's `nodes`, `edges`,
   `agent_runs` and receives the new rows.
2. **Frontend layout.** dagre or ELK, driven by the shape and edges, anchored at the focus node.
   The frontend writes x/y via `supabase-js`.
3. **Write path re-runs.** The node inserts fire the webhook → `embed-node` → embedded and
   counted (file 03). The x/y update fires it again → stops at the hash check, no cost.
4. **Suggested edges** render distinctly (e.g. dashed) until accepted/rejected.
5. **Outcome logging.** When the user keeps, edits, deletes, accepts, or rejects agent output,
   record it on `agent_runs.outcome` (file 12 uses it).

## 9.5 Running the agent call inside Inngest [PROPOSED]

```
run-agent (concurrency key: canvas_id, limit 1)
  step "load"            → read run, focus, canvas
  step "route"           → scope (preset map or Jev), budget category        (file 05)
  step "retrieve"        → strategy-specific retrieval (+ Jev per hop)        (file 06)
  step "assemble"        → prompt + alias map; write context_snapshot         (file 08)
  step "llm-1"           → agent call with tools
  step "expand-1"        → if expand_context called: fetch, log, step "llm-2" (max 2 rounds)
  step "validate"        → file 9.2; on failure one retry step
  step "check" [opt]     → Jev dedupe                                         (file 10)
  step "write"           → transaction 9.3
```

- Inngest memoizes completed steps: if `write` fails and retries, the LLM call is not paid for
  twice.
- Concurrency key `canvas_id` (limit 1) prevents two agents on the same canvas reading each
  other's half-written state.
