---
feature: "database-foundation"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Create migration files for the 6 agent/audit tables (`agent_threads`, `attunement_state`, `rejection_insights`, `ai_contributions`, `session_learnings`, `subscriptions`), all RLS policies, and performance indexes.

## Files to Touch
```
CREATE:
  supabase/migrations/20260609000002_agent_tables.sql
  supabase/migrations/20260609000003_rls_and_indexes.sql
```

## Schema Detail — Agent Tables

```sql
-- agent_threads (per canvas — accumulates across sessions)
CREATE TABLE agent_threads (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id                     UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  agent_role                    TEXT NOT NULL,  -- expander | stress_tester | observer | etc.
  messages                      JSONB NOT NULL DEFAULT '[]',
  active_rejection_insight_ids  UUID[] NOT NULL DEFAULT '{}',
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(canvas_id, agent_role)
);

-- attunement_state (per node creation event)
CREATE TABLE attunement_state (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id             UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id            UUID NOT NULL REFERENCES sessions(id),
  node_id               UUID REFERENCES nodes(id),
  cognitive_mode        TEXT NOT NULL,    -- exploratory | transitional | declarative
  question_style        TEXT NOT NULL,    -- opening | bridging | closing
  phase_shift_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  confidence            NUMERIC(4,3),     -- 0.000 – 1.000
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- rejection_insights
CREATE TABLE rejection_insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id        UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id       UUID REFERENCES sessions(id),
  thread_id        UUID REFERENCES agent_threads(id),
  rejection_reason TEXT NOT NULL,     -- too_abstract | too_technical | skip_for_now
  severity         TEXT NOT NULL,     -- hard_block | approach_pivot | temporal_deferral
  insight_points   JSONB NOT NULL DEFAULT '[]',
  turns_remaining  INT,               -- NULL for non-temporal; counts down for temporal_deferral
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ai_contributions (audit log)
CREATE TABLE ai_contributions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id   UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES sessions(id),
  agent_role  TEXT NOT NULL,
  ghost_id    UUID,
  status      TEXT NOT NULL DEFAULT 'pending',  -- ghost lifecycle status
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- session_learnings (unresolved threads carried forward)
CREATE TABLE session_learnings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id   UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL REFERENCES sessions(id),
  content     TEXT NOT NULL,
  type        TEXT NOT NULL,  -- question | contradiction | empty_node
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- subscriptions (Stripe sync)
CREATE TABLE subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id),
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  tier                 TEXT NOT NULL DEFAULT 'free',  -- free | pro | power
  status               TEXT NOT NULL DEFAULT 'active',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);
```

## RLS Policies (20260609000003_rls_and_indexes.sql)

```sql
-- Enable RLS on ALL tables
ALTER TABLE canvases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges             ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_threads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attunement_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_contributions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;

-- canvases: user owns their own
CREATE POLICY "own canvases" ON canvases FOR ALL
  USING (user_id = auth.uid());

-- original_intent immutable
CREATE POLICY "original_intent immutable" ON canvases FOR UPDATE
  USING (true)
  WITH CHECK (original_intent = (SELECT original_intent FROM canvases WHERE id = canvases.id));

-- All canvas-child tables: access via canvas ownership
-- (repeat pattern for sessions, nodes, edges, agent_threads, etc.)

-- Indexes
CREATE INDEX idx_nodes_canvas_id ON nodes(canvas_id);
CREATE INDEX idx_nodes_session_id ON nodes(session_id);
CREATE INDEX idx_edges_canvas_id ON edges(canvas_id);
CREATE INDEX idx_agent_threads_canvas_role ON agent_threads(canvas_id, agent_role);
CREATE INDEX idx_rejection_insights_canvas_active ON rejection_insights(canvas_id) WHERE active = TRUE;
```

## Depends On
task-01 must be complete — foreign keys reference `canvases`, `sessions`, `nodes`.

## Definition of Done
- [ ] `npm run migrate` applies both migrations with no errors
- [ ] All 10 tables exist in Supabase
- [ ] RLS is enabled on every table (verify via Supabase Auth → Policies)
- [ ] `original_intent` policy blocks UPDATE correctly (test in Supabase SQL editor)
- [ ] `npm run gen:types` generates `src/db/database.types.ts` without errors
