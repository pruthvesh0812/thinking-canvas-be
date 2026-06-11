-- Atomic JSONB append for agent_threads.messages
-- Called via db.rpc('append_thread_message', { p_thread_id, p_message })
-- Single SQL statement = no race condition vs read-modify-write in application code.

CREATE OR REPLACE FUNCTION append_thread_message(p_thread_id UUID, p_message JSONB)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE agent_threads
  SET
    messages   = messages || jsonb_build_array(p_message),
    updated_at = NOW()
  WHERE id = p_thread_id;
$$;

-- Atomic decrement for rejection_insights.turns_remaining
-- Automatically deactivates the insight when the count reaches 0.
-- Called via db.rpc('decrement_insight_turns', { p_insight_id })

CREATE OR REPLACE FUNCTION decrement_insight_turns(p_insight_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE rejection_insights
  SET
    turns_remaining = turns_remaining - 1,
    active          = CASE WHEN turns_remaining - 1 <= 0 THEN FALSE ELSE active END
  WHERE id = p_insight_id
    AND turns_remaining IS NOT NULL
    AND turns_remaining > 0;
$$;

-- Atomic array append for sessions.node_sequence
-- Called via db.rpc('append_node_to_sequence', { p_session_id, p_node_id })

CREATE OR REPLACE FUNCTION append_node_to_sequence(p_session_id UUID, p_node_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE sessions
  SET node_sequence = node_sequence || ARRAY[p_node_id]
  WHERE id = p_session_id;
$$;
