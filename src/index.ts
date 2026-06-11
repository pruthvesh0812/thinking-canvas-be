import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serve as inngestServe } from 'inngest/hono'
import { inngest } from './lib/inngest.js'

const app = new Hono()

app.use('/*', cors({ origin: process.env.FRONTEND_URL ?? '*' }))

app.get('/health', (c) => c.json({ status: 'ok' }))

// Inngest worker — functions registered here in Story 9
const inngestHandler = inngestServe({
  client: inngest,
  functions: [],  // populated in inngest-pipelines story
})
app.on(['GET', 'POST', 'PUT'], '/api/inngest', (c) => inngestHandler(c))

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`ThinkingCanvas API running on http://localhost:${info.port}`)
})
