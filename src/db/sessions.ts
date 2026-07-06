import { db } from './client.js'
import type { AttunementState, Session, SessionPhase } from '../../types/index.js'

// Hysteresis threshold for the diverging→converging latch: a confident/sustained
// shift is required so phase doesn't chatter on a single low-confidence read.
// Tunable — see DESIGN.md §10 (open item).
export const PHASE_SHIFT_MIN_CONFIDENCE = 0.7

export async function getSession(id: string): Promise<Session> {
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(`getSession failed: ${error.message}`)
  return data as Session
}

// All sessions on a canvas, oldest first — used at session start to detect
// whether prior sessions exist (and thus whether to inject a session_boundary).
export async function getSessionsByCanvas(canvas_id: string): Promise<Session[]> {
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('canvas_id', canvas_id)
    .order('start_time', { ascending: true })

  if (error) throw new Error(`getSessionsByCanvas failed: ${error.message}`)
  return (data ?? []) as Session[]
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

// v1 phase model = a ONE-WAY latch: diverging → converging, once. Re-divergence
// (converging → diverging) is deferred to the branching era — see DESIGN.md §4c.
// Flips only on a confident/sustained shift from Attunement (hysteresis), which is
// what finally makes the converging phase — and thus the Stress-Tester — reachable.
// Returns the phase now in effect; persists only when it actually flips.
export async function maybeAdvancePhase(
  session: Session,
  attunement: Pick<AttunementState, 'phase_shift_suggested' | 'confidence'>
): Promise<SessionPhase> {
  if (session.current_phase === 'converging') return 'converging' // latched — never reverts in v1

  const confident =
    attunement.phase_shift_suggested &&
    (attunement.confidence ?? 0) >= PHASE_SHIFT_MIN_CONFIDENCE

  if (!confident) return session.current_phase

  await updatePhase(session.id, 'converging')
  return 'converging'
}
