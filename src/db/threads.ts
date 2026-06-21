import { db } from './client.js'
import type { AgentThread, AgentRole, ThreadMessage, GhostStatus } from '../../types/index.js'

export async function getByCanvas(
  canvas_id: string,
  agent_role: AgentRole
): Promise<AgentThread | null> {
  const { data, error } = await db
    .from('agent_threads')
    .select('*')
    .eq('canvas_id', canvas_id)
    .eq('agent_role', agent_role)
    .maybeSingle()

  if (error) throw new Error(`getByCanvas failed: ${error.message}`)
  return data as AgentThread | null
}

export async function getById(thread_id: string): Promise<AgentThread | null> {
  const { data, error } = await db
    .from('agent_threads')
    .select('*')
    .eq('id', thread_id)
    .maybeSingle()

  if (error) throw new Error(`getById failed: ${error.message}`)
  return data as AgentThread | null
}

// Every agent thread on a canvas, regardless of role — used to broadcast a
// session_boundary turn into each thread when a new session starts.
export async function getAllByCanvas(canvas_id: string): Promise<AgentThread[]> {
  const { data, error } = await db
    .from('agent_threads')
    .select('*')
    .eq('canvas_id', canvas_id)

  if (error) throw new Error(`getAllByCanvas failed: ${error.message}`)
  return (data ?? []) as AgentThread[]
}

export async function createThread(
  canvas_id: string,
  agent_role: AgentRole
): Promise<AgentThread> {
  const { data, error } = await db
    .from('agent_threads')
    .insert({ canvas_id, agent_role })
    .select()
    .single()

  if (error) throw new Error(`createThread failed: ${error.message}`)
  return data as AgentThread
}

export async function getOrCreateThread(
  canvas_id: string,
  agent_role: AgentRole
): Promise<AgentThread> {
  const existing = await getByCanvas(canvas_id, agent_role)
  if (existing) return existing
  return createThread(canvas_id, agent_role)
}

// Atomic JSONB append — calls the Postgres function from migration 00004.
// Never read-modify-write: that creates a race condition under concurrent agent calls.
export async function appendMessage(
  thread_id: string,
  message: ThreadMessage
): Promise<void> {
  const { error } = await db.rpc('append_thread_message', {
    p_thread_id: thread_id,
    p_message: message,
  })

  if (error) throw new Error(`appendMessage failed: ${error.message}`)
}

// Mutates the pair_status of an existing ghost_pair turn in place. Unlike
// appendMessage (atomic, to avoid append races between concurrent agent turns),
// this is a read-modify-write — but ghost accept/reject is a single-user,
// user-driven action with no concurrent writer to the same turn, so there is no
// race to guard against here.
export async function setGhostPairStatus(
  thread_id: string,
  turn_index: number,
  pair_status: GhostStatus
): Promise<void> {
  const { data, error } = await db
    .from('agent_threads')
    .select('messages')
    .eq('id', thread_id)
    .single()

  if (error) throw new Error(`setGhostPairStatus read failed: ${error.message}`)

  const messages = (data.messages ?? []) as ThreadMessage[]
  const turn = messages[turn_index]
  if (!turn || turn.turn_type !== 'ghost_pair') {
    throw new Error(`setGhostPairStatus: no ghost_pair turn at index ${turn_index}`)
  }
  turn.ghost_pair.pair_status = pair_status

  const { error: updateError } = await db
    .from('agent_threads')
    .update({ messages })
    .eq('id', thread_id)

  if (updateError) throw new Error(`setGhostPairStatus update failed: ${updateError.message}`)
}

export async function updateActiveInsights(
  thread_id: string,
  ids: string[]
): Promise<void> {
  const { error } = await db
    .from('agent_threads')
    .update({ active_rejection_insight_ids: ids })
    .eq('id', thread_id)

  if (error) throw new Error(`updateActiveInsights failed: ${error.message}`)
}
