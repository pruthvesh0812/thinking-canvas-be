-- Migration: add the `relate` edge type
--
-- `relate` is the deliberate "articulate this connection" gesture — the only
-- edge type that triggers the Articulator immediately. Splitting it out means a
-- plain `logical` edge between two existing nodes no longer fires an agent, so
-- rearranging thinking on the canvas is silent (the routing lives in
-- src/routes/canvas-event.ts).
--
-- edges.edge_type was declared plain TEXT with no CHECK — the allowed values
-- lived only in a column comment. This adds the CHECK that was implied, now
-- including `relate`. All existing rows already hold one of the first four
-- values, so the constraint validates without a backfill and none of them
-- change.
ALTER TABLE edges
  ADD CONSTRAINT edges_edge_type_check
    CHECK (edge_type IN ('logical', 'doubt', 'question', 'associative', 'relate'));

-- Keep the column comment in step with the constraint.
COMMENT ON COLUMN edges.edge_type IS 'logical | doubt | question | associative | relate';
