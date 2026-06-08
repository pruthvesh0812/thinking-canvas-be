---
feature: "api-routes"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement the GET /api/stream/:sessionId SSE endpoint that subscribes to Redis and forwards ghost token messages to the frontend browser.

## Files to Touch
```
CREATE:
  src/routes/stream.ts
```

## Complete implementation (from CANVAS-SYNC.md)

```typescript
import { streamSSE } from 'hono/streaming'
import { redis } from '../lib/redis'

app.get('/api/stream/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  return streamSSE(c, async (stream) => {
    const sub = redis.subscribe(`canvas:stream:${sessionId}`)

    sub.on('message', async (_, message) => {
      await stream.writeSSE({ data: message })

      if (JSON.parse(message).type === 'done') {
        await sub.unsubscribe()
      }
    })

    // Keepalive ping every 25s — prevents browser SSE timeout
    const ping = setInterval(async () => {
      await stream.writeSSE({ data: JSON.stringify({ type: 'ping' }) })
    }, 25000)

    stream.onAbort(() => {
      clearInterval(ping)
      sub.unsubscribe()
    })
  })
})
```

## Why this matters

SSE is the only channel from backend to frontend. If the keepalive ping is missing, browsers disconnect after ~30s of agent silence. If `onAbort` doesn't unsubscribe, Redis subscriptions leak.

## Depends On
`ghost-streaming` task-01 (redis.ts). `project-bootstrap` task-02 (Hono app exists).

## Definition of Done
- [ ] GET /api/stream/:sessionId establishes SSE connection
- [ ] All Redis messages forwarded verbatim as SSE data events
- [ ] Connection closes after `{ type: 'done' }` message
- [ ] Ping sent every 25s
- [ ] Redis subscription cleaned up on client abort
- [ ] `npm run build` compiles
