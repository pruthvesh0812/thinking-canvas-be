-- Migration B (context-engineering Slice 1c): drop edges.edge_type for good.
--
-- Migration A (20261025000001) made the column optional and the backend stopped
-- reading/writing it. Edges are now just structure + a free-text `label`.
-- IMPORTANT: run this only after the frontend stops sending edge_type in edge
-- inserts. PostgREST rejects unknown columns, so a frontend that still sends it
-- would get errors on every edge insert after this runs.
ALTER TABLE edges
  DROP COLUMN IF EXISTS edge_type;
