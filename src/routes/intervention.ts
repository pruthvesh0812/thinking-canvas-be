import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { getOffer, updateOfferStatus, getInFlightForSession } from '../db/intervention-offers.js'
import { getCanvas } from '../db/canvases.js'
import { applyReceptivityResponse } from '../db/sessions.js'
import { checkImpact, IMPACT_WARNING } from '../lib/intervention.js'

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
  // 'manual' = the user hit "process now" or resumed a paused timer (they were
  // watching); 'lapse' = the timer ran out on its own. Feeds the show ruleset's
  // attention state (DESIGN §5) — see src/pipeline/agent-pipeline.ts step 5/8.
  reason: z.enum(['manual', 'lapse']),
})

const dismissSchema = z.object({
  offer_id: z.string().uuid(),
})

const ghostInteractionSchema = z.object({
  offer_id: z.string().uuid(),
  canvas_id: z.string().uuid(),
  session_id: z.string().uuid(),
  node_id: z.string().uuid(),   // trigger node for a potential re-trigger
  interaction: z.enum(['accept', 'reject', 'hover']),
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
  const { offer_id, session_id, canvas_id, reason } = parsed.data

  try {
    await inngest.send({
      name: 'canvas/intervention.process',
      data: { offer_id, session_id, canvas_id, reason },
    })
    logger.info('[route:intervention] process fired', { offer_id, session_id, reason })
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
    const offer = await getOffer(offer_id)
    await updateOfferStatus(offer_id, 'dismissed')
    // Fold the "dismissed" TIMING signal into receptivity BEFORE the offer is
    // purge-eligible (§4f, §8) — never rejection_insights; dismiss ≠ reject.
    await applyReceptivityResponse(offer.session_id, 'dismissed')
    logger.info('[route:intervention] dismissed', { offer_id })
    return c.json({ ok: true })
  } catch (err) {
    logger.error('[route:intervention] dismiss failed', { offer_id, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})

// POST /api/intervention/ghost-interaction
// Matrix cases 12-15 (accept/reject an OLD ghost node/edge) and 24 (hover an
// OLD ghost) all run the Impact Check (DESIGN §6): compare the offer's
// birth-time context fingerprint to the canvas's CURRENT one.
//   none     → show as-is, caller proceeds with its normal accept/reject/hover flow
//   material · hover           → show with a warning, no re-trigger
//   material · accept/reject   → an intervention is already in flight for this
//                                 session → land with a warning; otherwise there
//                                 is nothing to interrupt → re-trigger fresh judgement
interventionRoute.post('/intervention/ghost-interaction', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = ghostInteractionSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn('[route:intervention] ghost-interaction invalid payload', { issues: parsed.error.issues })
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const { offer_id, canvas_id, session_id, node_id, interaction } = parsed.data

  try {
    const [offer, canvas] = await Promise.all([getOffer(offer_id), getCanvas(canvas_id)])
    const verdict = checkImpact(offer.context_fingerprint, canvas.canvas_version.toString())

    if (verdict === 'none') {
      return c.json({ verdict })
    }

    if (interaction === 'hover') {
      logger.info('[route:intervention] hover impact — material', { offer_id })
      return c.json({ verdict, warning: IMPACT_WARNING })
    }

    const inFlight = await getInFlightForSession(session_id)
    if (inFlight.some((o) => o.id !== offer_id)) {
      logger.info('[route:intervention] accept/reject impact — landing with warning', { offer_id })
      return c.json({ verdict, warning: IMPACT_WARNING })
    }

    const new_offer_id = randomUUID()
    await inngest.send({
      name: 'canvas/intervention.trigger',
      data: { canvas_id, session_id, node_id, offer_id: new_offer_id },
    })
    logger.info('[route:intervention] accept/reject impact — re-triggered', { offer_id, new_offer_id })
    return c.json({ verdict, re_triggered: true, offer_id: new_offer_id })
  } catch (err) {
    logger.error('[route:intervention] ghost-interaction failed', { offer_id, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})
