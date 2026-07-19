---
last-verified: 2026-07-05
verified-against: backend CODING-STANDARDS.md (2026-06-18), adapted for the frontend stack
stale-after-days: 90
---

# CODING-STANDARDS.md

> **Load this when:** Starting any new feature, reviewing code, or unsure about conventions.

---

## Non-Negotiables

1. **Write-then-notify** — Supabase insert first, `POST /api/canvas-event` (IDs only) second. Never reverse, never skip.
2. **No Supabase Realtime** — `supabase.channel()` is prohibited. SSE is the only push.
3. **Ghost layout from SpawnDescriptor only** — content only from `chunk` messages.
4. **Never auto-accept ghosts** — appreciation is the only no-reject exception.
5. **`original_intent` write-once** — no edit UI, no update call, ever.
6. **Contract types mirrored, never hand-edited** — `types/index.ts` comes from the backend repo via `sync-contract-types.md`.
7. **Tier checks are UI-only client-side** — enforcement lives in the backend Orchestrator.
8. **Anon key only** — no privileged secrets in this repo (`NEXT_PUBLIC_*` ships to the browser).
9. **Unknown SSE types ignored, logged** — never an exhaustive switch that throws.
10. **`logger` from `src/lib/logger.ts`** — never `console.log` directly.
11. **npm only** — no pnpm, yarn, bun.
12. **Client-generated UUIDs** for nodes/edges/canvases; ghost IDs come from the backend descriptor.

---

## Git Branch Naming

```
<type>/<short-title>-<timestamp>
```

- **type** — `feature` | `fix` | `chore` | `refactor` | `docs` | `test`
- **short-title** — kebab-case, 2-5 words, describes the change (not a ticket number)
- **timestamp** — UTC, `YYYY-MM-DDTHHmm`

```bash
# ✅
feature/ghost-streaming-hook-2026-07-05T1430
fix/edge-selector-escape-2026-07-06T0915

# ❌ Never random/auto-generated names
claude/admiring-albattani-nfsixe
```

---

## Package Manager

**npm only.**

```bash
npm install [package]
npm run dev / build / lint / test
```

---

## TypeScript Conventions

```typescript
// ✅ Contract types come from types/index.ts — never redefined locally
import type { SpawnDescriptor, RedisMessage, EdgeType } from '@/types'

// ✅ UI-only types live next to their component/store, PascalCase
type GhostPairState = { descriptor: SpawnDescriptor; contextText: string; ... }

// ✅ Narrow unions with type guards, not casts — the RedisMessage union will
// grow (waiting/offer/withdraw); a guard forces re-examination, a cast hides it
function isChunk(msg: RedisMessage): msg is Extract<RedisMessage, { type: 'chunk' }> {
  return msg.type === 'chunk'
}

// ❌ Never `any`
// ❌ Never `as X` when a guard can do it
// ❌ Never a switch over RedisMessage.type without a default branch
```

---

## React / Next.js Conventions

```typescript
// ✅ 'use client' only where interaction demands it — the canvas tree is
//    client; the shell (layout, dashboard list) stays server where possible

// ✅ Components render; hooks orchestrate; stores hold state.
//    A component never calls supabase or fetch directly — it calls a hook/store action.

// ✅ nodeTypes/edgeTypes registered in module-scope constants (see CANVAS-RENDERING.md)

// ✅ Effects with subscriptions always return cleanup (EventSource.close, timers)

// ❌ No useEffect data-fetch waterfalls — hydrate the canvas in one hook (use-canvas-persistence)
// ❌ No prop-drilling store state — select from the store where it's used
// ❌ No CSS files per component — Tailwind utility classes; extract to a
//    component, not a stylesheet, when repetition hurts
```

---

## Zustand Conventions

See `STATE-MANAGEMENT.md` for the store layout. Summary:

```typescript
// ✅ One store per concern; actions defined inside the store
// ✅ Narrow selectors: useCanvasStore((s) => s.nodes)
// ✅ getState() for non-React contexts (SSE dispatch, event handlers)
// ❌ No persist middleware for canvas data — Supabase is the persistence layer
// ❌ No cross-store imports inside store definitions
```

---

## Comments — Write for the Next Reader

Default: **no comments.** Don't restate what well-named code already says.

Two places where comments are REQUIRED:

**1. Contract seams.** Anywhere this repo touches the backend contract or a
non-obvious product rule, one comment stating the constraint and where it comes
from. These comments are what keep a cross-repo codebase navigable:

```typescript
// Backend routes the Articulator on this flag and never recomputes it —
// true ⇔ the user connected two nodes that already existed (API-CONTRACT.md).
const both_existing = !connectionCreatedNewNode
```

**2. Complex functions.** When a function has 3+ distinct logical phases, add a
short step-label comment before each phase — a scannable map, not narration:

```typescript
// ✅ Step labels for a multi-phase function
async function hydrateCanvas(canvasId: string) {
  // 1. Canvas meta + active session (creates one via the backend if missing)
  ...
  // 2. All nodes + edges for the canvas — every session, not just the active one
  ...
  // 3. Map rows → React Flow shapes → stores
  ...
  // 4. Open the SSE stream + load carried-forward learnings
  ...
}

// ❌ Narration — don't do this
// set loading to true
setLoading(true)
```

Component-level: a one-or-two-line header comment on components whose *purpose*
isn't obvious from the name (e.g. why DebounceIndicator exists and when it
clears). Skip it for self-explanatory components.

---

## Logging

```typescript
import { logger } from '@/lib/logger'

logger.info('[ghost-stream] spawn received', { trigger_node_id })
logger.warn('[persistence] insert failed, rolling back', { node_id, error })
```

- Prefix with the subsystem in brackets: `[ghost-stream]`, `[persistence]`, `[session]`.
- Structured second argument — no string interpolation of data.
- `logger` wraps console in dev and can fan out to reporting later — which is
  why raw `console.log` is banned.

---

## Prohibited Patterns

```typescript
// ❌ supabase.channel()                    — Realtime is disabled product-wide
// ❌ fetch to backend before Supabase write — write-then-notify, always
// ❌ Sending node content to the backend    — IDs only; backend reads the row
// ❌ Editing types/index.ts by hand         — mirror it (sync-contract-types.md)
// ❌ Client-side tier gating of behaviour   — UI show/hide only
// ❌ setTimeout to fade/expire a ghost      — ghosts wait for the human
// ❌ Multiple EventSources per session      — one stream
// ❌ console.log                            — use logger
// ❌ pnpm / yarn / bun                      — npm only
// ❌ original_intent edit affordance        — immutable by design
```
