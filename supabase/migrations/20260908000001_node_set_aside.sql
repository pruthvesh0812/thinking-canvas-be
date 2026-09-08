-- Migration: soft-archive ("set aside") for AI nodes
-- A set-aside node is preserved (never destroyed, recoverable via restore) but
-- must be completely excluded from all agent reasoning while aside, and is
-- hidden by default on the canvas (frontend concern). See
-- .ai/context/CORE-CONCEPTS.md and AGENT-PIPELINE.md for the reasoning-
-- exclusion rule this column drives, applied live in every DB read the
-- backend uses to assemble graph state for an agent.

ALTER TABLE nodes ADD COLUMN set_aside_at TIMESTAMPTZ;
-- NULL     => active (default)
-- non-NULL => set aside at that instant

CREATE INDEX IF NOT EXISTS nodes_active_idx ON nodes (canvas_id) WHERE set_aside_at IS NULL;

-- No new RLS policy needed — the existing "nodes: owner access" FOR ALL
-- policy (canvas ownership) already covers UPDATE of this column, same
-- surface as content/x/y/width/height today. Only owner='ai' nodes are ever
-- set aside — the frontend is the gate, no CHECK constraint needed.

-- match_nodes (semantic_promote's pgvector search) must not surface a
-- set-aside node as a neighbour — re-create with the added filter.
CREATE OR REPLACE FUNCTION match_nodes(
  query_embedding    VECTOR(3072),
  canvas_id_filter   UUID,
  match_threshold    FLOAT,
  match_count        INT
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  summary     TEXT,
  similarity  FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    n.id,
    n.content,
    n.summary,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM nodes n
  WHERE
    n.canvas_id = canvas_id_filter
    AND n.embedding IS NOT NULL
    AND n.set_aside_at IS NULL
    AND 1 - (n.embedding <=> query_embedding) >= match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;
