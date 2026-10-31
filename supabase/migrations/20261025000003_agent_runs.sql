-- Context-engineering Slice 2: agent_runs.
--
-- One row per agent invocation (expander / stress_tester / general / observer).
-- It is two things at once:
--   1. the job record  -> status says queued / running / done / failed
--   2. the log         -> what the agent was shown, what it said, what the user did with it
--
-- Agents never write nodes/edges (ghosts only reach the canvas when the user accepts),
-- so unlike the spec this table has no "created_by_run" links from nodes/edges.
-- The backend (service role) is the only writer; the owner can read their own runs.
CREATE TABLE agent_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id           UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id          UUID REFERENCES sessions(id) ON DELETE SET NULL,
  agent               TEXT NOT NULL,                 -- expander | stress_tester | general | observer
  focus_node_ids      UUID[] NOT NULL DEFAULT '{}',  -- the nodes the run is anchored on (0 = canvas-wide)
  source_type         TEXT NOT NULL,                 -- context_entry | node : which row holds the invoking text
  source_id           UUID NOT NULL,                 -- id of that row (no FK: polymorphic)
  status              TEXT NOT NULL DEFAULT 'queued',
  scope               TEXT,                          -- S1 | S2 | S3
  loaded_nodes        JSONB,                         -- [{ id, seq, tier, reason }] what the agent was shown
  context_snapshot    TEXT,                          -- the exact prompt sent
  context_tokens      INTEGER,
  output              JSONB,                         -- validated GhostOutput
  referenced_node_ids UUID[],                        -- existing nodes the output pointed at
  outcome             JSONB,                         -- later: what the user accepted / rejected
  error               TEXT,
  thread_id           UUID REFERENCES agent_threads(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  CONSTRAINT agent_runs_status_chk
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  CONSTRAINT agent_runs_source_type_chk
    CHECK (source_type IN ('context_entry', 'node')),
  CONSTRAINT agent_runs_scope_chk
    CHECK (scope IS NULL OR scope IN ('S1', 'S2', 'S3'))
);

-- "Is this agent already running on this canvas?" is asked before every run.
CREATE INDEX idx_agent_runs_canvas_agent_status ON agent_runs (canvas_id, agent, status);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- Read-only for the owner. No write policy on purpose: only the backend writes.
CREATE POLICY "agent_runs: owner read"
  ON agent_runs FOR SELECT
  USING (
    canvas_id IN (
      SELECT id FROM canvases WHERE user_id = auth.uid()
    )
  );
