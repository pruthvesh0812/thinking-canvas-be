import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { updateOfferStatus } from '../db/intervention-offers.js'

export const interventionRoute = new Hono()

const triggerSchema = z.object({
  canvas_id: z.string().uuid(),
  session_id: z.string().uuid(),
  node_id: z.string().uuid(),
})

const processSchema = z.object({
  offer_id: z.string().uuid(),
  session_id: z.string().uuid(),
  canvas_id: z.string().uuid(),
})

const dismissSchema = z.object({
  offer_id: z.string().uuid(),
})

// POST /api/intervention/trigger
// The frontend fires this when its trigger ruleset passes (attention/action gate).
// We pre-generate offer_id here so the pipeline's step.waitForEvent can match on
// it via 'data.offer_id' against the triggering event (canvas/intervention.trigger).
interventionRoute.post('/intervention/trigger', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = triggerSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn('[route:intervention] trigger invalid payload', { issues: parsed.error.issues })
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const { canvas_id, session_id, node_id } = parsed.data
  const offer_id = randomUUID()

  try {
    await inngest.send({
      name: 'canvas/intervention.trigger',
      data: { canvas_id, session_id, node_id, offer_id },
    })
    logger.info('[route:intervention] trigger fired', { canvas_id, session_id, node_id, offer_id })
    return c.json({ offer_id }, 202)
  } catch (err) {
    logger.error('[route:intervention] trigger failed', { canvas_id, session_id, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})

// POST /api/intervention/process
// The frontend fires this when the processing timer lapses or the user hits
// "process now". Wakes the parked Inngest run via the waitForEvent match.
interventionRoute.post('/intervention/process', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = processSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn('[route:intervention] process invalid payload', { issues: parsed.error.issues })
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const { offer_id, session_id, canvas_id } = parsed.data

  try {
    await inngest.send({
      name: 'canvas/intervention.process',
      data: { offer_id, session_id, canvas_id },
    })
    logger.info('[route:intervention] process fired', { offer_id, session_id })
    return c.json({ ok: true })
  } catch (err) {
    logger.error('[route:intervention] process failed', { offer_id, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})

// POST /api/intervention/dismiss
// The user explicitly dismissed the waiting offer. This is a receptivity signal
// (not a content rejection) — no rejection_insights row, no NEGATIVE CONSTRAINTS.
interventionRoute.post('/intervention/dismiss', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = dismissSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn('[route:intervention] dismiss invalid payload', { issues: parsed.error.issues })
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const { offer_id } = parsed.data

  try {
    await updateOfferStatus(offer_id, 'dismissed')
    logger.info('[route:intervention] dismissed', { offer_id })
    return c.json({ ok: true })
  } catch (err) {
    logger.error('[route:intervention] dismiss failed', { offer_id, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})
