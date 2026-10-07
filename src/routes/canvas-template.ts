import { Hono } from 'hono'
import { canvasTemplateRequestSchema } from '../../types/index.js'
import type {
  CanvasTemplateError,
  CanvasTemplateRequest,
  CanvasTemplateResponse,
  TemplateShape,
} from '../../types/index.js'
import { runJev } from '../agents/jev.js'
import { runTemplateContent } from '../agents/template-content.js'
import { logger } from '../lib/logger.js'
import {
  MIN_HIERARCHY_CHILDREN,
  MIN_SEQUENCE_STEPS,
  normalizeHierarchy,
  normalizeSequence,
} from '../lib/template-validation.js'

export const canvasTemplateRoute = new Hono()

// User text only ever enters the agents' user message — the system prompts stay constants.
function formatInput({ query, context }: CanvasTemplateRequest): string {
  const lines = [`Question: ${query}`]
  if (context?.parent_label) {
    lines.push(`Expanding an existing node: ${context.parent_label}`)
    if (context.parent_detail) lines.push(`Node detail: ${context.parent_detail}`)
  }
  if (context?.sibling_labels?.length) {
    lines.push(
      'Already on the canvas (do not repeat):',
      ...context.sibling_labels.map((l) => `- ${l}`)
    )
  }
  return lines.join('\n')
}

// Retries once when the result is under-filled; if the retry fails or is still
// short, returns the retry's result — or the first one when the retry threw.
async function withCountRetry<P>(
  run: () => Promise<P>,
  count: (payload: P) => number,
  min: number
): Promise<P> {
  const first = await run()
  if (count(first) >= min) return first
  logger.warn('[route:canvas-template] under-filled — retrying once', { count: count(first), min })
  try {
    return await run()
  } catch (err) {
    logger.warn('[route:canvas-template] retry failed — keeping first result', {
      error: (err as Error).message,
    })
    return first
  }
}

async function fillShape(shape: TemplateShape, input: string): Promise<CanvasTemplateResponse> {
  if (shape === 'hierarchy') {
    const payload = await withCountRetry(
      async () => normalizeHierarchy(await runTemplateContent('hierarchy', input)),
      (p) => p.root.children.length,
      MIN_HIERARCHY_CHILDREN
    )
    return { shape, payload }
  }
  const payload = await withCountRetry(
    async () => normalizeSequence(await runTemplateContent('sequence', input)),
    (p) => p.steps.length,
    MIN_SEQUENCE_STEPS
  )
  return { shape, payload }
}

// POST /api/canvas-template — stateless. Jev picks the shape, the matching
// content agent fills its schema, the validation backstop normalises the result.
// No canvas/session in the request, so canAgentFire() and rejection-insight
// injection do not apply here.
canvasTemplateRoute.post('/canvas-template', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = canvasTemplateRequestSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn('[route:canvas-template] invalid payload', { issues: parsed.error.issues })
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const request = parsed.data
  const is_expansion = !!request.context?.parent_label
  logger.info('[route:canvas-template] received', { is_expansion })
  const started_at = Date.now()

  try {
    const input = formatInput(request)
    const shape = await runJev(input)
    const response = await fillShape(shape, input)
    logger.info('[route:canvas-template] done', {
      shape,
      is_expansion,
      duration_ms: Date.now() - started_at,
    })
    return c.json<CanvasTemplateResponse>(response)
  } catch (err) {
    logger.error('[route:canvas-template] failed', {
      is_expansion,
      error: (err as Error).message,
      duration_ms: Date.now() - started_at,
    })
    return c.json<CanvasTemplateError>(
      { error: 'could not generate a canvas template — please retry', fallback_shape: 'hierarchy' },
      500
    )
  }
})
