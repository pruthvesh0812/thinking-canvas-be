---
last-verified: 2026-06-09
stale-after-days: 60
---

# Skill: Create a Cursor Tool

> Load SERIALIZATION.md + this file before writing any tool.
> Fetch https://mastra.ai/llms.txt for createTool API if unsure.

---

## What cursor tools are

Cursor tools give agents scoped, read-only access to the canvas graph. Every tool queries by `canvas_id` — they see ALL nodes across ALL sessions on that canvas.

**Tools never write to the database.** They read and return structured text or data. The agent decides what to do with the result.

---

## File location

```
src/tools/<name>.ts   # kebab-case filename, snake_case tool name export
```

---

## Template

```typescript
// src/tools/<name>.ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db } from '../db/client'

export const tool_name = createTool({
  id: 'tool_name',
  description: 'One sentence: what this tool fetches and why an agent would call it.',
  inputSchema: z.object({
    canvas_id: z.string().uuid(),
    // other params...
  }),
  outputSchema: z.object({
    // structured output...
  }),
  execute: async ({ context }) => {
    const { canvas_id } = context
    // Always filter by canvas_id — never session_id
    const { data, error } = await db
      .from('nodes')
      .select('id, content, summary, direction_marker, session_id')
      .eq('canvas_id', canvas_id)
      // additional filters...

    if (error) throw error
    return { /* structured result */ }
  },
})
```

---

## Existing tools — check before creating

| Tool | File | What it fetches |
|---|---|---|
| `get_content` | `src/tools/get-content.ts` | Full content of a specific node by node_id |
| `get_window` | `src/tools/get-window.ts` | Sliding window of N recent nodes on the canvas |
| `traverse_trail` | `src/tools/traverse-trail.ts` | Linear trail from a node following edge direction |
| `get_big_picture` | `src/tools/get-big-picture.ts` | All node summaries + edge map (bird's eye) |
| `get_siblings` | `src/tools/get-siblings.ts` | Sibling nodes connected to same parent |
| `get_path` | `src/tools/get-path.ts` | Shortest path between two nodes |
| `get_branch` | `src/tools/get-branch.ts` | Full branch from a divergence point |
| `semantic_promote` | `src/tools/semantic-promote.ts` | Cosine-similar nodes via pgvector |

---

## semantic_promote specifics

Uses `gemini-embedding-2` (3072-dim). Only promotes nodes NOT already at full content in thread:
- Tier 1 or 2 → already full → skip
- Tier 3 or 4 → summary only → promote

```typescript
// Embedding query via pgvector RPC
const { data } = await db.rpc('match_nodes', {
  query_embedding: embedding,
  canvas_id_filter: canvas_id,
  match_threshold: 0.75,
  match_count: 5,
})
```

---

## Prohibited

```typescript
// ❌ Never filter by session_id in a cursor tool — tools see all sessions
// ❌ Never write to any table from a cursor tool
// ❌ Never use agent.memory — tools use Supabase directly
```
