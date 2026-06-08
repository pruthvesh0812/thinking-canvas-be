---
feature: "project-bootstrap"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Create the Hono app skeleton in `src/index.ts` (health check only — no routes yet), the Inngest client singleton, and `.env.example` listing all required environment variables.

## Files to Touch
```
CREATE:
  src/index.ts         → Hono app + health check + Inngest worker (no routes)
  src/lib/inngest.ts   → Inngest client singleton
  .env.example         → all required env vars
```

## src/index.ts skeleton

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serve as inngestServe } from 'inngest/hono'
import { inngest } from './lib/inngest'

const app = new Hono()

app.use('/*', cors({ origin: process.env.FRONTEND_URL ?? '*' }))

app.get('/health', (c) => c.json({ status: 'ok' }))

// Inngest worker — functions registered here in Story 9
app.on(['GET', 'POST', 'PUT'], '/api/inngest', ...inngestServe({
  client: inngest,
  functions: [],  // populated in inngest-pipelines story
}))

serve({ fetch: app.fetch, port: 3001 })
```

## src/lib/inngest.ts

```typescript
import { Inngest } from 'inngest'
export const inngest = new Inngest({ id: 'thinking-canvas' })
```

## .env.example content

```
GOOGLE_AI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
FRONTEND_URL=http://localhost:3000
```

## Depends On
task-01 must be complete — npm install must have run.

## Definition of Done
- [ ] `npm run dev` starts the server with no errors
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] `.env.example` lists all 12 environment variables above
- [ ] `src/lib/inngest.ts` exports the inngest singleton
