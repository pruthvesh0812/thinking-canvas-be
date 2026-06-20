---
last-verified: 2026-06-11
stale-after-days: 90
---

# LOGGING.md

> **Load this when:** Adding any new tool, agent, pipeline, or route. Logs must be present before shipping any new code path.

---

## Logger

Always import from `src/lib/logger.ts`. Never use `console.log` directly.

```typescript
import { logger } from '../lib/logger.js'

logger.info('message', { key: value })
logger.warn('message', { key: value })
logger.error('message', { key: value })
```

Outputs structured JSON to stdout/stderr — machine-parseable by any log aggregator.

---

## Are Logs Available in Containers?

Yes. `logger.info` writes to **stdout**, `logger.error` writes to **stderr`. Container runtimes capture both automatically:

| Platform | Where to find logs |
|---|---|
| Docker | `docker logs <container>` |
| Railway | Dashboard → Deployments → Logs |
| Fly.io | `fly logs` |
| Render | Dashboard → Logs tab |
| Any log drain | JSON lines on stdout are ingested directly |

No special setup needed — stdout/stderr is always captured.

---

## What to Log and Where

### Cursor Tools (`src/tools/*.ts`)
```typescript
// Entry — always log tool name + key inputs
logger.info('[tool:tool_name] called', { canvas_id, node_id })

// DB errors — log before throwing
logger.error('[tool:tool_name] db error', { canvas_id, error: error.message })
throw new Error(...)

// Success — brief result summary (counts, flags — never full content)
logger.info('[tool:tool_name] ok', { canvas_id, returned: data.length })

// Empty / not-found paths — use warn
logger.warn('[tool:tool_name] no result', { canvas_id, node_id })
```

### Agents (`src/agents/*.ts`)
```typescript
logger.info('[agent:expander] invoked', { canvas_id, trigger_node_id })
const started_at = Date.now()

// Streaming agents (expander, stress-tester, articulator, outer-subconscious) —
// pass onFinish to .stream() so completion logs once the stream is consumed,
// whether by a test caller or the real pipeline:
logger.info('[agent:expander] stream complete', {
  canvas_id, trigger_node_id, tokens: usage.totalTokens,
  tool_calls: toolCalls.map(t => t.payload.toolName).join(',') || null,
  finish_reason: finishReason, duration_ms: Date.now() - started_at,
})

// Non-streaming agents (.generate() — orchestrator, attunement, observer) —
// log "done" with key output fields + duration_ms.
logger.info('[agent:orchestrator] done', { canvas_id, route, question_style, duration_ms })

logger.error('[agent:expander] failed', { canvas_id, trigger_node_id, error: err.message, duration_ms: Date.now() - started_at })
```

### Inngest Pipelines (`src/pipeline/*.ts`)
```typescript
logger.info('[pipeline:agent-pipeline] started', { session_id, node_id })
logger.info('[pipeline:agent-pipeline] step:attunement complete', { session_id, cognitive_mode })
logger.info('[pipeline:agent-pipeline] step:spawn published', { session_id, context_ghost_id })
logger.info('[pipeline:agent-pipeline] done', { session_id })
logger.error('[pipeline:agent-pipeline] step failed', { session_id, step, error: err.message })
```

### Routes (`src/routes/*.ts`)
```typescript
logger.info('[route:canvas-event] received', { canvas_id, session_id, event_type })
logger.error('[route:canvas-event] validation failed', { error: err.message })
logger.info('[route:ghost-status] status update', { canvas_id, context_node_status })
```

### DB layer (`src/db/*.ts`)
DB helpers throw on error — the caller (tool or pipeline) is responsible for logging before re-throwing. Do not add logs inside `src/db/*.ts` directly.

---

## Log Format Rules

| Rule | Reason |
|---|---|
| Prefix with `[layer:name]` | Easy grep and filtering in log aggregator |
| Never log full node content or embeddings | Content can be large and contains user data |
| Never log API keys, tokens, or auth headers | Security |
| Use `warn` for expected empty states | Distinguishes "nothing found" from actual errors |
| Use `error` only when throwing or catching | Signals something went wrong, not just empty |
| Keep data fields flat (not nested objects) | Most log aggregators index flat JSON better |

---

## Example Log Output

```json
{"level":"info","msg":"[tool:semantic_promote] called","ts":"2026-06-11T10:23:01.123Z","canvas_id":"abc-123","query_preview":"convergence is felt internally","exclude_count":3,"limit":5}
{"level":"info","msg":"[tool:semantic_promote] embedding generated","ts":"2026-06-11T10:23:01.891Z","canvas_id":"abc-123","dims":3072}
{"level":"info","msg":"[tool:semantic_promote] ok","ts":"2026-06-11T10:23:02.104Z","canvas_id":"abc-123","raw_matches":8,"after_exclusion":5}
```
