---
feature: "cursor-tools"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement the first 4 cursor tools: get_content, get_window, traverse_trail, get_big_picture.

## Files to Touch
```
CREATE:
  src/tools/get-content.ts       → fetch full content of one node by node_id
  src/tools/get-window.ts        → N most recent nodes on canvas
  src/tools/traverse-trail.ts    → linear trail from node following edges
  src/tools/get-big-picture.ts   → all node summaries + edge adjacency map
```

## Tool Designs

**get_content** — Used by all agents
```typescript
// Input: { canvas_id, node_id }
// Output: { node_id, content, summary, direction_marker, session_id, created_at }
// Query: SELECT from nodes WHERE id = node_id AND canvas_id = canvas_id
```

**get_window** — Used by Expander, Observer
```typescript
// Input: { canvas_id, limit?: number }  (default limit 10)
// Output: { nodes: Node[] }  (most recent first by created_at)
// Always filter by canvas_id — sees ALL sessions
```

**traverse_trail** — Used by Expander, Articulator
```typescript
// Input: { canvas_id, start_node_id, direction: 'forward' | 'backward', max_hops?: number }
// Output: { trail: { node_id, summary, direction_marker, edge_type }[] }
// Traverses edges following from_node_id → to_node_id (forward) or reverse
```

**get_big_picture** — Used by Observer only
```typescript
// Input: { canvas_id }
// Output: { nodes: { node_id, summary, direction_marker }[], edges: { from, to, edge_type }[] }
// Intentionally returns summaries only — Observer gets bird's eye, not full content
```

## Depends On
`db-layer` task-01 must be complete (src/db/client.ts + nodes.ts available).

## Definition of Done
- [ ] All 4 tools created with correct `createTool({ id, description, inputSchema, outputSchema, execute })`
- [ ] All filter by `canvas_id` — no session_id filtering
- [ ] No writes to any table
- [ ] `npm run build` compiles with no errors
