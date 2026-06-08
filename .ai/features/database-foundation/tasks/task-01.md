---
feature: "database-foundation"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Create the migration file for the 4 core canvas tables: `canvases`, `sessions`, `nodes` (with pgvector embedding), and `edges`. These are the tables every other feature depends on.

## Files to Touch
```
CREATE:
  supabase/migrations/20260609000001_core_canvas_tables.sql
```

## Schema Detail

```sql
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- canvases
CREATE TABLE canvases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id),
  title           TEXT NOT NULL,
  original_intent TEXT NOT NULL,  -- immutable — RLS policy added in task-02
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sessions
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id     UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | closed
  current_phase TEXT NOT NULL DEFAULT 'diverging', -- diverging | converging
  node_sequence UUID[] NOT NULL DEFAULT '{}',     -- ordered IDs created in THIS session
  start_time    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time      TIMESTAMPTZ
);

-- nodes
CREATE TABLE nodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id        UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id       UUID NOT NULL REFERENCES sessions(id),
  owner            TEXT NOT NULL DEFAULT 'human',  -- human | ai
  content          TEXT,
  summary          TEXT,                            -- gemini-2.5-flash directional summary
  direction_marker TEXT,                            -- establishes | questions | contradicts | explores
  embedding        VECTOR(3072),                    -- gemini-embedding-2
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- edges
CREATE TABLE edges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id      UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id     UUID NOT NULL REFERENCES sessions(id),
  from_node_id   UUID NOT NULL REFERENCES nodes(id),
  to_node_id     UUID NOT NULL REFERENCES nodes(id),
  edge_type      TEXT NOT NULL,  -- logical | doubt | question | associative
  both_existing  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Depends On
None — first migration.

## Definition of Done
- [ ] `npm run migrate` applies migration with no errors
- [ ] `canvases`, `sessions`, `nodes`, `edges` tables exist in Supabase
- [ ] `nodes.embedding` is `VECTOR(3072)` (verify via Supabase table editor)
- [ ] `sessions.node_sequence` is `UUID[]`
