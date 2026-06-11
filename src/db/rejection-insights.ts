import { db } from './client.js'
import type { RejectionInsight } from '../../types/index.js'

export async function getActiveByCanvas(
  canvas_id: string
): Promise<RejectionInsight[]> {
  const { data, error } = await db
    .from('rejection_insights')
    .select('*')
    .eq('canvas_id', canvas_id)
    .eq('active', true)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getActiveByCanvas failed: ${error.message}`)
  return (data ?? []) as RejectionInsight[]
}

export async function createInsight(
  input: Omit<RejectionInsight, 'id' | 'created_at'>
): Promise<RejectionInsight> {
  const { data, error } = await db
    .from('rejection_insights')
    .insert(input)
    .select()
    .single()

  if (error) throw new Error(`createInsight failed: ${error.message}`)
  return data as RejectionInsight
}

// Decrement turns_remaining by 1.
// Automatically sets active=false when the count reaches 0.
export async function decrementTurnsRemaining(id: string): Promise<void> {
  const { error } = await db.rpc('decrement_insight_turns', { p_insight_id: id })

  if (error) throw new Error(`decrementTurnsRemaining failed: ${error.message}`)
}

export async function deactivate(id: string): Promise<void> {
  const { error } = await db
    .from('rejection_insights')
    .update({ active: false })
    .eq('id', id)

  if (error) throw new Error(`deactivate failed: ${error.message}`)
}
