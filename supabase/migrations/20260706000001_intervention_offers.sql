-- Migration: AI Intervention Spectrum — data foundation (task-01)
--
-- Adds the lifecycle spine for the decide → wait → generate handshake:
--   * intervention_offers      — the persisted offer handle (ephemeral; purged in task-08)
--   * sessions.latest_seq      — monotonic version guard (§4e)
--   * canvases.canvas_version  — context fingerprint / change-detector (§6), bumped by a
--                                DB trigger on BOTH nodes and edges so re-parenting
--                                (edge delete + create) can't slip past a node-only composite.

-- ─────────────────────────────────────────────
-- intervention_offers
-- The persisted handle every later step references by id/seq. Operational state only —
-- durable through the active flow, then purged (session close + TTL). No retention guarantee.
-- ─────────────────────────────────────────────
CREATE TABLE intervention_offers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id           UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_role          TEXT NOT NULL,               -- expander | stress_tester | observer | outer_subconscious | articulator
  trigger_node_id     UUID NOT NULL REFERENCES nodes(id),
  anchor_node_ids     UUID[] NOT NULL DEFAULT '{}',
  seq                 INT NOT NULL,                -- per-session; compared against sessions.latest_seq
  context_fingerprint TEXT NOT NULL,               -- change-detector (canvas_version snapshot), NOT content
  directness          TEXT,                         -- direct | subtle — set at show
  headline            TEXT,                         -- backend-authored — set at show
  status              TEXT NOT NULL DEFAULT 'waiting',  -- waiting | shown | pulled | dismissed | superseded | expired
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  CONSTRAINT intervention_offers_directness_chk
    CHECK (directness IS NULL OR directness IN ('direct', 'subtle')),
  CONSTRAINT intervention_offers_status_chk
    CHECK (status IN ('waiting', 'shown', 'pulled', 'dismissed', 'superseded', 'expired'))
);

-- ─────────────────────────────────────────────
-- sessions.latest_seq — monotonic version guard (§4e)
-- ─────────────────────────────────────────────
ALTER TABLE sessions
  ADD COLUMN latest_seq INT NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────
-- canvases.canvas_version — context fingerprint (§6)
-- ─────────────────────────────────────────────
ALTER TABLE canvases
  ADD COLUMN canvas_version INT NOT NULL DEFAULT 0;

-- Bump the owning canvas's version on any node/edge mutation. Catches re-parenting
-- (edge delete + create) that a node-only (node_count, max updated_at) composite misses.
CREATE OR REPLACE FUNCTION bump_canvas_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    UPDATE canvases SET canvas_version = canvas_version + 1 WHERE id = OLD.canvas_id;
    RETURN OLD;
  ELSE
    UPDATE canvases SET canvas_version = canvas_version + 1 WHERE id = NEW.canvas_id;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_nodes_bump_canvas_version
  AFTER INSERT OR UPDATE OR DELETE ON nodes
  FOR EACH ROW EXECUTE FUNCTION bump_canvas_version();

CREATE TRIGGER trg_edges_bump_canvas_version
  AFTER INSERT OR UPDATE OR DELETE ON edges
  FOR EACH ROW EXECUTE FUNCTION bump_canvas_version();

-- ─────────────────────────────────────────────
-- RLS — owner-scoped via canvas → user_id, like every table
-- ─────────────────────────────────────────────
ALTER TABLE intervention_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intervention_offers: owner access"
  ON intervention_offers FOR ALL
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_intervention_offers_canvas_id  ON intervention_offers(canvas_id);
CREATE INDEX IF NOT EXISTS idx_intervention_offers_session_id ON intervention_offers(session_id);

-- the in-flight offer for a session is read by the single-flight guard + supersession
CREATE INDEX IF NOT EXISTS idx_intervention_offers_in_flight
  ON intervention_offers(session_id, seq) WHERE status = 'waiting';
