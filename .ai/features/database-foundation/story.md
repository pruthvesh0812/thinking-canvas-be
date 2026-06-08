---
feature: "database-foundation"
type: story
created: 2026-06-09
status: draft
---

## What
Create all Supabase migration files to provision the complete database schema: 10 tables, pgvector extension, RLS policies on every table, and indexes for common query patterns.

## Why
Every other story depends on the schema. The DB layer (task 4), cursor tools (task 5), serializer (task 6), and all agents read from these tables. Nothing else can be written until the schema exists.

## Blast Radius
| Component | Impact |
|---|---|
| `supabase/migrations/` | All migration files created here |
| Supabase project | All tables provisioned on `npm run migrate` |
| `src/db/database.types.ts` | Regenerated via `npm run gen:types` after migration |

## Tables to Create (in FK order)

```
1. canvases          (user_id FK → auth.users)
2. sessions          (canvas_id FK → canvases)
3. nodes             (canvas_id + session_id FK)
4. edges             (canvas_id + session_id FK)
5. agent_threads     (canvas_id FK → canvases)
6. attunement_state  (canvas_id + session_id FK)
7. rejection_insights (canvas_id + session_id + thread_id FK)
8. ai_contributions  (canvas_id + session_id FK)
9. session_learnings (canvas_id + session_id FK)
10. subscriptions    (user_id FK → auth.users)
```

## Files to Touch
```
NEW (one migration per logical group):
  supabase/migrations/20260609000001_core_canvas_tables.sql
    → canvases, sessions, nodes (with pgvector), edges

  supabase/migrations/20260609000002_agent_tables.sql
    → agent_threads, attunement_state, rejection_insights

  supabase/migrations/20260609000003_audit_tables.sql
    → ai_contributions, session_learnings, subscriptions

  supabase/migrations/20260609000004_rls_policies.sql
    → All RLS policies (in one file for clarity)

  supabase/migrations/20260609000005_indexes.sql
    → All performance indexes
```

## Supabase Migration
Yes — this IS the migration story.

**Key schema notes:**
- `canvases.original_intent` — RLS policy blocks UPDATE on this column
- `nodes.embedding` — `VECTOR(3072)` requires `CREATE EXTENSION IF NOT EXISTS vector`
- `sessions.node_sequence` — `UUID[]` ordered array of node IDs for this session only
- `agent_threads.messages` — `JSONB` array of serialized thread messages
- `agent_threads.active_rejection_insight_ids` — `UUID[]` array of active constraint IDs
- `rejection_insights.severity` — `VARCHAR` enum: `hard_block | approach_pivot | temporal_deferral`
- `rejection_insights.turns_remaining` — `INT` for temporal deferrals (NULL for non-temporal)

## Risks
- pgvector extension must be enabled in Supabase dashboard before migration runs
- `nodes.embedding VECTOR(3072)` — confirm dimension count matches `gemini-embedding-2`
- RLS using `auth.uid()` requires Supabase Auth to be enabled (it is — see ARCHITECTURE.md)

## Task Breakdown
- **task-01:** Core canvas tables (canvases, sessions, nodes, edges) + pgvector extension
- **task-02:** Agent tables (agent_threads, attunement_state, rejection_insights, ai_contributions, session_learnings, subscriptions) + all RLS policies + indexes
