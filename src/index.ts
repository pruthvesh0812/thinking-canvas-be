import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serve as inngestServe } from 'inngest/hono'
import { inngest } from './lib/inngest.js'
import './mastra.js' // registers agents with Mastra so Langfuse tracing picks up their calls
import { logger } from './lib/logger.js'

// Routes
import { canvasEventRoute } from './routes/canvas-event.js'
import { streamRoute } from './routes/stream.js'
import { ghostStatusRoute } from './routes/ghost-status.js'
import { sessionRoute } from './routes/session.js'
import { stripeRoute } from './routes/stripe.js'
import { interventionRoute } from './routes/intervention.js'

// Inngest pipeline functions
import { agentPipeline } from './pipeline/agent-pipeline.js'
import { articulatorPipeline } from './pipeline/articulator-pipeline.js'
import { outerSubPipeline } from './pipeline/outer-sub-pipeline.js'
import { rejectionInsightsPipeline } from './pipeline/rejection-insights.js'
import { sessionCompletePipeline } from './pipeline/session-complete.js'

const app = new Hono()

// CORS is restricted to the frontend origin only — never wildcard (the API is
// single-tenant and the SSE stream must not be readable cross-origin).
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
app.use('/*', cors({ origin: FRONTEND_URL }))

app.get('/health', (c) => c.json({ status: 'ok' }))

// Inngest worker — all five pipeline functions registered here.
const inngestHandler = inngestServe({
  client: inngest,
  functions: [
    agentPipeline,
    articulatorPipeline,
    outerSubPipeline,
    rejectionInsightsPipeline,
    sessionCompletePipeline,
  ],
})
app.on(['GET', 'POST', 'PUT'], '/api/inngest', (c) => inngestHandler(c))

// API routes — all mounted under /api.
app.route('/api', canvasEventRoute)
app.route('/api', streamRoute)
app.route('/api', ghostStatusRoute)
app.route('/api', sessionRoute)
app.route('/api', stripeRoute)
app.route('/api', interventionRoute)

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  logger.info('[server] listening', { port: info.port })
})
