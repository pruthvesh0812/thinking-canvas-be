-- Migration: drop the Intervention Spectrum schema (pivot, 2026-10-16)
--
-- The intervention layer (judge → offer → consent timer → show) is removed from
-- the product. This undoes, in dependency order, the three migrations that added it:
--   20260706000001_intervention_offers   — intervention_offers, sessions.latest_seq,
--                                          canvases.canvas_version + bump triggers
--   20260712000001_allocate_session_seq  — allocate_session_seq()
--   20260712000002_session_receptivity   — sessions.receptivity(_updated_at)
--
-- DESTRUCTIVE: offer rows and receptivity scores are discarded. Both were
-- ephemeral operational state by design (offers were purged at session close;
-- receptivity was a timing signal, never content), so no product data is lost.
-- The canvas_version triggers also stop issuing an UPDATE on the canvases row for
-- every node/edge write.
--
-- sessions.current_phase is NOT dropped — it belongs to the original core schema.

DROP TRIGGER IF EXISTS trg_nodes_bump_canvas_version ON nodes;
DROP TRIGGER IF EXISTS trg_edges_bump_canvas_version ON edges;
DROP FUNCTION IF EXISTS bump_canvas_version();

ALTER TABLE canvases DROP COLUMN IF EXISTS canvas_version;

DROP FUNCTION IF EXISTS allocate_session_seq(UUID);

ALTER TABLE sessions
  DROP COLUMN IF EXISTS latest_seq,
  DROP COLUMN IF EXISTS receptivity,
  DROP COLUMN IF EXISTS receptivity_updated_at;

-- Policy and indexes go with the table.
DROP TABLE IF EXISTS intervention_offers;
