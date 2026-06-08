---
feature: "cursor-tools"
type: story
created: 2026-06-09
status: draft
---

## What
Implement all 8 Mastra cursor tools in `src/tools/` — the read-only graph query functions that agents call to navigate the canvas during inference.

## Why
Without tools, agents receive only the serialized thread context. Cursor tools give agents on-demand access to the live canvas graph — specific nodes, trails, branches, semantic neighbors — without bloating the context window.

## Blast Radius
| Component | Impact |
|---|---|
| `src/tools/*.ts` | 8 new tool files |
| All agent files | Import tools from here |

## Files to Touch
```
CREATE:
  src/tools/get-content.ts        → full content of a node by node_id
  src/tools/get-window.ts         → N most recent nodes (canvas-scoped)
  src/tools/traverse-trail.ts     → linear trail from node following edges
  src/tools/get-big-picture.ts    → all summaries + edge map (Observer)
  src/tools/get-siblings.ts       → sibling nodes sharing parent
  src/tools/get-path.ts           → shortest path between two nodes
  src/tools/get-branch.ts         → full branch from a divergence point
  src/tools/semantic-promote.ts   → cosine-similar nodes via pgvector
```

## Tool → Agent mapping

| Tool | Used by |
|---|---|
| `get_content` | All agents |
| `get_window` | Expander, Observer |
| `traverse_trail` | Expander, Articulator |
| `get_big_picture` | Observer |
| `get_siblings` | Observer |
| `get_path` | Articulator |
| `get_branch` | Stress-Tester |
| `semantic_promote` | Expander, Stress-Tester |

## Key Constraints (from CODING-STANDARDS.md + cursor tool skill)

- All tools filter by `canvas_id` — they see ALL nodes across all sessions on that canvas
- Tools never write to DB — read-only
- `semantic_promote` uses `gemini-embedding-2` (3072-dim) via pgvector RPC `match_nodes`
- `semantic_promote` skips nodes already at Tier 1 or 2 (full content already in thread)
- Load SERIALIZATION.md before writing `semantic_promote` to understand tier logic

## Supabase Migration
No — depends on `database-foundation` being applied.

## Inngest Events
No.

## Risks
- `semantic_promote` requires `match_nodes` Postgres function (pgvector RPC) — verify it exists after migrations
- All tools must use `db` from `src/db/client.ts` — not their own Supabase instance

## Task Breakdown
- **task-01:** get-content, get-window, traverse-trail, get-big-picture
- **task-02:** get-siblings, get-path, get-branch, semantic-promote
