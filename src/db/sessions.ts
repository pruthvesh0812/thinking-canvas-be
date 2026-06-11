import { db } from './client.js'
import type { Session, SessionPhase } from '../../types/index.js'

export async function getSession(id: string): Promise<Session> {
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(`getSession failed: ${error.message}`)
  return data as Session
}

export async function createSession(canvas_id: string): Promise<Session> {
  const { data, error } = await db
    .from('sessions')
    .insert({ canvas_id })
    .select()
    .single()

  if (error) throw new Error(`createSession failed: ${error.message}`)
  return data as Session
}

export async function appendToNodeSequence(
  session_id: string,
  node_id: string
): Promise<void> {
  // Atomic array append via Postgres — avoids read-modify-write race condition.
  const { error } = await db.rpc('append_node_to_sequence', {
    p_session_id: session_id,
    p_node_id: node_id,
  })

  if (error) throw new Error(`appendToNodeSequence failed: ${error.message}`)
}

export async function closeSession(session_id: string): Promise<void> {
  const { error } = await db
    .from('sessions')
    .update({ status: 'closed', end_time: new Date().toISOString() })
    .eq('id', session_id)

  if (error) throw new Error(`closeSession failed: ${error.message}`)
}

export async function updatePhase(
  session_id: string,
  phase: SessionPhase
): Promise<void> {
  const { error } = await db
    .from('sessions')
    .update({ current_phase: phase })
    .eq('id', session_id)

  if (error) throw new Error(`updatePhase failed: ${error.message}`)
}
