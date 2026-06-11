-- Migration: RLS policies and performance indexes for all 10 tables

-- ─────────────────────────────────────────────
-- Enable RLS on every table (non-negotiable)
-- ─────────────────────────────────────────────
ALTER TABLE canvases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_threads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attunement_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_contributions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_learnings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────
-- canvases: owner access
-- ─────────────────────────────────────────────
CREATE POLICY "canvases: owner access"
  ON canvases FOR ALL
  USING (user_id = auth.uid());

-- original_intent is immutable — block any UPDATE that changes it
CREATE POLICY "canvases: original_intent immutable"
  ON canvases FOR UPDATE
  USING (true)
  WITH CHECK (
    original_intent = (SELECT original_intent FROM canvases WHERE id = canvases.id)
  );


-- ─────────────────────────────────────────────
-- sessions: access via canvas ownership
-- ─────────────────────────────────────────────
CREATE POLICY "sessions: owner access"
  ON sessions FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- nodes: access via canvas ownership
-- ─────────────────────────────────────────────
CREATE POLICY "nodes: owner access"
  ON nodes FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- edges: access via canvas ownership
-- ─────────────────────────────────────────────
CREATE POLICY "edges: owner access"
  ON edges FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- agent_threads: access via canvas ownership
-- ─────────────────────────────────────────────
CREATE POLICY "agent_threads: owner access"
  ON agent_threads FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- attunement_state: access via canvas ownership
-- ─────────────────────────────────────────────
CREATE POLICY "attunement_state: owner access"
  ON attunement_state FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- rejection_insights: access via canvas ownership
-- ─────────────────────────────────────────────
CREATE POLICY "rejection_insights: owner access"
  ON rejection_insights FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- ai_contributions: access via canvas ownership
-- ─────────────────────────────────────────────
CREATE POLICY "ai_contributions: owner access"
  ON ai_contributions FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- session_learnings: access via canvas ownership
-- ─────────────────────────────────────────────
CREATE POLICY "session_learnings: owner access"
  ON session_learnings FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- subscriptions: user owns their own row
-- ─────────────────────────────────────────────
CREATE POLICY "subscriptions: owner access"
  ON subscriptions FOR ALL
  USING (user_id = auth.uid());


-- ─────────────────────────────────────────────
-- Performance indexes
-- ─────────────────────────────────────────────

-- nodes
CREATE INDEX IF NOT EXISTS idx_nodes_canvas_id   ON nodes(canvas_id);
CREATE INDEX IF NOT EXISTS idx_nodes_session_id  ON nodes(session_id);

-- edges
CREATE INDEX IF NOT EXISTS idx_edges_canvas_id   ON edges(canvas_id);
CREATE INDEX IF NOT EXISTS idx_edges_session_id  ON edges(session_id);
CREATE INDEX IF NOT EXISTS idx_edges_from_node   ON edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_to_node     ON edges(to_node_id);

-- sessions
CREATE INDEX IF NOT EXISTS idx_sessions_canvas_id ON sessions(canvas_id);

-- agent_threads — looked up by (canvas_id, agent_role) on every agent call
CREATE INDEX IF NOT EXISTS idx_agent_threads_canvas_role
  ON agent_threads(canvas_id, agent_role);

-- rejection_insights — only active constraints are injected into prompts
CREATE INDEX IF NOT EXISTS idx_rejection_insights_canvas_active
  ON rejection_insights(canvas_id) WHERE active = TRUE;

-- attunement_state
CREATE INDEX IF NOT EXISTS idx_attunement_state_canvas_id  ON attunement_state(canvas_id);
CREATE INDEX IF NOT EXISTS idx_attunement_state_session_id ON attunement_state(session_id);

-- ai_contributions
CREATE INDEX IF NOT EXISTS idx_ai_contributions_canvas_id  ON ai_contributions(canvas_id);
CREATE INDEX IF NOT EXISTS idx_ai_contributions_session_id ON ai_contributions(session_id);

-- session_learnings
CREATE INDEX IF NOT EXISTS idx_session_learnings_canvas_id  ON session_learnings(canvas_id);
CREATE INDEX IF NOT EXISTS idx_session_learnings_session_id ON session_learnings(session_id);

-- subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- Vector index for nodes.embedding is intentionally omitted here.
-- Local Supabase Docker ships pgvector < 0.7.0 which caps indexes at 2000 dims.
-- Production Supabase cloud runs pgvector >= 0.7.0 which supports VECTOR(3072).
-- Run this manually against the production project after first deploy:
--
--   CREATE INDEX idx_nodes_embedding
--     ON nodes USING hnsw (embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
