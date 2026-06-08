---
feature: "api-routes"
type: story
created: 2026-06-09
status: draft
---

## What
Implement all Hono API routes in `src/routes/` and wire the complete Hono app in `src/index.ts` — including Zod validation, CORS, Inngest worker, and the SSE ghost streaming endpoint.

## Why
Routes are the public surface of the API. The frontend POSTs canvas events here, the SSE endpoint forwards ghost tokens to the browser, and ghost-status updates trigger the Rejection Insights Engine.

## Blast Radius
| Component | Impact |
|---|---|
| `src/routes/canvas-event.ts` | POST /api/canvas-event — entry point for all user actions |
| `src/routes/stream.ts` | GET /api/stream/:sessionId — SSE ghost streaming |
| `src/routes/ghost-status.ts` | POST /api/ghost-status — accept/reject ghost + fire rejection event |
| `src/routes/session.ts` | POST /api/session/start + /api/session/complete |
| `src/routes/stripe.ts` | POST /api/stripe/webhook — subscription sync |
| `src/index.ts` | App entry — Hono app, Inngest serve, all routes mounted |

## Files to Touch
```
CREATE:
  src/routes/canvas-event.ts
  src/routes/stream.ts
  src/routes/ghost-status.ts
  src/routes/session.ts
  src/routes/stripe.ts

MODIFY:
  src/index.ts  → mount all routes, CORS, Inngest serve handler
```

## canvas-event.ts — key logic

```
POST /api/canvas-event
1. Zod validate input (canvasEventSchema)
2. Read node/edge from Supabase (by node_id / edge_id)
3. If node: generate directional summary (gemini-2.5-flash) → nodes.summary
4. If node: generate embedding (gemini-embedding-2) → nodes.embedding
5. Fire correct Inngest event:
   - node created             → canvas/node.created
   - edge, both_existing=true → canvas/edge.existing-nodes
   - edge, type=question      → canvas/edge.question
```

## stream.ts — SSE with Redis

```typescript
// GET /api/stream/:sessionId
// Subscribe to Redis channel, forward all messages as SSE events
// Keepalive ping every 25s to prevent browser SSE timeout
// Unsubscribe on 'done' message or client abort
```

See CANVAS-SYNC.md → Hono SSE Endpoint for complete implementation.

## ghost-status.ts — rejection flow

```
POST /api/ghost-status
1. Zod validate (ghostStatusSchema)
2. Update AssistantMessage ghost_pair status in agent_thread
3. If context_node_status === 'rejected':
   → inngest.send('canvas/ghost.rejected', { rejected content, reason, ghost_type })
```

## session.ts

```
POST /api/session/start
  → Insert into sessions table, write session_boundary message to thread

POST /api/session/complete
  → inngest.send('canvas/session.completed', { canvas_id, session_id })
  → Update session status = 'closed'
```

## src/index.ts — wiring

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from 'inngest/hono'
import { inngest } from './lib/inngest'

// Import all pipeline functions
// Mount all routes
// CORS: allow FRONTEND_URL only
// Inngest serve at /api/inngest
// Health check: GET /health
```

## Supabase Migration
No.

## Inngest Events
All events are fired FROM routes — not consumed.

## Risks
- CORS must only allow `FRONTEND_URL` env var — not wildcard `*`
- Stripe webhook requires raw body — use Hono's `c.req.raw` not `c.req.json()`
- SSE endpoint must handle client disconnect (stream.onAbort) to unsubscribe from Redis and clear ping interval
- Directional summary must use `gemini-2.5-flash` with `thinking: low` (structured output)

## Task Breakdown
- **task-01:** canvas-event.ts (summary + embedding generation + Inngest event routing)
- **task-02:** stream.ts (SSE + Redis subscription + keepalive ping)
- **task-03:** ghost-status.ts + session.ts + stripe.ts + src/index.ts (full app wiring)
