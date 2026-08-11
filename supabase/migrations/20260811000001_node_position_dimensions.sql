-- Migration: node position + dimensions
-- Adds x, y, width, height to nodes so the frontend can restore the exact
-- previous layout on refetch. The frontend owns these columns (same as
-- id/canvas_id/session_id/owner/content — see FRONTEND-CONTRACT.md §3.1);
-- the backend never reads or writes them (agent serialization is
-- content-oriented, not spatial). Nullable so pre-existing rows stay valid;
-- new rows are expected to carry all four.

ALTER TABLE nodes
  ADD COLUMN x      DOUBLE PRECISION,
  ADD COLUMN y      DOUBLE PRECISION,
  ADD COLUMN width  DOUBLE PRECISION,
  ADD COLUMN height DOUBLE PRECISION;

-- No new RLS policy needed — the existing canvas-ownership policy on nodes
-- already covers these columns. No index — position is read as part of the
-- normal per-canvas node fetch, never filtered on.
