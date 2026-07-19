-- Migration: AI Intervention Spectrum — receptivity model (task-08)
--
-- Offer-response (dismissed / ignored / "process now") is a timing signal, never
-- a content signal — it must stay out of rejection_insights (§8's stated trap).
-- Adds a small decayed aggregate on sessions that src/lib/intervention.ts reads
-- to tune future show intensity + processing-timer length (§4d, §5).

ALTER TABLE sessions
  ADD COLUMN receptivity NUMERIC(4,3) NOT NULL DEFAULT 0.500
    CHECK (receptivity >= 0 AND receptivity <= 1),
  ADD COLUMN receptivity_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
