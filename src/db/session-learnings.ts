import { db } from './client.js'
import type { SessionLearning } from '../../types/index.js'

// Session learnings are written by the session-complete pipeline (Observer pass)
// and reviewed by the user in the 3-screen Session Complete flow.

export async function createLearning(
  input: Omit<SessionLearning, 'id' | 'created_at'>
): Promise<SessionLearning> {
  const { data, error } = await db
    .from('session_learnings')
    .insert(input)
    .select()
    .single()

  if (error) throw new Error(`createLearning failed: ${error.message}`)
  return data as SessionLearning
}
