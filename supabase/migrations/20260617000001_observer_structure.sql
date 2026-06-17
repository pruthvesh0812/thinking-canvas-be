-- Migration: Observer structure tables + connection-feedback extension on rejection_insights
--
-- The Observer no longer writes a ghost pair directly into a thread. It highlights
-- one or more existing canvas nodes (anchors) and proposes a hierarchical DAG of
-- observation nodes. The user accepts/rejects each EDGE independently, never the
-- structure as a unit.

-- ─────────────────────────────────────────────
-- observer_structures (one row per Observer invocation)
-- ─────────────────────────────────────────────
CREATE TABLE observer_structures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id       UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES sessions(id),
  thread_id       UUID REFERENCES agent_threads(id),
  anchor_node_ids UUID[] NOT NULL,
  nodes           JSONB NOT NULL DEFAULT '[]',   -- ObservationNode[]: {ghost_id, level, node_type, content}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- observer_edges (one row per individually accept/reject-able edge)
-- from_id is an anchor node id OR another observation node's ghost_id.
-- to_id is always an observation node's ghost_id.
-- ─────────────────────────────────────────────
CREATE TABLE observer_edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id  UUID NOT NULL REFERENCES observer_structures(id) ON DELETE CASCADE,
  from_id       UUID NOT NULL,
  to_id         UUID NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- rejection_insights: add a connection-feedback category alongside the
-- existing content category. Exactly one category must be populated per row.
-- ─────────────────────────────────────────────
ALTER TABLE rejection_insights
  ALTER COLUMN rejection_reason DROP NOT NULL,
  ADD COLUMN target_edge_id UUID REFERENCES observer_edges(id) ON DELETE CASCADE,
  ADD COLUMN connection_feedback TEXT;  -- not_related | wrong_direction | too_indirect | already_obvious

ALTER TABLE rejection_insights
  ADD CONSTRAINT rejection_insights_category_xor CHECK (
    (rejection_reason IS NOT NULL AND target_edge_id IS NULL AND connection_feedback IS NULL)
    OR
    (rejection_reason IS NULL AND target_edge_id IS NOT NULL AND connection_feedback IS NOT NULL)
  );

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE observer_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE observer_edges      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "observer_structures: owner access"
  ON observer_structures FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "observer_edges: owner access"
  ON observer_edges FOR ALL
  USING (
    structure_id IN (
      SELECT id FROM observer_structures WHERE canvas_id IN (
        SELECT id FROM canvases WHERE user_id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_observer_structures_canvas_id ON observer_structures(canvas_id);
CREATE INDEX IF NOT EXISTS idx_observer_edges_structure_id   ON observer_edges(structure_id);

-- pending edges are looked up when the user hovers an anchor to reveal the structure
CREATE INDEX IF NOT EXISTS idx_observer_edges_pending
  ON observer_edges(structure_id) WHERE status = 'pending';

-- connection-category insights are only injected into the Observer's own prompt
CREATE INDEX IF NOT EXISTS idx_rejection_insights_target_edge
  ON rejection_insights(target_edge_id) WHERE target_edge_id IS NOT NULL;
