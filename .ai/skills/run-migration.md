---
last-verified: 2026-06-09
stale-after-days: 60
---

# Skill: Create and Run a Supabase Migration

> Load ARCHITECTURE.md → Database Tables before writing any migration.

---

## File location

```
supabase/migrations/<timestamp>_<description>.sql
```

Timestamp format: `YYYYMMDDHHMMSS` (e.g. `20260609120000_create_canvases.sql`)

---

## Running migrations

```bash
npm run migrate        # applies pending migrations via supabase CLI
npm run gen:types      # regenerates TypeScript types from schema after migration
```

---

## Migration template

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_description.sql

-- Enable pgvector if not already enabled (nodes.embedding only)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Create table
CREATE TABLE IF NOT EXISTS table_name (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id   UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES sessions(id),
  user_id     UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_table_name_canvas_id ON table_name(canvas_id);

-- RLS — every table must have RLS enabled
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own data (via canvas → user_id)
CREATE POLICY "Users access own data"
  ON table_name
  FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );
```

---

## Non-negotiables

1. **RLS on every table** — `ALTER TABLE x ENABLE ROW LEVEL SECURITY` always required
2. **Cascade deletes** — child tables reference `canvases(id) ON DELETE CASCADE`
3. **original_intent immutable** — add a policy or check constraint blocking UPDATE on `canvases.original_intent`
4. **pgvector** — `nodes.embedding` is `VECTOR(3072)` — requires `CREATE EXTENSION IF NOT EXISTS vector`
5. **Never drop tables** in a migration without explicit user confirmation

---

## original_intent immutable policy

```sql
-- Block updates to original_intent column
CREATE POLICY "original_intent is immutable"
  ON canvases
  FOR UPDATE
  USING (true)
  WITH CHECK (original_intent = (SELECT original_intent FROM canvases WHERE id = canvases.id));
```

---

## pgvector index (nodes table only)

```sql
-- After inserting enough data, add IVFFlat index for performance
CREATE INDEX IF NOT EXISTS idx_nodes_embedding
  ON nodes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

---

## After running a migration

```bash
npm run gen:types     # regenerates src/db/database.types.ts from Supabase schema
```

Update any affected `src/db/*.ts` files to use the new generated types.
