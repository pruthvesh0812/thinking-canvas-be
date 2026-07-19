---
last-verified: 2026-07-05
stale-after-days: 60
---

# Skill: Add a Backend API Call

> Load API-CONTRACT.md + this file before adding any call to `src/lib/api.ts`.
> If the endpoint isn't in API-CONTRACT.md, STOP — verify it exists in the
> backend repo (`src/routes/`) before writing a client for it. Never invent
> endpoints.

---

## Where calls live

All backend calls go through typed wrappers in `src/lib/api.ts` — one function
per endpoint. Components and stores call these wrappers; nothing else in the
codebase touches `fetch` against the backend.

---

## Template

```typescript
// src/lib/api.ts
import { logger } from '@/lib/logger'
import type { CanvasEvent } from '@/types'   // payload types are MIRRORED — never redefined here

const API_URL = process.env.NEXT_PUBLIC_API_URL!

// Thin generic: JSON in/out, structured logging, typed errors. Every endpoint
// wrapper below stays one honest line of intent.
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    logger.error('[api] request failed', { path, status: res.status, err })
    throw new ApiError(path, res.status, err)
  }
  return res.json() as Promise<T>
}

// POST /api/canvas-event — notify AFTER the Supabase write commits; the
// backend immediately reads the row by id (write-then-notify non-negotiable).
export function canvasEvent(payload: CanvasEvent) {
  return post<{ ok: true }>('/api/canvas-event', payload)
}
```

---

## Checklist

1. **Payload type from `types/index.ts`** — the mirrored Zod-inferred type, so a
   backend schema change breaks compilation here instead of at runtime.
2. **One wrapper per endpoint**, named after the action (`canvasEvent`,
   `ghostStatus`, `sessionStart`, `sessionComplete`).
3. **Comment the contract seam** — when the call has ordering or side-effect
   rules (write-then-notify; complete-is-async), one comment saying so.
4. **Error strategy at the call site** — persistence calls roll back optimistic
   state; fire-and-forget notifies may retry once. Decide per call, in the
   hook, not in `api.ts`.
5. **No secrets, no auth headers to the backend** in MVP — the backend trusts
   RLS-scoped Supabase state, not client claims. (If auth headers get added to
   the contract later, update API-CONTRACT.md first.)
6. **SSE is not an api.ts concern** — `EventSource` lives in
   `use-ghost-stream.ts` only.
