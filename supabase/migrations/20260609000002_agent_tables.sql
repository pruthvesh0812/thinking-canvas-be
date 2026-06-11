-- Migration: agent and audit tables
-- Tables: agent_threads, attunement_state, rejection_insights,
--         ai_contributions, session_learnings, subscriptions

-- ─────────────────────────────────────────────
-- agent_threads (per canvas — accumulates across sessions)
-- ─────────────────────────────────────────────
CREATE TABLE agent_threads (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id                    UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  agent_role                   TEXT NOT NULL,          -- expander | stress_tester | observer | etc.
  messages                     JSONB NOT NULL DEFAULT '[]',
  active_rejection_insight_ids UUID[] NOT NULL DEFAULT '{}',
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(canvas_id, agent_role)
);

-- ─────────────────────────────────────────────
-- attunement_state (per node creation event)
-- ─────────────────────────────────────────────
CREATE TABLE attunement_state (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id             UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id            UUID NOT NULL REFERENCES sessions(id),
  node_id               UUID REFERENCES nodes(id),
  cognitive_mode        TEXT NOT NULL,        -- exploratory | transitional | declarative
  question_style        TEXT NOT NULL,        -- opening | bridging | closing
  phase_shift_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  confidence            NUMERIC(4,3),         -- 0.000 – 1.000
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- rejection_insights
-- ─────────────────────────────────────────────
CREATE TABLE rejection_insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id        UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id       UUID REFERENCES sessions(id),
  thread_id        UUID REFERENCES agent_threads(id),
  rejection_reason TEXT NOT NULL,    -- too_abstract | too_technical | skip_for_now
  severity         TEXT NOT NULL,    -- hard_block | approach_pivot | temporal_deferral
  insight_points   JSONB NOT NULL DEFAULT '[]',
  turns_remaining  INT,              -- NULL for non-temporal; counts down for temporal_deferral
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ai_contributions (audit log of every ghost pair)
-- ─────────────────────────────────────────────
CREATE TABLE ai_contributions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id  UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id),
  agent_role TEXT NOT NULL,
  ghost_id   UUID,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- session_learnings (unresolved threads carried forward)
-- ─────────────────────────────────────────────
CREATE TABLE session_learnings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id  UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id),
  content    TEXT NOT NULL,
  type       TEXT NOT NULL,  -- question | contradiction | empty_node
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- subscriptions (Stripe sync)
-- ─────────────────────────────────────────────
CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  tier                   TEXT NOT NULL DEFAULT 'free',    -- free | pro | power
  status                 TEXT NOT NULL DEFAULT 'active',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);
