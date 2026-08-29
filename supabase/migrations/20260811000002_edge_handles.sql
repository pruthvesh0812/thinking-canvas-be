-- Migration: edge handles
-- Adds from_handle, to_handle to edges so the frontend can restore the exact
-- side each end of the edge attaches to (a React Flow "handle"). Same
-- ownership model as the position columns on nodes: FE-owned, backend
-- never reads or writes them. Nullable so pre-existing edges stay valid;
-- CHECK constraint permits only TOP/RIGHT/LEFT/BOTTOM (NULL always passes
-- a Postgres CHECK).

ALTER TABLE edges
  ADD COLUMN from_handle TEXT,
  ADD COLUMN to_handle   TEXT;

ALTER TABLE edges
  ADD CONSTRAINT edges_from_handle_check
    CHECK (from_handle IN ('TOP', 'RIGHT', 'LEFT', 'BOTTOM')),
  ADD CONSTRAINT edges_to_handle_check
    CHECK (to_handle IN ('TOP', 'RIGHT', 'LEFT', 'BOTTOM'));

-- No new RLS policy needed — the existing canvas-ownership policy on edges
-- already covers these columns. No index — handles are read as part of the
-- normal per-canvas edge fetch, never filtered on.
