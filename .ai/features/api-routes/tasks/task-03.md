---
feature: "api-routes"
type: task
task_id: task-03
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement ghost-status route, session routes, Stripe webhook, and wire the complete Hono app in src/index.ts.

## Files to Touch
```
CREATE:
  src/routes/ghost-status.ts
  src/routes/session.ts
  src/routes/stripe.ts

MODIFY:
  src/index.ts  → mount all routes + CORS + Inngest functions registration
```

## ghost-status.ts

```
POST /api/ghost-status
Body: ghostStatusSchema (thread_id, turn_index, canvas_id, session_id,
      context_node_status, question_node_status, rejection_reason?, interacted_at)

1. Update AssistantMessage ghost_pair status in agent_thread (by thread_id + turn_index)
2. If context_node_status === 'rejected':
   → inngest.send('canvas/ghost.rejected', { canvas_id, session_id, thread_id,
       triggered_by_node_id, rejected_ghost_content, rejection_reason, ghost_type: 'context' })
3. Return 200
// No Supabase Realtime broadcast — single-user, nothing else to notify
```

## session.ts

```
POST /api/session/start
  Body: { canvas_id }
  1. createSession(canvas_id) → new session row
  2. If canvas has prior sessions → inject session_boundary message into agent threads
  3. Return { session_id }

POST /api/session/complete
  Body: { canvas_id, session_id }
  1. inngest.send('canvas/session.completed', { canvas_id, session_id })
  2. Return 200 (Inngest handles closing session asynchronously)
```

## stripe.ts

```
POST /api/stripe/webhook
  1. Verify signature: stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
  2. Handle events:
     - customer.subscription.created → upsert subscriptions table, set tier
     - customer.subscription.updated → update tier based on price_id → tier mapping
     - customer.subscription.deleted → set tier='free'
  3. CRITICAL: use c.req.raw (raw body) for signature verification — not c.req.json()
```

## src/index.ts — final wiring

```typescript
import { canvasEventRoute } from './routes/canvas-event'
import { streamRoute } from './routes/stream'
import { ghostStatusRoute } from './routes/ghost-status'
import { sessionRoute } from './routes/session'
import { stripeRoute } from './routes/stripe'
import { agentPipeline } from './pipeline/agent-pipeline'
import { articulatorPipeline } from './pipeline/articulator-pipeline'
import { outerSubPipeline } from './pipeline/outer-sub-pipeline'
import { rejectionInsightsPipeline } from './pipeline/rejection-insights'
import { sessionCompletePipeline } from './pipeline/session-complete'

// Mount routes
app.route('/api', canvasEventRoute)
app.route('/api', streamRoute)
app.route('/api', ghostStatusRoute)
app.route('/api', sessionRoute)
app.route('/api', stripeRoute)

// Register all Inngest functions
app.on(['GET', 'POST', 'PUT'], '/api/inngest', ...inngestServe({
  client: inngest,
  functions: [
    agentPipeline,
    articulatorPipeline,
    outerSubPipeline,
    rejectionInsightsPipeline,
    sessionCompletePipeline,
  ],
}))
```

## Depends On
task-01 + task-02, all pipeline functions (inngest-pipelines story).

## Definition of Done
- [ ] POST /api/ghost-status fires `canvas/ghost.rejected` Inngest event on rejection
- [ ] POST /api/session/start creates session + injects session_boundary message if prior sessions exist
- [ ] POST /api/session/complete fires `canvas/session.completed` Inngest event
- [ ] Stripe webhook verifies signature before processing — returns 400 on invalid sig
- [ ] `src/index.ts` mounts all routes and registers all 5 Inngest functions
- [ ] CORS origin restricted to `FRONTEND_URL` env var
- [ ] `npm run dev` starts cleanly with all routes responding
