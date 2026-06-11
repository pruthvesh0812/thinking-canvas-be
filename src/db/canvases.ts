import { db } from './client.js'
import type { Canvas } from '../../types/index.js'

export async function getCanvas(id: string): Promise<Canvas> {
  const { data, error } = await db
    .from('canvases')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(`getCanvas failed: ${error.message}`)
  return data as Canvas
}

export async function createCanvas(input: {
  user_id: string
  title: string
  original_intent: string
}): Promise<Canvas> {
  const { data, error } = await db
    .from('canvases')
    .insert(input)
    .select()
    .single()

  if (error) throw new Error(`createCanvas failed: ${error.message}`)
  return data as Canvas
}
// NOTE: original_intent is never updated — enforced by RLS policy in DB.
