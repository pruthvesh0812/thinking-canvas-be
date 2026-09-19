import { db } from '../db/client.js'
import { logger } from './logger.js'

// requireAuth proves WHO is calling; these prove the ids in the request are
// theirs. The service-role client bypasses RLS, so every route that takes a
// canvas_id / session_id from the client must call one of these first.
// Denials are logged; callers respond 403 without saying which check failed.

export async function ownsCanvas(userId: string, canvasId: string): Promise<boolean> {
  const { data, error } = await db
    .from('canvases')
    .select('id')
    .eq('id', canvasId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`ownsCanvas failed: ${error.message}`)
  if (!data) logger.warn('[ownership] canvas not owned', { user_id: userId, canvas_id: canvasId })
  return data !== null
}

// When canvasId is given the session must also belong to THAT canvas — otherwise
// a caller could pair their own canvas_id with someone else's session_id.
export async function ownsSession(
  userId: string,
  sessionId: string,
  canvasId?: string
): Promise<boolean> {
  let query = db
    .from('sessions')
    .select('id, canvases!inner(user_id)')
    .eq('id', sessionId)
    .eq('canvases.user_id', userId)
  if (canvasId) query = query.eq('canvas_id', canvasId)

  const { data, error } = await query.maybeSingle()

  if (error) throw new Error(`ownsSession failed: ${error.message}`)
  if (!data) {
    logger.warn('[ownership] session not owned', {
      user_id: userId,
      session_id: sessionId,
      canvas_id: canvasId,
    })
  }
  return data !== null
}
