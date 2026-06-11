import { db } from './client.js'
import type { AgentThread, AgentRole, ThreadMessage } from '../../types/index.js'

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
