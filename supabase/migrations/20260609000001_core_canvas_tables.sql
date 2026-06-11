-- Migration: core canvas tables
-- Tables: canvases, sessions, nodes (pgvector), edges

-- pgvector — required for nodes.embedding VECTOR(3072)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────
-- canvases
-- ─────────────────────────────────────────────
CREATE TABLE canvases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id),
  title           TEXT NOT NULL,
  original_intent TEXT NOT NULL,  -- immutable — RLS policy in migration 3
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- sessions
-- ─────────────────────────────────────────────
CREATE TABLE sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id      UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'active',      -- active | closed
  current_phase  TEXT NOT NULL DEFAULT 'diverging',   -- diverging | converging
  node_sequence  UUID[] NOT NULL DEFAULT '{}',        -- ordered node IDs created in this session
  start_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time       TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- nodes
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- edges
-- ─────────────────────────────────────────────
CREATE TABLE edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id     UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  from_node_id  UUID NOT NULL REFERENCES nodes(id),
  to_node_id    UUID NOT NULL REFERENCES nodes(id),
  edge_type     TEXT NOT NULL,  -- logical | doubt | question | associative
  both_existing BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
