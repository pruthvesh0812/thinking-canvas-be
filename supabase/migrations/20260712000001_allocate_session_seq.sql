-- Migration: AI Intervention Spectrum — atomic seq allocation (task-05)
--
-- Atomic bump of sessions.latest_seq for the monotonic version guard (§4e).
-- Concurrent Inngest workers must never read-modify-write in application code —
-- a single SQL statement with RETURNING is the race-free path.
--
-- Called via db.rpc('allocate_session_seq', { p_session_id })

CREATE OR REPLACE FUNCTION allocate_session_seq(p_session_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE sessions
  SET latest_seq = latest_seq + 1
  WHERE id = p_session_id
  RETURNING latest_seq;
$$;
