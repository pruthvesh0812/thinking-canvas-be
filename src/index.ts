import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serve as inngestServe } from 'inngest/hono'
import { inngest } from './lib/inngest.js'
import './mastra.js' // registers agents with Mastra so Langfuse tracing picks up their calls
import { logger } from './lib/logger.js'
import { requireAuth } from './lib/auth.js'

// Routes
import { canvasEventRoute } from './routes/canvas-event.js'
import { streamRoute } from './routes/stream.js'
import { ghostStatusRoute } from './routes/ghost-status.js'
import { sessionRoute } from './routes/session.js'
import { stripeRoute } from './routes/stripe.js'
import { interventionRoute } from './routes/intervention.js'

// Inngest pipeline functions
import { agentPipeline, interventionImpactPipeline } from './pipeline/agent-pipeline.js'
import { articulatorPipeline } from './pipeline/articulator-pipeline.js'
import { outerSubPipeline } from './pipeline/outer-sub-pipeline.js'
import { rejectionInsightsPipeline } from './pipeline/rejection-insights.js'
import { sessionCompletePipeline } from './pipeline/session-complete.js'

const app = new Hono()

// CORS is restricted to the frontend origin only — never wildcard (the API is
// single-tenant and the SSE stream must not be readable cross-origin).
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:9000'
app.use('/*', cors({ origin: FRONTEND_URL }))

app.get('/health', (c) => c.json({ status: 'ok' }))

// Routes verified by their own signature, not a user JWT — registered before
// requireAuth so they never hit it (Hono composes middleware/handlers in
// registration order per path).
app.route('/api', stripeRoute) // Stripe signature, see routes/stripe.ts
const inngestHandler = inngestServe({
  client: inngest,
  functions: [
    agentPipeline,
    interventionImpactPipeline,
    articulatorPipeline,
    outerSubPipeline,
    rejectionInsightsPipeline,
    sessionCompletePipeline,
  ],
})
app.on(['GET', 'POST', 'PUT'], '/api/inngest', (c) => inngestHandler(c)) // Inngest signing key

// Every other /api route requires a verified Supabase JWT (FRONTEND-CONTRACT.md
// §11 row 1) — Authorization: Bearer header, or ?token= for the EventSource
// stream, which cannot set headers.
app.use('/api/*', requireAuth)
app.route('/api', canvasEventRoute)
app.route('/api', streamRoute)
app.route('/api', ghostStatusRoute)
app.route('/api', sessionRoute)
// Intervention layer (decide→wait→generate). Every handler takes canvas_id/
// session_id from the body and ownership-checks it — mounted after requireAuth
// like the other body-id routes. This is the proactive path's only entry point;
// without it the judge, Expander, Stress-Tester, phase latch, receptivity, and
// tier-locked upgrade offers are all unreachable.
app.route('/api', interventionRoute)


serve({ fetch: app.fetch, port: 3001 }, (info) => {
  logger.info('[server] listening', { port: info.port })
})
