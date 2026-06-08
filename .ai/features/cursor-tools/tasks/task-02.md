---
feature: "cursor-tools"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement the remaining 4 cursor tools: get_siblings, get_path, get_branch, semantic_promote.

## Files to Touch
```
CREATE:
  src/tools/get-siblings.ts     → sibling nodes sharing same parent node
  src/tools/get-path.ts         → shortest path between two nodes
  src/tools/get-branch.ts       → full branch from a divergence point
  src/tools/semantic-promote.ts → cosine-similar nodes via pgvector
```

## Tool Designs

**get_siblings** — Used by Observer
```typescript
// Input: { canvas_id, node_id }
// Output: { siblings: { node_id, summary, direction_marker }[] }
// Siblings = nodes that share the same incoming parent edge as node_id
```

**get_path** — Used by Articulator
```typescript
// Input: { canvas_id, from_node_id, to_node_id }
// Output: { path: { node_id, summary, edge_type }[], length: number }
// Shortest path via BFS over edges table
```

**get_branch** — Used by Stress-Tester
```typescript
// Input: { canvas_id, branch_root_node_id }
// Output: { branch: { node_id, content, summary, direction_marker }[] }
// All nodes reachable from branch_root following outgoing edges
```

**semantic_promote** — Used by Expander, Stress-Tester
```typescript
// Input: { canvas_id, query_text, exclude_node_ids?: string[], limit?: number }
// Process:
//   1. Generate embedding for query_text via gemini-embedding-2
//   2. Call Supabase RPC match_nodes (pgvector cosine search)
//   3. Skip nodes already at Tier 1 or Tier 2 (full content in thread)
// Output: { promoted: { node_id, content, similarity }[] }
```

## semantic_promote — gemini-embedding-2 call

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const result = await genai.models.embedContent({
  model: 'gemini-embedding-2',
  content: query_text,
})
const embedding = result.embedding.values  // number[] length 3072
```

## Depends On
`db-layer` task-01 + task-02 must be complete. The `match_nodes` Postgres function must exist (add to a migration if not yet created in database-foundation).

## Definition of Done
- [ ] All 4 tools created and typed
- [ ] `semantic_promote` calls Google embedding API and queries pgvector via Supabase RPC
- [ ] `semantic_promote` skips Tier 1/2 nodes (those in `exclude_node_ids`)
- [ ] All tools filter by `canvas_id`
- [ ] `npm run build` compiles with no errors
