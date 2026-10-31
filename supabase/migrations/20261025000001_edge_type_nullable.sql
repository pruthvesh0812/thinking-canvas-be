-- Migration A (context-engineering Slice 1b): stage the removal of edges.edge_type.
--
-- Edges are now just structure + a free-text `label`. There is no edge-type enum anymore.
-- We do NOT drop the column yet: the frontend may still send edge_type, and PostgREST
-- rejects unknown columns, so dropping first would break every frontend edge insert.
-- So this migration only makes the column optional:
--   1. allow NULL  -> a frontend insert that leaves edge_type out now succeeds
--   2. drop CHECK  -> no value is enforced any more
-- Existing rows (logical / doubt / question / associative / relate) are left untouched.
--
-- Migration B (Slice 1c) does the real DROP COLUMN, only after the frontend stops sending it.
ALTER TABLE edges
  ALTER COLUMN edge_type DROP NOT NULL;

-- Constraint was added in 20260906000001_edge_relate_type.sql
ALTER TABLE edges
  DROP CONSTRAINT IF EXISTS edges_edge_type_check;

COMMENT ON COLUMN edges.edge_type IS 'DEPRECATED - unused, nullable. Dropped in Slice 1c. Use edges.label.';
